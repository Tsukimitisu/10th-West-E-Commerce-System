import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prepareOfflinePos, verifyOfflinePreparation } from '../services/offlinePosPreparation.js';
import { waitForPosShell } from '../services/posPwa.js';
import { posTransaction, writePosValue, readPosValue, allPosValues } from '../services/offlinePosDb.js';
const device = '11111111-1111-4111-8111-111111111111';
const snapshot = () => ({ id: crypto.randomUUID(), device_id: device, created_at: new Date().toISOString(), expires_at: new Date(Date.now()+3600000).toISOString(), products: [] });
const options = () => ({ pin: '482916', user: { id: 1, name: 'Cashier' }, requireShell: async()=>{}, registerDevice: async()=>({device:{id:device}}), getSnapshot: async()=>snapshot(), refreshLocal: async()=>{} });
beforeEach(async()=>posTransaction(['metadata','products','pending_sales','offline_access'],'readwrite',async(s,r)=>{for(const store of Object.values(s))await r(store.clear());}));

test('preparation phases are reported and saved metadata/PIN verifier is read back before readiness',async()=>{
  const phases=[];await writePosValue('pending_sales',{id:'pending-sale',status:'pending',items:[]});
  const ready=await prepareOfflinePos({...options(),onProgress:phase=>phases.push(phase)});
  assert.deepEqual(phases,['Preparing offline app…','Registering this computer…','Downloading offline catalogue…','Securing offline PIN…','Offline POS ready.']);
  assert.equal(ready.grant.device_id,device);assert.equal(ready.grant.verifier.length,32);assert.ok(!JSON.stringify(ready.grant).includes('482916'));
  assert.equal((await verifyOfflinePreparation(device)).snapshot.snapshot_id,ready.snapshot.snapshot_id);
  assert.equal((await allPosValues('pending_sales')).length,1);
});
test('repeat preparation reuses the computer identifier and safely renews the grant',async()=>{
  const identifiers=[];const registerDevice=async id=>{identifiers.push(id);return {device:{id:device}};};
  await prepareOfflinePos({...options(),registerDevice});await prepareOfflinePos({...options(),registerDevice});assert.equal(identifiers[0],identifiers[1]);
});
for(const stage of ['requireShell','registerDevice','getSnapshot'])test(`${stage} failure reaches the caller and never reports ready`,async()=>{
  const phases=[];await assert.rejects(prepareOfflinePos({...options(),[stage]:async()=>{throw new Error('Actionable failure');},onProgress:p=>phases.push(p)}),/Actionable failure/);
  assert.ok(!phases.includes('Offline POS ready.'));assert.equal(await readPosValue('offline_access','grant'),undefined);
});
test('IndexedDB persistence failure prevents readiness without deleting pending sales',async t=>{
  await writePosValue('pending_sales',{id:'pending-sale',status:'pending',items:[]});const original=IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype,'put',function(value){if(this.name==='offline_access')throw new Error('Storage quota exceeded');return original.call(this,value);});
  await assert.rejects(prepareOfflinePos(options()),/Storage quota/);assert.equal((await allPosValues('pending_sales')).length,1);await assert.rejects(verifyOfflinePreparation(device),/could not be verified/);
});
test('invalid PIN, snapshot identity, missing verifier and expired access do not claim readiness',async()=>{
  await assert.rejects(prepareOfflinePos({...options(),pin:'123'}),/6-digit/);
  await assert.rejects(prepareOfflinePos({...options(),getSnapshot:async()=>({...snapshot(),device_id:'other-device'})}),/incomplete/);
  await prepareOfflinePos(options());const grant=await readPosValue('offline_access','grant');await writePosValue('offline_access',{...grant,verifier:[]});await assert.rejects(verifyOfflinePreparation(device),/could not be verified/);
});
test('PWA registration rejection, unsupported context and activation timeout are actionable',async()=>{
  await assert.rejects(waitForPosShell({secure:true,serviceWorker:{ready:new Promise(()=>{})},registered:Promise.resolve({error:true})}),/registration failed/);
  await assert.rejects(waitForPosShell({secure:false}),/HTTPS/);
  await assert.rejects(waitForPosShell({secure:true,serviceWorker:{ready:new Promise(()=>{})},timeoutMs:5}),/not ready yet/);
  await waitForPosShell({secure:true,serviceWorker:{ready:Promise.resolve()},registered:Promise.resolve({value:{}})});
});
