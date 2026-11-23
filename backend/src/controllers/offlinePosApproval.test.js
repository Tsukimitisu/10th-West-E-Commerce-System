import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pool from '../config/database.js';
import migration from '../../migrations/202610210002_offline_pos_device_approval.cjs';
import {fixture,A,B,response,request} from './offlinePosFixture.js';
import {requestOfflineDevice,getCurrentOfflineDeviceRequest,listOfflineDeviceRequests,approveOfflineDeviceRequest,rejectOfflineDeviceRequest,registerOfflineDevice,revokeOfflineDevice} from './offlinePosController.js';
import {requireRole,requirePermission} from '../middleware/auth.js';
let f;
before(async()=>{f=await fixture();});
beforeEach(async()=>{await f.reset();await migration.up({raw:f.raw});await f.raw("INSERT INTO users VALUES(8,'James','store_staff'),(9,'Another staff','cashier')");});
after(async()=>{await f?.close();await pool.end();});
const install=t=>t.mock.method(pool,'connect',f.connect);
const scalar=async(sql,args=[])=>Object.values((await f.db.query(sql,args)).rows[0])[0];
const call=async(fn,{role='store_staff',userId=8,body={},id,uuid,session}={})=>{
  const res=response();await fn(request(body,{user:{id:userId,role},params:id?{id}:{},query:uuid?{device_uuid:uuid}:{},...(session?{session}:{})}),res);return res;
};
const ask=(extra={})=>call(requestOfflineDevice,{body:{device_uuid:B,name:'James Laptop'},...extra});
const review=(id,extra={})=>call(approveOfflineDeviceRequest,{id,role:'owner',userId:7,...extra});

