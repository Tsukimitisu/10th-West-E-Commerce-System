import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import {registerOfflineDevice,revokeOfflineDevice,getOfflineDevice,getOfflineDevices} from './offlinePosController.js';
import {setOfflineReserve,createOfflineSnapshot,prepareOfflineSale,lockOfflineDevice} from '../services/offlinePos.js';
import {createPosOrder} from './posController.js';
import {requireRole,requirePermission} from '../middleware/auth.js';
import {fixture,A,B,response,request} from './offlinePosFixture.js';
let f;
before(async()=>{f=await fixture();});
beforeEach(async()=>f.reset());
after(async()=>{await f?.close();await pool.end();});
const install=t=>{t.mock.method(pool,'connect',f.connect);t.mock.method(console,'error',(_label,error)=>{if(!error?.status)process.stderr.write(`Isolated SQL fixture: ${error?.message}\n`);});};
const transaction=async fn=>{const c=await f.connect();try{await c.query('BEGIN');await lockOfflineDevice(c);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
const register=async(uuid=B,role='owner')=>{const r=response();await registerOfflineDevice(request({device_uuid:uuid,name:'My Laptop'},{user:{id:7,role}}),r);return r;};
const scalar=async(sql,args=[])=>Object.values((await f.db.query(sql,args)).rows[0])[0];
const allocate=(deviceId,quantity,variantId=null,reviewed=false)=>transaction(c=>setOfflineReserve(c,{deviceId,productId:variantId?2:1,variantId,quantity,reviewed}));
const snapshot=deviceId=>transaction(c=>createOfflineSnapshot(c,deviceId,7));
const sale=(s,{quantity=1,key=crypto.randomUUID(),variantId=null,price=120}={})=>{
  const req=request({items:[{product_id:variantId?2:1,variant_id:variantId,quantity,unit_price:price}],payment_method:'cash',amount_tendered:1000,
    offline:{device_id:s.device_id,snapshot_id:s.id,transaction_id:key,created_at:new Date().toISOString()}},{get:name=>name==='Idempotency-Key'?key:null});
  return {req,key};
};

test('second approved laptop registers while A remains active; own UUID lookup and duplicates are idempotent',async t=>{
  install(t);const b=await register();assert.equal(b.statusCode,200);assert.equal(await scalar('SELECT COUNT(*) FROM pos_offline_devices WHERE is_active'),2);
  const again=await register();assert.equal(again.body.device.id,b.body.device.id);assert.equal(await scalar('SELECT COUNT(*) FROM pos_offline_devices'),2);
  const own=response();await getOfflineDevice(request({}, {query:{device_uuid:A}}),own);assert.equal(own.body.device.id,A);
  const unspecified=response();await getOfflineDevice(request(),unspecified);assert.equal(unspecified.body.device,null);
  const all=response();await getOfflineDevices(request(),all);assert.equal(all.body.devices.length,2);
  await assert.rejects(f.db.query('INSERT INTO pos_offline_devices(id,device_uuid,name) VALUES($1,$2,$3)',[crypto.randomUUID(),A,'Duplicate']),/unique/);
});
for(const role of ['customer','store_staff','cashier'])test(`${role} cannot approve a new device`,async t=>{install(t);const r=await register(B,role);assert.equal(r.statusCode,403);assert.equal(await scalar('SELECT COUNT(*) FROM pos_offline_devices'),1);});
test('approved staff can prepare their existing device; fresh authentication and safe bounded names remain required',async t=>{
  install(t);assert.equal((await register(A,'store_staff')).statusCode,200);
  const stale=response();await registerOfflineDevice(request({device_uuid:B},{session:{}}),stale);assert.equal(stale.statusCode,401);
  for(const name of ['<script>','x'.repeat(81)]){const r=response();await registerOfflineDevice(request({device_uuid:B,name}),r);assert.equal(r.statusCode,400);}
});
test('revoked computer needs management reauthorization and keeps its identity and quarantined hold',async t=>{
  install(t);await revokeOfflineDevice(request({}, {params:{id:A}}),response());assert.equal((await register(A,'cashier')).statusCode,403);
  const r=await register(A);assert.equal(r.body.device.id,A);assert.equal(await scalar('SELECT quarantined FROM pos_offline_reserves WHERE device_id=$1',[A]),true);
});
test('allocations and variant allowances belong to one device; aggregate online availability is protected',async t=>{
  install(t);const b=(await register()).body.device.id;await allocate(b,3);await allocate(A,1,20);await allocate(b,2,21);
  const sa=await snapshot(A),sb=await snapshot(b);
  assert.equal(sa.products[0].available_stock,2);assert.equal(sb.products[0].available_stock,3);
  assert.deepEqual(sa.products[1].variants.map(v=>v.available_stock),[1,0]);assert.deepEqual(sb.products[1].variants.map(v=>v.available_stock),[0,2]);
  assert.equal(await scalar('SELECT stock_quantity-reserved_stock FROM products WHERE id=1'),5);
  await assert.rejects(allocate(b,9),/Only 5 units/);assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),5);
});
test('A cannot submit B snapshot and cannot consume B allocation when its own stock is exhausted',async t=>{
  install(t);const b=(await register()).body.device.id;await allocate(b,3);const sa=await snapshot(A),sb=await snapshot(b);
  const wrong=sale(sb);wrong.req.body.offline.device_id=A;
  await assert.rejects(transaction(c=>prepareOfflineSale(c,wrong.req,wrong.key,'hash')),/authorized offline window/);
  const over=sale(sa,{quantity:3});const res=response();await createPosOrder(over.req,res);assert.equal(res.statusCode,409);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[b]),3);
});
test('the final physical units cannot be allocated twice and aggregate DB protection remains enforced',async t=>{
  install(t);const b=(await register()).body.device.id;
  await f.db.query('UPDATE products SET stock_quantity=2 WHERE id=1');
  await assert.rejects(allocate(b,2),/Only 0 units/);assert.equal((await snapshot(b)).products[0].available_stock,0);
  await assert.rejects(f.db.query('UPDATE products SET reserved_stock=0 WHERE id=1'),/protected for offline POS/);
});
test('simultaneous A and B sales use the existing order writer, ledger, receipt and stock movements exactly once',async t=>{
  install(t);const b=(await register()).body.device.id;await allocate(b,3);const sa=await snapshot(A),sb=await snapshot(b);
  const sales=[sale(sa),sale(sb)];const replies=[response(),response()];await Promise.all(sales.map((s,i)=>createPosOrder(s.req,replies[i])));
  assert.deepEqual(replies.map(r=>r.statusCode),[201,201]);assert.equal(await scalar('SELECT COUNT(*) FROM orders'),2);
  assert.equal(await scalar('SELECT stock_quantity FROM products WHERE id=1'),8);assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),3);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),1);assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[b]),2);
  for(const s of sales){const res=response();await createPosOrder(s.req,res);assert.equal(res.statusCode,200);assert.match(res.body.receipt.receipt_number,/^POS-/);}
  assert.equal(await scalar('SELECT COUNT(*) FROM orders'),2);assert.equal(await scalar('SELECT COUNT(*) FROM stock_movements'),2);
  assert.equal(await scalar("SELECT COUNT(*) FROM payments WHERE method='cash' AND status='paid'"),2);
  assert.equal(await scalar("SELECT COUNT(*) FROM audit_logs WHERE action='OFFLINE_POS_SALE_SYNCED' AND metadata ? 'device_id'"),2);
  const changed=structuredClone(sales[0].req.body);changed.items[0].quantity=2;const conflict=response();await createPosOrder({...sales[0].req,body:changed},conflict);assert.equal(conflict.statusCode,409);
});
test('revoking A leaves B active, its reserve unquarantined and B able to sync; no global revoke fallback',async t=>{
  install(t);const b=(await register()).body.device.id;await allocate(b,3);const sb=await snapshot(b);
  const invalid=response();await revokeOfflineDevice(request(),invalid);assert.equal(invalid.statusCode,400);
  await revokeOfflineDevice(request({}, {params:{id:A}}),response());
  assert.equal(await scalar('SELECT is_active FROM pos_offline_devices WHERE id=$1',[b]),true);
  assert.equal(await scalar('SELECT quarantined FROM pos_offline_reserves WHERE device_id=$1',[A]),true);assert.equal(await scalar('SELECT quarantined FROM pos_offline_reserves WHERE device_id=$1',[b]),false);
  await assert.rejects(snapshot(A),/revoked/);const res=response();await createPosOrder(sale(sb).req,res);assert.equal(res.statusCode,201);
  await allocate(A,0,null,true);assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[b]),2);
});
test('releasing reviewed device protection preserves other devices and non-POS reservations',async t=>{
  install(t);const b=(await register()).body.device.id;await allocate(b,3);
  await f.db.query('UPDATE products SET reserved_stock=reserved_stock+1 WHERE id=1');
  await revokeOfflineDevice(request({}, {params:{id:A}}),response());await allocate(A,0,null,true);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),4);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[b]),3);
});
test('legacy migration preserves laptop, hold, snapshots, sales, price grants and aggregate stock',async t=>{
  install(t);await f.reset({migrate:false});const id=crypto.randomUUID();
  await f.db.query("INSERT INTO pos_offline_snapshots(id,device_id,created_by,expires_at,catalogue) VALUES($1,$2,7,now()+interval '72 hours','[]')",[id,A]);
  await f.db.query("INSERT INTO pos_offline_snapshot_items(snapshot_id,item_key,unit_price,allowance) VALUES($1,'1:0',120,2)",[id]);
  await f.db.query('INSERT INTO orders(id) VALUES(91)');
  await f.db.query("INSERT INTO pos_offline_sales(transaction_id,device_id,snapshot_id,request_hash,order_id,response,sold_at) VALUES($1,$2,$3,'hash',91,'{}',now())",[crypto.randomUUID(),A,id]);
  await f.multi.up({raw:f.raw});
  assert.equal(await scalar("SELECT device_id FROM pos_offline_reserves WHERE id='1:0'"),A);assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves'),2);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);assert.equal(await scalar('SELECT COUNT(*) FROM pos_offline_sales'),1);
  assert.equal(await scalar('SELECT allowance FROM pos_offline_snapshot_items'),2);assert.equal(await scalar('SELECT COUNT(*) FROM pos_offline_snapshots'),1);
  const res=response();await createPosOrder(sale({id,device_id:A}).req,res);assert.equal(res.statusCode,201);
  assert.equal(await scalar('SELECT stock_quantity FROM products WHERE id=1'),9);
});
test('ambiguous legacy protection is never released or assigned to new laptops; explicit review is required',async t=>{
  install(t);await f.reset({migrate:false,active:false});await f.multi.up({raw:f.raw});
  const row=(await f.db.query('SELECT * FROM pos_offline_reserves')).rows[0];assert.equal(row.device_id,null);assert.equal(row.quarantined,true);assert.equal(row.remaining,2);
  await assert.rejects(f.db.query('UPDATE pos_offline_reserves SET quarantined=false WHERE device_id IS NULL'),/pos_unassigned_reserve_quarantined/);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);const b=(await register()).body.device.id;assert.equal((await snapshot(b)).products[0].available_stock,0);
  await assert.rejects(allocate(null,0),/Review physical stock/);await allocate(null,0,null,true);assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),0);
});
test('down migration refuses multi-device or ambiguous protected state; safe one-device rollback retains original hold',async t=>{
  install(t);await register();await assert.rejects(f.multi.down({raw:f.raw}),/reconciled before rollback/);
  await f.reset();await f.multi.down({raw:f.raw});assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves'),2);assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);
});
test('POS access and management-only device mutations remain backend guarded',async t=>{
  t.mock.method(pool,'query',async()=>({rows:[{has_permission:false}]}));
  for(const role of ['customer','store_staff','cashier']){const res=response();await requirePermission('pos.access')({user:{id:7,role}},res,()=>assert.fail());assert.equal(res.statusCode,403);}
  for(const role of ['customer','store_staff','cashier']){const res=response();requireRole('owner','super_admin','admin')({user:{role}},res,()=>assert.fail());assert.equal(res.statusCode,403);}
});
