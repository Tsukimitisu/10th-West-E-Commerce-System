import { inventorySearch, INVENTORY_SEARCH_FROM } from './inventorySearch.js';

const AVAILABLE = 'COALESCE(variant_summary.available_stock, GREATEST(0, COALESCE(p.stock_quantity,0)-COALESCE(p.reserved_stock,0)))';
const SORT = { name:'p.name', part_number:'p.part_number', available_stock:AVAILABLE, store_selling_price:'COALESCE(p.store_selling_price,p.price)' };

// Reuse inventory's canonical model/label search. POS stock uses sellable units,
// with variant availability replacing the parent stock when variants exist.
export function posProductSearch(query = {}) {
  const search = inventorySearch({ ...query, stockStatus:undefined, in_stock_only:false, status:undefined }, {
    extraSearch:['variant_summary.search_text'],
  });
  const values = [...search.values];
  values.push(search.q);
  const exact = `$${values.length}`;
  const where = [search.where, "p.inventory_status = 'active'"];
  const category = query.category_id;
  if (category != null && String(category).trim() !== '') {
    const id = Number(category);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Choose a valid category.'), {status:400});
    values.push(id);
    where.push(`p.category_id = $${values.length}`);
  }
  const stock = query.stockStatus ?? query.stock_status ?? 'all';
  if (['in','in_stock'].includes(stock)) where.push(`${AVAILABLE} > COALESCE(p.low_stock_threshold,0)`);
  if (['low','low_stock'].includes(stock)) where.push(`${AVAILABLE} > 0 AND ${AVAILABLE} <= COALESCE(p.low_stock_threshold,0)`);
  if (['out','out_of_stock'].includes(stock)) where.push(`${AVAILABLE} = 0`);
  const positive = (value, fallback, max) => Number.isInteger(Number(value)) && Number(value)>0 ? Math.min(Number(value),max) : fallback;
  return {
    values,
    page:positive(query.page,1,1000000),
    pageSize:positive(query.limit ?? query.pageSize,30,100),
    available:AVAILABLE,
    from:`${INVENTORY_SEARCH_FROM}
      LEFT JOIN LATERAL (
        SELECT SUM(GREATEST(0,COALESCE(pv.stock_quantity,0)-COALESCE(pv.reserved_stock,0))) AS available_stock,
          STRING_AGG(CONCAT_WS(' ',pv.sku,pv.variant_type,pv.variant_value,pv.option_combination::text,
            to_jsonb(pv)->>'barcode',to_jsonb(pv)->>'part_number'),' ') AS search_text,
          BOOL_OR(LOWER(TRIM(pv.sku))=LOWER(${exact}) OR LOWER(TRIM(to_jsonb(pv)->>'barcode'))=LOWER(${exact})
            OR LOWER(TRIM(to_jsonb(pv)->>'part_number'))=LOWER(${exact})) AS exact_match
        FROM product_variants pv WHERE pv.product_id=p.id
      ) variant_summary ON true
      WHERE ${where.join(' AND ')}`,
    order:`${search.q ? `CASE WHEN LOWER(TRIM(p.part_number))=LOWER(${exact}) OR LOWER(TRIM(p.sku))=LOWER(${exact})
      OR LOWER(TRIM(p.barcode))=LOWER(${exact}) OR variant_summary.exact_match THEN 0 ELSE 1 END,` : ''}
      ${SORT[query.sortBy] || SORT.name} ${query.sortDir==='desc'?'DESC':'ASC'} NULLS LAST,p.id ASC`,
  };
}
