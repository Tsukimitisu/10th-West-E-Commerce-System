import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import {fixture,A,B,response,request} from './offlinePosFixture.js';
import migration from '../../migrations/202610210003_automatic_offline_pos.cjs';
import {createOfflineSnapshot,setOfflineStockMode,setOfflineReserve,lockOfflineDevice} from '../services/offlinePos.js';
import {registerOfflineDevice,saveOfflineStockMode,revokeOfflineDevice} from './offlinePosController.js';
import {createPosOrder} from './posController.js';
import {readFileSync} from 'node:fs';
let f;
before(async()=>{f=await fixture();});beforeEach(()=>f.reset());after(async()=>{await f?.close();await pool.end();});
const scalar=async(sql,args=[])=>Object.values((await f.db.query(sql,args)).rows[0])[0];
const transaction=async fn=>{const c=await f.connect();try{await c.query('BEGIN');await lockOfflineDevice(c);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
const mode=(id,value)=>transaction(c=>setOfflineStockMode(c,id,value));
const snapshot=(id=A)=>transaction(c=>createOfflineSnapshot(c,id,7));
const register=async(t,uuid=B)=>{t.mock.method(pool,'connect',f.connect);const res=response();await registerOfflineDevice(request({device_uuid:uuid,name:'New Laptop'}),res);return res;};
const quantity=(s,p=1,v=null)=>{const product=s.products.find(row=>row.id===p);return v ? product?.variants.find(row=>row.id===v)?.available_stock : product?.available_stock;};

test('migration leaves existing laptop and reserves Manual; rollback preserves every protected unit',async()=>{
  assert.equal(await scalar('SELECT stock_mode FROM pos_offline_devices WHERE id=$1',[A]),'manual');
  const before=(await f.db.query('SELECT * FROM pos_offline_reserves')).rows;
  await migration.down({raw:sql=>f.db.query(sql)});await migration.up({raw:f.raw});
  assert.deepEqual((await f.db.query('SELECT * FROM pos_offline_reserves')).rows,before);
  await mode(A,'automatic');await assert.rejects(migration.down({raw:sql=>f.db.query(sql)}),/Switch automatic devices to Manual/);
});
test('only a newly registered single-device setup defaults Automatic; registering/reauthorizing existing devices changes nothing',async t=>{
  const b=await register(t);assert.equal(b.body.device.stock_mode,'manual');
  const again=await register(t,A);assert.equal(again.body.device.stock_mode,'manual');
  await f.db.query('UPDATE pos_offline_devices SET is_active=false');
  const c=await register(t,crypto.randomUUID());assert.equal(c.body.device.stock_mode,'automatic');
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_reserves WHERE device_id=$1',[c.body.device.id]),0);
});
test('single Automatic device receives safe stock, excluding existing online/order reservations',async()=>{
  await f.db.query('UPDATE products SET stock_quantity=20,reserved_stock=7 WHERE id=1'); // Own hold 2 + online/order protection 5.
  await mode(A,'automatic');const s=await snapshot();assert.equal(s.stock_mode,'automatic');assert.equal(quantity(s),15);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),20);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1 AND product_id=1',[A]),15);
});
test('variants receive independent safe allowances; inactive/deleted products and missing variants receive none',async()=>{
  await f.db.query('UPDATE product_variants SET reserved_stock=2 WHERE id=20');
  await f.db.query("INSERT INTO products(id,name,price,stock_quantity,inventory_status) VALUES(3,'Inactive',100,12,'inactive')");
  await f.db.query("INSERT INTO products(id,name,price,stock_quantity,is_deleted) VALUES(4,'Deleted',100,12,true)");
  await mode(A,'automatic');const s=await snapshot();assert.equal(quantity(s,2),0);assert.equal(quantity(s,2,20),3);assert.equal(quantity(s,2,21),5);
  assert.equal(quantity(s,3),undefined);assert.equal(quantity(s,4),undefined);
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_reserves WHERE product_id IN(3,4)'),0);
});
test('other-device and legacy quarantined holds remain protected; Automatic only consumes unreserved stock',async t=>{
  const b=(await register(t)).body.device.id;
  await transaction(c=>setOfflineReserve(c,{deviceId:b,productId:1,quantity:3}));
  await f.db.query("INSERT INTO pos_offline_reserves(id,device_id,product_id,target_quantity,remaining,quarantined) VALUES('legacy',NULL,1,1,1,true)");
  await f.db.query('UPDATE products SET reserved_stock=reserved_stock+1 WHERE id=1');
  await mode(A,'automatic');const s=await snapshot();assert.equal(quantity(s),6);assert.equal(quantity(await snapshot(b)),3);
  assert.equal(await scalar("SELECT remaining FROM pos_offline_reserves WHERE id='legacy'"),1);
  assert.equal(await scalar('SELECT stock_quantity-reserved_stock FROM products WHERE id=1'),0);
});
test('quarantined own reserves and inactive product protection are never released or automatically expanded',async()=>{
  await f.db.query('UPDATE pos_offline_reserves SET quarantined=true WHERE device_id=$1',[A]);
  await mode(A,'automatic');assert.equal(quantity(await snapshot()),0);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);
});
test('repeated and simultaneous Automatic syncs cannot duplicate holds or oversell',async()=>{
  await mode(A,'automatic');const first=await snapshot();const rows=(await f.db.query('SELECT * FROM pos_offline_reserves ORDER BY id')).rows;
  const [a,b]=await Promise.all([snapshot(),snapshot()]);assert.equal(quantity(a),quantity(first));assert.equal(quantity(b),quantity(first));
  assert.deepEqual((await f.db.query('SELECT * FROM pos_offline_reserves ORDER BY id')).rows,rows);
  assert.equal(await scalar('SELECT reserved_stock<=stock_quantity FROM products WHERE id=1'),true);
});
test('concurrent primary selection allows only one Automatic device and preserves all other allocations',async t=>{
  const b=(await register(t)).body.device.id;const results=await Promise.allSettled([mode(A,'automatic'),mode(b,'automatic')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/primary automatic device/);
  await assert.rejects(f.db.query("UPDATE pos_offline_devices SET stock_mode='automatic' WHERE id=$1",[b]),/unique/);
});
test('Manual targets continue to refill and switching modes never shrinks live issued protection',async()=>{
  await transaction(c=>setOfflineReserve(c,{deviceId:A,productId:1,quantity:3}));assert.equal(quantity(await snapshot()),3);
  await mode(A,'automatic');assert.equal(quantity(await snapshot()),10);await mode(A,'manual');
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1 AND product_id=1',[A]),10);
  await assert.rejects(transaction(c=>setOfflineReserve(c,{deviceId:A,productId:1,quantity:2})),/issued offline allowance/);
});
test('stock changes update Automatic targets without refilling obsolete larger targets or shrinking remaining holds',async()=>{
  await mode(A,'automatic');await snapshot();
  // Represents a correctly finalized sale: consume hold before aggregate guard.
  await f.db.query('UPDATE pos_offline_reserves SET remaining=remaining-1 WHERE product_id=1');
  await f.db.query('UPDATE products SET reserved_stock=reserved_stock-1,stock_quantity=stock_quantity-1 WHERE id=1');
  assert.equal(quantity(await snapshot()),9);assert.equal(await scalar('SELECT target_quantity FROM pos_offline_reserves WHERE product_id=1'),9);
  await f.db.query('UPDATE products SET stock_quantity=stock_quantity+2 WHERE id=1');assert.equal(quantity(await snapshot()),11);
});
test('offline cash sale consumes the automatic hold once; reconnect retains correct stock and receipt',async t=>{
  t.mock.method(pool,'connect',f.connect);await mode(A,'automatic');const s=await snapshot();const key=crypto.randomUUID();
  const req=request({items:[{product_id:1,variant_id:null,quantity:1,unit_price:120}],payment_method:'cash',amount_tendered:200,offline:{device_id:A,snapshot_id:s.id,transaction_id:key,created_at:new Date().toISOString()}},{get:name=>name==='Idempotency-Key'?key:null});
  const first=response();await createPosOrder(req,first);assert.equal(first.statusCode,201);assert.equal(first.body.receipt.payment_method,'cash');
  const again=response();await createPosOrder(req,again);assert.equal(again.statusCode,200);
  assert.equal(await scalar('SELECT count(*) FROM orders'),1);assert.equal(await scalar('SELECT count(*) FROM stock_movements'),1);
  assert.equal(quantity(await snapshot()),9);assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1 AND product_id=1',[A]),9);
});
test('mode changes retain existing authorization, input validation, audit and revoked-device protection',async t=>{
  t.mock.method(pool,'connect',f.connect);const r=response();await saveOfflineStockMode(request({stock_mode:'automatic'},{params:{id:A}}),r);assert.equal(r.statusCode,200);
  assert.equal(await scalar("SELECT count(*) FROM audit_logs WHERE action='OFFLINE_POS_STOCK_MODE_UPDATED'"),1);
  await assert.rejects(mode(A,'invalid'),/Select Automatic or Manual/);
  const routes=readFileSync(new URL('../routes/pos.js',import.meta.url),'utf8');assert.match(routes,/stock-mode', \.\.\.manageReserve, adminMutationLimiter/);
  await revokeOfflineDevice(request({}, {params:{id:A}}),response());await assert.rejects(mode(A,'automatic'),/revoked/);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  await transaction(c=>setOfflineReserve(c,{deviceId:A,productId:1,quantity:0,reviewed:true}));
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),0);
  assert.equal(await scalar('SELECT stock_quantity FROM products WHERE id=1'),10);
});
test('manual writes cannot override Automatic targets; oversized automatic allocation fails safely with existing reserve limits',async()=>{
  await mode(A,'automatic');await assert.rejects(transaction(c=>setOfflineReserve(c,{deviceId:A,productId:1,quantity:3})),/Switch this computer to Manual/);
  await f.db.query('UPDATE products SET stock_quantity=10001 WHERE id=1');await assert.rejects(snapshot(),/0–10000/);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  await f.db.query('UPDATE products SET stock_quantity=10 WHERE id=1');await f.db.query('UPDATE product_variants SET stock_quantity=10001 WHERE id=21');
  await assert.rejects(snapshot(),/0–10000/); // Roll back earlier product/variant allocations too.
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);
  assert.equal(await scalar('SELECT reserved_stock FROM product_variants WHERE id=20'),0);
});
