import crypto from 'crypto';
import pool from '../config/database.js';
import { sendTransactionalEmail } from '../services/transactionalEmail.js';

const emailFailureResponse = (res, error) => {
  if (error.code === 'EMAIL_CONFIG_MISSING') {
    return res.status(503).json({
      message: 'Email delivery is blocked by credentials/configuration.',
      code: error.code,
      missing_categories: error.missing_categories || [],
    });
  }

  return res.status(502).json({
    message: 'Email provider rejected the delivery attempt.',
    code: 'EMAIL_DELIVERY_FAILED',
  });
};

const assertDeliveryAccepted = (result) => {
  if (result.accepted) return;
  const error = new Error('Email provider rejected the delivery attempt.');
  error.code = result.code;
  throw error;
};

// Send order confirmation email
export const sendOrderConfirmation = async (req, res) => {
  const { order_id, email, customer_name } = req.body;

  try {
    // Get order details
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsResult = await pool.query(
      `SELECT oi.*, p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order_id]
    );

    const items = itemsResult.rows;

    // Create HTML email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .order-details { background-color: white; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .item { padding: 10px 0; border-bottom: 1px solid #eee; }
          .total { font-size: 18px; font-weight: bold; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
            <p>Thank you for your order!</p>
          </div>
          
          <div class="content">
            <h2>Hi ${customer_name || 'Customer'},</h2>
            <p>Your order has been confirmed and will be shipped soon.</p>
            
            <div class="order-details">
              <h3>Order #${order.id}</h3>
              <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${order.status}</p>
              
              <h3>Items Ordered:</h3>
              ${items.map(item => `
                <div class="item">
                  <strong>${item.product_name || 'Product'}</strong><br>
                  Quantity: ${item.quantity} × $${parseFloat(item.product_price).toFixed(2)}
                  = $${(item.quantity * parseFloat(item.product_price)).toFixed(2)}
                </div>
              `).join('')}
              
              <div class="total">
                Total: $${parseFloat(order.total_amount).toFixed(2)}
              </div>
              
              <h3>Shipping Address:</h3>
              <p>${order.shipping_address}</p>
            </div>
            
            <p>We'll send you another email when your order ships.</p>
          </div>
          
          <div class="footer">
            <p>10th West Moto - Motorcycle Parts & Accessories</p>
            <p>If you have any questions, please contact us.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendTransactionalEmail({
      to: email,
      subject: `Order Confirmation #${order.id} - 10th West Moto`,
      text: `Your order #${order.id} has been confirmed. Total: ${parseFloat(order.total_amount).toFixed(2)}.`,
      html: htmlContent,
      requestId: crypto.randomUUID(),
      userId: order.user_id || null,
    });
    assertDeliveryAccepted(result);

    res.json({ message: 'Order confirmation email sent successfully', messageId: result.messageId });
  } catch (error) {
    console.error('Order confirmation email failed.', { code: error?.code || 'EMAIL_DELIVERY_FAILED' });
    return emailFailureResponse(res, error);
  }
};
// Send order status update email
export const sendOrderStatusUpdate = async (req, res) => {
  const { order_id, email, customer_name, status } = req.body;

  try {
    // Get order details
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Status-specific messages
    const statusMessages = {
      'pending': {
        title: 'Order Pending',
        message: 'Your order is being processed and will be confirmed soon.'
      },
      'confirmed': {
        title: 'Order Confirmed',
        message: 'Your order has been confirmed and is being prepared for shipment.'
      },
      'processing': {
        title: 'Order Processing',
        message: 'Your order is currently being prepared for shipment.'
      },
      'shipped': {
        title: 'Order Shipped',
        message: `Your order has been shipped! ${order.tracking_number ? 'Tracking number: ' + order.tracking_number : ''}`
      },
      'delivered': {
        title: 'Order Delivered',
        message: 'Your order has been delivered. Thank you for shopping with us!'
      },
      'cancelled': {
        title: 'Order Cancelled',
        message: 'Your order has been cancelled. If you have any questions, please contact us.'
      }
    };

    const statusInfo = statusMessages[status] || {
      title: 'Order Update',
      message: `Your order status has been updated to: ${status}`
    };

    // Create HTML email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .order-details { background-color: white; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .status { font-size: 18px; font-weight: bold; color: #4F46E5; padding: 10px; text-align: center; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusInfo.title}</h1>
          </div>
          
          <div class="content">
            <h2>Hi ${customer_name || 'Customer'},</h2>
            <p>${statusInfo.message}</p>
            
            <div class="order-details">
              <h3>Order #${order.id}</h3>
              <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
              <div class="status">${status.toUpperCase()}</div>
              ${order.tracking_number ? `<p><strong>Tracking Number:</strong> ${order.tracking_number}</p>` : ''}
              <p><strong>Total:</strong> $${parseFloat(order.total_amount).toFixed(2)}</p>
            </div>
            
            <p>You can track your order status anytime in your account order history.</p>
          </div>
          
          <div class="footer">
            <p>10th West Moto - Motorcycle Parts & Accessories</p>
            <p>If you have any questions, please contact us.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await sendTransactionalEmail({
      to: email,
      subject: `${statusInfo.title} - Order #${order.id}`,
      text: `${statusInfo.title}. ${statusInfo.message} Order #${order.id}.`,
      html: htmlContent,
      requestId: crypto.randomUUID(),
      userId: order.user_id || null,
    });
    assertDeliveryAccepted(result);

    res.json({ message: 'Order status update email sent successfully', messageId: result.messageId });
  } catch (error) {
    console.error('Order status update email failed.', { code: error?.code || 'EMAIL_DELIVERY_FAILED' });
    return emailFailureResponse(res, error);
  }
};
