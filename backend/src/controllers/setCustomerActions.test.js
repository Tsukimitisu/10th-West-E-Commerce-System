import test, { after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test'; process.env.TEST_DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/invalid'; process.env.DB_READ_MODE='postgres';
const {default:pool}=await import('../config/database.js');
const wishlist=await import('./wishlistController.js');
const {startProductConversation}=await import('./productChatController.js');
afterEach(()=>mock.restoreAll()); after(()=>pool.end());
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
const listing={id:7,title:'Mio fairings',items:[{id:11,name:'Left panel',part_number:'LEFT',color:'Black',store_selling_price:200,stock_quantity:0,inventory_status:'active'}],media:[{url:'/uploads/set.webp',media_type:'image'}]};
test('set favorite saves the listing itself after public validation and removal scopes ownership',async()=>{
  const calls=[]; mock.method(pool,'query',async(sql,params)=>{calls.push({sql:String(sql),params}); if(String(sql).includes('FROM ecommerce_listings l'))return {rows:[listing]};return {rows:[{id:1}],rowCount:1};});
  const res=response(); await wishlist.addToWishlist({user:{id:2},body:{reference_type:'storefront_set',listing_id:7}},res);
  assert.equal(res.statusCode,201); assert.ok(calls.some(c=>c.sql.includes('INSERT INTO storefront_set_wishlists')&&c.params[1]===7));
  assert.ok(!calls.some(c=>/INSERT INTO wishlists\s/.test(c.sql)));
  assert.equal(typeof wishlist.removeSetFromWishlist,'function');
  await wishlist.removeSetFromWishlist({user:{id:2},params:{listingId:7}},response());
  assert.ok(calls.some(c=>c.sql.includes('DELETE FROM storefront_set_wishlists')&&c.params[0]===2&&c.params[1]===7));
});
test('hidden sets cannot be favorited or used as chat context',async()=>{
  const client={query:async()=>({rows:[]}),release(){}};mock.method(pool,'query',client.query);mock.method(pool,'connect',async()=>client);
  const fav=response();await wishlist.addToWishlist({user:{id:2},body:{reference_type:'storefront_set',listing_id:7}},fav);assert.equal(fav.statusCode,404);
  const chat=response();await startProductConversation({user:{id:2,role:'customer'},body:{reference_type:'storefront_set',listing_id:7}},chat);assert.equal(chat.statusCode,404);
});
test('set chat rejects a selected item outside the listing before creating any conversation',async()=>{
  const calls=[];const client={async query(sql){calls.push(String(sql));return {rows:String(sql).includes('FROM ecommerce_listings l')?[listing]:[]};},release(){}};mock.method(pool,'connect',async()=>client);
  const res=response();await startProductConversation({user:{id:2,role:'customer'},body:{reference_type:'storefront_set',listing_id:7,selected_product_item_id:999}},res);
  assert.equal(res.statusCode,400);assert.ok(!calls.some(sql=>sql.includes('INSERT INTO chat_threads')));
  assert.match(res.body.message,/does not belong/);
});

test('set chat uses server context, accepts no child and reuses an owned active conversation',async()=>{
  const calls=[];let snapshot;let thread;
  const query=async(sql,params=[])=>{
    const source=String(sql);calls.push({source,params});
    if(source.includes('FROM ecommerce_listings l'))return {rows:[listing]};
    if(source.includes('FROM users')&&source.includes('ORDER BY CASE'))return {rows:[{id:3}]};
    if(source.includes('SELECT id FROM chat_threads WHERE customer_id'))return {rows:thread?[{id:thread.id}]:[]};
    if(source.includes('INSERT INTO chat_threads')){
      snapshot=JSON.parse(params[4]);thread={id:91,customer_id:2,listing_id:7,reference_type:'storefront_set',status:'open',product_snapshot:snapshot};
      return {rows:[{id:91}]};
    }
    if(source.includes('UPDATE chat_threads')&&source.includes('product_snapshot')){snapshot=JSON.parse(params[2]);thread.product_snapshot=snapshot;}
    if(source.includes('SELECT ct.*'))return {rows:[thread]};
    return {rows:[]};
  };
  mock.method(pool,'query',query);mock.method(pool,'connect',async()=>({query,release(){}}));
  const req={user:{id:2,role:'customer'},body:{reference_type:'storefront_set',listing_id:7,listing_name:'Forged title',cover:'https://attacker.invalid/image'}};
  const first=response();await startProductConversation(req,first);
  assert.equal(first.statusCode,201);assert.equal(first.body.conversation.product_snapshot.name,'Mio fairings');
  assert.equal(first.body.conversation.product_snapshot.image_url,'/uploads/set.webp');
  assert.equal(first.body.conversation.product_snapshot.url,'https://10thwestmotoparts.com/sets/7');
  assert.equal(first.body.conversation.product_snapshot.listing_url,'https://10thwestmotoparts.com/sets/7');
  assert.equal(first.body.conversation.product_snapshot.cover_image,'/uploads/set.webp');
  assert.equal(first.body.conversation.product_id,undefined);
  assert.equal(first.body.conversation.product_snapshot.selected_product_item_id,undefined);
  const second=response();await startProductConversation({...req,body:{...req.body,selected_product_item_id:11}},second);
  assert.equal(second.statusCode,200);assert.equal(second.body.conversation.id,91);
  assert.equal(second.body.conversation.product_snapshot.selected_product_item_name,'Left panel');
  assert.equal(second.body.conversation.product_snapshot.selected_product_item_part_number,'LEFT');
  assert.equal(second.body.conversation.product_snapshot.selected_product_item_color,'Black');
  assert.equal(calls.filter(call=>call.source.includes('INSERT INTO chat_threads')).length,1);
  const lock=calls.findIndex(call=>call.source.includes('pg_advisory_xact_lock'));
  const lookup=calls.findIndex(call=>call.source.includes('SELECT id FROM chat_threads WHERE customer_id'));
  assert.ok(lock>=0&&lock<lookup);assert.deepEqual(calls[lock].params,[2,7]);
});
