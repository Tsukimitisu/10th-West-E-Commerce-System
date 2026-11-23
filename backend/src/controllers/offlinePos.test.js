import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFileSync} from 'node:fs';
import pool from '../config/database.js';
import {createPosOrder} from './posController.js';
import {getOfflineDevice} from './offlinePosController.js';
import {validateOfflineEnvelope,setOfflineReserve,createOfflineSnapshot} from '../services/offlinePos.js';
import {requirePermission,requireRole} from '../middleware/auth.js';
after(()=>pool.end());
const device='11111111-1111-4111-8111-111111111111';
const snapshot='22222222-2222-4222-8222-222222222222';
const key='33333333-3333-4333-8333-333333333333';
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
const request=(overrides={})=>({body:{items:[{product_id:1,variant_id:null,quantity:1,unit_price:120}],payment_method:'cash',amount_tendered:200,offline:{device_id:device,snapshot_id:snapshot,transaction_id:key,created_at:new Date().toISOString()}},user:{id:7,role:'owner'},get:name=>name==='Idempotency-Key'?key:null,...overrides});

// Transactional adapter, not a shared database. Exercises the actual POS order
// controller, its existing SQL write path and the new offline transaction seam.
function database(){
  const model={state:{device:{id:device,device_uuid:device,is_active:true,name:'POS'},product:{id:1,name:'Brake pad',price:150,store_selling_price:150,stock_quantity:10,reserved_stock:3},grant:{unit_price:120,allowance:3,consumed:0},hold:{id:'1:0',remaining:3,target_quantity:3},ledger:new Map(),idempotency:new Map(),orders:[],movements:[],payments:[],items:[],audits:[]},calls:[],tail:Promise.resolve()};
  model.connect=async()=>{
    let checkpoint;let unlock;
    return {release(){},async query(source,args=[]){
      const sql=source.replace(/\s+/g,' ').trim();model.calls.push({sql,args});
      const rows=v=>({rows:v==null?[]:Array.isArray(v)?v:[v],rowCount:v==null?0:Array.isArray(v)?v.length:1});
      if(sql==='BEGIN'){checkpoint=structuredClone(model.state);return rows();}
      if(sql.includes('pg_advisory_xact_lock')){const previous=model.tail;model.tail=new Promise(r=>{unlock=r;});await previous;checkpoint=structuredClone(model.state);return rows();}
      if(sql==='COMMIT'){unlock?.();unlock=null;return rows();}
      if(sql==='ROLLBACK'){model.state=checkpoint;unlock?.();unlock=null;return rows();}
      const s=model.state;
      if(sql.startsWith('SELECT * FROM pos_offline_devices WHERE id='))return rows(s.device?.is_active && s.device.id===args[0]?s.device:null);
      if(sql.startsWith('SELECT * FROM pos_offline_devices WHERE is_active'))return rows(s.device?.is_active?s.device:null);
      if(sql.startsWith('SELECT id FROM pos_offline_devices WHERE device_uuid'))return rows(s.device?.device_uuid===args[0]?s.device:null);
      if(sql.startsWith('INSERT INTO pos_offline_devices')){s.device={id:args[0],device_uuid:args[1],name:'10th West POS',is_active:true};return rows(s.device);}
      if(sql.startsWith('UPDATE pos_offline_devices SET is_active=false')){if(!s.device?.is_active)return rows();s.device.is_active=false;return rows({id:s.device.id});}
      if(sql.startsWith('UPDATE pos_offline_devices SET'))return rows({});
      if(sql.startsWith('SELECT request_hash,response FROM pos_offline_sales'))return rows(s.ledger.get(args[0]));
      if(sql.startsWith('SELECT * FROM pos_offline_snapshots'))return rows(args[0]===snapshot?{id:snapshot,device_id:device,created_by:7,created_at:new Date(Date.now()-3600000),expires_at:new Date(Date.now()+3600000)}:null);
      if(sql.startsWith('SELECT * FROM pos_offline_snapshot_items'))return rows(s.grant);
      if(sql.startsWith('SELECT id FROM products'))return rows(s.inactive?null:{id:1});
      if(sql.startsWith('SELECT id,stock_quantity,reserved_stock FROM products'))return rows(s.product);
      if(sql.startsWith('SELECT id FROM product_variants'))return rows({id:2});
      if(sql.startsWith('SELECT remaining') || sql.startsWith('SELECT id,remaining'))return rows(s.hold);
      if(sql.startsWith('UPDATE pos_offline_reserves SET remaining=remaining-')){s.hold.remaining-=args[0];return rows({});}
      if(sql.startsWith('UPDATE pos_offline_reserves SET quarantined')){s.hold.quarantined=true;return rows({});}
      if(sql.startsWith('UPDATE products SET reserved_stock=reserved_stock-')||sql.startsWith('UPDATE product_variants SET reserved_stock=reserved_stock-')){if(s.product.stock_quantity<s.product.reserved_stock||s.product.reserved_stock<args[0])return rows();s.product.reserved_stock-=args[0];return rows({id:1});}
      if(sql.startsWith('UPDATE pos_offline_snapshot_items')){s.grant.consumed+=args[0];return rows({});}
      if(sql.startsWith('INSERT INTO idempotency_keys')){const id=`${args[0]}:${args[1]}`;if(s.idempotency.has(id))return rows();const row={request_hash:args[2],status:'processing'};s.idempotency.set(id,row);return rows(row);}
      if(sql.startsWith('SELECT * FROM idempotency_keys'))return rows(s.idempotency.get(`${args[0]}:${args[1]}`));
      if(sql.startsWith('SELECT p.id, p.name'))return rows(s.inactive?null:s.product);
      if(sql.startsWith('SELECT COUNT(*)::int AS count FROM product_variants'))return rows({count:s.hasVariant?1:0});
      if(sql.startsWith('SELECT id, product_id, variant_type'))return rows(s.variantMissing?null:{id:2,product_id:1,price:150,stock_quantity:s.product.stock_quantity,reserved_stock:s.product.reserved_stock});
      if(sql.startsWith('UPDATE products SET stock_quantity = stock_quantity -')||sql.startsWith('UPDATE product_variants SET stock_quantity = stock_quantity -')){if(s.product.stock_quantity-s.product.reserved_stock<args[0])return rows();const before=s.product.stock_quantity;s.product.stock_quantity-=args[0];return rows({before,after:s.product.stock_quantity});}
      if(sql.startsWith('INSERT INTO orders')){const o={id:s.orders.length+1,source:'pos',status:'paid',payment_status:'paid',payment_method:args[4],total_amount:args[0],subtotal_amount:args[1],discount_amount:args[2],tax_amount:args[3],amount_tendered:args[7],change_due:args[8],cashier_id:args[9],created_at:new Date().toISOString()};s.orders.push(o);return rows(o);}
      if(sql.startsWith('UPDATE orders SET receipt_number')){s.orders.find(o=>o.id===args[1]).receipt_number=args[0];return rows({});}
      if(sql.startsWith('UPDATE orders SET created_at=')){s.orders.find(o=>o.id===args[1]).created_at=args[0];return rows({});}
      if(sql.startsWith('UPDATE payments SET paid_at='))return rows({});
      if(sql.startsWith('INSERT INTO order_items')){s.items.push({order_id:args[0],product_id:args[1],variant_id:args[2],product_name:args[3],product_price:args[4],quantity:args[5],line_total:args[4]*args[5]});return rows({});}
      if(sql.startsWith('INSERT INTO stock_movements')){s.movements.push(args);return rows({});}
      if(sql.startsWith('INSERT INTO payments')){const payment={id:s.payments.length+1,provider:args[2],method:args[3],status:'paid',amount:args[4],currency:'PHP'};s.payments.push(payment);return rows(payment);}
      if(sql.startsWith('INSERT INTO audit_logs')){s.audits.push({action:args[1],metadata:args[8]});return rows({});}
      if(sql.startsWith('INSERT INTO activity_logs')||sql.startsWith('INSERT INTO order_status_history'))return rows({});
      if(sql.startsWith('SELECT o.*, u.name AS cashier_name'))return rows(s.orders.find(o=>o.id===args[0]));
      if(sql.includes('FROM order_items WHERE order_id'))return rows(s.items.filter(i=>i.order_id===args[0]));
      if(sql.includes('FROM payments WHERE order_id'))return rows(s.payments.at(-1));
      if(sql.startsWith('INSERT INTO pos_offline_sales')){s.ledger.set(args[0],{request_hash:args[3],response:JSON.parse(args[5])});return rows({});}
      if(sql.startsWith('UPDATE idempotency_keys')){Object.assign(s.idempotency.get(`${args[0]}:${args[1]}`),{status:'completed',response_body:JSON.parse(args[3])});return rows({});}
      throw new Error(`Unexpected test SQL: ${sql}`);
    }};
  };
  return model;
}
const install=(t,db)=>{t.mock.method(pool,'connect',db.connect);t.mock.method(console,'error',()=>{});};

