import crypto from 'node:crypto';
import { writeAuditLog } from '../utils/audit.js';

export const offlineError = (message, code = 'OFFLINE_POS_CONFLICT', status = 409) => Object.assign(new Error(message), { status, code });
export const itemKey = item => `${item.product_id}:${item.variant_id || 0}`;
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
export const offlineAccessHours = () => {
  const hours = Number(process.env.OFFLINE_POS_ACCESS_HOURS || 72);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw offlineError('Offline POS access configuration is invalid.', 'OFFLINE_POS_CONFIG', 503);
  return hours;
};
export const lockOfflineDevice = client => client.query('SELECT pg_advisory_xact_lock(197510, 1)');
export const requireDevice = async (client, id) => {
  if (!uuid(id)) throw offlineError('Reconnect and prepare this POS computer.', 'OFFLINE_POS_DEVICE_INVALID');
  const { rows } = await client.query('SELECT * FROM pos_offline_devices WHERE id=$1 AND is_active=true FOR UPDATE', [id]);
  if (!rows[0]) throw offlineError('Offline access for this computer has been revoked.', 'OFFLINE_POS_DEVICE_REVOKED', 403);
  return rows[0];
};

// Holds live inside reserved_stock, alongside checkout reservations. Never
// release a checkout reservation when changing an offline hold.
export const setOfflineReserve = async (client, { deviceId, productId, variantId = null, quantity,reviewed = false,automatic = false }) => {
  if (!Number.isInteger(productId) || productId < 1 || (variantId !== null && (!Number.isInteger(variantId) || variantId < 1)) || !Number.isInteger(quantity) || quantity < 0 || quantity > 10000) {
    throw offlineError('Enter a valid item and reserve quantity (0–10000).', 'OFFLINE_POS_RESERVE_INVALID', 400);
  }
  if (deviceId == null) {
    if (quantity !== 0 || !reviewed) throw offlineError('Review physical stock and pending sales before releasing unassigned protection.', 'OFFLINE_POS_RESERVE_INVALID',400);
  } else if (quantity === 0 && reviewed && uuid(deviceId)) {
    const device = (await client.query('SELECT * FROM pos_offline_devices WHERE id=$1 FOR UPDATE',[deviceId])).rows[0];
    if (!device) throw offlineError('Select a registered computer.');
  } else {
    const device=await requireDevice(client, deviceId);
    if(device.stock_mode==='automatic' && !automatic)throw offlineError('Switch this computer to Manual before setting reserve quantities.','OFFLINE_POS_AUTOMATIC_RESERVE');
  }
  const product = (await client.query("SELECT id FROM products WHERE id=$1 AND inventory_status='active' AND COALESCE(is_deleted,false)=false FOR UPDATE", [productId])).rows[0];
  if (!product) throw offlineError('This inventory item is unavailable.');
  const table = variantId ? 'product_variants' : 'products';
  if (!variantId && Number((await client.query('SELECT COUNT(*)::int AS count FROM product_variants WHERE product_id=$1', [productId])).rows[0].count)) throw offlineError('Select a variant to reserve its stock.');
  const target = (await client.query(`SELECT id,stock_quantity,reserved_stock FROM ${table} WHERE id=$1 ${variantId ? 'AND product_id=$2' : ''} FOR UPDATE`, variantId ? [variantId,productId] : [productId])).rows[0];
  if (!target) throw offlineError('This variant is unavailable.');
  const key = itemKey({ product_id: productId, variant_id: variantId });
  const old = (await client.query('SELECT id,remaining,quarantined FROM pos_offline_reserves WHERE device_id IS NOT DISTINCT FROM $1::uuid AND product_id=$2 AND variant_id IS NOT DISTINCT FROM $3::int FOR UPDATE', [deviceId,productId,variantId])).rows[0];
  if (deviceId == null && !old) throw offlineError('No unassigned protected reserve exists.');
  if(old?.quarantined && !reviewed)throw offlineError('Review the old computer’s pending sales and physical stock, then confirm that review before releasing this protected reserve.');
  const delta = quantity - Number(old?.remaining || 0);
  if (Number(target.stock_quantity) - Number(target.reserved_stock) < delta) throw offlineError(`Only ${Math.max(0,Number(target.stock_quantity)-Number(target.reserved_stock))} units are currently available for additional offline reserve.`);
  // Do not reduce an issued allowance during its offline window: physical sales
  // may already exist on the disconnected computer. Revocation is explicit.
  if (delta < 0) {
    const issued = (await client.query(`SELECT COUNT(*)::int AS issued,COALESCE(BOOL_OR(s.expires_at>now() AND d.is_active),false) AS live
      FROM pos_offline_snapshot_items i JOIN pos_offline_snapshots s ON s.id=i.snapshot_id
      JOIN pos_offline_devices d ON d.id=s.device_id WHERE i.item_key=$1 AND ($2::uuid IS NULL OR s.device_id=$2) AND i.allowance>i.consumed`, [key,deviceId])).rows[0];
    if (issued?.live) throw offlineError('Synchronize pending sales and wait for the issued offline allowance to expire, or revoke the device before reducing this reserve.');
    if(Number(issued?.issued)>0 && !reviewed)throw offlineError('Review physical stock and all pending offline sales, then confirm that review before reducing this reserve.');
  }
  // Increase the aggregate first; decrease the hold first (DB guard).
  if (delta > 0) await client.query(`UPDATE ${table} SET reserved_stock=reserved_stock+$1 WHERE id=$2`, [delta,target.id]);
  if (old) await client.query('UPDATE pos_offline_reserves SET target_quantity=$1,remaining=$1,quarantined=$3 WHERE id=$2', [quantity,old.id,deviceId == null]);
  else await client.query(`INSERT INTO pos_offline_reserves(id,device_id,product_id,variant_id,target_quantity,remaining) VALUES($1,$2,$3,$4,$5,$5)`, [`${deviceId}:${key}`,deviceId,productId,variantId,quantity]);
  if (delta < 0) await client.query(`UPDATE ${table} SET reserved_stock=reserved_stock+$1 WHERE id=$2`, [delta,target.id]);
};

