import pool from '../config/database.js';

import { inventorySearch, INVENTORY_SEARCH_FROM } from '../services/inventorySearch.js';

export const buildProductItemsQuery = (query = {}) => {
  const search = inventorySearch(query);
  const { values,page,pageSize } = search;
  const from = `${INVENTORY_SEARCH_FROM} WHERE ${search.where}`;
  return {
    page,pageSize,
    countSql: `SELECT COUNT(*)::int AS total ${from}`,
    itemsSql: `SELECT p.id, p.part_number, p.name, p.color,p.motorcycle_model_id,p.barcode,p.sku,
      COALESCE(p.store_selling_price, p.price) AS price,
      p.stock_quantity,p.low_stock_threshold,p.box_number,p.box_location,p.brand,
      COALESCE(model.model_name,p.motorcycle_model) AS motorcycle_model,c.name AS category,p.inventory_status AS status
      ${from} ORDER BY ${search.priority}${search.sort} ${search.direction} NULLS LAST,p.id ASC
      LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    countValues:values,itemValues:[...values,pageSize,(page-1)*pageSize],
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
        motorcycleModelId: row.motorcycle_model_id,
        barcode: row.barcode,
        sku: row.sku,
        category: row.category,
        status: row.status,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.total || 0,
    });
  } catch (error) {
    console.error('List inventory product items error:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to load product items.' });
  }
};
