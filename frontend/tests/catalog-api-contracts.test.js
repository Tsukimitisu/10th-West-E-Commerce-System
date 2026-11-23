import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api=readFileSync(new URL('../services/api.js',import.meta.url),'utf8');
const section=(start,end)=>api.slice(api.indexOf(start),api.indexOf(end)).replaceAll('export const','const');

test('POS page requests send all server filters and cancellation while legacy callers retain arrays',async()=>{
  const requests=[],controller=new AbortController(),response={products:[{id:5000}],total:5000,page:2,pageSize:30,totalPages:167};
  const get=new Function('authenticatedFetch','API_URL',`${section('export const getPosProducts =','export const getPosCapabilities =')};return getPosProducts;`)(async(url,options)=>{requests.push({url,options});return response;},'https://example.test/api');
  assert.deepEqual(await get({search:'  SKU-5000  ',modelId:7,categoryId:3,stockStatus:'low_stock',sortBy:'price',sortDir:'desc',page:2,limit:30,paged:true,signal:controller.signal}),response);
  const query=new URL(requests[0].url).searchParams;
  for(const [key,value] of Object.entries({search:'SKU-5000',model_id:'7',category_id:'3',stockStatus:'low_stock',sortBy:'price',sortDir:'desc',page:'2',limit:'30'}))assert.equal(query.get(key),value,key);
  assert.equal(requests[0].options.signal,controller.signal);
  assert.deepEqual(await get(),response.products);
});

test('wishlist normalization keeps set references distinct from coincident product IDs',()=>{
  const start=api.indexOf('  const normalizeWishlistItem =',api.indexOf('export const getWishlist ='));
  const end=api.indexOf('\n  if (USE_SUPABASE)',start);
  const normalize=new Function(`${api.slice(start,end)};return normalizeWishlistItem;`)();
  const set=normalize({id:90,listing_id:90,reference_type:'storefront_set',product_id:null,name:'Panel set',price:'173',available_stock:2,image:'/cover.webp'});
  const product=normalize({id:90,product_id:90,name:'Inventory product',price:'150',stock_quantity:1});
  assert.equal(set.reference_type,'storefront_set');assert.equal(set.listing_id,90);assert.equal(set.product_id,null);
  assert.equal(set.name,'Panel set');assert.equal(set.price,173);assert.equal(product.product_id,90);
});

test('set favorites post listing IDs and emit typed sync without impersonating products',async()=>{
  const requests=[],events=[];
  const functions=new Function('authenticatedFetch','API_URL','emitWishlistChange',`${section('export const addSetToWishlist =','export const getReviews =')};return {addSetToWishlist,removeSetFromWishlist};`)(async(url,options)=>{requests.push({url,options});return {ok:true};},'https://example.test/api',event=>events.push(event));
  await functions.addSetToWishlist(9,90);await functions.removeSetFromWishlist(9,90);
  assert.deepEqual(JSON.parse(requests[0].options.body),{reference_type:'storefront_set',listing_id:90});
  assert.equal(requests[1].url,'https://example.test/api/wishlist/sets/90');
  assert.ok(events.every(event=>event.referenceType==='storefront_set' && event.listingId===90 && !('productId' in event)));
});
