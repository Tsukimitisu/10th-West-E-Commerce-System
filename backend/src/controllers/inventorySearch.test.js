import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { getInventory,createInventoryItem,updateInventoryItem,findInventoryItem } from './inventoryController.js';
import { listInventoryProductItems } from './inventoryProductItemsController.js';
import { getEcommerceListings } from './ecommerceListingController.js';
import { getMotorcycleModels } from './motorcycleModelController.js';
import { resetSetListingSchemaCache } from '../services/setListings.js';

after(()=>pool.end());
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
const invoke=async(handler,query={},extra={})=>{const res=response();await handler({query,...extra},res);assert.equal(res.statusCode,200,JSON.stringify(res.body));return res.body;};

async function fixture(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE motorcycle_models(id int PRIMARY KEY,model_name text,brand text,status text);
    INSERT INTO motorcycle_models VALUES(1,'REBORN','Suzuki','active'),(2,'SMASH','Suzuki','active'),(3,'Model without stock','Other','active'),(4,'Retired','Other','inactive');
    CREATE TABLE categories(id int PRIMARY KEY,name text);
    CREATE TABLE products(id serial PRIMARY KEY,part_number text UNIQUE,name text,brand text,motorcycle_model text,motorcycle_model_id int,color text,
      store_selling_price numeric,price numeric,buying_price numeric,stock_quantity int,reserved_stock int DEFAULT 0,damaged_stock int DEFAULT 0,low_stock_threshold int,
      box_location text,box_number text,description text,inventory_status text,status text,is_deleted boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),updated_at timestamptz,category_id int,rating numeric,sku text,barcode text,image text);
    INSERT INTO products(id,part_number,name,brand,motorcycle_model,motorcycle_model_id,color,store_selling_price,price,buying_price,stock_quantity,low_stock_threshold,box_location,inventory_status,status,sku,barcode)
      SELECT n,'PART-'||lpad(n::text,4,'0'),'Item '||lpad(n::text,4,'0'),'Maker','Stale label',1+(n%2),'Black',100,100,80,CASE WHEN n%10=0 THEN 0 ELSE 10 END,5,'Bin '||(n%5),'active','draft','SKU-'||n,'SCAN-'||n FROM generate_series(1,620) n;
    SELECT setval('products_id_seq',620);
    CREATE TABLE stock_adjustments(product_id int,quantity_change int,reason text,notes text,adjusted_by int,status text);
    CREATE TABLE stock_movements(product_id int,quantity_delta int,stock_before int,stock_after int,reason text,reference_type text,created_by int,metadata jsonb);
    CREATE TABLE product_variants(id int,product_id int);
    CREATE TABLE ecommerce_listings(id serial PRIMARY KEY,inventory_item_id int,listing_type text,title text,motorcycle_model_id int,
      ecommerce_description text,visibility_status text,is_featured boolean,is_best_seller boolean,is_new_arrival boolean,created_at timestamptz,updated_at timestamptz,visual_options boolean);
    INSERT INTO ecommerce_listings(id,inventory_item_id,listing_type,visibility_status) SELECT id,id,'single','active' FROM products;
    INSERT INTO ecommerce_listings(id,listing_type,title,motorcycle_model_id,visibility_status) VALUES(621,'set','Special Kit',1,'draft');
    CREATE TABLE ecommerce_listing_items(listing_id int,product_item_id int,sort_order int,image_url text);INSERT INTO ecommerce_listing_items VALUES(621,620,0,NULL);
    CREATE TABLE ecommerce_listing_media(id int,listing_id int,url text,media_type text,sort_order int,alt_text text);`);
  const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:/^\s*(SELECT|WITH)/i.test(sql)?result.rows.length:result.affectedRows ?? result.rows.length};};
  t.mock.method(pool,'query',query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  resetSetListingSchemaCache(true);t.after(()=>resetSetListingSchemaCache(null));
  return db;
}

test('Owner and Staff share full-dataset search, IDs, barcode, counts and allowlisted paging',async t=>{
  await fixture(t);
  const models=await invoke(getMotorcycleModels);assert.deepEqual(models.models.filter(row=>row.status==='active').map(row=>row.id).sort(),[1,2,3]);
  for(const role of ['owner','store_staff']) {
    const user={id:7,role};
    const all=await invoke(getInventory,{paged:'true',page:1,pageSize:20},{user});assert.equal(all.total,620);assert.equal(all.items.length,20);
    const second=await invoke(getInventory,{paged:'true',page:20,pageSize:20},{user});assert.equal(second.total,620);assert.equal(second.items.length,20);
    for(const q of ['REBORN','Reborn','reborn','  reborn  ']) {
      const inventory=await invoke(getInventory,{paged:'true',q},{user});
      const reference=await invoke(listInventoryProductItems,{q},{user});
      assert.equal(inventory.total,310);assert.equal(reference.total,310);
      assert.deepEqual(inventory.items.map(row=>row.id),reference.items.map(row=>row.id));
      assert.ok(inventory.items.every(row=>row.motorcycle_model_id===1 && row.motorcycle_model==='REBORN'));
    }
    const combined=await invoke(getInventory,{paged:'true',q:'reborn',model_id:1},{user});assert.equal(combined.total,310);
    assert.equal((await invoke(getInventory,{paged:'true',q:'reborn',model_id:2},{user})).total,0);
    for(const q of ['PART-0620','  part-0620  ','SCAN-620','sku-620']) {
      const result=await invoke(getInventory,{paged:'true',q},{user});assert.equal(result.total,1);assert.equal(result.items[0].id,620);assert.equal(result.items[0].has_storefront_listing,true);
      assert.equal((await invoke(listInventoryProductItems,{q},{user})).items[0].id,620);
    }
    assert.equal((await invoke(getInventory,{paged:'true',q:'PART-06'},{user})).total,21);
    assert.equal((await invoke(getInventory,{paged:'true',q:'Suzuki'},{user})).total,620);
    assert.equal((await invoke(getInventory,{paged:'true',stockStatus:'out_of_stock'},{user})).total,62);
    const lookup=await invoke(findInventoryItem,{code:' scan-620 '},{user});assert.equal(lookup.id,620);
    const reset=await invoke(getInventory,{paged:'true',q:'',model_id:''},{user});assert.equal(reset.total,620);
    const unsafe=await invoke(listInventoryProductItems,{q:"'; DROP TABLE products;--",sortBy:'name;DROP TABLE products',sortDir:'ASC;DROP'});assert.equal(unsafe.total,0);
  }
});

test('committed create/edit is immediately searchable by canonical model and exact part number',async t=>{
  await fixture(t);
  const body={part_number:'NEW-EXACT-765',product_name:'New panel',motorcycle_model_id:1,store_selling_price:150,quantity:1,minimum_stock:0};
  const added=response();await createInventoryItem({body,user:{id:7,role:'owner'}},added);assert.equal(added.statusCode,201);
  const id=added.body.item.id;
  let found=await invoke(getInventory,{paged:'true',q:' new-exact-765 ',model_id:1});assert.equal(found.total,1);assert.equal(found.items[0].id,id);
  const edited=response();await updateInventoryItem({params:{productId:id},body:{...body,motorcycle_model_id:2},user:{id:7,role:'owner'}},edited);assert.equal(edited.statusCode,200);
  assert.equal((await invoke(getInventory,{paged:'true',q:'NEW-EXACT-765',model_id:1})).total,0);
  found=await invoke(getInventory,{paged:'true',q:'NEW-EXACT-765',model_id:2});assert.equal(found.items[0].id,id);assert.equal(found.items[0].motorcycle_model,'SMASH');
  const exact=await invoke(listInventoryProductItems,{q:'NEW-EXACT-765',model_id:2});assert.equal(exact.items[0].motorcycleModel,'SMASH');
});

test('listing search uses canonical model IDs and child fields before paging; status filters stay intact',async t=>{
  await fixture(t);
  const all=await invoke(getEcommerceListings,{paged:'true'});assert.equal(all.total,621);assert.equal(all.items.length,20);
  const exact=await invoke(getEcommerceListings,{paged:'true',q:'PART-0620'});assert.equal(exact.total,2);
  assert.ok(exact.items.some(row=>row.id===621),'set child fields are searchable');
  const models=await invoke(getEcommerceListings,{paged:'true',q:'reborn',model_id:1});assert.equal(models.total,311);
  assert.equal((await invoke(getEcommerceListings,{paged:'true',q:'reborn',model_id:2})).total,0);
  assert.equal((await invoke(getEcommerceListings,{paged:'true',visibility_status:'draft'})).total,1);
  assert.equal((await invoke(getEcommerceListings,{paged:'true',q:'scan-620',visibility_status:'active'})).total,1);
  for(const sortBy of ['itemName','price','stockQuantity','motorcycleModel','location']) assert.equal((await invoke(getEcommerceListings,{paged:'true',sortBy,sortDir:'desc'})).total,621);
});
