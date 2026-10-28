import pool from '../config/database.js';

const SORT_COLUMNS = Object.freeze({
  itemName: 'p.name',
  partNumber: 'p.part_number',
  location: 'COALESCE(NULLIF(p.box_location, \'\'), NULLIF(p.box_number, \'\'))',
  price: 'COALESCE(p.store_selling_price, p.price)',
  stockQuantity: 'p.stock_quantity',
});

const asText = (value) => String(value ?? '').trim().slice(0, 160);
const asPositiveInt = (value, fallback, max) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

export const buildProductItemsQuery = (query = {}) => {
  const page = asPositiveInt(query.page, 1, 1000000);
  const pageSize = asPositiveInt(query.pageSize, 20, 100);
  const values = [];
  const where = ['COALESCE(p.is_deleted, false) = false'];
  const add = (sql, value) => {
    where.push(sql.replace(/\?/g, () => {
      values.push(value);
      return `$${values.length}`;
    }));
  };
  const search = asText(query.q || query.search);
  if (search) add(`(p.part_number ILIKE ? OR p.name ILIKE ? OR p.color ILIKE ? OR p.brand ILIKE ?
    OR COALESCE(model.model_name, p.motorcycle_model) ILIKE ? OR c.name ILIKE ?
    OR p.box_number ILIKE ? OR p.box_location ILIKE ?)`, `%${search}%`);
  const filters = [
    ['partNumber', 'p.part_number'], ['itemName', 'p.name'], ['color', 'p.color'],
    ['brand', 'p.brand'], ['motorcycleModel', 'COALESCE(model.model_name, p.motorcycle_model)'],
    ['category', 'c.name'],
  ];
  for (const [key, column] of filters) {
    const value = asText(query[key]);
    if (value) add(`${column} ILIKE ?`, `%${value}%`);
  }
  const location = asText(query.location || query.boxNumber);
  if (location) add('(p.box_number ILIKE ? OR p.box_location ILIKE ?)', `%${location}%`);
  const stockStatus = asText(query.stockStatus);
  if (stockStatus === 'out_of_stock') where.push('p.stock_quantity = 0');
  if (stockStatus === 'low_stock') where.push('p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold');
  if (stockStatus === 'in_stock') where.push('p.stock_quantity > p.low_stock_threshold');
  const status = asText(query.status);
  if (status) add('p.inventory_status = ?', status);
  const from = `FROM products p
    LEFT JOIN motorcycle_models model ON model.id = p.motorcycle_model_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}`;
  const sortColumn = SORT_COLUMNS[query.sortBy] || SORT_COLUMNS.itemName;
  const sortDirection = query.sortDir === 'desc' ? 'DESC' : 'ASC';
  return {
    page, pageSize,
    countSql: `SELECT COUNT(*)::int AS total ${from}`,
    itemsSql: `SELECT p.id, p.part_number, p.name, p.color,
      COALESCE(p.store_selling_price, p.price) AS price,
      p.stock_quantity, p.low_stock_threshold, p.box_number, p.box_location,
      p.brand, COALESCE(model.model_name, p.motorcycle_model) AS motorcycle_model,
      c.name AS category, p.inventory_status AS status
      ${from}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, p.id ASC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    countValues: values,
    itemValues: [...values, pageSize, (page - 1) * pageSize],
  };
};

export const listInventoryProductItems = async (req, res) => {
  try {
    const query = buildProductItemsQuery(req.query);
    const [count, result] = await Promise.all([
      pool.query(query.countSql, query.countValues),
      pool.query(query.itemsSql, query.itemValues),
    ]);
    res.json({
      items: result.rows.map((row) => ({
        id: row.id,
        partNumber: row.part_number,
        itemName: row.name,
        color: row.color,
        price: Number(row.price),
        stockQuantity: Number(row.stock_quantity),
        lowStockThreshold: Number(row.low_stock_threshold),
        boxNumber: row.box_number,
        storageLocation: row.box_location,
        brand: row.brand,
        motorcycleModel: row.motorcycle_model,
        category: row.category,
        status: row.status,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.total || 0,
    });
  } catch (error) {
    console.error('List inventory product items error:', error);
    res.status(500).json({ message: 'Unable to load product items.' });
  }
};
