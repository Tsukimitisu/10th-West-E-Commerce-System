import { test,expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

// All API requests/mutations stay in this in-memory fixture.
const models=[{id:1,model_name:'REBORN',brand:'Suzuki',status:'active'},
  {id:2,model_name:'SMASH',brand:'Suzuki',status:'active'},
  {id:3,model_name:'Unused active model',brand:'Other',status:'active'}];
const makeRows=()=>Array.from({length:620},(_,i)=>({id:i+1,part_number:`PART-${String(i+1).padStart(4,'0')}`,name:`Item ${String(i+1).padStart(4,'0')}`,
  product_name:`Item ${String(i+1).padStart(4,'0')}`,motorcycle_model_id:1+(i%2),motorcycle_model:models[i%2].model_name,
  brand:'Maker',color:'Black',box_location:'A-01',barcode:`SCAN-${i+1}`,sku:`SKU-${i+1}`,stock_quantity:10,reserved_stock:0,low_stock_threshold:5,
  store_selling_price:150,cost_price:120,ecommerce_price:173,inventory_status:'active',status:'active',has_storefront_listing:true}));
async function fixture(page,role='owner') {
  await staffFixture(page,{user:{role},permissions:['inventory.view','products.view']});
  const state={rows:makeRows(),models:structuredClone(models),requests:[],hold:null,created:0,edited:0};
  await page.route('**/api/motorcycle-models**',route=>{
    if(route.request().method()==='POST') {const model={...route.request().postDataJSON(),id:4};state.models.push(model);return route.fulfill({status:201,json:{model}});}
    return route.fulfill({json:{models:state.models}});
  });
  await page.route(/\/api\/(inventory(?:\/[^?]*)?|ecommerce-listings)(?:\?.*)?$/,async route=>{
    const request=route.request(),url=new URL(request.url()),q=(url.searchParams.get('q') || '').trim().toLowerCase();
    if(request.method()!=='GET') {
      if(role!=='owner')return route.fulfill({status:403,json:{message:'Permission denied'}});
      const body=request.postDataJSON(),model=models.find(row=>row.id===Number(body.motorcycle_model_id));
      let row;
      if(request.method()==='POST') {state.created++;row={...state.rows[0],...body,id:621,name:body.product_name,motorcycle_model:model.model_name};state.rows.push(row);}
      else {state.edited++;row=state.rows.find(item=>item.id===Number(url.pathname.split('/').at(-1)));Object.assign(row,body,{name:body.product_name,motorcycle_model:model.model_name});}
      return route.fulfill({status:request.method()==='POST'?201:200,json:{item:row}});
    }
    if(url.pathname.includes('/adjustments'))return route.fulfill({json:[]});
    if(url.pathname.includes('/low-stock'))return route.fulfill({json:{count:0,products:[]}});
    state.requests.push({path:url.pathname,q,model:url.searchParams.get('model_id'),page:url.searchParams.get('page')});
    if(state.hold && q===state.hold.q){state.hold.started=true;await state.hold.promise;}
    const modelId=url.searchParams.get('model_id');
    let rows=state.rows.filter(row=>(!modelId || row.motorcycle_model_id===Number(modelId)) && (!q ||
      [row.part_number,row.name,row.motorcycle_model,row.brand,row.color,row.box_location,row.barcode,row.sku].join(' ').toLowerCase().includes(q)));
    const total=rows.length,page=Number(url.searchParams.get('page') || 1),size=Number(url.searchParams.get('pageSize') || 20);
    const paged=url.searchParams.get('paged')==='true' || url.pathname.endsWith('/product-items');
    if(paged)rows=rows.slice((page-1)*size,page*size);
    if(url.pathname.endsWith('/product-items'))rows=rows.map(row=>({id:row.id,partNumber:row.part_number,itemName:row.name,motorcycleModel:row.motorcycle_model,motorcycleModelId:row.motorcycle_model_id,
      stockQuantity:row.stock_quantity,lowStockThreshold:5,price:150,color:row.color,brand:row.brand,storageLocation:row.box_location,status:row.status}));
    if(url.pathname==='/api/ecommerce-listings')rows=rows.map(row=>({...row,inventory_item_id:row.id,listing_type:'single',visibility_status:'active',available_stock:10,media:[]}));
    await route.fulfill({json:paged?{items:rows,total,page,pageSize:size,summary:{total,units:total*10,value:total*120}}:rows}).catch(()=>{});
  });
  return state;
}

for(const role of ['owner','store_staff'])for(const area of ['inventory','inventory/product-items','storefront']) {
  test(`${role} ${area}: canonical model filters, full counts, exact/barcode search and reset`,async({page})=>{
    const state=await fixture(page,role),base=role==='owner'?'admin':'staff';
    await page.goto(`/#/${base}/${area}`);
    const search=page.locator('input[type=search]').last();
    const model=page.getByRole('combobox',{name:'Filter inventory by model'});
    await expect(model.locator('option[value="1"]')).toHaveText('REBORN (Suzuki)');
    await expect(model.locator('option[value="2"]')).toHaveText('SMASH (Suzuki)');
    await expect(model.locator('option[value="3"]'),'models do not depend on the current page').toHaveCount(1);
    await expect(page.getByText(/620 matching|of 620 product items/).first()).toBeVisible();
    await page.getByRole('button',{name:'Next',exact:true}).click();await expect.poll(()=>state.requests.at(-1)?.page).toBe('2');
    for(const value of ['reborn','REBORN','  Reborn  ']) {
      await search.fill(value);await expect(page.getByText(/310 matching|of 310 product items/).first()).toBeVisible();await expect.poll(()=>state.requests.at(-1)?.page).toBe('1');
    }
    await model.selectOption('1');await expect.poll(()=>state.requests.at(-1)?.model).toBe('1');
    await expect(page.getByText(/310 matching|of 310 product items/).first()).toBeVisible();
    await model.selectOption('2');await expect(page.getByText(/No items match|No product items found|No storefront listings found/).first()).toBeVisible();
    await page.getByRole('button',{name:'Clear filters',exact:true}).first().click();
    await expect(page.getByText(/620 matching|of 620 product items/).first()).toBeVisible();
    for(const value of ['part-0620','SCAN-620','PART-06']) {
      await search.fill(value);await expect(page.getByText(/1 matching|of 1 product items|21 matching|of 21 product items/).first()).toBeVisible();
      if(value!=='PART-06')await expect(page.getByText('PART-0620',{exact:true}).filter({visible:true}).first()).toBeVisible();
    }
    if(role==='store_staff' && area==='inventory') {
      await expect(page.getByRole('button',{name:'Add Inventory Item',exact:true})).toHaveCount(0);
      await expect(page.getByRole('button',{name:/^Edit Item/}).filter({visible:true}).first()).toBeDisabled();
    }
  });
}

for(const role of ['owner','store_staff'])test(`${role}: a delayed older search cannot replace the newest result`,async({page})=>{
  const state=await fixture(page,role),base=role==='owner'?'admin':'staff';
  await page.goto(`/#/${base}/inventory`);const search=page.locator('input[type=search]').last();
  let release;state.hold={q:'reborn',started:false,promise:new Promise(resolve=>{release=resolve;})};
  await search.fill('reborn');await expect.poll(()=>state.hold.started).toBe(true);
  await search.fill('PART-0620');await expect(page.getByText('PART-0620',{exact:true}).filter({visible:true}).first()).toBeVisible();
  release();await page.getByRole('combobox',{name:'Filter inventory by model'}).selectOption('2');
  await expect(page.getByText('PART-0620',{exact:true}).filter({visible:true}).first()).toBeVisible();
  expect(state.requests.at(-1).q).toBe('part-0620');
});

test('owner create/edit refetches immediately without reload and keeps the canonical model ID',async({page})=>{
  const state=await fixture(page);await page.goto('/#/admin/inventory');
  await page.getByRole('button',{name:'Add Inventory Item',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Add Inventory Item',exact:true});
  await dialog.getByLabel('Part Number',{exact:true}).fill('NEW-EXACT-765');await dialog.getByLabel('Product Name',{exact:true}).fill('New panel');
  await dialog.locator('select').first().selectOption('1');await dialog.getByLabel('Store Selling Price',{exact:true}).fill('150');
  await dialog.getByLabel('Initial Quantity',{exact:true}).fill('1');await dialog.getByRole('button',{name:'Create Inventory Item',exact:true}).last().click();
  await expect.poll(()=>state.created).toBe(1);await expect(dialog).toHaveCount(0);
  await page.locator('input[type=search]').last().fill('NEW-EXACT-765');
  await expect(page.getByText('NEW-EXACT-765',{exact:true}).filter({visible:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Edit New panel',exact:true}).click();dialog=page.getByRole('dialog',{name:/Edit Inventory/});
  await dialog.locator('select').first().selectOption('2');await dialog.getByRole('button',{name:/Save/}).last().click();
  await expect.poll(()=>state.edited).toBe(1);await expect(dialog).toHaveCount(0);
  await page.getByRole('combobox',{name:'Filter inventory by model'}).selectOption('2');
  await expect(page.getByText('NEW-EXACT-765',{exact:true}).filter({visible:true}).first()).toBeVisible();
  expect(state.rows.at(-1).motorcycle_model_id).toBe(2);
});

test('shared inventory picker uses canonical models and searches past the first 500 items',async({page})=>{
  await fixture(page);await page.goto('/#/admin/storefront');
  await page.getByRole('button',{name:'Add Set Listing',exact:true}).click();
  await page.getByRole('button',{name:'Add Items',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Add items to set',exact:true});
  await expect(picker.getByRole('combobox',{name:'Filter inventory by model'}).locator('option[value="2"]')).toHaveText('SMASH (Suzuki)');
  await picker.getByRole('combobox',{name:'Filter inventory by model'}).selectOption('2');
  await picker.locator('input[type=search]').fill('PART-0620');
  await expect(picker.getByText('PART-0620',{exact:true})).toBeVisible();
  await picker.getByRole('button',{name:'Add to set',exact:true}).click();
  await expect(picker.getByRole('button',{name:/Done.*1 selected/})).toBeVisible();
});

test('single listing picker recognizes an existing listing outside the displayed listing page',async({page})=>{
  await fixture(page);await page.goto('/#/admin/storefront');
  await page.getByRole('button',{name:'Add Listing',exact:true}).click();
  await page.getByRole('button',{name:'Choose Inventory Item',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Choose Inventory Item',exact:true});
  await picker.locator('input[type=search]').fill('PART-0620');
  await expect(picker.getByText('PART-0620',{exact:true})).toBeVisible();
  await expect(picker.getByRole('button',{name:'Already listed',exact:true})).toBeDisabled();
});


test('new canonical model appears in filters immediately without a page reload',async({page})=>{
  await fixture(page);await page.goto('/#/admin/inventory');
  await page.getByRole('button',{name:'Motorcycle Models',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Motorcycle Models',exact:true});
  await dialog.getByPlaceholder('Model name, e.g. Mio M3').fill('New Canonical Model');
  await dialog.getByRole('button',{name:'Add Motorcycle Model',exact:true}).click();
  await expect(dialog.getByText('Motorcycle model added successfully.',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox',{name:'Filter inventory by model'}).locator('option[value="4"]')).toHaveText('New Canonical Model');
});


for(const role of ['owner','store_staff'])test(`${role}: old product-management URLs reach the canonical Inventory view`,async({page})=>{
  await fixture(page,role);const base=role==='owner'?'admin':'staff';
  await page.goto(`/#/${base}/products`);await expect(page).toHaveURL(new RegExp(`#/${base}/inventory$`));
  await expect(page.getByRole('combobox',{name:'Filter inventory by model'})).toBeVisible();
});

for(const [role,width,area] of [['owner',390,'inventory'],['store_staff',768,'inventory/product-items']])test(`${role}: shared filters fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await fixture(page,role);const base=role==='owner'?'admin':'staff';
  await page.goto(`/#/${base}/${area}`);await expect(page.getByRole('combobox',{name:'Filter inventory by model'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
