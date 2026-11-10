import { test,expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

// Mock every API/upload: never write catalog, stock, cart or provider storage.
const cover='/fixture-images/kit.svg', red='/fixture-images/red.svg', black='/fixture-images/black.svg';
const items=[{id:11,name:'Candy Red',color:'Red',part_number:'RED-11',image:red,option_image_url:red,price:173,stock_quantity:1,is_available:true},
  {id:12,name:'Black',color:'Black',part_number:'BLACK-12',image:black,option_image_url:black,price:230,stock_quantity:3,is_available:true},
  {id:13,name:'White',color:'White',image:null,price:288,stock_quantity:2,is_available:true}];
const kit={id:90,name:'Fairing Kit',title:'Fairing Kit',product_name:'Fairing Kit',listing_type:'set',image:cover,
  visual_options:true,visibility_status:'active',media:[{url:cover,media_type:'image'}],options:items,items,
  price:173,max_price:288,stock_quantity:6,available_stock:6,item_count:3,available_item_count:3};
const variants=[{id:201,option_combination:{Color:'Red'},image_url:red,price:173,stock_quantity:1},
  {id:202,option_combination:{Color:'Black'},image_url:black,price:230,stock_quantity:3},
  {id:203,option_combination:{Color:'White'},image_url:null,price:288,stock_quantity:2}];
const product={id:21,name:'Helmet',price:173,image:cover,stock_quantity:6,available_stock:6,visibility_status:'active',inventory_status:'active',variants,variant_options:[{name:'Color',values:['Red','Black','White']}],description:'A helmet'};

async function fixture(page,owner=false) {
  await staffFixture(page, {user:{role:owner?'owner':'customer'}});
  await page.route('**/fixture-images/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>'}));
  const state={adds:[],updates:[],uploads:0};
  await page.route(/\/api\/products(?:\/[^?]*)?(?:\?.*)?$/,route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/upload-image')) {state.uploads++;return route.fulfill({json:{imageUrl:'/fixture-images/replacement.svg'}});}
    return route.fulfill({json:path==='/api/products/21'?product:path==='/api/products'?[product]:[]});
  });
  await page.route('**/api/ecommerce-listings**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(route.request().method()==='PUT') {state.updates.push(route.request().postDataJSON());return route.fulfill({json:{listing:kit}});}
    return route.fulfill({json:path.includes('/public/sets/90')?kit:[kit]});
  });
  await page.route('**/api/inventory**',route=>route.fulfill({json:items.map(item=>({...item,product_name:item.name,store_selling_price:150,ecommerce_price:173,inventory_status:'active'})).concat([{...product,product_name:'Helmet',store_selling_price:150,ecommerce_price:173,inventory_status:'active'}])}));
  await page.route('**/api/variants/product/21',route=>route.fulfill({json:{variants,options:product.variant_options}}));
  await page.route('**/api/cart**',route=>{
    if(new URL(route.request().url()).pathname.endsWith('/add')) {state.adds.push(route.request().postDataJSON());return route.fulfill({json:{message:'Added'}});}
    return route.fulfill({json:{items:[]}});
  });
  return state;
}