test('offline cash uses existing order writer, cached server price, paid cash payment, normal receipt and one stock movement',async t=>{
  const db=database();install(t,db);const res=response();await createPosOrder(request(),res);
  assert.equal(res.statusCode,201);assert.equal(res.body.receipt.total_amount,120);assert.equal(db.state.product.stock_quantity,9);assert.equal(db.state.product.reserved_stock,2);assert.equal(db.state.hold.remaining,2);
  assert.equal(db.state.payments[0].method,'cash');assert.equal(db.state.payments[0].status,'paid');assert.equal(db.state.movements.length,1);assert.match(res.body.receipt.receipt_number,/^POS-/);assert.ok(db.state.audits.some(a=>a.action==='OFFLINE_POS_SALE_SYNCED'));
});
test('permanent UUID ledger deduplicates after normal idempotency expiry and across authorized cashier sessions',async t=>{
  const db=database();install(t,db);const req=request();await createPosOrder(req,response());db.state.idempotency.clear();const res=response();await createPosOrder({...req,user:{id:8,role:'owner'}},res);
  assert.equal(res.statusCode,200);assert.equal(db.state.orders.length,1);assert.equal(db.state.movements.length,1);assert.equal(db.state.product.stock_quantity,9);
});
test('cached completion can repair the durable ledger without consuming stock or allowance again',async t=>{
  const db=database();install(t,db);const req=request();await createPosOrder(req,response());db.state.ledger.clear();const hold=db.state.hold.remaining;const consumed=db.state.grant.consumed;
  const res=response();await createPosOrder(req,res);assert.equal(res.statusCode,201);assert.equal(db.state.hold.remaining,hold);assert.equal(db.state.grant.consumed,consumed);assert.equal(db.state.product.stock_quantity,9);assert.equal(db.state.ledger.size,1);
});
test('a cached failed attempt never consumes offline allowance or asks for a new transaction UUID',async t=>{
  const db=database();install(t,db);const req=request();await createPosOrder(req,response());const row=db.state.idempotency.get(`7:${key}`);db.state.ledger.clear();row.status='failed';
  const hold=db.state.hold.remaining;const res=response();await createPosOrder(req,res);assert.equal(res.statusCode,409);assert.equal(res.body.code,'OFFLINE_POS_PRIOR_FAILURE');assert.equal(db.state.hold.remaining,hold);assert.equal(db.state.product.stock_quantity,9);
});
test('concurrent retry of the same offline sale cannot double deduct inventory',async t=>{
  const db=database();install(t,db);const req=request();const results=[response(),response()];await Promise.all(results.map(res=>createPosOrder(req,res)));
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,201]);assert.equal(db.state.orders.length,1);assert.equal(db.state.movements.length,1);
});
test('same UUID with changed quantities is rejected without another order or stock deduction',async t=>{
  const db=database();install(t,db);const req=request();await createPosOrder(req,response());req.body.items[0].quantity=2;const res=response();await createPosOrder(req,res);assert.equal(res.statusCode,409);assert.equal(res.body.code,'IDEMPOTENCY_KEY_CONFLICT');assert.equal(db.state.product.stock_quantity,9);
});
for(const mode of ['gcash','paymongo'])test(`offline ${mode} is rejected`,async t=>{
  const db=database();install(t,db);const req=request();req.body.payment_method=mode;req.body.payment_reference='test-ref';const res=response();await createPosOrder(req,res);assert.equal(res.statusCode,400);assert.equal(db.state.orders.length,0);
});
for(const kind of ['price','allowance','inactive','variant','stock','revoked','window'])test(`${kind} conflict preserves stock, hold and sale ledger`,async t=>{
  const db=database();install(t,db);const req=request();
  if(kind==='price')req.body.items[0].unit_price=1;
  if(kind==='allowance')db.state.grant.allowance=0;
  if(kind==='inactive')db.state.inactive=true;
  if(kind==='variant'){req.body.items[0].variant_id=2;db.state.variantMissing=true;}
  if(kind==='stock')db.state.product.stock_quantity=0;
  if(kind==='revoked')db.state.device.is_active=false;
  if(kind==='window')req.body.offline.created_at=new Date(Date.now()-2*3600000).toISOString();
  const before=structuredClone(db.state);const res=response();await createPosOrder(req,res);assert.ok(res.statusCode>=400);assert.equal(db.state.orders.length,0);assert.equal(db.state.product.stock_quantity,before.product.stock_quantity);assert.equal(db.state.product.reserved_stock,before.product.reserved_stock);assert.equal(db.state.ledger.size,0);
});
test('online POS still uses current price and cannot consume the protected offline hold',async t=>{
  const db=database();install(t,db);const req=request();delete req.body.offline;const res=response();await createPosOrder(req,res);assert.equal(res.statusCode,201);assert.equal(res.body.receipt.total_amount,150);assert.equal(db.state.product.reserved_stock,3);assert.equal(db.state.ledger.size,0);
});
test('snapshot persists authoritative variant prices and only physically protected allowances',async()=>{
  let stored;
  const client={async query(sql,args=[]){
    if(sql.includes('FROM pos_offline_devices'))return {rows:[{id:device,is_active:true}]};
    if(sql.includes('remaining < target_quantity'))return {rows:[]};
    if(sql.includes('COALESCE(p.store_selling_price,p.price)'))return {rows:[{id:1,name:'Helmet',price:'100.00'},{id:2,name:'Pad',price:'120.00'}]};
    if(sql.includes('FROM product_variants v'))return {rows:[{id:10,product_id:1,variant_type:'Color',variant_value:'Black',price:null,price_adjustment:'0.10'}]};
    if(sql.includes('FROM pos_offline_reserves r'))return {rows:[{id:'1:10',product_id:1,variant_id:10,remaining:2,stock_quantity:5,reserved_stock:2},{id:'2:0',product_id:2,variant_id:null,remaining:3,stock_quantity:1,reserved_stock:3}]};
    if(sql.includes('jsonb_to_recordset'))stored=JSON.parse(args[1]);
    return {rows:[]};
  }};
  const result=await createOfflineSnapshot(client,device,7);
  assert.equal(result.products[0].variants[0].price,100.10);assert.equal(result.products[0].variants[0].available_stock,2);assert.equal(result.products[1].available_stock,0);
  assert.deepEqual(stored,[{key:'1:10',price:100.10,allowance:2},{key:'2:0',price:120,allowance:0}]);assert.equal(result.device_id,device);assert.ok(Date.parse(result.expires_at)>Date.now());
});
test('offline envelope rejects future sale, changed transaction reference, promotions and noncash',()=>{
  for(const change of [r=>r.body.offline.created_at=new Date(Date.now()+5*60000).toISOString(),r=>r.body.offline.transaction_id=crypto.randomUUID(),r=>r.body.promotion_code='SALE',r=>r.body.payment_method='gcash']){const req=request();change(req);assert.throws(()=>validateOfflineEnvelope(req.body,key));}
});
test('protected reserve cannot be configured with invalid quantity or released from quarantine without review',async()=>{
  await assert.rejects(setOfflineReserve({query:()=>assert.fail('invalid request must not query')},{productId:1,quantity:-1}),/valid item/);
  const db=database();db.state.hold.quarantined=true;const client=await db.connect();await assert.rejects(setOfflineReserve(client,{deviceId:device,productId:1,quantity:3}),/Review the old computer/);
});
test('POS authorization remains backend-enforced; reserve management uses existing inventory permission',async t=>{
  t.mock.method(pool,'query',async()=>({rows:[{has_permission:false}]}));
  for(const role of ['store_staff','cashier','customer']){const res=response();await requirePermission('pos.access')({user:{id:7,role}},res,()=>assert.fail('permission required'));assert.equal(res.statusCode,403);}
  const unauthorized=response();await requirePermission('pos.access')({},unauthorized,()=>assert.fail());assert.equal(unauthorized.statusCode,401);
  const customer=response();requireRole('owner','super_admin','store_staff','cashier')({user:{role:'customer'}},customer,()=>assert.fail());assert.equal(customer.statusCode,403);
  const routes=readFileSync(new URL('../routes/pos.js',import.meta.url),'utf8');assert.match(routes,/router\.post\('\/orders', \.\.\.canAccessPos, createPosOrder\)/);assert.match(routes,/requirePermission\('inventory.adjust'\)/);assert.match(routes,/requireRole\('owner','super_admin','admin'\)/);
});
test('legacy migration protects one device, stock holds, private data and refuses destructive rollback',()=>{
  const migration=readFileSync(new URL('../../migrations/202610200004_offline_pos.cjs',import.meta.url),'utf8');assert.match(migration,/CREATE UNIQUE INDEX pos_one_active_offline_device/);assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/protect_product_offline_hold/);assert.match(migration,/preserve issued snapshots/);assert.doesNotMatch(migration,/password|pin_hash|session_cookie/);
});


test('missing offline schema gives an actionable safe error',async t=>{
  t.mock.method(pool,'connect',async()=>({release(){},query:async sql=>{if(sql.includes('FROM pos_offline_devices'))throw Object.assign(new Error('private SQL'),{code:'42P01'});return {rows:[]};}}));
  const res=response();await getOfflineDevice(request({query:{device_uuid:device}}),res);assert.equal(res.statusCode,503);assert.equal(res.body.code,'OFFLINE_POS_SCHEMA_NOT_READY');assert.match(res.body.message,/Apply the offline POS migration/);assert.doesNotMatch(JSON.stringify(res.body),/private SQL/);
});
