import test from 'node:test';
import assert from 'node:assert/strict';

test('product favorites ignore a set with the same numeric id; removal keys stay distinct',async()=>{
  const helpers=await import('../utils/wishlistIdentity.js').catch(()=>null);
  assert.ok(helpers,'wishlist identity helpers must exist');
  const {getWishlistProductIds,wishlistKey}=helpers;
  assert.deepEqual(getWishlistProductIds([{id:7,product_id:7},{id:8,listing_id:8,reference_type:'storefront_set'},{id:7,listing_id:7,reference_type:'storefront_set'}]),[7]);
  assert.equal(wishlistKey({product_id:7}),'product:7');
  assert.equal(wishlistKey({listing_id:7,reference_type:'storefront_set'}),'set:7');
});

test('sharing uses the device share sheet first and falls back to clipboard on failure',async()=>{
  const helpers=await import('../utils/storefrontShare.js').catch(()=>null);
  assert.ok(helpers,'shared storefront sharing helpers must exist');
  const {shareStorefrontItem}=helpers;
  const calls=[];const payload={title:'Mio fairings',text:'Fairings for Mio',url:'https://10thwestmotoparts.com/sets/7'};
  await shareStorefrontItem(payload,{share:async data=>calls.push(data),clipboard:{writeText:async()=>assert.fail('unneeded copy')}});
  assert.deepEqual(calls,[payload]);
  const copied=[];
  await shareStorefrontItem(payload,{share:async()=>{throw Error('unavailable');},clipboard:{writeText:async text=>copied.push(text)}});
  assert.deepEqual(copied,['https://10thwestmotoparts.com/sets/7']);
  assert.equal(await shareStorefrontItem(payload,{share:async()=>{throw Object.assign(Error(),{name:'AbortError'});}}),'cancelled');
});
