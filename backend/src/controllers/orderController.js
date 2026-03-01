import pool from '../config/database.js';
import Stripe from 'stripe';
import { emitNewOrder, emitOrderStatusUpdate, emitStockUpdate } from '../socket.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

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
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount || 0),
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
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount || 0),
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
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'cashier';

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
         p.name as product_name,
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

    res.json({
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount || 0),
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

  const validStatuses = ['pending', 'paid', 'preparing', 'shipped', 'completed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const updatedOrder = result.rows[0];
    emitOrderStatusUpdate(updatedOrder);

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
    payment_intent_id,
    total_amount,
    discount_amount = 0,
    promo_code_used,
    source = 'online',
    payment_method,
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
      quantity: item.quantity
    }));

    if (normalizedItems.some(item => !item.product_id)) {
      return res.status(400).json({ message: 'Invalid items payload' });
    }

    // Check stock levels first
    for (const item of normalizedItems) {
      const stockCheck = await client.query(
        'SELECT name, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      const product = stockCheck.rows[0];
      if (!product || product.stock_quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Insufficient stock for ${product?.name || 'Product #' + item.product_id}`
        });
      }
    }

    // Respect the payment method from the frontend for online orders
    const resolvedPaymentMethod = source === 'pos'
      ? (payment_method || 'cash')
      : (payment_method || 'stripe');
    const resolvedCashierId = source === 'pos' ? (cashier_id || req.user?.id || null) : null;

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (
        user_id, guest_name, guest_email, total_amount, 
        shipping_address, payment_intent_id, status, 
        discount_amount, promo_code_used, payment_method, source,
        amount_tendered, change_due, cashier_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
      RETURNING *`,
      [
        userId,
        guestInfo?.name || null,
        guestInfo?.email || null,
        total_amount,
        shipping_address,
        payment_intent_id,
        'paid',
        discount_amount,
        promo_code_used || null,
        resolvedPaymentMethod,
        source,
        source === 'pos' ? amount_tendered || null : null,
        source === 'pos' ? change_due || null : null,
        resolvedCashierId
      ]
    );

    const order = orderResult.rows[0];

    // Add order items and update stock
    for (const item of normalizedItems) {
      // Add order item
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity)
         SELECT $1, $2, name, price, $3 FROM products WHERE id = $2`,
        [order.id, item.product_id, item.quantity]
      );

      // Update product stock
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    // Clear user's cart if logged in
    if (userId) {
      const cartResult = await client.query(
        'SELECT id FROM carts WHERE user_id = $1',
        [userId]
      );

      if (cartResult.rows.length > 0) {
        await client.query(
          'DELETE FROM cart_items WHERE cart_id = $1',
          [cartResult.rows[0].id]
        );
      }
    }

    await client.query('COMMIT');

    const itemsResult = await client.query(
      `SELECT 
         oi.*, 
         p.name as product_name,
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
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount || 0),
      items: itemsResult.rows.map(item => ({
        ...item,
        product_price: parseFloat(item.product_price)
      }))
    };

    // Emit real-time events
    emitNewOrder(fullOrder);
    // Emit stock updates for each item
    for (const item of itemsResult.rows) {
      emitStockUpdate({
        product_id: item.product_id,
        stock_quantity: parseInt(item.product_stock_quantity),
        name: item.product_name
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
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'cashier';

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
      `SELECT oi.*, p.name as product_name, p.part_number
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
              </tr>
            `).join('')}
          </tbody>
        </table>
 
    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(invoiceHTML);
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
  }
};