export const setOfflineStockMode = async (client,deviceId,mode) => {
  if(!['automatic','manual'].includes(mode))throw offlineError('Select Automatic or Manual stock mode.','OFFLINE_POS_STOCK_MODE_INVALID',400);
  await lockOfflineDevice(client);
  await requireDevice(client,deviceId);
  if(mode==='automatic'){
    const other=(await client.query("SELECT id FROM pos_offline_devices WHERE is_active AND stock_mode='automatic' AND id<>$1",[deviceId])).rows[0];
    if(other)throw offlineError('Another computer is already the primary automatic device. Switch it to Manual first. Existing protected stock remains reserved.','OFFLINE_POS_AUTOMATIC_DEVICE_CONFLICT');
  }
  // Switching mode never releases holds, including live or quarantined ones.
  return (await client.query('UPDATE pos_offline_devices SET stock_mode=$2 WHERE id=$1 RETURNING id,device_uuid,name,is_active,stock_mode,last_synced_at',[deviceId,mode])).rows[0];
};

const allocateAutomaticStock = async (client,deviceId) => {
  const holds=(await client.query('SELECT * FROM pos_offline_reserves WHERE device_id=$1',[deviceId])).rows;
  const byItem=new Map(holds.map(h=>[itemKey(h),h]));
  // Match the POS inventory eligibility and product-before-variant lock order.
  // Variants have no independent active flag in the current inventory schema.
  const items=(await client.query(`SELECT p.id AS product_id,NULL::int AS variant_id FROM products p
    WHERE p.inventory_status='active' AND COALESCE(p.is_deleted,false)=false
      AND NOT EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id)
    UNION ALL SELECT v.product_id,v.id FROM product_variants v JOIN products p ON p.id=v.product_id
    WHERE p.inventory_status='active' AND COALESCE(p.is_deleted,false)=false
    ORDER BY product_id,variant_id NULLS FIRST`)).rows;
  for(const item of items){
    const hold=byItem.get(itemKey(item));
    if(hold?.quarantined)continue; // Physical reconciliation must remain explicit.
    await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[item.product_id]);
    const table=item.variant_id ? 'product_variants' : 'products';
    const target=(await client.query(`SELECT stock_quantity,reserved_stock FROM ${table} WHERE id=$1 FOR UPDATE`,[item.variant_id || item.product_id])).rows[0];
    if(!target)continue;
    // reserved_stock already includes checkout, other devices, legacy quarantine,
    // and this device's outstanding physical-sale protection. Never subtract a
    // pending sale again here: savePosSnapshot performs that local deduction.
    const quantity=Number(hold?.remaining || 0)+Math.max(0,Number(target.stock_quantity)-Number(target.reserved_stock));
    if(!quantity || (quantity===Number(hold?.remaining) && quantity===Number(hold?.target_quantity)))continue;
    await setOfflineReserve(client,{deviceId,productId:item.product_id,variantId:item.variant_id,quantity,automatic:true});
  }
};

