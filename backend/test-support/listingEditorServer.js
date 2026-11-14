// Disposable browser-test API. Real routes/controllers/auth/CSRF and PostgreSQL
// queries; only the external Cloudinary transport is replaced. Never deployed.
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import session from 'express-session';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV !== 'test' || !process.send) throw new Error('Test runner only.');
for (const key of ['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','POSTGRES_URL','PGHOST','PGPASSWORD','DB_HOST']) process.env[key]='';
process.env.TEST_DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
process.env.DB_READ_MODE='postgres';
process.env.SESSION_SECRET=process.env.CSRF_SECRET='disposable-listing-editor-test-only';
process.env.CLOUDINARY_CLOUD_NAME=process.env.CLOUDINARY_API_KEY=process.env.CLOUDINARY_API_SECRET='fixture-not-a-credential';
const { default:pool }=await import('../src/config/database.js');
const db=new PGlite();
await db.exec(`
  CREATE TABLE system_settings(key text,value text,category text);
  CREATE TABLE users(id int PRIMARY KEY,name text,email text,role text,avatar text,is_active boolean DEFAULT true,is_deleted boolean DEFAULT false,email_verified boolean DEFAULT true,two_factor_enabled boolean DEFAULT false);
  INSERT INTO users(id,name,email,role) VALUES(1,'Fixture Owner','owner@example.test','owner'),(2,'Fixture Staff','staff@example.test','store_staff'),(3,'No permission','limited@example.test','store_staff'),(4,'Customer','customer@example.test','customer');
  CREATE TABLE sessions(id serial PRIMARY KEY,user_id int,token_hash text,is_active boolean DEFAULT true,expires_at timestamptz DEFAULT now()+interval '1 day',created_at timestamptz DEFAULT now(),last_active timestamptz DEFAULT now(),explicitly_refreshed_at timestamptz DEFAULT now());
  INSERT INTO sessions(user_id,token_hash) SELECT id,'fixture-'||id FROM users;
  CREATE TABLE permissions(id int PRIMARY KEY,name text UNIQUE);
  INSERT INTO permissions VALUES(1,'products.view'),(2,'products.manage'),(3,'inventory.view');
  CREATE TABLE role_permissions(role text,permission_id int);INSERT INTO role_permissions SELECT 'store_staff',id FROM permissions;
  CREATE TABLE user_permissions(user_id int,permission_id int,granted boolean);INSERT INTO user_permissions SELECT 3,id,false FROM permissions;
  CREATE TABLE motorcycle_models(id int PRIMARY KEY,model_name text,brand text,status text);INSERT INTO motorcycle_models VALUES(1,'Fixture Model','Fixture','active');
  CREATE TABLE categories(id int PRIMARY KEY,name text);
  CREATE TABLE products(id int PRIMARY KEY,name text,part_number text,brand text,motorcycle_model text,motorcycle_model_id int,color text,
    store_selling_price numeric,price numeric,buying_price numeric DEFAULT 80,stock_quantity int,reserved_stock int DEFAULT 0,damaged_stock int DEFAULT 0,
    box_location text,box_number text,low_stock_threshold int DEFAULT 1,inventory_status text,is_deleted boolean DEFAULT false,image text,created_at timestamptz DEFAULT now(),category_id int,barcode text,sku text);
  INSERT INTO products(id,name,part_number,motorcycle_model_id,store_selling_price,price,stock_quantity,inventory_status) VALUES
    (11,'First panel','P-11',1,150,150,5,'active'),(12,'Middle panel','P-12',1,200,200,3,'active'),(13,'Last panel','P-13',1,250,250,2,'active'),(21,'Helmet','P-21',1,300,300,4,'active');
  CREATE TABLE product_variants(id int PRIMARY KEY,product_id int REFERENCES products(id),image_url text,stock_quantity int,price numeric,sku text,option_combination jsonb);
  INSERT INTO product_variants VALUES(201,21,NULL,4,300,'HELMET-BLACK','{"Color":"Black"}');
  CREATE TABLE ecommerce_listings(id serial PRIMARY KEY,inventory_item_id int UNIQUE REFERENCES products(id),listing_type text DEFAULT 'single',title text,motorcycle_model_id int,
    ecommerce_description text,visibility_status text,is_featured boolean DEFAULT false,is_best_seller boolean DEFAULT false,is_new_arrival boolean DEFAULT false,
    visual_options boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
  INSERT INTO ecommerce_listings(id,listing_type,title,motorcycle_model_id,ecommerce_description,visibility_status) VALUES(90,'set','Fixture panel set',1,'Keep this description','active');
  INSERT INTO ecommerce_listings(id,inventory_item_id,visibility_status) VALUES(91,21,'draft');
  CREATE TABLE ecommerce_listing_items(listing_id int REFERENCES ecommerce_listings(id),product_item_id int REFERENCES products(id),sort_order int,image_url text,PRIMARY KEY(listing_id,product_item_id),UNIQUE(listing_id,sort_order));
  INSERT INTO ecommerce_listing_items VALUES(90,11,0,NULL),(90,12,1,NULL),(90,13,2,NULL);
  CREATE TABLE ecommerce_listing_media(id serial PRIMARY KEY,listing_id int REFERENCES ecommerce_listings(id),url text,media_type text,sort_order int DEFAULT 0,alt_text text);
  INSERT INTO ecommerce_listing_media(listing_id,url,media_type) VALUES(90,'/images/product-fallback.svg','image');
`);
const query=async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:/^\s*(SELECT|WITH)/i.test(sql)?result.rows.length:result.affectedRows ?? result.rows.length};};
pool.query=query;pool.connect=async()=>({query,release(){}});
const { default:listingRoutes }=await import('../src/routes/ecommerceListings.js');
const { default:productRoutes }=await import('../src/routes/products.js');
const { getInventory }=await import('../src/controllers/inventoryController.js');
const { getMotorcycleModels }=await import('../src/controllers/motorcycleModelController.js');
const { authenticateToken,requirePermission }=await import('../src/middleware/auth.js');
const { validateCsrf,generateCsrfToken }=await import('../src/middleware/csrf.js');
const app=express();const files=new Map();let port;const uploads=[];let storageFailure=null,storageDelay=0,storageUrl;
cloudinary.uploader.upload_stream=(_options,callback)=>{const chunks=[];return new Writable({write(chunk,_enc,done){chunks.push(chunk);done();},async final(done){
  const buffer=Buffer.concat(chunks),id=randomUUID();uploads.push({id,bytes:buffer.length});
  if(storageDelay)await new Promise(resolve=>setTimeout(resolve,storageDelay));
  if(storageFailure){callback(storageFailure);done();return;}
  files.set(id,buffer);
  callback(null,{secure_url:storageUrl ?? `http://localhost:${port}/fixture-media/${id}`,bytes:buffer.length});done();
}});};
app.use(session({secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax'}}));
app.use(express.json());
app.post('/fixture/login',(req,res)=>{const id=Number(req.body.id);if(![1,2,3,4].includes(id))return res.sendStatus(400);req.session.auth={userId:id,tokenHash:`fixture-${id}`,authenticatedAt:Date.now()};res.json({ok:true});});
app.post('/fixture/storage',(req,res)=>{storageFailure=req.body.failure || null;storageDelay=req.body.delay || 0;storageUrl=req.body.url;res.json({ok:true});});
app.post('/fixture/reset',async(_req,res)=>{
  storageFailure=null;storageDelay=0;storageUrl=undefined;uploads.length=0;
  await db.exec(`UPDATE ecommerce_listing_items SET image_url=NULL;UPDATE product_variants SET image_url=NULL;
    UPDATE ecommerce_listings SET visual_options=false,title=CASE WHEN id=90 THEN 'Fixture panel set' ELSE NULL END,ecommerce_description='Keep this description',visibility_status=CASE WHEN id=90 THEN 'active' ELSE 'draft' END;
    DELETE FROM ecommerce_listing_items;INSERT INTO ecommerce_listing_items VALUES(90,11,0,NULL),(90,12,1,NULL),(90,13,2,NULL);`);
  res.json({ok:true});
});
app.get('/api/csrf-token',generateCsrfToken,(req,res)=>res.json({csrfToken:req.csrfToken}));
app.get('/fixture/state',async(_req,res)=>res.json({uploads,items:(await query('SELECT * FROM ecommerce_listing_items ORDER BY sort_order')).rows,variants:(await query('SELECT id,image_url FROM product_variants ORDER BY id')).rows}));
app.get('/fixture-media/:id',(req,res)=>res.type('png').send(files.get(req.params.id)));
app.use('/api',validateCsrf);
app.use('/api/ecommerce-listings',listingRoutes);
app.use('/api/products',productRoutes);
app.get('/api/inventory',authenticateToken,requirePermission('inventory.view'),getInventory);
app.get('/api/motorcycle-models',authenticateToken,getMotorcycleModels);
app.get('/api/variants/product/:id',authenticateToken,requirePermission('products.view'),async(req,res)=>res.json({variants:(await query('SELECT * FROM product_variants WHERE product_id=$1',[req.params.id])).rows}));
app.use((error,_req,res,_next)=>res.status(error.status || 500).json({message:'Fixture request failed',code:error.code || 'FIXTURE_ERROR'}));
const server=app.listen(0,'localhost',()=>{port=server.address().port;process.send({port});});
process.on('message',async message=>{if(message==='stop'){server.closeAllConnections();server.close();await db.close();await pool.end();process.exit(0);}});