for(const role of ['store_staff','cashier'])test(`${role} requests approval; duplicate pending requests are idempotent`,async t=>{
  install(t);const a=await ask({role}),b=await ask({role});assert.equal(a.statusCode,200);assert.equal(a.body.status,'pending');assert.equal(a.body.request.id,b.body.request.id);
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_device_requests'),1);
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_devices'),1);
});
test('POS role/permission and management route guards exclude customers and self-approval',async t=>{
  for(const role of ['customer','store_staff','cashier']){
    let next=false;const res=response();requireRole('owner','admin','super_admin')(request({}, {user:{id:8,role}}),res,()=>{next=true;});assert.equal(res.statusCode,403);assert.equal(next,false);
  }
  const res=response();requireRole('owner','admin','super_admin','store_staff','cashier')(request({}, {user:{id:8,role:'customer'}}),res,()=>assert.fail('customer accepted'));assert.equal(res.statusCode,403);
  t.mock.method(pool,'query',async()=>({rows:[{has_permission:false}]}));
  const denied=response();await requirePermission('pos.access')(request({}, {user:{id:8,role:'store_staff'}}),denied,()=>assert.fail('missing POS permission accepted'));assert.equal(denied.statusCode,403);
  const routes=readFileSync(new URL('../routes/pos.js',import.meta.url),'utf8');
  for(const action of ['approve','reject'])assert.match(routes,new RegExp(`device-requests/:id/${action}'.*manageDevices, adminMutationLimiter`));
  assert.match(routes,/device-requests', \.\.\.canAccessPos, adminMutationLimiter/);
});
for(const role of ['owner','admin','super_admin'])test(`${role} approves atomically with no reserve allocation and preserves Friend Laptop`,async t=>{
  install(t);const pending=await ask();const id=pending.body.request.id;
  const result=await review(id,{role});assert.equal(result.statusCode,200);assert.equal(result.body.device.device_uuid,B);
  assert.equal(result.body.request.status,'approved');assert.equal(await scalar('SELECT count(*) FROM pos_offline_devices WHERE is_active'),2);
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_reserves WHERE device_id=$1',[result.body.device.id]),0);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);
  assert.equal(await scalar('SELECT reviewed_by FROM pos_offline_device_requests WHERE id=$1',[id]),7);
  const again=await review(id);assert.equal(again.statusCode,409);
  const current=await call(getCurrentOfflineDeviceRequest,{uuid:B});assert.equal(current.body.device.id,result.body.device.id);
  const prepare=await call(registerOfflineDevice,{body:{device_uuid:B}});assert.equal(prepare.statusCode,200);assert.equal(prepare.body.device.id,result.body.device.id);
});
for(const role of ['store_staff','cashier'])test(`${role} cannot self-approve or reject`,async t=>{
  install(t);const pending=await ask();for(const fn of [approveOfflineDeviceRequest,rejectOfflineDeviceRequest])assert.equal((await call(fn,{id:pending.body.request.id,role})).statusCode,403);
  assert.equal((await call(registerOfflineDevice,{body:{device_uuid:B}})).statusCode,403);
});
test('active device resolves approved without another request; request serializer excludes unrelated identity',async t=>{
  install(t);const active=await ask({body:{device_uuid:A,name:'Friend Laptop'}});assert.equal(active.body.status,'approved');
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_device_requests'),0);
  await ask();const other=await call(getCurrentOfflineDeviceRequest,{uuid:B,userId:9});assert.equal(other.body.status,'none');assert.equal(other.body.request,null);
  const duplicate=await ask({userId:9});assert.equal(duplicate.statusCode,409);assert.equal(duplicate.body.request,undefined);
  const own=await call(getCurrentOfflineDeviceRequest,{uuid:B});assert.equal(own.body.request.requested_by,undefined);assert.equal(own.body.request.device_uuid,undefined);
});
test('rejection creates no device, records bounded reason, permits a new request and appears in management list',async t=>{
  install(t);const pending=await ask();const id=pending.body.request.id;
  const rejected=await call(rejectOfflineDeviceRequest,{role:'owner',userId:7,id,body:{reason:'Please use the shop laptop'}});assert.equal(rejected.body.status,'rejected');
  assert.equal(await scalar('SELECT count(*) FROM pos_offline_devices'),1);
  const own=await call(getCurrentOfflineDeviceRequest,{uuid:B});assert.equal(own.body.request.rejection_reason,'Please use the shop laptop');
  const second=await ask();assert.notEqual(second.body.request.id,id);
  const list=await call(listOfflineDeviceRequests,{role:'owner'});assert.equal(list.body.requests[0].status,'pending');assert.equal(list.body.requests[0].requested_by_name,'James');
});
test('expired pending requests can be resubmitted and cannot be approved',async t=>{
  install(t);const first=await ask();await f.db.query("UPDATE pos_offline_device_requests SET requested_at=now()-interval '8 days' WHERE id=$1",[first.body.request.id]);
  assert.equal((await call(getCurrentOfflineDeviceRequest,{uuid:B})).body.status,'expired');
  assert.equal((await review(first.body.request.id)).statusCode,409);assert.notEqual((await ask()).body.request.id,first.body.request.id);
});
test('revoked laptop requires explicit approval; reapproval preserves quarantined stock and never reactivates from old decision',async t=>{
  install(t);const pending=await ask();const approved=await review(pending.body.request.id);
  await call(revokeOfflineDevice,{role:'owner',id:approved.body.device.id,userId:7});
  assert.equal((await call(getCurrentOfflineDeviceRequest,{uuid:B})).body.status,'none');
  assert.equal((await call(registerOfflineDevice,{body:{device_uuid:B}})).statusCode,403);
  const next=await ask();const reapproved=await review(next.body.request.id);assert.equal(reapproved.body.device.id,approved.body.device.id);
  assert.equal(await scalar('SELECT is_active FROM pos_offline_devices WHERE id=$1',[A]),true);
  await call(revokeOfflineDevice,{role:'owner',id:A,userId:7});
  const friendRequest=await ask({body:{device_uuid:A,name:'Friend Laptop'}});await review(friendRequest.body.request.id);
  assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  assert.equal(await scalar('SELECT quarantined FROM pos_offline_reserves WHERE device_id=$1',[A]),true);
  assert.equal(await scalar('SELECT reserved_stock FROM products WHERE id=1'),2);
  assert.equal(await scalar('SELECT is_active FROM pos_offline_devices WHERE id=$1',[approved.body.device.id]),true);
});
test('concurrent requests/approvals create exactly one request/device with one approval audit',async t=>{
  install(t);const results=await Promise.all([ask(),ask()]);assert.equal(results[0].body.request.id,results[1].body.request.id);
  const reviews=await Promise.all(results.map(r=>review(r.body.request.id)));assert.deepEqual(reviews.map(r=>r.statusCode).sort(),[200,409]);
  assert.equal(await scalar("SELECT count(*) FROM audit_logs WHERE action='OFFLINE_POS_DEVICE_APPROVED'"),1);
});
test('safe validation, fresh review authentication, audit events and no credential persistence',async t=>{
  install(t);for(const body of [{device_uuid:'invalid',name:'Laptop'},{device_uuid:B,name:'<script>'},{device_uuid:B,name:'x'.repeat(81)}])assert.equal((await ask({body})).statusCode,400);
  const pending=await ask();assert.equal((await review(pending.body.request.id,{session:{auth:{authenticatedAt:1}}})).statusCode,401);
  const bad=await call(rejectOfflineDeviceRequest,{role:'owner',id:pending.body.request.id,body:{reason:'x'.repeat(301)}});assert.equal(bad.statusCode,400);
  const data=(await f.db.query('SELECT * FROM pos_offline_device_requests')).rows;assert.ok(!JSON.stringify(data).match(/password|pin|token/i));
  assert.equal(await scalar("SELECT count(*) FROM audit_logs WHERE action='OFFLINE_POS_DEVICE_APPROVAL_REQUESTED'"),1);
  assert.equal(await scalar('SELECT is_active FROM pos_offline_devices WHERE id=$1',[A]),true);
});
test('additive migration preserves legacy stock/devices and refuses rollback with approval history',async t=>{
  install(t);assert.equal(await scalar('SELECT count(*) FROM pos_offline_devices'),1);assert.equal(await scalar('SELECT remaining FROM pos_offline_reserves WHERE device_id=$1',[A]),2);
  await migration.down({raw:async sql=>f.db.query(sql)});
  const snapshotId=crypto.randomUUID(),transactionId=crypto.randomUUID();
  const orderId=await scalar('INSERT INTO orders DEFAULT VALUES RETURNING id');
  await f.db.query("INSERT INTO pos_offline_snapshots(id,device_id,created_by,expires_at,catalogue) VALUES($1,$2,7,now()+interval '72 hours','[]')",[snapshotId,A]);
  await f.db.query("INSERT INTO pos_offline_snapshot_items(snapshot_id,item_key,unit_price,allowance) VALUES($1,'1:0',120,2)",[snapshotId]);
  await f.db.query("INSERT INTO pos_offline_sales(transaction_id,device_id,snapshot_id,request_hash,order_id,response,sold_at) VALUES($1,$2,$3,'hash',$4,'{}',now())",[transactionId,A,snapshotId,orderId]);
  const tables=['pos_offline_devices','pos_offline_reserves','pos_offline_snapshots','pos_offline_snapshot_items','pos_offline_sales'];
  const before=await Promise.all(tables.map(table=>f.db.query(`SELECT * FROM ${table}`)));
  await migration.up({raw:f.raw});
  assert.deepEqual(await Promise.all(tables.map(table=>f.db.query(`SELECT * FROM ${table}`))),before);
  await ask();await assert.rejects(migration.down({raw:async sql=>f.db.query(sql)}),/Preserve device approval history/);
  await assert.rejects(f.db.query("INSERT INTO pos_offline_device_requests(id,device_uuid,requested_name,status) VALUES($1,$2,'Bad','bad')",[crypto.randomUUID(),B]),/check constraint/);
});
