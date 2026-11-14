import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.NODE_ENV='test';
process.env.TEST_DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE='postgres';
const { default:pool } = await import('../config/database.js');
const { default:router } = await import('./banners.js');

test('carousel HTTP validates Owner writes, protects management, and publishes only safe current content', async () => {
  const original=pool.query; let role='owner'; let rows=[]; let metadataReady=true; const queries=[];
  const product={ id:4,name:'Front brake pads',part_number:'BRK-004',motorcycle_model:'Click 125',store_selling_price:620,price:650 };
  const campaign={ id:7,code:'OIL20',type:'percentage',value:20,min_purchase:500,max_discount:100,starts_at:null,expires_at:null,is_active:true,used_count:3,secret:'private' };
  pool.query=async (sql,values=[]) => {
    queries.push({sql,values});
    if(sql.includes('p.ecommerce_price')) throw Object.assign(new Error('ecommerce_price is derived, not stored'),{code:'42703'});
    if(sql.includes('FROM sessions')) return {rows:[{id:1}]};
    if(sql.includes('FROM users')) return {rows:[{id:1,role,is_active:true,is_deleted:false,email_verified:true}]};
    if(sql.includes('FROM products')) return {rows:values[0] instanceof Array ? values[0].includes(4) ? [product] : [] : [product]};
    if(sql.includes('FROM discounts')) {
      if(sql.includes('AND EXISTS') && !rows.some(row=>row.destination_type==='promotion' && row.destination_id===values[0] && row.is_active && (!row.starts_at || Date.parse(row.starts_at)<=Date.now()) && (!row.ends_at || Date.parse(row.ends_at)>Date.now()))) return {rows:[]};
      return {rows:values[0] instanceof Array ? values[0].includes(7) ? [campaign] : [] : values[0]===7 || !values.length ? [campaign] : []};
    }
    if(sql.includes('FROM categories')) return {rows:[{id:2,name:'Maintenance'}]};
    if(sql.includes('FROM motorcycle_models')) return {rows:[{id:6,model_name:'Click 125'}]};
    if(sql.startsWith('INSERT INTO banners')) {
      if(!metadataReady) throw Object.assign(new Error('missing column'),{code:'42703'});
      const keys=sql.match(/banners \(([^)]+)\)/)[1].split(',');
      const row={id:rows.length+1,...Object.fromEntries(keys.map((key,i)=>[key,values[i]])),owner_secret:'private'};
      rows.push(row); return {rows:[row]};
    }
    if(sql.startsWith('UPDATE banners')) {
      const id=values.at(-1);const keys=sql.split('SET ')[1].split(',updated_at')[0].split(',').map(value=>value.split('=')[0]);
      const row=rows.find(row=>row.id===id);Object.assign(row,Object.fromEntries(keys.map((key,i)=>[key,values[i]])));return {rows:[row]};
    }
    if(sql.startsWith('DELETE FROM banners')) { const match=rows.find(row=>row.id===values[0]);rows=rows.filter(row=>row.id!==values[0]);return {rows:match?[{id:match.id}]:[]}; }
    if(sql.includes('FROM banners')) return {rows:sql.includes('WHERE id=') ? rows.filter(row=>row.id===values[0]) : [...rows].sort((a,b)=>a.display_order-b.display_order || a.id-b.id)};
    return {rows:[]};
  };
  const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.headers['x-test-role']) {role=req.headers['x-test-role'];req.session={auth:{userId:1,tokenHash:'a'.repeat(64)}};}next();});app.use('/api/banners',router);
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/api/banners`;
    const send=(path='',method='GET',body,as='owner')=>fetch(`${url}${path}`,{method,headers:{...(as?{'x-test-role':as}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await send('/all','GET',undefined,null)).status,401);
    assert.deepEqual(await (await send('','GET',undefined,null)).json(),[]);
    assert.equal((await send('/destinations/promotion/7','GET',undefined,null)).status,404,'unpublished coupon codes remain private');
    for(const denied of ['customer','store_staff','cashier']) {
      assert.equal((await send('/all','GET',undefined,denied)).status,403);
      assert.equal((await send('/destinations','GET',undefined,denied)).status,403);
      assert.equal((await send('','POST',{title:'Unauthorized'},denied)).status,403);
    }
    const base={title:'Weekend oils',subtitle:'Real shop campaign',image_url:'/brand/ride-detail.webp',button_text:'Shop oils',is_active:true,display_order:2,destination_type:'product',destination_id:4};
    let response=await send('','POST',base);assert.equal(response.status,201);assert.equal((await response.json()).banner.link_url,'/products/4');
    assert.equal((await (await send('','GET',undefined,null)).json()).length,1);
    const pickerResponse=await send('/destinations?type=product&search=Click%20125');assert.equal(pickerResponse.status,200);
    const picker=await pickerResponse.json();
    assert.equal(picker.products[0].motorcycle_model,'Click 125');
    assert.equal(picker.products[0].price,713,'picker uses existing authoritative online pricing');
    const pickerSql=queries.find(row=>row.sql.includes('ILIKE') && row.values[0]==='Click 125');
    assert.match(pickerSql.sql,/COALESCE\(mm.model_name,p.motorcycle_model\) ILIKE \$2/);
    assert.equal(pickerSql.values[1],'%Click 125%');
    assert.equal((await send('','POST',{...base,title:'Coupon',destination_type:'promotion',destination_id:7,display_order:1})).status,201);
    assert.equal((await send('','POST',{...base,title:'No link',destination_type:'none',destination_id:null,display_order:3})).status,201);
    for(const patch of [{destination_type:'external',destination_id:null,link_url:'javascript:alert(1)'},{destination_type:'product',destination_id:999},{destination_type:'storefront',destination_id:null,link_url:'/superadmin/dashboard'},{starts_at:'not-a-date'},{image_url:'data:image/svg+xml,evil'}]) assert.equal((await send('','POST',{...base,...patch})).status,400);
    rows.push(...[
      {id:10,...base,title:'Inactive',is_active:false},
      {id:11,...base,title:'Future',starts_at:new Date(Date.now()+3600000).toISOString()},
      {id:12,...base,title:'Expired',ends_at:new Date(Date.now()-3600000).toISOString()},
      {id:13,...base,title:'Unlisted product',destination_id:999},
      {id:14,...base,title:'Unavailable coupon',destination_type:'promotion',destination_id:8},
      {id:15,...base,title:'',image_url:'javascript:evil',destination_type:'none'},
    ]);
    const published=await (await send('','GET',undefined,null)).json();
    assert.deepEqual(published.map(row=>row.title),['Coupon','Weekend oils','No link']);
    assert.deepEqual(published.map(row=>row.link_url),['/shop?promotion=7','/products/4','']);
    assert.ok(published.every(row=>row.owner_secret===undefined && row.destination_id===undefined));
    const publicPromotion=await (await send('/destinations/promotion/7','GET',undefined,null)).json();
    assert.equal(publicPromotion.code,'OIL20');assert.equal(publicPromotion.secret,undefined);assert.equal(publicPromotion.used_count,undefined);
    assert.equal((await send('/destinations/promotion/8','GET',undefined,null)).status,404);
    assert.equal((await send('/not-an-id','PUT',base)).status,400);
    // Existing partial visibility updates keep metadata and accept pg Date values.
    rows[0].starts_at=new Date(Date.now()-60000);
    assert.equal((await send('/1','PUT',{is_active:false})).status,200);
    assert.equal(rows[0].destination_id,4);
    rows=[{id:21,title:'Legacy retained',image_url:'',link_url:'/shop',is_active:true,display_order:0}];
    assert.equal((await (await send('','GET',undefined,null)).json())[0].title,'Legacy retained');
    metadataReady=false;assert.equal((await send('','POST',base)).status,503);
    assert.ok(queries.every(({sql})=>!/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(sql)));
  } finally {pool.query=original;await new Promise(resolve=>server.close(resolve));await pool.end();}
});
