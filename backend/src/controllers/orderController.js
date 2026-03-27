import pool from '../config/database.js';
import Stripe from 'stripe';
import { emitNewOrder, emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';
import { buildReturnEligibility, getReturnSettings } from '../utils/returnPolicy.js';
import { buildOrderStatusMessage, createNotification as createUserNotification, ensureNotificationColumns } from '../utils/notifications.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const STAFF_ROLES = new Set(['admin', 'super_admin', 'owner', 'store_staff', 'cashier', 'manager']);

const ensureOrderAddressSnapshotColumns = async () => {
  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS shipping_address_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
  `).catch((error) => {
    console.error('Failed to ensure order support columns:', error);
  });
};
ensureOrderAddressSnapshotColumns();
ensureNotificationColumns();

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const buildShippingAddressSnapshot = (snapshotInput = {}, shippingAddress) => {
  const snapshot = {
    recipient_name: normalizeText(snapshotInput.recipient_name),
    phone: normalizeText(snapshotInput.phone),
    street: normalizeText(snapshotInput.street),
    barangay: normalizeText(snapshotInput.barangay),
    city: normalizeText(snapshotInput.city),
    state: normalizeText(snapshotInput.state),
    postal_code: normalizeText(snapshotInput.postal_code),
    country: normalizeText(snapshotInput.country) || 'Philippines',
    address_string: normalizeText(snapshotInput.address_string) || normalizeText(shippingAddress),
  };

  return snapshot;
};

const parseShippingAddressSnapshot = (order) => {
  const snapshot = order.shipping_address_snapshot && typeof order.shipping_address_snapshot === 'object'
    ? order.shipping_address_snapshot
    : null;

  return buildShippingAddressSnapshot(snapshot || {}, order.shipping_address);
};

const mapOrderRecord = (order) => ({
  ...order,
  total_amount: parseFloat(order.total_amount),
  discount_amount: parseFloat(order.discount_amount || 0),
  shipping_address_snapshot: parseShippingAddressSnapshot(order),
});

const buildOrderReturnInfo = async (db, order, userId, isStaff) => {
  const [settings, latestReturnResult] = await Promise.all([
    getReturnSettings(db),
    db.query(
      `SELECT id, status, created_at, updated_at
       FROM returns
       WHERE order_id = $1
         ${isStaff ? '' : 'AND user_id = $2'}
       ORDER BY created_at DESC
       LIMIT 1`,
      isStaff ? [order.id] : [order.id, userId]
    ),
  ]);

  const latestReturn = latestReturnResult.rows[0] || null;
  const eligibility = buildReturnEligibility({
    order,
    latestReturn,
    returnWindowDays: settings.returnWindowDays,
  });

  return {
    return_eligible: eligibility.eligible,
    return_eligibility_message: eligibility.message,
    return_window_days: eligibility.returnWindowDays,
    return_deadline_at: eligibility.deadlineAt ? eligibility.deadlineAt.toISOString() : null,
    delivered_at: eligibility.deliveredAt ? eligibility.deliveredAt.toISOString() : (order.delivered_at || null),
    return_request: latestReturn ? {
      id: latestReturn.id,
      status: latestReturn.status,
      created_at: latestReturn.created_at,
      updated_at: latestReturn.updated_at,
    } : null,
  };
};

// Get all orders (admin)
export const getAllOrders = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, 
             u.name as customer_name, u.email as customer_email,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id, u.name, u.email
      ORDER BY o.created_at DESC
    `);

    res.json(result.rows.map(order => ({
      ...mapOrderRecord(order),
      item_count: parseInt(order.item_count)
    })));
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user's orders
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT o.*, COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [userId]
    );

    res.json(result.rows.map(order => ({
      ...mapOrderRecord(order),
      item_count: parseInt(order.item_count)
    })));
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single order
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isStaff = STAFF_ROLES.has(req.user?.role);

    // Get order
    const orderResult = await pool.query(
      'SELECT o.*, u.name as customer_name, u.email as customer_email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check authorization
    if (!isStaff && order.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT 
         oi.*, 
         COALESCE(oi.product_name, p.name) as product_name,
         p.name as product_name_current,
         p.image as product_image,
         p.part_number as product_part_number,
         p.price as product_price_current,
         p.buying_price as product_buying_price,
         p.box_number as product_box_number,
         p.category_id as product_category_id,
         p.stock_quantity as product_stock_quantity,
         p.low_stock_threshold as product_low_stock_threshold,
         p.sale_price as product_sale_price,
         p.is_on_sale as product_is_on_sale,
         p.sku as product_sku,
         p.barcode as product_barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1`,
      [id]
    );

    const returnInfo = await buildOrderReturnInfo(pool, order, userId, isStaff);

    res.json({
      ...mapOrderRecord(order),
      ...returnInfo,
      items: itemsResult.rows.map(item => ({
        ...item,
        product_price: parseFloat(item.product_price)
      }))
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update order status (admin)
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'paid', 'preparing', 'shipped', 'completed', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const orderDetailResult = await pool.query(
      `SELECT o.id, o.user_id, o.status, o.order_number,
              oi.product_id, COALESCE(oi.product_name, p.name) as product_name,
              p.image as product_image
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.id = $1
       ORDER BY oi.id ASC
       LIMIT 1`,
      [id]
    );

    if (orderDetailResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const deliveredAt = status === 'completed' || status === 'delivered'
      ? new Date().toISOString()
      : null;
    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           delivered_at = CASE
             WHEN $1 IN ('completed', 'delivered') THEN COALESCE(delivered_at, $3::timestamp)
             ELSE delivered_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id, deliveredAt]
    );

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

    const orderDetail = orderDetailResult.rows[0];
    if (orderDetail.user_id) {
      await createUserNotification(pool, {
        user_id: orderDetail.user_id,
        type: 'order.status',
        title: `Order #${String(orderDetail.order_number || updatedOrder.id).padStart(4, '0')} ${status}`,
        message: orderDetail.product_name
          ? `${buildOrderStatusMessage(status)} Item: ${orderDetail.product_name}.`
          : buildOrderStatusMessage(status),
        reference_id: updatedOrder.id,
        reference_type: 'order',
        thumbnail_url: orderDetail.product_image || null,
        metadata: {
          status,
          order_id: updatedOrder.id,
          order_number: orderDetail.order_number || updatedOrder.id,
          product_id: orderDetail.product_id || null,
          product_name: orderDetail.product_name || null,
        },
      });
    }

    res.json({
      message: 'Order status updated',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel order (customer - only if not yet shipped/preparing)
export const cancelOrder = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Customers can only cancel their own orders
    if (order.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only allow cancellation if not yet shipped
    if (order.status !== 'pending' && order.status !== 'paid') {
      return res.status(400).json({ message: 'Order cannot be cancelled once it is being prepared or shipped' });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['cancelled', id]
    );

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

    res.json({
      message: 'Order cancelled successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create order (after payment)
export const createOrder = async (req, res) => {
  const {
    items,
    shipping_address,
    shipping_lat,
    shipping_lng,
    payment_intent_id,
    total_amount,
    discount_amount = 0,
    promo_code_used,
    source = 'online',
    payment_method,
    shipping_address_snapshot,
    amount_tendered,
    change_due,
    cashier_id
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userId = source === 'pos' ? null : req.user?.id;
    const guestInfo = req.body.guest_info;
    const normalizedItems = (items || []).map(item => ({
      product_id: item.product_id ?? item.productId,
      quantity: Number(item.quantity)
    }));

    if (normalizedItems.some(item => !item.product_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ message: 'Invalid items payload' });
    }

    // Lock and validate all products in one query so stock checks and decrements stay consistent.
    const uniqueProductIds = [...new Set(normalizedItems.map(item => Number(item.product_id)))];
    const productSnapshotResult = await client.query(
      `SELECT id, name, price, stock_quantity
       FROM products
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [uniqueProductIds]
    );

    const productMap = new Map(productSnapshotResult.rows.map(product => [Number(product.id), product]));

    for (const item of normalizedItems) {
      const product = productMap.get(Number(item.product_id));

      if (!product) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Product #${item.product_id} is no longer available.`
        });
      }

      if (Number(product.stock_quantity) < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `${product.name}: Maximum available quantity is ${product.stock_quantity}.`
        });
      }
    }

    // Respect the payment method from the frontend for online orders
    const resolvedPaymentMethod = source === 'pos'
      ? (payment_method || 'cash')
      : (payment_method || 'stripe');
    const resolvedCashierId = source === 'pos' ? (cashier_id || req.user?.id || null) : null;
    const resolvedAddressSnapshot = buildShippingAddressSnapshot(shipping_address_snapshot, shipping_address);

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, guest_name, guest_email, total_amount, 
        shipping_address, shipping_lat, shipping_lng, payment_intent_id, status, 
        discount_amount, promo_code_used, payment_method, source,
        shipping_address_snapshot,
        amount_tendered, change_due, cashier_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17) 
      RETURNING *`,
      [
        userId,
        guestInfo?.name || null,
        guestInfo?.email || null,
        total_amount,
        shipping_address,
        shipping_lat ?? null,
        shipping_lng ?? null,
        payment_intent_id,
        'paid',
        discount_amount,
        promo_code_used || null,
        resolvedPaymentMethod,
        source,
        JSON.stringify(resolvedAddressSnapshot),
        source === 'pos' ? amount_tendered || null : null,
        source === 'pos' ? change_due || null : null,
        resolvedCashierId
      ]
    );

    const order = orderResult.rows[0];

    // Add order items and update stock
    const stockUpdates = [];
    for (const item of normalizedItems) {
      const product = productMap.get(Number(item.product_id));

      // Persist product snapshot into order_items so order history stays readable even if product changes later.
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, product.name, product.price, item.quantity]
      );

      const stockUpdateResult = await client.query(
        `UPDATE products
         SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND stock_quantity >= $1
         RETURNING id, name, stock_quantity`,
        [item.quantity, item.product_id]
      );

      if (stockUpdateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `${product.name}: Unable to update stock. Please try checkout again.`
        });
      }

      stockUpdates.push(stockUpdateResult.rows[0]);
    }

    // Clear user's cart if logged in
    if (userId) {
      const cartResult = await client.query(
        'SELECT id FROM carts WHERE user_id = $1',
        [userId]
      );

      if (cartResult.rows.length > 0) {
        await client.query(
          'DELETE FROM cart_items WHERE cart_id = $1 AND product_id = ANY($2::int[])',
          [cartResult.rows[0].id, uniqueProductIds]
        );
      }
    }

    await client.query('COMMIT');

    const itemsResult = await client.query(
      `SELECT 
         oi.*, 
         COALESCE(oi.product_name, p.name) as product_name,
         p.name as product_name_current,
         p.image as product_image,
         p.part_number as product_part_number,
         p.price as product_price_current,
         p.buying_price as product_buying_price,
         p.box_number as product_box_number,
         p.category_id as product_category_id,
         p.stock_quantity as product_stock_quantity,
         p.low_stock_threshold as product_low_stock_threshold,
         p.sale_price as product_sale_price,
         p.is_on_sale as product_is_on_sale,
         p.sku as product_sku,
         p.barcode as product_barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const fullOrder = {
      ...mapOrderRecord(order),
      items: itemsResult.rows.map(item => ({
        ...item,
        product_price: parseFloat(item.product_price)
      }))
    };

    // Emit real-time events
    emitNewOrder(fullOrder);
    // Emit stock updates for each item
    for (const stockUpdate of stockUpdates) {
      emitStockUpdate({
        product_id: stockUpdate.id,
        stock_quantity: parseInt(stockUpdate.stock_quantity),
        name: stockUpdate.name
      });
    }

    res.status(201).json({
      message: 'Order created successfully',
      order: fullOrder
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order' });
  } finally {
    client.release();
  }
};
// Generate invoice HTML for an order
export const getOrderInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isStaff = STAFF_ROLES.has(req.user?.role);

    // Get order
    const orderResult = await pool.query(
      'SELECT o.*, u.name as customer_name, u.email as customer_email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check authorization
    if (!isStaff && order.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT oi.*, COALESCE(oi.product_name, p.name) as product_name, p.part_number
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [id]
    );

    const items = itemsResult.rows;

    // Generate invoice HTML (BIR RR 18-2012 compliant)
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.product_price) * item.quantity, 0);
    const discount = parseFloat(order.discount_amount || 0);
    const totalAmount = parseFloat(order.total_amount);
    const vatRate = 0.12;
    const vatableSales = totalAmount / (1 + vatRate);
    const vatAmount = totalAmount - vatableSales;

    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice #${order.id}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
          .invoice-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #F97316; padding-bottom: 20px; }
          .company-name { font-size: 28px; font-weight: bold; color: #F97316; }
          .company-info { font-size: 11px; color: #666; margin-top: 6px; line-height: 1.6; }
          .invoice-title { font-size: 20px; margin-top: 10px; }
          .or-number { font-size: 13px; color: #F97316; font-weight: bold; margin-top: 4px; }
          .info-section { display: flex; justify-content: space-between; margin: 30px 0; }
          .info-block { flex: 1; }
          .info-block h3 { font-size: 14px; color: #666; margin-bottom: 10px; }
          .info-block p { font-size: 14px; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin: 30px 0; }
          thead { background-color: #F97316; color: white; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { font-weight: bold; }
          .item-description { max-width: 300px; }
          .text-right { text-align: right; }
          .totals { margin-top: 20px; text-align: right; }
          .totals table { width: 300px; margin-left: auto; }
          .totals td { padding: 8px; }
          .totals .grand-total { font-size: 18px; font-weight: bold; background-color: #FFF7ED; }
          .vat-section { font-size: 12px; color: #666; }
          .footer { margin-top: 50px; text-align: center; color: #666; font-size: 11px; padding-top: 20px; border-top: 1px solid #ddd; line-height: 1.8; }
          .legal-note { margin-top: 20px; font-size: 10px; color: #999; text-align: center; border-top: 1px dashed #ddd; padding-top: 15px; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-header">
          <div class="company-name">10TH WEST MOTO</div>
          <div class="company-info">
            Motorcycle Parts &amp; Accessories<br>
            Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104, Philippines<br>
            DTI Reg. No.: 3217456 &nbsp;|&nbsp; BIR TIN: 123-456-789-000 (VAT Registered)
          </div>
          <div class="invoice-title">OFFICIAL RECEIPT / INVOICE</div>
          <div class="or-number">OR No.: OR-${String(order.id).padStart(8, '0')}</div>
        </div>

        <div class="info-section">
          <div class="info-block">
            <h3>SOLD TO:</h3>
            <p>
              <strong>${order.customer_name || 'Customer'}</strong><br>
              ${order.customer_email || ''}<br>
              ${order.shipping_address ? order.shipping_address.replace(/\n/g, '<br>') : ''}
            </p>
          </div>
          <div class="info-block">
            <h3>INVOICE DETAILS:</h3>
            <p>
              <strong>Invoice #:</strong> ${order.id}<br>
              <strong>OR No.:</strong> OR-${String(order.id).padStart(8, '0')}<br>
              <strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
              <strong>Payment Method:</strong> ${order.payment_method || 'N/A'}<br>
              <strong>Status:</strong> ${order.status.toUpperCase()}
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Part Number</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td class="item-description">${item.product_name || 'Product'}</td>
                <td>${item.part_number || '-'}</td>
                <td class="text-right">₱${parseFloat(item.product_price).toFixed(2)}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">₱${(parseFloat(item.product_price) * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
 
        <div class="totals">
          <table>
            <tr class="vat-section">
              <td>VATable Sales:</td>
              <td class="text-right">₱${vatableSales.toFixed(2)}</td>
            </tr>
            <tr class="vat-section">
              <td>VAT (12%):</td>
              <td class="text-right">₱${vatAmount.toFixed(2)}</td>
            </tr>
            ${discount > 0 ? `
            <tr>
              <td>Discount:</td>
              <td class="text-right">-₱${discount.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr class="grand-total">
              <td><strong>TOTAL (VAT Inclusive):</strong></td>
              <td class="text-right"><strong>₱${totalAmount.toFixed(2)}</strong></td>
            </tr>
          </table>
        </div>

        <div class="footer">
          <p><strong>10th West Moto Parts</strong></p>
          <p>Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104</p>
          <p>BIR TIN: 123-456-789-000 &nbsp;|&nbsp; DTI Reg. No.: 3217456</p>
          <p>Phone: (02) 8888-1234 &nbsp;|&nbsp; Email: support@10thwestmoto.com</p>
          <p>Thank you for your business!</p>
        </div>

        <div class="legal-note">
          <p>This document serves as an Official Receipt per BIR Revenue Regulations No. 18-2012.</p>
          <p>For returns, you may return products within 7 days of delivery per DTI DAO 21-01.</p>
          <p>For questions, contact returns@10thwestmoto.com or call (02) 8888-1234.</p>
        </div>
      </body>
      </html>
    `;

    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(invoiceHTML);
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
  }
};
