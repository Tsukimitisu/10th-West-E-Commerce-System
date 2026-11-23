import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import pool from '../config/database.js';
import { initSocket } from '../socket.js';
import { updateInventoryItem } from './inventoryController.js';
import variants from '../routes/variants.js';

after(()=>pool.end());
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
const variantHandler=(method,path)=>variants.stack.find(layer=>layer.route?.path===path && layer.route.methods[method]).route.stack.at(-1).handle;

test('inventory edits and every variant write notify the canonical POS catalogue after success',async t=>{
  const io=initSocket(createServer(),['http://localhost']);t.after(()=>new Promise(resolve=>io.close(resolve)));
  let committed=false,failWrite=false,requireCommit=false;
  const events=[];t.mock.method(io,'emit',(event,payload)=>{
    if(requireCommit) assert.equal(committed,true,'matrix must commit before notifying clients');
    events.push({event,payload});return true;
  });
  const product={id:7,name:'Brake pad',part_number:'PAD-7',motorcycle_model_id:1,store_selling_price:100,stock_quantity:10};
  const variant={id:70,product_id:7,variant_type:'Color',variant_value:'Black',option_combination:{Color:'Black'},price:100,stock_quantity:10};
  const query=async sql=>{
    if(sql==='COMMIT'){committed=true;return {rows:[],rowCount:0};}
    if(failWrite && /^\s*(UPDATE|INSERT|DELETE)/.test(sql)) throw new Error('Disposable write failure');
    if(sql.includes('FROM motorcycle_models')) return {rows:[{id:1,model_name:'REBORN'}],rowCount:1};
    if(sql.includes('FROM products')) return {rows:[{...product,price:100}],rowCount:1};
    if(sql.includes('UPDATE products') && sql.includes('RETURNING')) return {rows:[product],rowCount:1};
    if(sql.includes('product_variants') && /SELECT|RETURNING/.test(sql)) return {rows:[variant],rowCount:1};
    return {rows:[],rowCount:0};
  };
  t.mock.method(pool,'query',query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  const req={params:{productId:'7'},body:{name:'Brake pad',part_number:'PAD-7',motorcycle_model_id:1,store_selling_price:100},user:{id:1}};
  const edited=response();await updateInventoryItem(req,edited);assert.equal(edited.statusCode,200,JSON.stringify(edited.body));
  assert.deepEqual(events,[{event:'product:updated',payload:{id:7}},{event:'catalog:updated',payload:{}}]);

  for(const [method,path,params,body] of [
    ['put','/product/:productId',{productId:'7'},{options:[{name:'Color',values:['Black']}],variants:[{option_combination:{Color:'Black'},price:100,stock_quantity:10}]}],
    ['post','/',{}, {product_id:7,variant_type:'Color',variant_value:'Black',price:100,stock_quantity:10}],
    ['put','/:id',{id:'70'}, {variant_type:'Color',variant_value:'Black',price:100,stock_quantity:10}],
    ['delete','/:id',{id:'70'},{}],
  ]) {
    events.length=0;committed=false;requireCommit=path==='/product/:productId';
    const res=response();await variantHandler(method,path)({params,body},res);
    assert.ok([200,201].includes(res.statusCode),JSON.stringify(res.body));
    assert.deepEqual(events,[{event:'product:updated',payload:{id:7}},{event:'catalog:updated',payload:{}}],`${method} ${path}`);
    if(path==='/product/:productId') assert.equal(committed,true,'matrix must commit before notifying clients');
  }
  events.length=0;failWrite=true;
  const failed=response();await variantHandler('delete','/:id')({params:{id:'70'}},failed);
  assert.equal(failed.statusCode,500);assert.deepEqual(events,[],'failed writes cannot announce a catalogue change');
});
