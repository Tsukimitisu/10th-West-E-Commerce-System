import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test,{beforeEach} from 'node:test';
import { readFileSync } from 'node:fs';
import { posTransaction,savePosSnapshot,readPosValue,writePosValue,pendingPosSales,allPosValues,searchOfflineProducts,commitOfflineCashSale,updateOfflineSale,offlinePosStockSummary } from '../services/offlinePosDb.js';
import { setupOfflinePin,unlockOfflinePos,lockLocalPos,currentOfflineAccess } from '../services/offlinePosAccess.js';
import { synchronizeOfflineSales } from '../services/offlinePosSync.js';
import { checkPosBackend } from '../services/posReachability.js';
const device='17b17eb7-0d22-4f27-a37d-fb166e7df954';
const snapshot=()=>({id:crypto.randomUUID(),device_id:device,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+72*3600000).toISOString(),products:[{id:1,name:'Brake Pad',sku:'PAD-1',barcode:'12345678',part_number:'BRK-125',price:120,available_stock:3,variants:[]},{id:2,name:'Helmet',sku:'HEL-2',price:500,available_stock:0,variants:[{id:20,sku:'HELMET-BLK',variant_type:'Color',variant_value:'Black',price:550,available_stock:1}]}]});
const cashier={id:7,name:'Cashier'};
const sell=(extra={})=>commitOfflineCashSale({items:[{product_id:1,variant_id:null,quantity:1}],paymentMethod:'cash',amountTendered:200,transactionId:crypto.randomUUID(),cashier,...extra});
const prepare=async()=>{const s=snapshot();await savePosSnapshot(s);await writePosValue('offline_access',{id:'grant',device_id:device,expires_at:s.expires_at});return s;};
beforeEach(async()=>{lockLocalPos();await posTransaction(['metadata','products','pending_sales','receipts','offline_access'],'readwrite',async(s,r)=>{for(const store of Object.values(s))await r(store.clear());});});