export const createOfflineSnapshot = async (client, deviceId, userId) => {
  await lockOfflineDevice(client);
  const device=await requireDevice(client, deviceId);
  if(device.stock_mode==='automatic')await allocateAutomaticStock(client,deviceId);
  // Refill configured holds only from genuinely unreserved physical stock.
  // Local snapshot replacement subtracts unsynchronized physical sales, so a
  // reconnect cannot reissue an allowance those pending sales already consumed.
  const configured=device.stock_mode==='automatic' ? [] : (await client.query('SELECT * FROM pos_offline_reserves WHERE device_id=$1 AND remaining < target_quantity AND NOT quarantined ORDER BY product_id,variant_id NULLS FIRST', [deviceId])).rows;
  for(const hold of configured){
    await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[hold.product_id]);
    const table=hold.variant_id ? 'product_variants' : 'products';
    const target=(await client.query(`SELECT stock_quantity,reserved_stock FROM ${table} WHERE id=$1 FOR UPDATE`,[hold.variant_id || hold.product_id])).rows[0];
    const addition=Math.max(0,Math.min(hold.target_quantity-hold.remaining,Number(target?.stock_quantity || 0)-Number(target?.reserved_stock || 0)));
    if(addition){
      await client.query(`UPDATE ${table} SET reserved_stock=reserved_stock+$1 WHERE id=$2`,[addition,hold.variant_id || hold.product_id]);
      await client.query('UPDATE pos_offline_reserves SET remaining=remaining+$1 WHERE id=$2',[addition,hold.id]);
    }
  }
  const rows = (await client.query(`SELECT p.id,p.name,p.sku,p.barcode,p.part_number,p.image,p.category_id,
    COALESCE(model.model_name,p.motorcycle_model) AS motorcycle_model,p.color,p.box_location,
    COALESCE(p.store_selling_price,p.price) AS price FROM products p LEFT JOIN motorcycle_models model ON model.id=p.motorcycle_model_id
    WHERE p.inventory_status='active' AND COALESCE(p.is_deleted,false)=false ORDER BY p.id LIMIT 20001`)).rows;
  if (rows.length > 20000) throw offlineError('The offline catalogue is too large. Contact support.', 'OFFLINE_POS_CATALOGUE_LIMIT');
  const variants = (await client.query(`SELECT v.id,v.product_id,v.sku,v.variant_type,v.variant_value,v.option_combination,v.price,v.price_adjustment,v.image_url
    FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.inventory_status='active' AND COALESCE(p.is_deleted,false)=false ORDER BY v.id`)).rows;
  const reserves = (await client.query(`SELECT r.product_id,r.variant_id,r.remaining,
    CASE WHEN r.variant_id IS NULL THEN p.stock_quantity ELSE v.stock_quantity END AS stock_quantity,
    CASE WHEN r.variant_id IS NULL THEN p.reserved_stock ELSE v.reserved_stock END AS reserved_stock
    FROM pos_offline_reserves r JOIN products p ON p.id=r.product_id
    LEFT JOIN product_variants v ON v.id=r.variant_id AND v.product_id=r.product_id WHERE r.device_id=$1 AND NOT r.quarantined`, [deviceId])).rows;
  const holds = new Map(reserves.map(r => [itemKey(r),Number(r.stock_quantity)>=Number(r.reserved_stock) && Number(r.reserved_stock)>=Number(r.remaining) ? Number(r.remaining) : 0]));
  const snapshotId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + offlineAccessHours()*3600000);
  const items = [];
  const childrenByProduct=new Map();
  for(const variant of variants){if(!childrenByProduct.has(variant.product_id))childrenByProduct.set(variant.product_id,[]);childrenByProduct.get(variant.product_id).push(variant);}
  const catalogue = rows.map(p => {
    const children = (childrenByProduct.get(p.id) || []).map(v => ({ ...v, price: Number(v.price ?? Number(p.price)+Number(v.price_adjustment || 0)), available_stock: holds.get(`${p.id}:${v.id}`) || 0 }));
    const product = { ...p, price:Number(p.price), available_stock:holds.get(`${p.id}:0`) || 0, variants:children };
    for (const v of children.length ? children : [null]) {
      const price=Math.round(((v?.price ?? product.price)+Number.EPSILON)*100)/100;
      if(!Number.isFinite(price)||price<0)throw offlineError('An inventory item has an invalid price. Correct it before synchronizing the catalogue.','OFFLINE_POS_PRICE_INVALID');
      if(v)v.price=price;else product.price=price;
      items.push({ key:`${p.id}:${v?.id || 0}`, price, allowance:v?.available_stock ?? product.available_stock });
    }
    return product;
  });
  await client.query('INSERT INTO pos_offline_snapshots(id,device_id,created_by,created_at,expires_at,catalogue) VALUES($1,$2,$3,$4,$5,$6::jsonb)', [snapshotId,deviceId,userId,createdAt,expiresAt,JSON.stringify(catalogue)]);
  await client.query(`INSERT INTO pos_offline_snapshot_items(snapshot_id,item_key,unit_price,allowance)
    SELECT $1, x.key,x.price,x.allowance FROM jsonb_to_recordset($2::jsonb) AS x(key text,price numeric,allowance integer)`,[snapshotId,JSON.stringify(items)]);
  await client.query('UPDATE pos_offline_devices SET last_synced_at=now() WHERE id=$1', [deviceId]);
  return { id:snapshotId, device_id:deviceId, stock_mode:device.stock_mode || 'manual', created_at:createdAt.toISOString(), expires_at:expiresAt.toISOString(), products:catalogue };
};

