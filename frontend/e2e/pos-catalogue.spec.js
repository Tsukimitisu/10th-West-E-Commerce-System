import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

// All API and socket traffic is intercepted: these tests never write shop data.
async function fixture(page) {
  await staffFixture(page,{ permissions:['pos.access'] });
  const state={ queries:[], sockets:[], releaseSlow:null };
  const products=Array.from({length:5000},(_,i)=>({
    id:i+1,name:`Part ${String(i+1).padStart(5,'0')}`,sku:`SKU-${i+1}`,barcode:`SCAN-${i+1}`,part_number:`PART-${i+1}`,
    category_id:1+(i%2),motorcycle_model_id:1+(i%2),motorcycle_model:i%2?'SMASH':'REBORN',
    store_selling_price:i+1,price:i+1,available_stock:10,stock_quantity:10,variants:[],
  }));
  await page.routeWebSocket('**/socket.io/**',socket=>{
    state.sockets.push(socket);
    socket.send('0{"sid":"pos-catalogue","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
    socket.onMessage(message=>{
      if(String(message).startsWith('40')) socket.send('40{"sid":"pos-catalogue"}');
      if(message==='2') socket.send('3');
    });
  });
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname.replace(/^\/api/,'');
    const reply=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/health') return reply({status:'OK'});
    if(path==='/pos/capabilities') return reply({can_access:true,can_discount:false,can_void:false});
    if(path==='/pos/daily-summary') return reply({transaction_count:0,gross_sales:0,cash_sales:0,gcash_sales:0});
    if(path==='/pos/validate-cart') {
      const items=request.postDataJSON().items;
      return reply({valid:true,items,subtotal_amount:items.reduce((sum,item)=>sum+item.product_id*item.quantity,0),discount_amount:0,total_amount:items.reduce((sum,item)=>sum+item.product_id*item.quantity,0)});
    }
    if(path!=='/pos/products') return route.fallback();
    const query=Object.fromEntries(url.searchParams);state.queries.push(query);
    const term=(query.search || '').trim().toLowerCase();
    if(state.holdNext === term) {
      state.holdNext=null;
      await new Promise(resolve=>{state.releaseHeld=resolve;});
    }
    let rows=products.filter(product=>!term || [product.name,product.sku,product.barcode,product.part_number,product.motorcycle_model].some(value=>value.toLowerCase().includes(term)));
    if(term==='slow') {
      await new Promise(resolve=>{state.releaseSlow=resolve;});
      rows=[{...products[0],name:'Stale response product'}];
    }
    if(query.model_id) rows=rows.filter(row=>String(row.motorcycle_model_id)===query.model_id);
    if(query.category_id) rows=rows.filter(row=>String(row.category_id)===query.category_id);
    if(query.stockStatus==='out_of_stock' || query.stockStatus==='low_stock') rows=[];
    const sort=query.sortBy || 'name',direction=query.sortDir==='desc'?-1:1;
    rows.sort((a,b)=>(typeof a[sort]==='string'?a[sort].localeCompare(b[sort]):a[sort]-b[sort])*direction);
    const pageNumber=Number(query.page || 1),limit=Number(query.limit || 30);
    const body={products:rows.slice((pageNumber-1)*limit,pageNumber*limit),total:rows.length,page:pageNumber,pageSize:limit,totalPages:Math.max(1,Math.ceil(rows.length/limit)),filters:{
      models:[{id:1,model_name:'REBORN',brand:'Suzuki'},{id:2,model_name:'SMASH',brand:'Suzuki'},{id:3,model_name:'No inventory yet',brand:'Honda'}],
      categories:[{id:1,name:'Brakes'},{id:2,name:'Electrical'}],
    }};
    try { return await reply(body); } catch(error) { if(!/closed|handled|disposed|cancelled|aborted/i.test(error.message)) throw error; }
  });
  return state;
}

