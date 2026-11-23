import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCustomerReturnTo } from '../utils/customerReturnTo.js';

test('public clean set links reach the HashRouter and preserve listing query parameters',async()=>{
  const module=await import('../utils/publicSetRoute.js').catch(()=>null);
  assert.ok(module,'public set route bridge must exist');
  const calls=[];const history={state:{existing:true},replaceState:(...args)=>calls.push(args)};
  module.bridgePublicSetRoute({pathname:'/sets/90',search:'?source=share',hash:''},history);
  assert.deepEqual(calls,[[{existing:true},'','/#/sets/90?source=share']]);
  for(const location of [{pathname:'/',hash:'#/sets/90'},{pathname:'/sets/90',hash:'#/wishlist'},{pathname:'/sets/invalid',hash:''},{pathname:'/products/90',hash:''}])module.bridgePublicSetRoute(location,history);
  assert.equal(calls.length,1);
});

test('customer login returns to an exact set route while rejecting unrelated paths',()=>{
  assert.equal(safeCustomerReturnTo('/sets/90?source=favorite'),'/sets/90?source=favorite');
  assert.equal(safeCustomerReturnTo('/sets/90/manage'),'/');
  assert.equal(safeCustomerReturnTo('//other.invalid/sets/90'),'/');
});