export const validateOfflineEnvelope = (body, key, now = Date.now()) => {
  const o = body.offline;
  const fields=new Set(['device_id','snapshot_id','transaction_id','created_at']);
  if (!o || typeof o!=='object' || Object.keys(o).some(k=>!fields.has(k)) || !uuid(key) || !uuid(o.device_id) || !uuid(o.snapshot_id) || o.transaction_id !== key || body.payment_method !== 'cash' || body.promotion_code || body.payment_reference) throw offlineError('Offline sales require cash and their original transaction reference.', 'OFFLINE_POS_INVALID', 400);
  const sold = Date.parse(o.created_at);
  if (!Number.isFinite(sold) || sold > now+120000) throw offlineError('Offline sale time is invalid.', 'OFFLINE_POS_TIME_INVALID', 400);
  return o;
};

// Called INSIDE the existing POS transaction, before existing idempotency/order
// creation. Global UUID ledger survives idempotency TTL and cashier changes.
export const prepareOfflineSale = async (client, req, key, requestHash) => {
  const o = validateOfflineEnvelope(req.body, key);
  await lockOfflineDevice(client);
  await requireDevice(client, o.device_id);
  const prior = (await client.query('SELECT request_hash,response FROM pos_offline_sales WHERE transaction_id=$1', [key])).rows[0];
  if (prior) {
    if (prior.request_hash !== requestHash) throw offlineError('This transaction reference already belongs to a different sale.', 'IDEMPOTENCY_KEY_CONFLICT');
    return { response:prior.response };
  }
  const snapshot = (await client.query('SELECT * FROM pos_offline_snapshots WHERE id=$1 AND device_id=$2', [o.snapshot_id,o.device_id])).rows[0];
  const sold = Date.parse(o.created_at);
  if (!snapshot || sold < new Date(snapshot.created_at).getTime() || sold > new Date(snapshot.expires_at).getTime()) throw offlineError('This sale is outside its authorized offline window.', 'OFFLINE_POS_WINDOW_INVALID');
  return { metadata:o,cashier_id:snapshot.created_by };
};