for(const width of [390,768,1440]) test(`set option image, stock and price stay aligned at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});const state=await fixture(page);
  await page.goto('/#/sets/90');
  const main=page.getByRole('img',{name:'Fairing Kit',exact:true});
  await expect(main).toHaveAttribute('src',cover);
  await page.getByRole('radio',{name:/Candy Red/}).click();await expect(main).toHaveAttribute('src',red);
  await expect(page.getByText('1 available',{exact:true})).toBeVisible();
  await page.getByRole('radio',{name:/Black/}).click();await expect(main).toHaveAttribute('src',black);
  await expect(page.getByText('3 available',{exact:true})).toBeVisible();
  await page.getByRole('radio',{name:/White/}).click();await expect(main).toHaveAttribute('src',cover);
  await page.getByRole('radio',{name:/Black/}).click();
  await page.getByRole('button',{name:/^Add to cart$/i}).filter({visible:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Add to cart'});
  await expect(dialog.getByRole('radio',{name:/Black/})).toHaveAttribute('aria-checked','true');
  await dialog.getByTestId('set-purchase-submit').click();
  await expect.poll(()=>state.adds.length).toBe(1);
  expect(state.adds[0]).toEqual({product_id:12,variant_id:null,quantity:1,listing_id:90});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('variant selection switches main image and sends the exact variant; missing/broken image falls back',async({page})=>{
  const state=await fixture(page);await page.goto('/#/products/21');
  const main=page.locator('.zoom-container img');await expect(main).toHaveAttribute('src',cover);
  await page.getByRole('button',{name:/^Red/}).filter({visible:true}).first().click();await expect(main).toHaveAttribute('src',red);
  await expect(page.getByText('1 available for selected variant')).toBeVisible();
  await page.getByRole('button',{name:/^Black/}).filter({visible:true}).first().click();await expect(main).toHaveAttribute('src',black);
  await expect(page.getByText('3 available for selected variant')).toBeVisible();
  await page.getByRole('button',{name:/^Add to cart$/i}).filter({visible:true}).first().click();
  await expect.poll(()=>state.adds.length).toBe(1);expect(state.adds[0].variant_id).toBe(202);expect(state.adds[0].product_id).toBe(21);
  await page.getByRole('button',{name:/^White/}).filter({visible:true}).first().click();await expect(main).toHaveAttribute('src',cover);
  await page.route('**/fixture-images/missing.svg',route=>route.fulfill({status:404,body:'missing'}));
  await page.route('**/api/products/21',route=>route.fulfill({json:{...product,variants:variants.map(row=>row.id===201?{...row,image_url:'/fixture-images/missing.svg'}:row)}}));
  await page.reload();
  await page.getByRole('button',{name:/^Red/}).filter({visible:true}).first().click();await expect(main).toHaveAttribute('src',cover);
});

test('simple listing keeps its cover without option controls',async({page})=>{
  await fixture(page);await page.route('**/api/products/21',route=>route.fulfill({json:{...product,variants:[],variant_options:[]}}));
  await page.route('**/api/variants/product/21',route=>route.fulfill({json:{variants:[],options:[]}}));
  await page.goto('/#/products/21');await expect(page.locator('.zoom-container img')).toHaveAttribute('src',cover);
  await expect(page.getByRole('button',{name:/^Red/})).toHaveCount(0);
});

test('mobile variant selector keeps image, quantity and exact cart identity together',async({page})=>{
  await page.setViewportSize({width:390,height:900});const state=await fixture(page);
  await page.goto('/#/products/21');
  await page.getByRole('button',{name:/^Add to cart$/i}).filter({visible:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Add to cart'});
  await dialog.getByRole('button',{name:/^Black/}).click();
  await expect(page.locator('.zoom-container img')).toHaveAttribute('src',black);
  await dialog.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect.poll(()=>state.adds.length).toBe(1);expect(state.adds[0].variant_id).toBe(202);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('owner edits a variant image through the existing listing save without sending inventory overrides',async({page})=>{
  const state=await fixture(page,true);
  await page.route(/\/api\/ecommerce-listings(?:\?.*)?$/,route=>route.fulfill({json:[{id:91,inventory_item_id:21,listing_type:'single',product_name:'Helmet',visibility_status:'active',visual_options:true,media:kit.media}]}));
  await page.goto('/#/admin/storefront');await page.getByRole('button',{name:'Edit',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Edit Storefront Listing'});
  await dialog.getByLabel('Select gallery image for White').selectOption(cover);
  await dialog.getByLabel('Select gallery image for Red').selectOption(cover);
  await dialog.getByRole('button',{name:'Save Listing'}).click();await expect.poll(()=>state.updates.length).toBe(1);
  expect(state.updates[0].variant_images).toEqual([{variant_id:201,image_url:cover},{variant_id:202,image_url:black},{variant_id:203,image_url:cover}]);
  expect(state.updates[0]).not.toHaveProperty('stock_quantity');expect(state.updates[0]).not.toHaveProperty('price');
});

for(const width of [390,1440]) test(`owner replaces the selected set image without altering cover/other options at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});const state=await fixture(page,true);
  await page.goto('/#/admin/storefront');await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Edit Set Listing'});
  await dialog.getByLabel('Upload image for Candy Red',{exact:true}).setInputFiles({name:'red.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/5kAAAAASUVORK5CYII=','base64')});
  await expect.poll(()=>state.uploads).toBe(1);
  // The legacy White option has no image: select the existing cover to complete visual validation.
  await dialog.getByLabel('Select gallery image for White').selectOption(cover);
  await dialog.getByRole('button',{name:'Save Listing'}).click();await expect.poll(()=>state.updates.length).toBe(1);
  expect(state.updates[0].option_images).toEqual([{product_item_id:11,image_url:expect.stringMatching(/\/fixture-images\/replacement\.svg$/)},{product_item_id:12,image_url:black},{product_item_id:13,image_url:cover}]);
  expect(state.updates[0].media[0].url).toBe(cover);expect(state.updates[0]).not.toHaveProperty('stock_quantity');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
