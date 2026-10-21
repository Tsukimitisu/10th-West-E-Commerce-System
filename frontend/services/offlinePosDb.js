// Native IndexedDB only. Never clear a store on upgrades or recovery errors.
const STORES = ['metadata','products','pending_sales','receipts','offline_access'];
let opening;
export const openOfflinePosDb = () => opening ||= new Promise((resolve,reject) => {
  const request = indexedDB.open('10th-west-offline-pos',1);
  request.onupgradeneeded = () => {
    for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name,{ keyPath:'id' });
  };
  request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening=null; }; resolve(request.result); };
  request.onerror = () => { opening=null; reject(request.error); };
  request.onblocked = () => reject(new Error('Close other POS tabs to update offline storage. Pending sales have been preserved.'));
});
const result = request => new Promise((resolve,reject) => { request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
export const posTransaction = async (names,mode,fn) => {
  const db = await openOfflinePosDb();
  const tx = db.transaction(names,mode);
  const done = new Promise((resolve,reject) => { tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error || new Error('Offline data could not be saved.')); tx.onerror=()=>{}; });
  const stores = Object.fromEntries(names.map(name => [name,tx.objectStore(name)]));
  try { const value = await fn(stores,result); await done; return value; }
  catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await done.catch(()=>{}); throw error; }
};
export const readPosValue = (store,id) => posTransaction([store],'readonly',async(s,r)=>r(s[store].get(id)));
export const writePosValue = (store,value) => posTransaction([store],'readwrite',async(s,r)=>r(s[store].put(value)));
export const allPosValues = store => posTransaction([store],'readonly',async(s,r)=>r(s[store].getAll()));
export const offlinePosStockSummary = async () => {
  let products=0,units=0;
  for(const product of await allPosValues('products')){
    const quantity=(product.variants?.length ? product.variants : [product]).reduce((sum,item)=>sum+Math.max(0,Number(item.available_stock) || 0),0);
    if(quantity>0)products++;units+=quantity;
  }
  return {products,units};
};
export const pendingPosSales = async () => (await allPosValues('pending_sales')).filter(s=>s.status !== 'synchronized').sort((a,b)=>a.created_at.localeCompare(b.created_at));
export const posMoney = v => Math.round((Number(v)+Number.EPSILON)*100)/100;
const itemKey = i => `${i.product_id}:${i.variant_id || 0}`;
const targetFor = (p,i) => i.variant_id ? p?.variants?.find(v=>Number(v.id)===Number(i.variant_id)) : p;

export const savePosSnapshot = snapshot => posTransaction(['metadata','products','pending_sales'],'readwrite',async(s,r)=>{
  const pending = (await r(s.pending_sales.getAll())).filter(x=>x.status !== 'synchronized');
  const deductions = new Map();
  for (const sale of pending) for (const item of sale.items) deductions.set(itemKey(item),(deductions.get(itemKey(item)) || 0)+item.quantity);
  await r(s.products.clear()); // Catalogue replacement only; NEVER pending sales or receipts.
  for (const product of snapshot.products) {
    const p = structuredClone(product);
    p.available_stock=Math.max(0,p.available_stock-(deductions.get(`${p.id}:0`) || 0));
    for (const v of p.variants || []) v.available_stock=Math.max(0,v.available_stock-(deductions.get(`${p.id}:${v.id}`) || 0));
    await r(s.products.put(p));
  }
  const { products:ignored,...metadata } = snapshot;
  await r(s.metadata.put({ ...metadata,id:'snapshot',snapshot_id:snapshot.id }));
});
export const searchOfflineProducts = async ({ search='',categoryId='' }={}) => {
  const term=search.trim().toLowerCase();
  return (await allPosValues('products')).filter(p=>(!categoryId || Number(p.category_id)===Number(categoryId)) && (!term || [p.name,p.sku,p.barcode,p.part_number,p.motorcycle_model,p.color,p.box_location,...(p.variants || []).flatMap(v=>[v.sku,v.barcode,v.part_number,v.variant_value])].some(v=>String(v || '').toLowerCase().includes(term))));
};
export const quoteOfflineCart = items => {
  const subtotal=posMoney(items.reduce((sum,i)=>sum+Number(i.variant?.price ?? (Number(i.product.price)+Number(i.variant?.price_adjustment || 0)))*i.quantity,0));
  return { valid:items.length>0,subtotal_amount:subtotal,discount_amount:0,total_amount:subtotal,tax_amount:posMoney(subtotal-subtotal/1.12) };
};
export const validateOfflineCart = async items => {
  const snapshot=await readPosValue('metadata','snapshot');
  const grant=await readPosValue('offline_access','grant');
  if(!snapshot || !grant || Date.parse(snapshot.expires_at)<=Date.now() || Date.parse(grant.expires_at)<=Date.now())throw new Error('Reconnect to renew offline access. Pending sales are safe.');
  const checked=[];
  for(const item of items){
    const product=await readPosValue('products',item.product_id);
    const variant=item.variant_id ? targetFor(product,item) : null;
    const target=variant || product;
    if(!target || (item.variant_id && !variant) || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>100 || item.quantity>target.available_stock)throw new Error('No offline stock remaining for this item.');
    checked.push({...item,product,variant});
  }
  return quoteOfflineCart(checked);
};