// Run only after the existing idempotency claim accepts a NEW order attempt.
// Cached/failed attempts must never consume a second allowance.
export const consumeOfflineAllowance = async (client,req,items) => {
  const o=req.body.offline;
  const prices = new Map();
  for (const item of [...items].sort((a,b) => a.product_id-b.product_id || (a.variant_id || 0)-(b.variant_id || 0))) {
    const key = itemKey(item);
    const grant = (await client.query('SELECT * FROM pos_offline_snapshot_items WHERE snapshot_id=$1 AND item_key=$2 FOR UPDATE', [o.snapshot_id,key])).rows[0];
    const submitted = req.body.items.find(i => itemKey(i) === key);
    if (!grant || Number(submitted?.unit_price) !== Number(grant.unit_price)) throw offlineError('The saved sale price does not match its authorized catalogue.', 'OFFLINE_POS_PRICE_CONFLICT');
    if (grant.allowance-grant.consumed < item.quantity) throw offlineError('This sale exceeds its issued offline allowance.', 'OFFLINE_POS_ALLOWANCE_CONFLICT');
    // Same product-before-variant lock order as normal POS/inventory mutation.
    await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [item.product_id]);
    const table = item.variant_id ? 'product_variants' : 'products';
    await client.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [item.variant_id || item.product_id]);
    const hold = (await client.query('SELECT id,remaining FROM pos_offline_reserves WHERE device_id=$1 AND product_id=$2 AND variant_id IS NOT DISTINCT FROM $3::int AND NOT quarantined FOR UPDATE', [o.device_id,item.product_id,item.variant_id || null])).rows[0];
    if (!hold || hold.remaining < item.quantity) throw offlineError('Offline stock changed. Review this in-store sale and physical stock.', 'OFFLINE_POS_STOCK_CONFLICT');
    await client.query('UPDATE pos_offline_reserves SET remaining=remaining-$1 WHERE id=$2', [item.quantity,hold.id]);
    const released = await client.query(`UPDATE ${table} SET reserved_stock=reserved_stock-$1 WHERE id=$2 AND reserved_stock >= $1 AND stock_quantity >= reserved_stock RETURNING id`, [item.quantity,item.variant_id || item.product_id]);
    if (!released.rowCount) throw offlineError('Inventory changed before this sale could synchronize.', 'OFFLINE_POS_STOCK_CONFLICT');
    await client.query('UPDATE pos_offline_snapshot_items SET consumed=consumed+$1 WHERE snapshot_id=$2 AND item_key=$3', [item.quantity,o.snapshot_id,key]);
    prices.set(key, Number(grant.unit_price));
  }
  return prices;
};

export const completeOfflineSale = async (client, req, key, hash, response) => {
  const o = req.body.offline;
  await client.query(`INSERT INTO pos_offline_sales(transaction_id,device_id,snapshot_id,request_hash,order_id,response,sold_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [key,o.device_id,o.snapshot_id,hash,response.order.id || response.order.order_id,JSON.stringify(response),o.created_at]);
  await client.query('UPDATE pos_offline_devices SET last_synced_at=now() WHERE id=$1', [o.device_id]);
  await writeAuditLog(client, { req,actorUserId:req.user.id,action:'OFFLINE_POS_SALE_SYNCED',entityType:'pos_offline_sale',entityId:key,metadata:{ device_id:o.device_id, order_id:response.order.id || response.order.order_id, sold_at:o.created_at } });
};