test('reachability requires real health response, including navigator online with backend unreachable',async()=>{
  assert.equal(await checkPosBackend({online:true,fetcher:async()=>{throw new Error('unreachable');}}),false);
  assert.equal(await checkPosBackend({online:true,fetcher:async()=>({ok:true,json:async()=>({status:'OK'})})}),true);
  assert.equal(await checkPosBackend({online:false,fetcher:()=>assert.fail('must not fetch')}),false);
  assert.equal(await checkPosBackend({online:true,fetcher:async()=>({ok:true,json:async()=>({})})}),false);
});
test('cached catalogue supports product, part number, barcode and variant SKU search',async()=>{
  await prepare();for(const search of ['Brake','PAD-1','12345678','BRK-125','HELMET-BLK'])assert.equal((await searchOfflineProducts({search})).length,1);
});
test('cash completion atomically persists immutable sale, receipt and decremented allowance',async()=>{
  await prepare();const sale=await sell();assert.equal(sale.status,'pending');assert.match(sale.receipt_number,/^OFF-POS-/);
  assert.equal((await readPosValue('products',1)).available_stock,2);assert.equal((await readPosValue('receipts',sale.id)).total_amount,120);
  assert.equal((await pendingPosSales())[0].offline_transaction_id,sale.id);assert.equal(sale.change_due,80);
  await assert.rejects(sell({transactionId:sale.id}),/already been saved/);assert.equal((await readPosValue('products',1)).available_stock,2);
});
test('quantity over allowance, GCash/provider payments, insufficient cash and expired grants are rejected without mutations',async()=>{
  const s=await prepare();
  await assert.rejects(sell({items:[{product_id:1,quantity:4}]}),/No offline stock/);
  for(const paymentMethod of ['gcash','paymongo'])await assert.rejects(sell({paymentMethod}),/Cash payments/);
  await assert.rejects(sell({amountTendered:1}),/Cash received/);
  await writePosValue('offline_access',{id:'grant',device_id:device,expires_at:new Date(Date.now()-1).toISOString()});
  await assert.rejects(sell(),/expired/);assert.equal((await allPosValues('pending_sales')).length,0);assert.equal((await readPosValue('products',1)).available_stock,3);
  assert.ok(s.id);
});
test('IndexedDB write failure aborts sale and stock change',async t=>{
  await prepare();const original=IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype,'put',function(value){if(this.name==='pending_sales')throw new Error('Quota exceeded');return original.call(this,value);});
  await assert.rejects(sell(),/Quota exceeded/);assert.equal((await readPosValue('products',1)).available_stock,3);assert.equal((await allPosValues('receipts')).length,0);
});
test('snapshot refresh subtracts pending physical sales and preserves their original price/version',async()=>{
  await prepare();const sale=await sell();const fresh=snapshot();fresh.products[0].price=150;await savePosSnapshot(fresh);
  assert.equal((await readPosValue('products',1)).available_stock,2);const pending=(await pendingPosSales())[0];assert.equal(pending.items[0].unit_price,120);assert.equal(pending.snapshot_id,sale.snapshot_id);
});
test('reconnect sync uses original UUID across network retries and stores server receipt only after acknowledgement',async()=>{
  await prepare();const sale=await sell();const keys=[];
  await synchronizeOfflineSales({send:async payload=>{keys.push(payload.idempotencyKey);throw Object.assign(new Error('offline'),{code:'NETWORK_ERROR'});}});
  assert.equal((await pendingPosSales()).length,1);await updateOfflineSale(sale.id,{next_attempt_at:0});
  await synchronizeOfflineSales({send:async payload=>{keys.push(payload.idempotencyKey);assert.equal(payload.offline.snapshot_id,sale.snapshot_id);assert.equal(payload.paymentMethod,'cash');return {receipt:{id:99,receipt_number:'POS-99',source:'pos',payment_method:'cash',payment_status:'paid',total_amount:120}};}});
  assert.deepEqual(keys,[sale.id,sale.id]);assert.equal((await pendingPosSales()).length,0);assert.equal((await readPosValue('receipts',sale.id)).server_receipt_number,'POS-99');
  await synchronizeOfflineSales({send:()=>assert.fail('synchronized sale must not repeat')});
});
test('expired authentication preserves pending queue; permanent conflict is visible and is not retried',async()=>{
  await prepare();const sale=await sell();const outcome=await synchronizeOfflineSales({send:async()=>{throw Object.assign(new Error('login'),{status:401});}});
  assert.equal(outcome.authenticationRequired,true);assert.equal((await pendingPosSales()).length,1);
  await synchronizeOfflineSales({send:async()=>{throw Object.assign(new Error('stock'),{status:409,code:'OFFLINE_POS_STOCK_CONFLICT'});}});
  assert.equal((await readPosValue('pending_sales',sale.id)).status,'attention');await synchronizeOfflineSales({send:()=>assert.fail('conflict must not loop')});
});
test('an incomplete server acknowledgement never clears a pending physical sale',async()=>{
  await prepare();const sale=await sell();await synchronizeOfflineSales({send:async()=>({receipt:{id:99,receipt_number:'POS-99'}})});const saved=await readPosValue('pending_sales',sale.id);assert.equal(saved.status,'attention');assert.equal(saved.error_code,'POS_SYNC_ACK_INVALID');assert.equal(saved.server_order_id,undefined);
});
test('concurrent local sales cannot oversell the protected allowance',async()=>{
  await prepare();const outcomes=await Promise.allSettled([sell({items:[{product_id:1,quantity:2}],amountTendered:300}),sell({items:[{product_id:1,quantity:2}],amountTendered:300})]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal((await readPosValue('products',1)).available_stock,1);
});
test('selected variant uses its exact cached price, stock allowance and receipt identity',async()=>{
  await prepare();const sale=await sell({items:[{product_id:2,variant_id:20,quantity:1}],amountTendered:600});assert.equal(sale.total_amount,550);assert.equal(sale.items[0].variant_id,20);assert.equal(sale.items[0].variant_name_snapshot,'Color: Black');assert.equal((await readPosValue('products',2)).variants[0].available_stock,0);
  await assert.rejects(sell({items:[{product_id:2,variant_id:20,quantity:1}],amountTendered:600}),/No offline stock/);
});

test('automatic inventory counts use locally deducted stock; repeated snapshots never double-count pending sales',async()=>{
  const s=snapshot();s.stock_mode='automatic';s.products[0].available_stock=10;
  await savePosSnapshot(s);await writePosValue('offline_access',{id:'grant',device_id:device,expires_at:s.expires_at});
  assert.deepEqual(await offlinePosStockSummary(),{products:2,units:11});
  const sale=await sell({items:[{product_id:1,quantity:2}],amountTendered:300});
  assert.deepEqual(await offlinePosStockSummary(),{products:2,units:9});
  await savePosSnapshot(s);await savePosSnapshot(s);assert.deepEqual(await offlinePosStockSummary(),{products:2,units:9});
  assert.equal((await pendingPosSales())[0].id,sale.id);assert.equal((await readPosValue('metadata','snapshot')).stock_mode,'automatic');
  await updateOfflineSale(sale.id,{status:'synchronized',server_order_id:99,server_receipt_number:'POS-99'});
  s.products[0].available_stock=8;await savePosSnapshot(s);assert.deepEqual(await offlinePosStockSummary(),{products:2,units:9});
  assert.equal((await readPosValue('pending_sales',sale.id)).server_order_id,99);
});
test('catalogue/grant expiry preserves already completed pending physical sales',async()=>{
  await prepare();const sale=await sell();const snapshot=await readPosValue('metadata','snapshot');await writePosValue('metadata',{...snapshot,expires_at:new Date(0).toISOString()});await assert.rejects(sell(),/expired/);assert.equal((await pendingPosSales())[0].id,sale.id);
});
test('PIN uses salted PBKDF2, survives restart, five bad PINs cause cooldown and never stores plaintext secrets',async()=>{
  const s=await prepare();await setupOfflinePin('482916',s,cashier);const grant=await readPosValue('offline_access','grant');
  assert.equal(grant.iterations,600000);assert.equal(grant.salt.length,16);assert.equal(grant.verifier.length,32);assert.ok(!JSON.stringify(grant).includes('482916'));
  assert.equal('pin' in grant,false);assert.equal('password' in grant,false);assert.equal('token' in grant,false);
  lockLocalPos();assert.equal(currentOfflineAccess(),null);await unlockOfflinePos('482916');assert.equal(currentOfflineAccess().cashier.id,7);lockLocalPos();
  for(let i=0;i<5;i++)await assert.rejects(unlockOfflinePos('000000'),/PIN not accepted/);
  await assert.rejects(unlockOfflinePos('482916'),/Too many PIN attempts/);assert.ok((await readPosValue('offline_access','grant')).locked_until>Date.now());
});
test('PWA caches only static shell and never deletes IndexedDB or force-activates an update',()=>{
  const source=readFileSync(new URL('../posPwaPlugin.js',import.meta.url),'utf8');
  assert.match(source,/url\.origin!==self\.location\.origin/);assert.match(source,/ASSETS\.includes\(target\)/);
  assert.doesNotMatch(source,/indexedDB\.deleteDatabase|self\.skipWaiting\(/);
  const route=readFileSync(new URL('../components/staff/OfflinePosRoute.jsx',import.meta.url),'utf8');assert.match(route,/Offline POS is not ready on this computer/);assert.doesNotMatch(route,/setCurrentAuthUser/);
});
