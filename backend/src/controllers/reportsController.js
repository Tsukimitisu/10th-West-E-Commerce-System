import pool from '../config/database.js';

// Get sales report by date range
export const getSalesReport = async (req, res) => {
  const { range = 'daily', start_date, end_date } = req.query;

  try {
    let dateFilter = '';
    const today = new Date();
    
    if (range === 'daily') {
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      dateFilter = `AND o.created_at >= '${startOfDay.toISOString()}'`;
    } else if (range === 'weekly') {
      const startOfWeek = new Date(today.setDate(today.getDate() - 7));
      dateFilter = `AND o.created_at >= '${startOfWeek.toISOString()}'`;
    } else if (range === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      dateFilter = `AND o.created_at >= '${startOfMonth.toISOString()}'`;
    } else if (start_date && end_date) {
      dateFilter = `AND o.created_at BETWEEN '${start_date}' AND '${end_date}'`;
    }

    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(AVG(o.total_amount), 0) as average_order_value,
        COALESCE(SUM(o.discount_amount), 0) as total_discounts,
        COUNT(DISTINCT CASE WHEN o.source = 'online' THEN o.id END) as online_orders,
        COUNT(DISTINCT CASE WHEN o.source = 'pos' THEN o.id END) as pos_orders,
        COALESCE(SUM(CASE WHEN o.source = 'online' THEN o.total_amount ELSE 0 END), 0) as online_revenue,
        COALESCE(SUM(CASE WHEN o.source = 'pos' THEN o.total_amount ELSE 0 END), 0) as pos_revenue
      FROM orders o
      WHERE o.status IN ('paid', 'completed')
      ${dateFilter}
    `);

    const stats = result.rows[0];

    res.json({
      range,
      start_date: start_date || null,
      end_date: end_date || null,
      total_orders: parseInt(stats.total_orders),
      total_revenue: parseFloat(stats.total_revenue),
      average_order_value: parseFloat(stats.average_order_value),
      total_discounts: parseFloat(stats.total_discounts),
      online_orders: parseInt(stats.online_orders),
      pos_orders: parseInt(stats.pos_orders),
      online_revenue: parseFloat(stats.online_revenue),
      pos_revenue: parseFloat(stats.pos_revenue)
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get sales by channel
export const getSalesByChannel = async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND created_at BETWEEN '${start_date}' AND '${end_date}'`;
    }

    const result = await pool.query(`
      SELECT 
        source as channel,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE status IN ('paid', 'completed')
      ${dateFilter}
      GROUP BY source
      ORDER BY total_revenue DESC
    `);

    res.json(result.rows.map(row => ({
      channel: row.channel,
      order_count: parseInt(row.order_count),
      total_revenue: parseFloat(row.total_revenue),
      avg_order_value: parseFloat(row.avg_order_value)
    })));
  } catch (error) {
    console.error('Sales by channel error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get stock levels report
export const getStockLevelsReport = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COALESCE(SUM(stock_quantity), 0) as total_stock,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_count,
        COUNT(CASE WHEN stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN stock_quantity > low_stock_threshold THEN 1 END) as in_stock_count,
        COALESCE(SUM(stock_quantity * buying_price), 0) as total_inventory_value,
        COALESCE(SUM(stock_quantity * price), 0) as potential_revenue
      FROM products
    `);

    const stats = result.rows[0];

    // Get category breakdown
    const categoryResult = await pool.query(`
      SELECT 
        c.name as category,
        COUNT(p.id) as product_count,
        COALESCE(SUM(p.stock_quantity), 0) as total_stock,
        COUNT(CASE WHEN p.stock_quantity <= p.low_stock_threshold THEN 1 END) as low_stock_items
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      GROUP BY c.name
      ORDER BY total_stock DESC
    `);

    res.json({
      overview: {
        total_products: parseInt(stats.total_products),
        total_stock: parseInt(stats.total_stock),
        out_of_stock_count: parseInt(stats.out_of_stock_count),
        low_stock_count: parseInt(stats.low_stock_count),
        in_stock_count: parseInt(stats.in_stock_count),
        total_inventory_value: parseFloat(stats.total_inventory_value),
        potential_revenue: parseFloat(stats.potential_revenue)
      },
      by_category: categoryResult.rows.map(row => ({
        category: row.category || 'Uncategorized',
        product_count: parseInt(row.product_count),
        total_stock: parseInt(row.total_stock),
        low_stock_items: parseInt(row.low_stock_items)
      }))
    });
  } catch (error) {
    console.error('Stock levels report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get top selling products
export const getTopProducts = async (req, res) => {
  const { limit = 10, start_date, end_date } = req.query;

  try {
    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND o.created_at BETWEEN '${start_date}' AND '${end_date}'`;
    }

    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.part_number,
        p.image,
        p.price,
        p.stock_quantity,
        c.name as category_name,
        COUNT(oi.id) as order_count,
        SUM(oi.quantity) as total_sold,
        SUM(oi.product_price * oi.quantity) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('paid', 'completed')
      ${dateFilter}
      GROUP BY p.id, p.name, p.part_number, p.image, p.price, p.stock_quantity, c.name
      ORDER BY total_sold DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows.map(row => ({
      ...row,
      stock_quantity: parseInt(row.stock_quantity),
      price: parseFloat(row.price),
      order_count: parseInt(row.order_count),
      total_sold: parseInt(row.total_sold),
      total_revenue: parseFloat(row.total_revenue)
    })));
  } catch (error) {
    console.error('Top products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get daily sales trend
export const getDailySalesTrend = async (req, res) => {
  const { days = 30 } = req.query;

  try {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(CASE WHEN source = 'online' THEN 1 END) as online_orders,
        COUNT(CASE WHEN source = 'pos' THEN 1 END) as pos_orders
      FROM orders
      WHERE status IN ('paid', 'completed')
        AND created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    res.json(result.rows.map(row => ({
      date: row.date,
      order_count: parseInt(row.order_count),
      revenue: parseFloat(row.revenue),
      online_orders: parseInt(row.online_orders),
      pos_orders: parseInt(row.pos_orders)
    })));
  } catch (error) {
    console.error('Daily sales trend error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get profit report (considering buying price)
export const getProfitReport = async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    let dateFilter = '';
    if (start_date && end_date) {
      dateFilter = `AND o.created_at BETWEEN '${start_date}' AND '${end_date}'`;
    }

    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(SUM(oi.quantity * p.buying_price), 0) as total_cost,
        COALESCE(SUM(o.total_amount) - SUM(oi.quantity * p.buying_price), 0) as gross_profit,
        COALESCE(SUM(o.discount_amount), 0) as total_discounts
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.status IN ('paid', 'completed')
      ${dateFilter}
    `);

    const stats = result.rows[0];
    const revenue = parseFloat(stats.total_revenue);
    const cost = parseFloat(stats.total_cost);
    const profit = parseFloat(stats.gross_profit);
    const margin = revenue > 0 ? ((profit / revenue) * 100) : 0;

    res.json({
      total_orders: parseInt(stats.total_orders),
      total_revenue: revenue,
      total_cost: cost,
      gross_profit: profit,
      profit_margin: parseFloat(margin.toFixed(2)),
      total_discounts: parseFloat(stats.total_discounts),
      net_profit: profit - parseFloat(stats.total_discounts)
    });
  } catch (error) {
    console.error('Profit report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
