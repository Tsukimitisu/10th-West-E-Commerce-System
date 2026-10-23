// Isolated PostgreSQL/WASM fixture: never loads or connects to a shop database.
import { PGlite } from '@electric-sql/pglite';
import legacy from '../../migrations/202610200004_offline_pos.cjs';
import multi from '../../migrations/202610210001_multi_device_offline_pos.cjs';
import automatic from '../../migrations/202610210003_automatic_offline_pos.cjs';
export const A='11111111-1111-4111-8111-111111111111';
export const B='22222222-2222-4222-8222-222222222222';
export const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
export const request=(body={},extra={})=>({body,user:{id:7,role:'owner'},params:{},query:{},session:{auth:{authenticatedAt:Date.now()}},get:()=>null,...extra});
export async function fixture() {
  const db=new PGlite();
  const raw=sql=>db.exec(sql);
  let tail=Promise.resolve();
  const connect=async()=>{
    const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;
    return {async query(sql,args=[]){const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows ?? r.rows.length};},release};
  };
  async function reset({migrate=true,active=true}={}) {
    await raw(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
      CREATE TABLE users(id int PRIMARY KEY,name text,role text);
      INSERT INTO users VALUES(7,'Cashier','owner');
      CREATE TABLE motorcycle_models(id int PRIMARY KEY,model_name text);
      CREATE TABLE products(id int PRIMARY KEY,name text,price numeric,store_selling_price numeric,buying_price numeric,
        stock_quantity int NOT NULL,reserved_stock int NOT NULL DEFAULT 0,inventory_status text DEFAULT 'active',is_deleted boolean DEFAULT false,
        sku text,barcode text,part_number text,image text,category_id int,motorcycle_model text,motorcycle_model_id int,color text,box_location text,variant_options jsonb,updated_at timestamptz);
      CREATE TABLE product_variants(id int PRIMARY KEY,product_id int REFERENCES products(id),stock_quantity int NOT NULL,reserved_stock int NOT NULL DEFAULT 0,
        sku text,variant_type text,variant_value text,option_combination jsonb,price numeric,price_adjustment numeric,image_url text,updated_at timestamptz);
      INSERT INTO products(id,name,price,stock_quantity,reserved_stock) VALUES(1,'Brake Pad',120,10,0),(2,'Helmet',500,10,0);
      INSERT INTO product_variants(id,product_id,stock_quantity,variant_type,variant_value,price) VALUES(20,2,5,'Color','Black',500),(21,2,5,'Color','Red',500);
      CREATE TABLE orders(id serial PRIMARY KEY,user_id int,total_amount numeric,subtotal_amount numeric,shipping_fee numeric,discount_amount numeric,tax_amount numeric,
        currency text,status text,shipping_address text,source text,payment_method text,payment_provider text,payment_status text,payment_reference text,amount_tendered numeric,
        change_due numeric,cashier_id int,shipping_method text,checkout_idempotency_key text,promo_code_used text,paid_at timestamptz,pos_metadata jsonb,receipt_number text,created_at timestamptz DEFAULT now());
      CREATE TABLE order_items(id serial PRIMARY KEY,order_id int,product_id int,variant_id int,product_name text,product_price numeric,price numeric,quantity int,
        sku_snapshot text,variant_name_snapshot text,image_snapshot text,unit_cost_snapshot numeric);
      CREATE TABLE stock_movements(id serial PRIMARY KEY,product_id int,variant_id int,order_id int,quantity_delta int,stock_before int,stock_after int,reason text,reference_type text,reference_id bigint,created_by int,metadata jsonb);
      CREATE TABLE payments(id serial PRIMARY KEY,order_id int,user_id int,provider text,method text,status text,amount numeric,currency text,reference text,metadata jsonb,paid_at timestamptz);
      CREATE TABLE order_status_history(id serial PRIMARY KEY,order_id int,from_status text,to_status text,source text,changed_by int,note text);
      CREATE TABLE audit_logs(id serial PRIMARY KEY,actor_user_id int,action text,entity_type text,entity_id text,ip_address text,user_agent text,before_data jsonb,after_data jsonb,metadata jsonb);
      CREATE TABLE activity_logs(id serial PRIMARY KEY,user_id int,action text,entity_type text,entity_id text,details jsonb,ip_address text,user_agent text);
      CREATE TABLE idempotency_keys(user_id int,scope text,key text,request_hash text,expires_at timestamptz,status text DEFAULT 'processing',response_status int,response_body jsonb,updated_at timestamptz,UNIQUE(user_id,scope,key));
    `);
    await legacy.up({raw});
    await db.query('INSERT INTO pos_offline_devices(id,device_uuid,name,is_active,registered_by) VALUES($1,$1,$2,$3,7)',[A,'Friend Laptop',active]);
    await db.query("INSERT INTO pos_offline_reserves(id,product_id,target_quantity,remaining) VALUES('1:0',1,2,2)");
    await db.query('UPDATE products SET reserved_stock=2 WHERE id=1');
    if(migrate){await multi.up({raw});await automatic.up({raw});}
  }
  return {db,raw,connect,reset,multi,automatic,close:()=>db.close()};
}
