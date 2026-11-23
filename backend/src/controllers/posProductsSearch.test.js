import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import pool from '../config/database.js';
import { getPosProducts } from './posController.js';

after(() => pool.end());
const response = () => ({ statusCode:200, status(code) { this.statusCode=code;return this; }, json(body) { this.body=body;return this; } });
const invoke = async (query={}) => { const res=response();await getPosProducts({query},res);return res; };

test('POS searches and pages 5,000 canonical products before limiting the catalogue', async t => {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    CREATE TABLE categories(id int PRIMARY KEY,name text);
    INSERT INTO categories VALUES(1,'Brakes'),(2,'Electrical');
    CREATE TABLE motorcycle_models(id int PRIMARY KEY,model_name text,brand text,status text);
    INSERT INTO motorcycle_models VALUES(1,'REBORN','Suzuki','active'),(2,'SMASH','Suzuki','active'),(3,'No inventory yet','Honda','active'),(4,'Retired','Other','inactive');
    CREATE TABLE products(id int PRIMARY KEY,name text,part_number text,sku text,barcode text,brand text,
      motorcycle_model_id int,motorcycle_model text,category_id int,color text,box_number text,box_location text,
      price numeric,store_selling_price numeric,image text,stock_quantity int,reserved_stock int,low_stock_threshold int,
      inventory_status text,is_deleted boolean);
    INSERT INTO products SELECT n,'Item '||lpad(n::text,5,'0'),'PART-'||n,'SKU-'||n,'SCAN-'||n,'Maker',
      1+(n%2),'Stale model label',1+(n%2),'Black','Box '||(n%5),'Shelf '||(n%7),100,n,NULL,
      CASE WHEN n%10=0 THEN 0 WHEN n%10=1 THEN 3 ELSE 10 END,0,5,'active',false FROM generate_series(1,5000) n;
    UPDATE products SET inventory_status='inactive' WHERE id=4990;
    UPDATE products SET is_deleted=true WHERE id=4998;
    UPDATE products SET reserved_stock=stock_quantity WHERE id=4995;
    UPDATE products SET stock_quantity=999 WHERE id=4997;
    CREATE TABLE product_variants(id int PRIMARY KEY,product_id int,variant_type text,variant_value text,option_combination jsonb,
      price numeric,price_adjustment numeric,sku text,barcode text,part_number text,image_url text,stock_quantity int,reserved_stock int);
    INSERT INTO product_variants VALUES(99,4997,'Color','Signal Orange','{"Color":"Signal Orange"}',NULL,25,'VAR-LAST','VAR-SCAN','VAR-PART',NULL,10,8),
      (100,4996,'Size','Large','{"Size":"Large"}',150,0,'SIZE-L',NULL,NULL,NULL,10,2);
    UPDATE products SET name='A PART-4999 compatible item' WHERE id=1;
    UPDATE products SET name='A VAR-LAST compatible item' WHERE id=2;
  `);
  t.mock.method(pool,'query',(sql,args)=>db.query(sql,args));

  const first=(await invoke()).body;
  assert.equal(first.products.length,30);
  assert.equal(first.total,4998);
  assert.equal(first.totalPages,167);
  assert.equal(first.pageSize,30);
  assert.deepEqual(first.filters.models.map(row=>row.id).sort(),[1,2,3]);
  assert.deepEqual(first.filters.categories.map(row=>row.id).sort(),[1,2]);
  const last=(await invoke({page:167})).body;
  assert.equal(last.products.length,18);
  assert.ok(last.products.some(row=>row.id===4999));
  assert.ok(last.products.some(row=>row.id===5000));
  assert.equal((await invoke({search:'  sCaN-5000  '})).body.products[0].id,5000);
  assert.deepEqual((await invoke({page:99999})).body.products.map(row=>row.id),last.products.map(row=>row.id));

  for (const term of ['  part-4999  ','scan-4999','SKU-4999']) {
    const result=(await invoke({search:term})).body;
    assert.equal(result.products[0].id,4999,term);
  }
  for (const term of ['var-last','var-scan','VAR-PART','Signal Orange']) {
    const result=(await invoke({search:term})).body;
    assert.equal(result.products[0].id,4997,term);
    assert.equal(result.products[0].available_stock,2);
    assert.equal(result.products[0].variants[0].available_stock,2);
    assert.equal(result.products[0].variants[0].barcode,'VAR-SCAN');
  }
  for (const term of ['REBORN','reborn','  ReBoRn  ']) {
    const result=(await invoke({search:term,model_id:1})).body;
    assert.equal(result.total,2498);
    assert.ok(result.products.every(row=>row.motorcycle_model_id===1 && row.motorcycle_model==='REBORN'));
  }
  for (const term of ['Maker','Suzuki','Black','Box 1','Shelf 1']) assert.ok((await invoke({search:term})).body.total>0,term);
  assert.equal((await invoke({model_id:3})).body.total,0);
  assert.equal((await invoke({model_id:1,category_id:2})).body.total,0);
  const all=[];
  for (const stockStatus of ['in_stock','low_stock','out_of_stock']) {
    const result=(await invoke({stockStatus,sortBy:'available_stock',sortDir:'asc',limit:100})).body;
    all.push(result.total);
    assert.ok(result.products.every(row=>stockStatus==='out_of_stock' ? row.available_stock===0 : stockStatus==='low_stock' ? row.available_stock>0 && row.available_stock<=5 : row.available_stock>5));
  }
  assert.equal(all.reduce((sum,n)=>sum+n,0),4998);
  assert.equal((await invoke({search:'PART-4995',stockStatus:'out_of_stock'})).body.products[0].available_stock,0);
  assert.equal((await invoke({search:'VAR-LAST',stockStatus:'low_stock'})).body.products[0].available_stock,2);
  assert.equal((await invoke({search:'SIZE-L',stockStatus:'in_stock'})).body.products[0].available_stock,8);
  for (const sortBy of ['name','part_number','available_stock','store_selling_price']) {
    const asc=(await invoke({sortBy,sortDir:'asc',limit:100})).body.products;
    const desc=(await invoke({sortBy,sortDir:'desc',limit:100})).body.products;
    const field=sortBy==='store_selling_price'?'store_selling_price':sortBy;
    for (const [rows,direction] of [[asc,1],[desc,-1]]) for(let i=1;i<rows.length;i++) {
      const a=rows[i-1][field],b=rows[i][field];
      assert.ok((typeof a==='string' ? a.localeCompare(b) : a-b)*direction<=0,sortBy);
    }
  }
  assert.equal((await invoke({model_id:"1 OR 1=1"})).statusCode,400);
  const bounded=(await invoke({limit:99999,sortBy:'name;DROP TABLE products',sortDir:'desc;DROP'})).body;
  assert.equal(bounded.products.length,100);
  assert.equal((await invoke({search:"'; DROP TABLE products;--"})).body.total,0);
  assert.equal((await invoke({search:'nonexistent',page:99})).body.totalPages,1);
});
