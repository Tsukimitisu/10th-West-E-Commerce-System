import pool from '../config/database.js';

const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'Asia/Manila';
const toNumber = (value) => Number(value || 0);

export const getOperationsDashboard = async (req, res) => {
  try {
    const [
      commerceResult,
      userResult,
      queueResult,
      salesTrendResult,
      recentOrdersResult,
      topProductsResult,
      activityResult,
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total_amount) FILTER (
            WHERE status::text NOT IN ('cancelled', 'failed', 'refunded')
              AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id)
          ), 0) AS total_sales,
          COALESCE(SUM(total_amount) FILTER (
            WHERE (created_at AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date
              AND status::text NOT IN ('cancelled', 'failed', 'refunded')
              AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id)
          ), 0) AS today_sales,
          COUNT(*) FILTER (WHERE status::text IN ('pending', 'payment_pending'))::int AS pending_orders,
          COUNT(*) FILTER (WHERE status::text IN ('paid', 'processing'))::int AS orders_to_process,
          COUNT(*) FILTER (WHERE status::text = 'packed')::int AS orders_to_pack,
          COUNT(*) FILTER (WHERE status::text IN ('ready_for_pickup', 'shipped', 'out_for_delivery'))::int AS orders_to_ship
        FROM orders
      `, [BUSINESS_TIME_ZONE]),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE role::text = 'customer')::int AS total_customers,
          COUNT(*) FILTER (WHERE role::text IN ('owner', 'admin', 'store_staff', 'cashier'))::int AS total_staff
        FROM users
        WHERE COALESCE(is_deleted, false) = false
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM products
           WHERE COALESCE(is_deleted, false) = false AND status <> 'archived') AS total_products,
          (SELECT COUNT(*)::int FROM products
           WHERE COALESCE(is_deleted, false) = false AND status <> 'archived'
             AND stock_quantity <= COALESCE(low_stock_threshold, 0)) AS low_stock_products,
          (SELECT COUNT(*)::int FROM returns WHERE status::text IN ('pending', 'requested')) AS return_requests,
          (SELECT COUNT(*)::int FROM refunds WHERE status::text IN ('pending', 'processing')) AS refund_requests,
          (SELECT COALESCE(SUM(seller_unread_count), 0)::int FROM chat_threads
           WHERE seller_archived_at IS NULL) AS unread_chats,
          (SELECT COUNT(*)::int FROM payments WHERE status::text IN ('failed', 'expired')) AS payment_issues,
          (SELECT COUNT(*)::int FROM shipments WHERE status::text IN ('failed', 'exception')) AS courier_issues
      `),
      pool.query(`
        SELECT
          (created_at AT TIME ZONE $1)::date AS date,
          COALESCE(SUM(total_amount), 0) AS amount
        FROM orders
        WHERE created_at >= (NOW() AT TIME ZONE $1)::date - INTERVAL '6 days'
          AND status::text NOT IN ('cancelled', 'failed', 'refunded')
          AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id)
        GROUP BY 1
        ORDER BY 1
      `, [BUSINESS_TIME_ZONE]),
      pool.query(`
        SELECT o.id, o.total_amount, o.status, o.source, o.payment_status, o.created_at,
               COALESCE(u.name, o.guest_name, 'Guest') AS customer_name
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        ORDER BY o.created_at DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT p.id, p.name, p.sku, COALESCE(SUM(oi.quantity), 0)::int AS quantity_sold,
               COALESCE(SUM(oi.quantity * oi.product_price), 0) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.status::text NOT IN ('cancelled', 'failed', 'refunded')
        GROUP BY p.id, p.name, p.sku
        ORDER BY quantity_sold DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT al.id, al.action, al.entity_type, al.entity_id, al.ip_address, al.created_at,
               u.name AS user_name
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 10
      `),
    ]);

    const commerce = commerceResult.rows[0];
    const users = userResult.rows[0];
    const queues = queueResult.rows[0];

    return res.json({
      totalRevenue: toNumber(commerce.total_sales),
      totalSales: toNumber(commerce.total_sales),
      todaySales: toNumber(commerce.today_sales),
      totalOrders: toNumber(commerce.total_orders),
      totalProducts: toNumber(queues.total_products),
      lowStockProducts: toNumber(queues.low_stock_products),
      totalUsers: toNumber(users.total_users),
      totalCustomers: toNumber(users.total_customers),
      totalStaff: toNumber(users.total_staff),
      pendingOrders: toNumber(commerce.pending_orders),
      ordersToProcess: toNumber(commerce.orders_to_process),
      ordersToPack: toNumber(commerce.orders_to_pack),
      ordersToShip: toNumber(commerce.orders_to_ship),
      returnRequests: toNumber(queues.return_requests),
      refundRequests: toNumber(queues.refund_requests),
      unreadChats: toNumber(queues.unread_chats),
      paymentIssues: toNumber(queues.payment_issues),
      courierIssues: toNumber(queues.courier_issues),
      businessTimeZone: BUSINESS_TIME_ZONE,
      salesTrend: salesTrendResult.rows.map((row) => ({
        date: row.date,
        amount: toNumber(row.amount),
      })),
      recentOrders: recentOrdersResult.rows,
      topProducts: topProductsResult.rows.map((row) => ({
        ...row,
        quantity_sold: toNumber(row.quantity_sold),
        revenue: toNumber(row.revenue),
      })),
      recentActivity: req.user.role === 'super_admin' ? activityResult.rows : [],
    });
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    return res.status(500).json({
      message: 'Dashboard metrics could not be loaded.',
      code: 'DASHBOARD_METRICS_FAILED',
    });
  }
};
