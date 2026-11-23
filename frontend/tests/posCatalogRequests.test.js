import test from 'node:test';
import assert from 'node:assert/strict';

const deferred = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };

test('POS catalogue aborts stale queries and ignores late successes, errors and loading changes',async()=>{
  const module=await import('../utils/latestRequest.js').catch(()=>null);
  assert.ok(module?.createLatestRequest,'POS requires a cancellable latest request coordinator');
  const requests=module.createLatestRequest();
  const old=deferred(),fresh=deferred(),events=[];let oldSignal;
  const callbacks={onSuccess:value=>events.push(value),onError:error=>events.push(error.message),onSettled:()=>events.push('settled')};
  const first=requests.run(signal=>{oldSignal=signal;return old.promise;},callbacks);
  const second=requests.run(()=>fresh.promise,callbacks);
  assert.equal(oldSignal.aborted,true);
  fresh.resolve('latest products');await second;
  old.resolve('old products');await first;
  assert.deepEqual(events,['latest products','settled']);
  const failed=deferred();const third=requests.run(()=>failed.promise,callbacks);
  const fourth=requests.run(async()=> 'refresh',callbacks);await fourth;
  failed.reject(new Error('stale network error'));await third;
  assert.deepEqual(events,['latest products','settled','refresh','settled']);
  const abandoned=deferred();const pending=requests.run(()=>abandoned.promise,callbacks);
  requests.cancel();abandoned.resolve('unmounted');await pending;
  assert.deepEqual(events,['latest products','settled','refresh','settled']);
});

test('POS catalogue reports current request errors and completes its loading state',async()=>{
  const module=await import('../utils/latestRequest.js').catch(()=>null);
  assert.ok(module?.createLatestRequest,'POS requires a cancellable latest request coordinator');
  const requests=module.createLatestRequest(),events=[];
  await requests.run(async()=>{throw new Error('Cannot reach inventory');},{onError:error=>events.push(error.message),onSettled:()=>events.push('settled')});
  assert.deepEqual(events,['Cannot reach inventory','settled']);
});
