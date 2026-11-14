const text = value => String(value ?? '').trim().slice(0,160);
const positive = (value,fallback,max) => Number.isInteger(Number(value)) && Number(value)>0 ? Math.min(Number(value),max) : fallback;
const STOCK = { success:'in_stock',warning:'low_stock',danger:'out_of_stock',in:'in_stock',low:'low_stock',out:'out_of_stock' };
const SORT = {
  itemName:'p.name',name:'p.name',partNumber:'p.part_number',part_number:'p.part_number',
  motorcycleModel:'COALESCE(model.model_name,p.motorcycle_model)',motorcycle_model:'COALESCE(model.model_name,p.motorcycle_model)',
  location:"COALESCE(NULLIF(p.box_location,''),p.box_number)",box_location:"COALESCE(NULLIF(p.box_location,''),p.box_number)",
  price:'COALESCE(p.store_selling_price, p.price)',store_selling_price:'COALESCE(p.store_selling_price, p.price)',
  stockQuantity:'p.stock_quantity',stock_quantity:'p.stock_quantity',created_at:'p.created_at',
};

// Shared management search. Joins use the canonical model ID; names/brands are
// searchable labels only. Every value is bound and sort expressions allowlisted.
export function inventorySearch(query = {}, { category = true,extraSearch = [],modelId = 'p.motorcycle_model_id',includeDeleted = false } = {}) {
  const values = [],where = [includeDeleted ? 'true' : 'COALESCE(p.is_deleted, false) = false'];
  const add = (sql,value) => where.push(sql.replace(/\?/g,()=>{ values.push(value);return `$${values.length}`; }));
  const q = text(query.q ?? query.search);
  if (q) {
    const fields = ['p.part_number','p.name','p.color','p.brand','COALESCE(model.model_name, p.motorcycle_model)',
      'model.brand','p.box_number','p.box_location','p.barcode','p.sku',...(category?['c.name']:[]),...extraSearch];
    add(`(${fields.map(column=>`${column} ILIKE ?`).join(' OR ')})`,`%${q}%`);
  }
  const selectedModel = query.model_id ?? query.motorcycle_model_id;
  if (selectedModel !== undefined && String(selectedModel).trim() !== '') {
    const id = Number(selectedModel);
    if (!Number.isSafeInteger(id) || id<=0 || id>2147483647) throw Object.assign(new Error('Choose a valid motorcycle model.'),{status:400});
    add(`${modelId} = ?`,id);
  }
  for (const [key,column] of [['partNumber','p.part_number'],['itemName','p.name'],['color','p.color'],['brand','p.brand'],
    ['motorcycleModel','COALESCE(model.model_name, p.motorcycle_model)'],...(category?[['category','c.name']]:[])]) {
    if (text(query[key])) add(`${column} ILIKE ?`,`%${text(query[key])}%`);
  }
  if (text(query.location ?? query.boxNumber)) add('(p.box_number ILIKE ? OR p.box_location ILIKE ?)',`%${text(query.location ?? query.boxNumber)}%`);
  const stock = STOCK[query.stockStatus] || query.stockStatus;
  if (stock==='out_of_stock') where.push('p.stock_quantity = 0');
  if (stock==='low_stock') where.push('p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold');
  if (stock==='in_stock') where.push('p.stock_quantity > p.low_stock_threshold');
  if (query.in_stock_only === 'true' || query.in_stock_only === true) where.push('p.stock_quantity > 0');
  if (text(query.status)) add('p.inventory_status = ?',text(query.status));
  if (text(query.product_id)) add('p.id = ?',positive(query.product_id,0,2147483647));
  return {
    q,values,where:where.join(' AND '),
    page:positive(query.page,1,1000000),pageSize:positive(query.pageSize,20,100),
    priority:q ? "CASE WHEN LOWER(p.part_number)=LOWER(SUBSTRING($1 FROM 2 FOR CHAR_LENGTH($1)-2)) THEN 0 ELSE 1 END," : '',
    sort:SORT[query.sortBy] || SORT.itemName,direction:query.sortDir==='desc'?'DESC':'ASC',
  };
}

export const INVENTORY_SEARCH_FROM = `FROM products p
  LEFT JOIN motorcycle_models model ON model.id=p.motorcycle_model_id
  LEFT JOIN categories c ON c.id=p.category_id`;