export const commitOfflineCashSale = ({ items,amountTendered,paymentMethod='cash',transactionId,cashier }) => posTransaction(['metadata','products','pending_sales','receipts','offline_access'],'readwrite',async(s,r)=>{
  if (paymentMethod !== 'cash') throw new Error('Online payments are unavailable while offline. Cash payments are still available.');
  const grant=await r(s.offline_access.get('grant'));
  const snapshot=await r(s.metadata.get('snapshot'));
  if (!grant || !snapshot || grant.device_id !== snapshot.device_id || Date.parse(grant.expires_at)<=Date.now() || Date.parse(snapshot.expires_at)<=Date.now()) throw new Error('Offline access has expired. Reconnect and prepare this computer again. Pending sales are safe.');
  if (!items.length || items.length>100 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId)) throw new Error('Add valid items before accepting payment.');
  if (await r(s.pending_sales.get(transactionId))) throw new Error('This offline sale has already been saved. Open Recent sales.');
  const merged=new Map();
  for (const i of items) {
    if (!Number.isInteger(i.quantity) || i.quantity<1 || i.quantity>100) throw new Error('Quantity must be between 1 and 100.');
    const key=itemKey(i); const old=merged.get(key); merged.set(key,{ ...i,quantity:i.quantity+(old?.quantity || 0) });
  }
  const lines=[];
  for (const i of merged.values()) {
    const product=await r(s.products.get(i.product_id));
    const target=targetFor(product,i);
    if (!product || !target || (!i.variant_id && product.variants?.length) || i.quantity>100 || i.quantity>target.available_stock) throw new Error('No offline stock remaining for this item.');
    const price=posMoney(target.price ?? Number(product.price)+Number(target.price_adjustment || 0));
    if(!Number.isFinite(price)||price<0)throw new Error('The cached price is invalid. Reconnect before selling this item.');
    lines.push({ product_id:product.id,variant_id:i.variant_id || null,quantity:i.quantity,unit_price:price,product_price:price,product_name:product.name,variant_name_snapshot:i.variant_id ? `${target.variant_type}: ${target.variant_value}` : null,line_total:posMoney(price*i.quantity) });
    target.available_stock-=i.quantity;
    await r(s.products.put(product));
  }
  const total=posMoney(lines.reduce((sum,i)=>sum+i.line_total,0));
  if (!Number.isFinite(Number(amountTendered)) || Number(amountTendered)<total) throw new Error('Cash received must cover the total.');
  const created_at=new Date().toISOString();
  const sale={ id:transactionId,offline_transaction_id:transactionId,device_id:snapshot.device_id,snapshot_id:snapshot.snapshot_id,created_at,cashier_id:cashier.id,cashier_name:cashier.name || 'Cashier',items:lines,subtotal_amount:total,tax_amount:posMoney(total-total/1.12),discount_amount:0,total_amount:total,amount_tendered:posMoney(amountTendered),change_due:posMoney(amountTendered-total),payment_method:'cash',status:'pending',sync_attempts:0,receipt_number:`OFF-POS-${transactionId.slice(0,8).toUpperCase()}`,offline_sale:true };
  await r(s.pending_sales.put(sale));
  await r(s.receipts.put(sale));
  return sale;
});
export const updateOfflineSale = (id,update) => posTransaction(['pending_sales','receipts'],'readwrite',async(s,r)=>{
  const current=await r(s.pending_sales.get(id));
  if (!current) throw new Error('Offline sale is missing.');
  const next={ ...current,...update,id };
  await r(s.pending_sales.put(next));
  await r(s.receipts.put(next));
  return next;
});
