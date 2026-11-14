import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { createInventoryItem,updateInventoryItem } from './inventoryController.js';
import { getProducts,getProductById } from './productController.js';
import { addToCart,getCart } from './cartController.js';
import { getWishlist } from './wishlistController.js';
after(()=>pool.end());
const response=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(body){this.body=body;return this;}});

test('inventory cost is server-derived; inventory-only items stay private until listed; public price/stock and cart agree',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE motorcycle_models(id int PRIMARY KEY,model_name text,status text);INSERT INTO motorcycle_models VALUES(1,'Test motorcycle','active');
    CREATE TABLE categories(id int PRIMARY KEY,name text);
    CREATE TABLE products(id serial PRIMARY KEY,part_number text,name text,brand text,motorcycle_model text,motorcycle_model_id int,color text,
      store_selling_price numeric,price numeric,buying_price numeric,stock_quantity int,reserved_stock int DEFAULT 0,low_stock_threshold int,
      box_location text,box_number text,description text,inventory_status text,status text,is_deleted boolean,created_at timestamptz DEFAULT now(),updated_at timestamptz,category_id int,rating numeric,sku text,image text);
    CREATE TABLE product_variants(id int,product_id int,stock_quantity int,reserved_stock int,variant_type text,variant_value text,price_adjustment numeric,price numeric,sku text,image_url text,option_combination jsonb,combination_key text,created_at timestamptz);
    CREATE TABLE ecommerce_listings(id serial,inventory_item_id int,ecommerce_description text,visibility_status text,is_featured boolean,is_best_seller boolean,is_new_arrival boolean);
    CREATE TABLE ecommerce_listing_media(listing_id int,url text,media_type text,sort_order int);
    CREATE TABLE orders(id int,status text);CREATE TABLE order_items(order_id int,product_id int,quantity int);CREATE TABLE returns(order_id int,status text);
    CREATE TABLE reviews(product_id int,rating numeric,review_status text,is_approved boolean);
    CREATE TABLE product_fitments(id int,product_id int,brand text,model text,start_year int,end_year int);
    CREATE TABLE product_bundle_components(id int,bundle_product_id int,component_product_id int,quantity int,display_order int);
    CREATE TABLE stock_adjustments(product_id int,quantity_change int,reason text,notes text,adjusted_by int,status text);
    CREATE TABLE stock_movements(product_id int,quantity_delta int,stock_before int,stock_after int,reason text,reference_type text,created_by int,metadata jsonb);
    CREATE TABLE carts(id serial,user_id int,session_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE cart_items(id serial,cart_id int,product_id int,variant_id int,quantity int,updated_at timestamptz);
    CREATE TABLE wishlists(id serial,user_id int,product_id int,created_at timestamptz DEFAULT now());INSERT INTO wishlists(user_id,product_id) VALUES(9,1);`);
  const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:/^\s*SELECT/i.test(sql)?result.rows.length:result.affectedRows??result.rows.length};};
  t.mock.method(pool,'query',query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  const body={part_number:'BATTERY-1',product_name:'Battery Cover',motorcycle_model_id:1,store_selling_price:150,cost_price:999,quantity:1,minimum_stock:1};
  const created=response();await createInventoryItem({body,user:{id:7,role:'owner'}},created);
  assert.equal(created.statusCode,201);assert.equal(created.body.item.cost_price,120);
  assert.equal(created.body.item.ecommerce_price,173);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM ecommerce_listings')).rows[0].count,0);
  const catalog=response();await getProducts({query:{}},catalog);assert.deepEqual(catalog.body,[]);
  const privilegedPublic=response();await getProducts({query:{},user:{role:'owner'}},privilegedPublic);assert.deepEqual(privilegedPublic.body,[]);
  const management=response();await getProducts({query:{include_unpublished:'true'},user:{role:'owner'}},management);assert.equal(management.body[0].price,150);assert.equal(management.body[0].buying_price,120);
  const customerOverride=response();await getProducts({query:{include_unpublished:'true'},user:{role:'customer'}},customerOverride);assert.deepEqual(customerOverride.body,[]);
  const detail=response();await getProductById({params:{id:'1'},query:{}},detail);assert.equal(detail.statusCode,404);
  const add=async()=>{const res=response();await addToCart({body:{product_id:1,quantity:1},user:{id:9}},res);return res;};
  assert.equal((await add()).statusCode,404);
  await db.exec("INSERT INTO ecommerce_listings(inventory_item_id,visibility_status) VALUES(1,'active')");
  const listed=response();await getProducts({query:{}},listed);assert.equal(listed.statusCode,200);assert.equal(listed.body[0].price,173);assert.equal(listed.body[0].available_stock,1);
  const publicDetail=response();await getProductById({params:{id:'1'},query:{}},publicDetail);assert.equal(publicDetail.statusCode,200);assert.equal(publicDetail.body.stock_quantity,1);assert.equal(publicDetail.body.price,173);
  assert.equal((await add()).statusCode,200);
  const cart=response();await getCart({user:{id:9}},cart);assert.equal(cart.body.items[0].product.price,173);assert.equal(cart.body.items[0].available_stock,1);
  const wishlist=response();await getWishlist({user:{id:9}},wishlist);assert.equal(wishlist.body[0].price,173);assert.equal(wishlist.body[0].available_stock,1);assert.equal(wishlist.body[0].buying_price,undefined);
  await db.exec("UPDATE ecommerce_listings SET visibility_status='hidden'");
  assert.equal((await add()).statusCode,404);
  const hiddenWish=response();await getWishlist({user:{id:9}},hiddenWish);assert.equal(hiddenWish.body[0].available_stock,0);
  const hidden=response();await getProducts({query:{}},hidden);assert.deepEqual(hidden.body,[]);
  const edited=response();await updateInventoryItem({params:{productId:'1'},body:{...body,store_selling_price:199.99,cost_price:1},user:{id:7}},edited);
  assert.equal(edited.statusCode,200);assert.equal(edited.body.item.cost_price,159.99);
  assert.equal((await db.query('SELECT stock_quantity*buying_price AS value FROM products')).rows[0].value,'159.99');
});

test('REST fallback never publishes inventory by legacy status and uses live listing/stock/price',async t=>{
  const names=['DB_READ_MODE','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{DB_READ_MODE:'supabase_rest',SUPABASE_URL:'https://unit.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
  t.after(()=>{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}});
  let active=false;
  t.mock.method(globalThis,'fetch',async url=>{
    const table=new URL(url).pathname.split('/').at(-1);
    const rows=table==='products'?[{id:1,name:'Battery Cover',store_selling_price:150,stock_quantity:1,reserved_stock:0,status:'active',inventory_status:'active',is_deleted:false}]:table==='ecommerce_listings'&&active?[{id:3,inventory_item_id:1,listing_type:'single'}]:[];
    return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const hidden=response();await getProducts({query:{}},hidden);assert.equal(hidden.statusCode,200);assert.deepEqual(hidden.body,[]);
  active=true;const listed=response();await getProducts({query:{}},listed);assert.equal(listed.statusCode,200);assert.equal(listed.body[0].price,173);assert.equal(listed.body[0].stock_quantity,1);assert.equal(listed.body[0].visibility_status,'active');
});
