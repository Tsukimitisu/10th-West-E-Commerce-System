import pool from '../config/database.js';
import { isDatabaseConnectivityError, shouldUseDatabaseReadFallback, supabaseRestFetch } from '../services/supabaseRest.js';

const REVENUE_ORDER_STATUSES = ['paid', 'processing', 'packed', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered'];
const REVENUE_ORDER_STATUS_SQL = REVENUE_ORDER_STATUSES.map((status) => `'${status}'`).join(', ');
const PAID_REPORT_STATUSES = new Set(REVENUE_ORDER_STATUSES);
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'Asia/Manila';

const buildDateFilter = ({ range = '30d', startDate, endDate, alias = 'o', startIndex = 1 } = {}) => {
  const column = `${alias}.created_at`;
  const normalizedRange = String(range || '30d').toLowerCase();
  if (startDate && endDate) {
    return {
      sql: `AND (${column} AT TIME ZONE $${startIndex})::date BETWEEN $${startIndex + 1}::date AND $${startIndex + 2}::date`,
      params: [BUSINESS_TIME_ZONE, startDate, endDate],
    };
  }
  const rangeDays = { daily: 0, weekly: 7, '7d': 7, monthly: 30, '30d': 30, '90d': 90 };
  const days = rangeDays[normalizedRange] ?? 30;
  return {
    sql: days === 0
      ? `AND (${column} AT TIME ZONE $${startIndex})::date = (NOW() AT TIME ZONE $${startIndex})::date`
      : `AND (${column} AT TIME ZONE $${startIndex}) >= (NOW() AT TIME ZONE $${startIndex}) - ($${startIndex + 1}::int * INTERVAL '1 day')`,
    params: days === 0 ? [BUSINESS_TIME_ZONE] : [BUSINESS_TIME_ZONE, days],
  };
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateOnly = (value) => new Date(value).toISOString().slice(0, 10);

const resolveDateWindow = ({ range = 'daily', start_date, end_date, days } = {}) => {
  const now = new Date();
  let start = null;
  let end = null;

  if (days) {
    start = new Date(now);
    start.setDate(start.getDate() - Math.max(1, Number.parseInt(days, 10) || 30));
    return { start, end };
  }

  if (range === 'daily') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'weekly') {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (range === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (start_date && end_date) {
    start = new Date(start_date);
    end = new Date(end_date);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
};

const inWindow = (createdAt, window) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  if (window.start && date < window.start) return false;
  if (window.end && date > window.end) return false;
  return true;
};

const getReportOrdersFallback = async (filters = {}) => {
  const orders = await supabaseRestFetch('orders', {
    select: 'id,total_amount,discount_amount,source,status,created_at',
    status: `in.(${REVENUE_ORDER_STATUSES.join(',')})`,
    order: 'created_at.desc',
    limit: 5000,
  }).catch((error) => {
    console.error('Reports orders Supabase REST fallback error:', error);
    return [];
  });

  const window = resolveDateWindow(filters);
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => PAID_REPORT_STATUSES.has(String(order.status || '').toLowerCase()))
    .filter((order) => inWindow(order.created_at, window));
};

const getProductsFallback = async () => {
  const products = await supabaseRestFetch('products', {
    select: 'id,name,part_number,image,price,buying_price,stock_quantity,low_stock_threshold,category_id,categories(name)',
    limit: 5000,
  }).catch((error) => {
    console.error('Reports products Supabase REST fallback error:', error);
    return [];
  });

  return Array.isArray(products) ? products : [];
};

const getOrderItemsFallback = async (orderIds) => {
  if (!orderIds.length) return [];
  const items = await supabaseRestFetch('order_items', {
    select: 'id,order_id,product_id,quantity,product_price',
    order_id: `in.(${orderIds.join(',')})`,
    limit: 10000,
  }).catch((error) => {
    console.error('Reports order items Supabase REST fallback error:', error);
    return [];
  });

  return Array.isArray(items) ? items : [];
};

const salesReportFallback = async ({ range = 'daily', start_date, end_date } = {}) => {
  const orders = await getReportOrdersFallback({ range, start_date, end_date });
  const totalRevenue = orders.reduce((sum, order) => sum + toNumber(order.total_amount), 0);
  const totalDiscounts = orders.reduce((sum, order) => sum + toNumber(order.discount_amount), 0);
  const onlineOrders = orders.filter((order) => order.source === 'online');
  const posOrders = orders.filter((order) => order.source === 'pos');

  return {
    range,
    start_date: start_date || null,
    end_date: end_date || null,
    total_orders: orders.length,
    total_revenue: totalRevenue,
    average_order_value: orders.length ? totalRevenue / orders.length : 0,
    total_discounts: totalDiscounts,
    online_orders: onlineOrders.length,
    pos_orders: posOrders.length,
    online_revenue: onlineOrders.reduce((sum, order) => sum + toNumber(order.total_amount), 0),
    pos_revenue: posOrders.reduce((sum, order) => sum + toNumber(order.total_amount), 0),
  };
};

const stockLevelsFallback = async () => {
  const products = await getProductsFallback();
  const totalStock = products.reduce((sum, product) => sum + toNumber(product.stock_quantity), 0);
  const byCategory = new Map();

  products.forEach((product) => {
    const category = product.categories?.name || product.category_name || 'Uncategorized';
    const current = byCategory.get(category) || { category, product_count: 0, total_stock: 0, low_stock_items: 0 };
    current.product_count += 1;
    current.total_stock += toNumber(product.stock_quantity);
    if (toNumber(product.stock_quantity) <= toNumber(product.low_stock_threshold)) current.low_stock_items += 1;
    byCategory.set(category, current);
  });

  return {
    overview: {
      total_products: products.length,
      total_stock: totalStock,
      out_of_stock_count: products.filter((product) => toNumber(product.stock_quantity) === 0).length,
      low_stock_count: products.filter((product) => toNumber(product.stock_quantity) > 0 && toNumber(product.stock_quantity) <= toNumber(product.low_stock_threshold)).length,
      in_stock_count: products.filter((product) => toNumber(product.stock_quantity) > toNumber(product.low_stock_threshold)).length,
      total_inventory_value: products.reduce((sum, product) => sum + (toNumber(product.stock_quantity) * toNumber(product.buying_price)), 0),
      potential_revenue: products.reduce((sum, product) => sum + (toNumber(product.stock_quantity) * toNumber(product.price)), 0),
    },
    by_category: Array.from(byCategory.values()).sort((a, b) => b.total_stock - a.total_stock),
  };
};

const topProductsFallback = async ({ limit = 10, start_date, end_date } = {}) => {
  const orders = await getReportOrdersFallback({ range: 'custom', start_date, end_date });
  const orderIds = orders.map((order) => Number(order.id)).filter(Boolean);
  const [items, products] = await Promise.all([getOrderItemsFallback(orderIds), getProductsFallback()]);
  const productMap = new Map(products.map((product) => [Number(product.id), product]));
  const totals = new Map();

  items.forEach((item) => {
    const productId = Number(item.product_id);
    const product = productMap.get(productId);
    if (!product) return;
    const current = totals.get(productId) || {
      ...product,
      category_name: product.categories?.name || product.category_name,
      order_count: 0,
      total_sold: 0,
      total_revenue: 0,
    };
    current.order_count += 1;
    current.total_sold += toNumber(item.quantity);
    current.total_revenue += toNumber(item.product_price || product.price) * toNumber(item.quantity);
    totals.set(productId, current);
  });

  return Array.from(totals.values())
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, Math.max(1, Number.parseInt(limit, 10) || 10));
};

const dailyTrendFallback = async ({ days = 30 } = {}) => {
  const orders = await getReportOrdersFallback({ days });
  const grouped = new Map();

  orders.forEach((order) => {
    const key = dateOnly(order.created_at);
    const current = grouped.get(key) || { date: key, order_count: 0, revenue: 0, online_orders: 0, pos_orders: 0 };
    current.order_count += 1;
    current.revenue += toNumber(order.total_amount);
    if (order.source === 'online') current.online_orders += 1;
    if (order.source === 'pos') current.pos_orders += 1;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const profitReportFallback = async ({ start_date, end_date } = {}) => {
  const orders = await getReportOrdersFallback({ range: 'custom', start_date, end_date });
  const orderIds = orders.map((order) => Number(order.id)).filter(Boolean);
  const [items, products] = await Promise.all([getOrderItemsFallback(orderIds), getProductsFallback()]);
  const productMap = new Map(products.map((product) => [Number(product.id), product]));
  const totalRevenue = orders.reduce((sum, order) => sum + toNumber(order.total_amount), 0);
  const totalCost = items.reduce((sum, item) => {
    const product = productMap.get(Number(item.product_id));
    return sum + (toNumber(item.quantity) * toNumber(product?.buying_price));
  }, 0);
  const totalDiscounts = orders.reduce((sum, order) => sum + toNumber(order.discount_amount), 0);
  const grossProfit = totalRevenue - totalCost;

  return {
    total_orders: orders.length,
    total_revenue: totalRevenue,
    total_cost: totalCost,
    gross_profit: grossProfit,
    profit_margin: totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0,
    total_discounts: totalDiscounts,
    net_profit: grossProfit - totalDiscounts,
  };
};

// Get sales report by date range
export const getSalesReport = async (req, res) => {
  const { range = 'daily', start_date, end_date } = req.query;

  try {
    if (shouldUseDatabaseReadFallback()) {
      return res.json(await salesReportFallback({ range, start_date, end_date }));
    }

    const dateFilter = buildDateFilter({ range, startDate: start_date, endDate: end_date });

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
      WHERE o.status IN (${REVENUE_ORDER_STATUS_SQL})
        AND COALESCE(o.integrity_status, 'valid') = 'valid'
        AND EXISTS (SELECT 1 FROM order_items valid_items WHERE valid_items.order_id = o.id)
      ${dateFilter.sql}
    `, dateFilter.params);

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
    if (isDatabaseConnectivityError(error)) {
      return res.json(await salesReportFallback({ range, start_date, end_date }));
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get sales by channel
export const getSalesByChannel = async (req, res) => {
  const { range = '30d', start_date, end_date } = req.query;

  try {
    if (shouldUseDatabaseReadFallback()) {
      const report = await salesReportFallback({ range: 'custom', start_date, end_date });
      return res.json([
        { channel: 'online', order_count: report.online_orders, total_revenue: report.online_revenue, avg_order_value: report.online_orders ? report.online_revenue / report.online_orders : 0 },
        { channel: 'pos', order_count: report.pos_orders, total_revenue: report.pos_revenue, avg_order_value: report.pos_orders ? report.pos_revenue / report.pos_orders : 0 },
      ].filter((row) => row.order_count > 0));
    }

    const dateFilter = buildDateFilter({ range, startDate: start_date, endDate: end_date, alias: 'orders' });

    const result = await pool.query(`
      SELECT 
        source as channel,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE status IN (${REVENUE_ORDER_STATUS_SQL})
        AND COALESCE(integrity_status, 'valid') = 'valid'
        AND EXISTS (SELECT 1 FROM order_items valid_items WHERE valid_items.order_id = orders.id)
      ${dateFilter.sql}
      GROUP BY source
      ORDER BY total_revenue DESC
    `, dateFilter.params);

    res.json(result.rows.map(row => ({
      channel: row.channel,
      order_count: parseInt(row.order_count),
      total_revenue: parseFloat(row.total_revenue),
      avg_order_value: parseFloat(row.avg_order_value)
    })));
  } catch (error) {
    console.error('Sales by channel error:', error);
    if (isDatabaseConnectivityError(error)) {
      const report = await salesReportFallback({ range: 'custom', start_date, end_date });
      return res.json([
        { channel: 'online', order_count: report.online_orders, total_revenue: report.online_revenue, avg_order_value: report.online_orders ? report.online_revenue / report.online_orders : 0 },
        { channel: 'pos', order_count: report.pos_orders, total_revenue: report.pos_revenue, avg_order_value: report.pos_orders ? report.pos_revenue / report.pos_orders : 0 },
      ].filter((row) => row.order_count > 0));
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get stock levels report
export const getStockLevelsReport = async (req, res) => {
  try {
    if (shouldUseDatabaseReadFallback()) {
      return res.json(await stockLevelsFallback());
    }

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
    if (isDatabaseConnectivityError(error)) {
      return res.json(await stockLevelsFallback());
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get top selling products
export const getTopProducts = async (req, res) => {
  const { limit = 10, range = '30d', start_date, end_date } = req.query;

  try {
    if (shouldUseDatabaseReadFallback()) {
      return res.json(await topProductsFallback({ limit, start_date, end_date }));
    }

    const dateFilter = buildDateFilter({ range, startDate: start_date, endDate: end_date, startIndex: 2 });

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
      WHERE o.status IN (${REVENUE_ORDER_STATUS_SQL})
        AND COALESCE(o.integrity_status, 'valid') = 'valid'
      ${dateFilter.sql}
      GROUP BY p.id, p.name, p.part_number, p.image, p.price, p.stock_quantity, c.name
      ORDER BY total_sold DESC
      LIMIT $1
    `, [limit, ...dateFilter.params]);

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
    if (isDatabaseConnectivityError(error)) {
      return res.json(await topProductsFallback({ limit, start_date, end_date }));
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get daily sales trend
export const getDailySalesTrend = async (req, res) => {
  const { days = 30 } = req.query;

  try {
    if (shouldUseDatabaseReadFallback()) {
      return res.json(await dailyTrendFallback({ days }));
    }

    const parsedDays = Math.min(365, Math.max(1, Number.parseInt(days, 10) || 30));
    const result = await pool.query(`
      SELECT 
        (created_at AT TIME ZONE $1)::date as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(CASE WHEN source = 'online' THEN 1 END) as online_orders,
        COUNT(CASE WHEN source = 'pos' THEN 1 END) as pos_orders
      FROM orders
      WHERE status IN (${REVENUE_ORDER_STATUS_SQL})
        AND COALESCE(integrity_status, 'valid') = 'valid'
        AND (created_at AT TIME ZONE $1) >= (NOW() AT TIME ZONE $1) - ($2::int * INTERVAL '1 day')
        AND EXISTS (SELECT 1 FROM order_items valid_items WHERE valid_items.order_id = orders.id)
      GROUP BY (created_at AT TIME ZONE $1)::date
      ORDER BY date ASC
    `, [BUSINESS_TIME_ZONE, parsedDays]);

    res.json(result.rows.map(row => ({
      date: row.date,
      order_count: parseInt(row.order_count),
      revenue: parseFloat(row.revenue),
      online_orders: parseInt(row.online_orders),
      pos_orders: parseInt(row.pos_orders)
    })));
  } catch (error) {
    console.error('Daily sales trend error:', error);
    if (isDatabaseConnectivityError(error)) {
      return res.json(await dailyTrendFallback({ days }));
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Get profit report (considering buying price)
export const getProfitReport = async (req, res) => {
  const { range = '30d', start_date, end_date } = req.query;

  try {
    if (shouldUseDatabaseReadFallback()) {
      return res.json(await profitReportFallback({ start_date, end_date }));
    }

    const dateFilter = buildDateFilter({ range, startDate: start_date, endDate: end_date });

    const result = await pool.query(`
      WITH valid_orders AS (
        SELECT o.id, o.total_amount, o.discount_amount
        FROM orders o
        WHERE o.status IN (${REVENUE_ORDER_STATUS_SQL})
          AND COALESCE(o.integrity_status, 'valid') = 'valid'
          AND EXISTS (SELECT 1 FROM order_items valid_items WHERE valid_items.order_id = o.id)
          ${dateFilter.sql}
      ), item_costs AS (
        SELECT oi.order_id, COALESCE(SUM(oi.quantity * p.buying_price), 0) AS order_cost
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id IN (SELECT id FROM valid_orders)
        GROUP BY oi.order_id
      )
      SELECT COUNT(*) AS total_orders,
             COALESCE(SUM(vo.total_amount), 0) AS total_revenue,
             COALESCE(SUM(ic.order_cost), 0) AS total_cost,
             COALESCE(SUM(vo.total_amount) - SUM(ic.order_cost), 0) AS gross_profit,
             COALESCE(SUM(vo.discount_amount), 0) AS total_discounts
      FROM valid_orders vo
      LEFT JOIN item_costs ic ON ic.order_id = vo.id
    `, dateFilter.params);

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
    if (isDatabaseConnectivityError(error)) {
      return res.json(await profitReportFallback({ start_date, end_date }));
    }
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPosSalesReport = async (req, res) => {
  const { range = '30d', start_date, end_date } = req.query;
  try {
    const dateFilter = buildDateFilter({ range, startDate: start_date, endDate: end_date });
    const result = await pool.query(`
      SELECT o.id, o.receipt_number, o.status, o.payment_status, o.payment_method,
             o.total_amount, o.voided_at, o.created_at,
             COUNT(oi.id)::int AS item_lines,
             COALESCE(SUM(oi.quantity), 0)::int AS units
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.source = 'pos'
        AND COALESCE(o.integrity_status, 'valid') = 'valid'
        ${dateFilter.sql}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, dateFilter.params);
    const sales = result.rows.map((row) => ({
      ...row,
      total_amount: toNumber(row.total_amount),
      item_lines: toNumber(row.item_lines),
      units: toNumber(row.units),
    }));
    const completed = sales.filter((sale) => !sale.voided_at && sale.status !== 'cancelled' && sale.payment_status === 'paid');
    const voided = sales.filter((sale) => sale.voided_at || sale.status === 'cancelled');
    return res.json({
      range,
      total_sales: completed.length,
      total_revenue: completed.reduce((sum, sale) => sum + sale.total_amount, 0),
      voided_sales: voided.length,
      sales,
    });
  } catch (error) {
    console.error('POS sales report error:', error);
    return res.status(500).json({ message: 'POS sales report could not be loaded.' });
  }
};