for(const width of [1440,390]) test(`POS pages canonical inventory and preserves the cart across filters at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const state=await fixture(page);
  await page.goto('/#/pos');
  const nav=page.getByRole('navigation',{name:'Product catalogue pages'});
  await expect(nav).toContainText('5,000 products');
  await expect(page.getByRole('heading',{name:'Part 00001',exact:true})).toBeVisible();
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Part 00001',exact:true})}).click();
  await nav.getByRole('button',{name:'Next',exact:true}).click();
  await expect(nav).toContainText('Page 2 of 167');
  await expect(page.getByRole('heading',{name:'Part 00031',exact:true})).toBeVisible();
  await page.getByLabel('Filter by motorcycle model').selectOption('1');
  await expect(nav).toContainText('2,500 products');await expect(nav).toContainText('Page 1 of 84');
  await page.getByLabel('Filter by category').selectOption('2');await expect(nav).toContainText('0 products');
  await page.getByLabel('Filter by category').selectOption('');
  await page.getByLabel('Filter by motorcycle model').selectOption('');
  await page.getByRole('searchbox',{name:'Search products or scan a barcode'}).fill('  sCaN-5000  ');
  await expect(page.getByRole('heading',{name:'Part 05000',exact:true})).toBeVisible();
  await expect(nav).toContainText('1 product');
  await expect(page.getByRole('complementary',{name:'Current sale'})).toContainText('Part 00001');
  await page.getByLabel('Filter by stock availability').selectOption('out_of_stock');
  await expect(page.getByText('No products found',{exact:true})).toBeVisible();
  await page.getByLabel('Filter by stock availability').selectOption('all');
  await page.getByLabel('Sort products by').selectOption('store_selling_price');
  await page.getByLabel('Sort direction').selectOption('desc');
  await expect.poll(()=>state.queries.at(-1)?.sortDir).toBe('desc');
  expect(state.queries.every(query=>Number(query.limit)===30)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('POS debounces search, ignores late results and refreshes the current query on inventory socket events',async({page})=>{
  const state=await fixture(page);await page.goto('/#/pos');
  const search=page.getByRole('searchbox',{name:'Search products or scan a barcode'});
  await expect(page.getByRole('heading',{name:'Part 00001',exact:true})).toBeVisible();
  await search.fill('slow');await expect.poll(()=>Boolean(state.releaseSlow)).toBe(true);
  await search.fill('SKU-5');await search.fill('SKU-5000');
  await expect(page.getByRole('heading',{name:'Part 05000',exact:true})).toBeVisible();
  state.releaseSlow();
  expect(state.queries.filter(query=>query.search==='SKU-5')).toHaveLength(0);
  await expect(page.getByRole('heading',{name:'Stale response product',exact:true})).toHaveCount(0);
  await expect.poll(()=>state.sockets.length).toBeGreaterThan(0);
  for(const event of ['inventory:updated','product:created','product:updated','product:deleted','catalog:updated']) {
    const before=state.queries.length;
    state.sockets.at(-1).send(`42${JSON.stringify([event,{product_id:5000}])}`);
    await expect.poll(()=>state.queries.length).toBeGreaterThan(before);
    expect(state.queries.at(-1).search).toBe('SKU-5000');
    expect(state.queries.at(-1).page).toBe('1');
  }
});

test('POS restarts a cancelled pending query when only surrounding whitespace changes',async({page})=>{
  const state=await fixture(page);await page.goto('/#/pos');
  await expect(page.getByRole('heading',{name:'Part 00001',exact:true})).toBeVisible();
  state.holdNext='sku-4999';
  const search=page.getByRole('searchbox',{name:'Search products or scan a barcode'});
  await search.fill('SKU-4999');await expect.poll(()=>Boolean(state.releaseHeld)).toBe(true);
  await search.fill('  SKU-4999  ');
  await expect(page.getByRole('heading',{name:'Part 04999',exact:true})).toBeVisible();
  state.releaseHeld();
  expect(state.queries.filter(query=>query.search==='SKU-4999').length).toBeGreaterThanOrEqual(2);
});
