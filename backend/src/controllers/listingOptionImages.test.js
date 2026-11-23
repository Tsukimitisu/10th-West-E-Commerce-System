import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import migration from '../../migrations/202611100003_listing_option_images.cjs';
import lockdown from '../../migrations/202607030001_lock_down_supabase_rls.cjs';
import { createEcommerceListing,updateEcommerceListing,getPublicSet } from './ecommerceListingController.js';
import { normalizeOptionImages } from '../services/listingOptionImages.js';
import { resetSetListingSchemaCache } from '../services/setListings.js';

after(() => pool.end());
const response = () => ({ statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;} });
async function fixture(t) {
  const db = new PGlite();t.after(() => db.close());
  await db.exec(`CREATE TABLE motorcycle_models(id int PRIMARY KEY,model_name text);
    CREATE TABLE products(id int PRIMARY KEY,name text,part_number text,brand text,motorcycle_model text,motorcycle_model_id int,
      color text,store_selling_price numeric,price numeric,stock_quantity int,reserved_stock int,box_location text,inventory_status text,is_deleted boolean,image text);
    INSERT INTO products(id,name,store_selling_price,stock_quantity,reserved_stock,inventory_status,is_deleted,image) VALUES
      (11,'Candy Red',150,5,1,'active',false,'/uploads/old-red.webp'),(12,'Black',200,3,1,'active',false,NULL),(21,'Helmet',250,0,0,'active',false,NULL);
    CREATE TABLE product_variants(id int PRIMARY KEY,product_id int REFERENCES products(id),image_url text,stock_quantity int,price numeric);
    INSERT INTO product_variants VALUES(201,21,NULL,3,250),(202,21,NULL,1,300);
    CREATE TABLE ecommerce_listings(id serial PRIMARY KEY,inventory_item_id int UNIQUE REFERENCES products(id),listing_type text DEFAULT 'single',title text,motorcycle_model_id int,
      ecommerce_description text,visibility_status text,is_featured boolean,is_best_seller boolean,is_new_arrival boolean,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE ecommerce_listing_items(listing_id int REFERENCES ecommerce_listings(id),product_item_id int REFERENCES products(id),sort_order int,
      PRIMARY KEY(listing_id,product_item_id),UNIQUE(listing_id,sort_order));
    CREATE TABLE ecommerce_listing_media(id serial PRIMARY KEY,listing_id int REFERENCES ecommerce_listings(id),url text,media_type text,sort_order int,alt_text text);`);
  await migration.up({raw:sql=>db.exec(sql)});
  const query = async (sql,args) => { const result=await db.query(sql,args);return { ...result,rowCount:/^\s*(?:SELECT|WITH)/i.test(sql)?result.rows.length:result.affectedRows ?? result.rows.length }; };
  t.mock.method(pool,'query',query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  resetSetListingSchemaCache(true);t.after(()=>resetSetListingSchemaCache(null));
  return db;
}
const setBody = {listing_type:'set',title:'Fairing Kit',items:[11,12],visibility_status:'active',visual_options:true,
  media:[{url:'/uploads/kit.webp',media_type:'image'}],option_images:[{product_item_id:11,image_url:'/uploads/red.webp'},{product_item_id:12,image_url:'/uploads/black.webp'}]};

test('set images are listing-scoped; edits/reordering preserve other images, cover, prices and stock',async t => {
  const db=await fixture(t);
  const created=response();await createEcommerceListing({body:setBody},created);assert.equal(created.statusCode,201);
  const id=created.body.listing.id;
  const read=response();await getPublicSet({params:{id:String(id)}},read);
  assert.deepEqual(read.body.options.map(row=>[row.id,row.image,row.price,row.stock_quantity]),[[11,'/uploads/red.webp',173,4],[12,'/uploads/black.webp',230,2]]);
  assert.equal(read.body.image,'/uploads/kit.webp');
  const before=(await db.query('SELECT * FROM products ORDER BY id')).rows;
  await db.exec("INSERT INTO ecommerce_listings(inventory_item_id,visibility_status) VALUES(11,'active');INSERT INTO ecommerce_listing_media(listing_id,url,media_type) VALUES(2,'/uploads/unrelated.webp','image')");
  const edit=response();await updateEcommerceListing({params:{id},body:{...setBody,items:[12,11],option_images:[{product_item_id:11,image_url:'/uploads/new-red.webp'}]}},edit);
  assert.equal(edit.statusCode,200);
  assert.deepEqual(edit.body.listing.items.map(row=>[row.id,row.image]),[[12,'/uploads/black.webp'],[11,'/uploads/new-red.webp']]);
  assert.deepEqual((await db.query('SELECT * FROM products ORDER BY id')).rows,before);
  const remove=response();await updateEcommerceListing({params:{id},body:{...setBody,option_images:[{product_item_id:11,image_url:null}]}},remove);
  assert.equal(remove.statusCode,400);assert.equal(remove.body.code,'OPTION_IMAGE_REQUIRED');
  assert.equal((await db.query('SELECT image_url FROM ecommerce_listing_items WHERE product_item_id=11')).rows[0].image_url,'/uploads/new-red.webp');
  const draft=response();await updateEcommerceListing({params:{id},body:{...setBody,visibility_status:'draft',option_images:[{product_item_id:11,image_url:null}]}},draft);
  assert.equal(draft.statusCode,200);assert.equal(draft.body.listing.items.find(item=>item.id===11).option_image_url,null);
  assert.equal((await db.query('SELECT url FROM ecommerce_listing_media WHERE listing_id=2')).rows[0].url,'/uploads/unrelated.webp');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM products')).rows[0].count,3);
});

test('variant image changes preserve IDs/prices/stock and reject another product variant',async t => {
  const db=await fixture(t);
  const base={inventory_item_id:21,visibility_status:'active',visual_options:true,media:[{url:'/uploads/helmet.webp',media_type:'image'}]};
  const missing=response();await createEcommerceListing({body:base},missing);assert.equal(missing.body.code,'OPTION_IMAGE_REQUIRED');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM ecommerce_listings')).rows[0].count,0);
  const created=response();await createEcommerceListing({body:{...base,variant_images:[{variant_id:201,image_url:'/uploads/black.webp'},{variant_id:202,image_url:'/uploads/white.webp'}]}},created);
  assert.equal(created.statusCode,201);
  const id=created.body.listing.id;
  const wrong=response();await updateEcommerceListing({params:{id},body:{...base,variant_images:[{variant_id:999,image_url:'/uploads/x.webp'}]}},wrong);
  assert.equal(wrong.body.code,'OPTION_NOT_IN_LISTING');
  const edited=response();await updateEcommerceListing({params:{id},body:{...base,variant_images:[{variant_id:202,image_url:'/uploads/new-white.webp'}]}},edited);
  assert.equal(edited.statusCode,200);
  assert.deepEqual((await db.query('SELECT id,image_url,stock_quantity,price FROM product_variants ORDER BY id')).rows,
    [{id:201,image_url:'/uploads/black.webp',stock_quantity:3,price:'250'},{id:202,image_url:'/uploads/new-white.webp',stock_quantity:1,price:'300'}]);
});

for (const roles of [false,true]) test(`option image migration is additive, repeatable and preserves RLS (roles=${roles})`,async t => {
  const db=new PGlite();t.after(()=>db.close());
  if(roles)await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  await db.exec('CREATE TABLE ecommerce_listings(id int PRIMARY KEY);CREATE TABLE ecommerce_listing_items(listing_id int,product_item_id int,PRIMARY KEY(listing_id,product_item_id));INSERT INTO ecommerce_listings VALUES(1);INSERT INTO ecommerce_listing_items VALUES(1,11);');
  await lockdown.up({raw:sql=>db.exec(sql)});
  const before=(await db.query('SELECT * FROM pg_policies ORDER BY tablename')).rows;
  await migration.up({raw:sql=>db.exec(sql)});await migration.up({raw:sql=>db.exec(sql)});
  assert.deepEqual((await db.query('SELECT * FROM ecommerce_listings')).rows,[{id:1,visual_options:false}]);
  assert.deepEqual((await db.query('SELECT * FROM ecommerce_listing_items')).rows,[{listing_id:1,product_item_id:11,image_url:null}]);
  assert.deepEqual((await db.query('SELECT * FROM pg_policies ORDER BY tablename')).rows,before);
  await db.exec("UPDATE ecommerce_listing_items SET image_url='/uploads/kept.webp'");
  await assert.rejects(migration.down({raw:sql=>db.exec(sql)}),/Cannot remove/);
  if(roles)for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_table_privilege($1,'ecommerce_listing_items','SELECT,INSERT,UPDATE,DELETE') AS allowed",[role])).rows[0].allowed,false);
});

test('image metadata rejects unsafe URLs and duplicate/invalid identities',()=>{
  assert.throws(()=>normalizeOptionImages([{variant_id:1,image_url:'javascript:alert(1)'}],'variant_id'),{status:400});
  assert.throws(()=>normalizeOptionImages([{variant_id:1},{variant_id:1}],'variant_id'),{status:400});
  assert.throws(()=>normalizeOptionImages([{variant_id:-1}],'variant_id'),{status:400});
  assert.deepEqual(normalizeOptionImages([{variant_id:1,image_url:null}],'variant_id'),[{id:1,image:null}]);
});
