import { test,expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/5kAAAAASUVORK5CYII=','base64');
const photo=(mimeType='image/png',name='phone.png')=>({name,mimeType,buffer:png});
const selectWithMetadata=(input,type)=>input.evaluate((node,{type,bytes})=>{
  const selection=new DataTransfer();selection.items.add(new File([new Uint8Array(bytes)],'phone.png',{type}));
  node.files=selection.files;node.dispatchEvent(new Event('change',{bubbles:true}));
},{type,bytes:[...png]});
const cover='/fixture-images/cover.png',replacement='/fixture-images/replacement.png';
async function listingFixture(page,role='store_staff',single=false) {
  await staffFixture(page,{user:{role},permissions:['inventory.view','products.view','products.manage']});
  const item={id:11,name:'Black panel',product_name:'Black panel',part_number:'PANEL-11',image:cover,option_image_url:null,store_selling_price:150,price:150,
    stock_quantity:2,available_stock:2,inventory_status:'active',is_available:true};
  const listing={id:90,inventory_item_id:single?11:null,listing_type:single?'single':'set',title:'Panel set',product_name:single?'Black panel':'Panel set',
    items:[item],visibility_status:'active',visual_options:true,media:[{url:cover,media_type:'image'}]};
  const state={listing,variants:[{id:201,option_combination:{Color:'Black'},image_url:null,stock_quantity:2,price:150}],uploads:[],updates:[],delay:null,fail:false,errors:[]};
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.route('**/fixture-images/**',route=>route.fulfill({contentType:'image/png',body:png}));
  await page.route('**/api/inventory**',route=>route.fulfill({json:[item]}));
  await page.route('**/api/variants/product/11',route=>route.fulfill({json:{variants:state.variants}}));
  await page.route('**/api/products/upload-image',async route=>{
    state.uploads.push({type:route.request().headers()['content-type'],body:route.request().postDataBuffer()});
    if(state.delay)await state.delay;
    await route.fulfill(state.fail?{status:503,json:{message:'Image storage is temporarily unavailable. Please try again.'}}:{status:201,json:{imageUrl:replacement}}).catch(()=>{});
  });
  await page.route('**/api/ecommerce-listings**',route=>{
    if(route.request().method()==='PUT') {
      const body=route.request().postDataJSON();state.updates.push(body);
      const previous=listing.items;Object.assign(listing,body);
      if(single)state.variants=state.variants.map(row=>({...row,image_url:body.variant_images.find(image=>image.variant_id===row.id)?.image_url}));
      else listing.items=previous.map(row=>({...row,option_image_url:body.option_images.find(image=>image.product_item_id===row.id)?.image_url}));
      return route.fulfill({json:{listing}});
    }
    return route.fulfill({json:{items:[listing],total:1}});
  });
  const base=role==='owner'?'admin':'staff';await page.goto(`/#/${base}/storefront`);
  await page.getByRole('button',{name:'Edit',exact:true}).filter({visible:true}).first().click();
  return {state,dialog:page.getByRole('dialog',{name:single?'Edit Storefront Listing':'Edit Set Listing',exact:true})};
}

test('staff phone photo with missing MIME uploads into the correct empty set option',async({page})=>{
  await page.setViewportSize({width:390,height:900});const {state,dialog}=await listingFixture(page);
  await selectWithMetadata(dialog.getByLabel('Upload image for Black panel',{exact:true}),'');
  await expect.poll(()=>state.uploads.length).toBe(1);expect(state.uploads[0].type).toBe('image/png');
  await expect(dialog.locator(`img[src$="${replacement}"]`)).toBeVisible();
  await expect(dialog).toBeVisible();expect(state.errors).toEqual([]);
});

test('promotion safe validation error is visible inside the edit/create dialog',async({page})=>{
  await staffFixture(page,{user:{role:'owner'}});
  await page.route('**/api/discounts**',route=>route.fulfill(route.request().method()==='POST'
    ?{status:409,json:{message:'This promotion code already exists.'}}
    :{json:{data:[],pagination:{total:0}}}));
  await page.goto('/#/admin/promotions');await page.getByRole('button',{name:'Create promotion',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Create promotion',exact:true});
  await dialog.getByLabel('Discount code',{exact:false}).fill('OWNER20');await dialog.locator('#promotion-value').fill('20');
  await dialog.getByRole('button',{name:'Create promotion',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('This promotion code already exists.');
});

for(const [role,width,single] of [['owner',1440,false],['store_staff',1440,false],['store_staff',390,false],['store_staff',768,false],['store_staff',390,true],['owner',1440,true]]) {
  test(`${role} ${single?'variant':'set item'} upload, save and reopen at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:950});const {state,dialog}=await listingFixture(page,role,single);
    await dialog.getByLabel(`Upload image for ${single?'Black':'Black panel'}`,{exact:true}).setInputFiles(photo());
    await expect(dialog.locator(`img[src$="${replacement}"]`)).toBeVisible();
    await dialog.getByRole('button',{name:'Save Listing',exact:true}).click();await expect(dialog).toHaveCount(0);
    expect(state.updates).toHaveLength(1);const payload=state.updates[0];
    expect(single?payload.variant_images:payload.option_images).toEqual([single?{variant_id:201,image_url:expect.stringContaining(replacement)}:{product_item_id:11,image_url:expect.stringContaining(replacement)}]);
    expect(payload.media[0].url).toBe(cover);expect(payload).not.toHaveProperty('stock_quantity');expect(payload).not.toHaveProperty('price');
    await page.getByRole('button',{name:'Edit',exact:true}).filter({visible:true}).first().click();
    await expect(dialog.locator(`img[src$="${replacement}"]`)).toBeVisible();expect(state.errors).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('odd gallery MIME is normalized from content, with no provider call for unsupported/oversized files',async({page})=>{
  const {state,dialog}=await listingFixture(page);const input=dialog.getByLabel('Upload image for Black panel',{exact:true});
  await input.setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<script>not an image</script>')});
  await expect(dialog.getByRole('alert').first()).toContainText('Unsupported image');expect(state.uploads).toHaveLength(0);
  await input.evaluate(node=>{const files=new DataTransfer();files.items.add(new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'}));node.files=files.files;node.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(dialog.getByRole('alert').first()).toContainText('5MB');expect(state.uploads).toHaveLength(0);
  await selectWithMetadata(input,'application/octet-stream');await expect.poll(()=>state.uploads.length).toBe(1);
  await expect(dialog.locator(`img[src$="${replacement}"]`)).toBeVisible();expect(state.uploads[0].type).toBe('image/png');expect(state.errors).toEqual([]);
});

test('failed upload preserves modal, option, fallback and entered form data; retry works',async({page})=>{
  await page.setViewportSize({width:390,height:900});const {state,dialog}=await listingFixture(page);state.fail=true;
  await dialog.getByRole('textbox',{name:'Set title',exact:true}).fill('Unsaved title');
  const input=dialog.getByLabel('Upload image for Black panel',{exact:true});await input.setInputFiles(photo());
  await expect(dialog.getByRole('alert').first()).toContainText('Image storage is temporarily unavailable');
  await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toHaveValue('Unsaved title');
  await expect(dialog.locator(`img[src$="${cover}"]`).first()).toBeVisible();await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeEnabled();
  state.fail=false;await input.setInputFiles(photo());await expect(dialog.locator(`img[src$="${replacement}"]`)).toBeVisible();expect(state.errors).toEqual([]);
});

test('duplicate gallery events upload once and busy state releases after modal closes',async({page})=>{
  const {state,dialog}=await listingFixture(page);let release;state.delay=new Promise(resolve=>{release=resolve;});
  const input=dialog.getByLabel('Upload image for Black panel',{exact:true});await selectWithMetadata(input,'image/png');
  await expect.poll(()=>state.uploads.length).toBe(1);await selectWithMetadata(input,'image/png');
  await expect(dialog.getByRole('status')).toContainText('Uploading image');await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Edit',exact:true}).filter({visible:true}).first().click();await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeEnabled();
  release();await expect(dialog.getByLabel('Upload image for Black panel',{exact:true})).toBeEnabled();
  expect(state.uploads).toHaveLength(1);expect(state.errors).toEqual([]);
  await expect(dialog.locator(`img[src$="${replacement}"]`)).toHaveCount(0);
});

test('main gallery upload still works and temporary previews are revoked after removal/save',async({page})=>{
  await page.addInitScript(()=>{
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    window.previewUrls={created:[],revoked:[]};
    URL.createObjectURL=blob=>{const url=create(blob);window.previewUrls.created.push(url);return url;};
    URL.revokeObjectURL=url=>{window.previewUrls.revoked.push(url);revoke(url);};
  });
  const {state,dialog}=await listingFixture(page,'owner');
  await dialog.getByLabel('Select gallery image for Black panel').selectOption(cover);
  const input=dialog.locator('input[type=file][multiple]');await input.setInputFiles(photo());
  await dialog.getByRole('button',{name:'Remove pending media',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.previewUrls.revoked.length)).toBe(1);
  await input.setInputFiles(photo());await dialog.getByRole('button',{name:'Save Listing',exact:true}).click();
  await expect(dialog).toHaveCount(0);expect(state.uploads).toHaveLength(1);expect(state.updates[0].media).toHaveLength(2);
  expect(state.updates[0].media[0].url).toBe(cover);expect(state.updates[0].media[1].url).toContain(replacement);
  await expect.poll(()=>page.evaluate(()=>window.previewUrls.revoked.length)).toBe(2);expect(state.errors).toEqual([]);
});

for(const width of [390,768,1440])test(`promotion create/edit refreshes list and campaign counts at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});await staffFixture(page,{user:{role:'owner'}});
  const rows=[],writes=[];await page.route('**/api/discounts**',route=>{
    const method=route.request().method();if(method==='GET')return route.fulfill({json:{data:rows,pagination:{total:rows.length}}});
    const body=route.request().postDataJSON();writes.push(body);
    if(method==='POST')rows.push({...body,id:rows.length+1,used_count:0});else Object.assign(rows.find(row=>row.id===Number(new URL(route.request().url()).pathname.split('/').at(-1))),body);
    return route.fulfill({status:method==='POST'?201:200,json:rows.at(-1)});
  });
  await page.goto('/#/admin/promotions');await page.getByRole('button',{name:'Create promotion',exact:true}).first().click();
  let dialog=page.getByRole('dialog',{name:'Create promotion',exact:true});
  await dialog.locator('#promotion-code').fill('OWNER20');await dialog.locator('#promotion-value').fill('20');
  await dialog.getByRole('button',{name:'Create promotion',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({code:'OWNER20',type:'percentage',value:20,min_purchase:0,max_uses:null,starts_at:null,expires_at:null,is_active:true});
  const total=page.locator('.ops-inline-kpis > div').filter({hasText:'Total Campaigns'});await expect(total).toContainText('1');
  await page.getByRole('button',{name:'Edit OWNER20',exact:true}).filter({visible:true}).click();dialog=page.getByRole('dialog',{name:'Edit OWNER20',exact:true});
  await dialog.locator('#promotion-type').selectOption('fixed');await dialog.locator('#promotion-value').fill('50');
  await dialog.getByRole('checkbox',{name:/Active/}).uncheck();await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(writes[1]).toMatchObject({type:'fixed',value:50,is_active:false});
  await expect(total).toContainText('1');await expect(page.locator('.ops-inline-kpis > div').filter({hasText:'Active Campaigns'})).toContainText('0');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('obvious promotion errors are explained before any create request',async({page})=>{
  await staffFixture(page,{user:{role:'owner'}});let writes=0;
  await page.route('**/api/discounts**',route=>{if(route.request().method()!=='GET')writes++;return route.fulfill({json:{data:[],pagination:{total:0}}});});
  await page.goto('/#/admin/promotions');await page.getByRole('button',{name:'Create promotion',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Create promotion',exact:true});await dialog.locator('#promotion-code').fill('OWNER20');
  await dialog.locator('#promotion-value').fill('101');await dialog.getByRole('button',{name:'Create promotion',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Value must not exceed 100');
  await dialog.locator('#promotion-value').fill('20');await dialog.locator('#promotion-start').fill('2026-12-02');await dialog.locator('#promotion-end').fill('2026-12-01');
  await dialog.getByRole('button',{name:'Create promotion',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('End date must be after start date');expect(writes).toBe(0);
});
