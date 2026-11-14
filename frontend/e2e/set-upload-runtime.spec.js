import { test,expect } from '@playwright/test';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { staffFixture } from './staffPhaseFixture.js';

let api,worker,fixtureImage;
test.beforeAll(async({browser})=>{
  const folder=await mkdir(path.join(os.tmpdir(),'10thwest-set-upload-runtime'),{recursive:true});
  fixtureImage=path.join(folder || path.join(os.tmpdir(),'10thwest-set-upload-runtime'),'photo.png');
  const fixturePage=await browser.newPage();
  const encoded=await fixturePage.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=72;const ctx=canvas.getContext('2d');ctx.fillStyle='#ef7319';ctx.fillRect(0,0,96,72);return canvas.toDataURL('image/png').split(',')[1];});
  await fixturePage.close();await writeFile(fixtureImage,Buffer.from(encoded,'base64'));
  worker=fork(fileURLToPath(new URL('../../backend/test-support/listingEditorServer.js',import.meta.url)),[],{env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe','ipc']});
  let output='';worker.stdout.on('data',chunk=>{output+=chunk;});worker.stderr.on('data',chunk=>{output+=chunk;});
  api=await new Promise((resolve,reject)=>{worker.once('message',message=>resolve(`http://localhost:${message.port}`));worker.once('exit',()=>reject(new Error(output)));});
});

test('object-valued upload error stays inline instead of crashing React',async({page,request},testInfo)=>{
  const {dialog,evidence,row}=await editor(page,request);
  await request.post(`${api}/fixture/storage`,{data:{failure:{status:400,message:{error:'Storage rejected the image'}}}});
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(row(12).getByRole('alert')).toContainText('could not be uploaded');
  await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toBeVisible();
  expect(evidence.responses[0]).toMatchObject({status:400,body:{message:{error:'Storage rejected the image'}}});
  await healthy(page,evidence,{expectedHttpFailure:true});
  await testInfo.attach('runtime-evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});

for(const url of [{unexpected:'object'},'javascript:alert(1)'])test(`malformed upload URL (${typeof url}) preserves editor`,async({page,request})=>{
  const {dialog,row,evidence}=await editor(page,request);await request.post(`${api}/fixture/storage`,{data:{url}});
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(row(12).getByRole('alert')).toContainText('invalid image address');
  await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toBeVisible();await healthy(page,evidence);
});

test('first and middle item images map by product ID across reorder, replace, remove and save',async({page,request})=>{
  const {dialog,row,evidence}=await editor(page,request);
  await dialog.getByRole('textbox',{name:'Set title',exact:true}).fill('Preserved title');
  await dialog.getByRole('textbox',{name:'E-commerce Description',exact:true}).fill('Preserved description');
  await row(11).locator('input[type=file]').setInputFiles(fixtureImage);await expect.poll(()=>evidence.responses.length).toBe(1);
  const first=evidence.responses[0].body.imageUrl;
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);await expect.poll(()=>evidence.responses.length).toBe(2);
  const middle=evidence.responses[1].body.imageUrl;expect(first).not.toBe(middle);
  await row(12).getByRole('button',{name:'Move Middle panel up',exact:true}).click();
  await row(11).locator('input[type=file]').setInputFiles(fixtureImage);await expect.poll(()=>evidence.responses.length).toBe(3);
  expect(evidence.responses[2].body.imageUrl).not.toBe(first);await expect(row(12).locator('img')).toHaveAttribute('src',middle);
  await row(11).getByRole('button',{name:'Remove image for First panel',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toHaveValue('Preserved title');
  await expect(dialog.getByRole('textbox',{name:'E-commerce Description',exact:true})).toHaveValue('Preserved description');
  await dialog.getByRole('button',{name:'Save Listing',exact:true}).click();await expect(dialog).toHaveCount(0);
  const stored=await(await request.get(`${api}/fixture/state`)).json();expect(stored.items.map(item=>[item.product_item_id,item.image_url])).toEqual([[12,middle],[11,null],[13,null]]);
  await healthy(page,evidence);
});

test('scoped render fallback retries without losing unsaved state',async({page,request})=>{
  const {dialog,row}=await editor(page,request);
  await dialog.getByRole('textbox',{name:'Set title',exact:true}).fill('Preserved after retry');
  await page.evaluate(()=>{window.breakEditor=true;const includes=Array.prototype.includes;Array.prototype.includes=function(value,...rest){if(window.breakEditor && typeof value==='string' && value.includes('/fixture-media/'))throw new Error('Fixture editor render failure');return Reflect.apply(includes,this,[value,...rest]);};});
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(dialog.getByText('Something went wrong while editing this listing.',{exact:true})).toBeVisible();
  await page.evaluate(()=>{window.breakEditor=false;});await dialog.getByRole('button',{name:'Retry editor',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toHaveValue('Preserved after retry');
  await expect(row(12).getByRole('button',{name:'Remove image for Middle panel',exact:true})).toBeVisible();
});

test('actual Staff/Customer permissions and CSRF still protect uploads',async({page,request})=>{
  const {cookie,csrfToken}=await editor(page,request);
  const body=await(await import('node:fs/promises')).readFile(fixtureImage);
  for(const id of [3,4]){
    await request.post(`${api}/fixture/login`,{headers:{cookie},data:{id}});
    const denied=await request.post(`${api}/api/products/upload-image`,{headers:{cookie,'x-csrf-token':csrfToken,'content-type':'image/png'},data:body});expect(denied.status()).toBe(403);
  }
  const denied=await request.post(`${api}/api/products/upload-image`,{headers:{cookie,'x-csrf-token':'invalid','content-type':'image/png'},data:body});expect(denied.status()).toBe(403);
  const state=await(await request.get(`${api}/fixture/state`)).json();expect(state.uploads).toHaveLength(0);
});

test('normal variant file upload persists through the real listing API',async({page,request})=>{
  const {dialog,evidence}=await editor(page,request,'store_staff',390,2);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('row').filter({hasText:'Helmet'}).getByRole('button',{name:'Edit',exact:true}).click();
  const single=page.getByRole('dialog',{name:'Edit Storefront Listing',exact:true});
  await single.getByLabel('Upload image for Black',{exact:true}).setInputFiles(fixtureImage);
  await expect.poll(()=>evidence.responses.length).toBe(1);const image=evidence.responses[0].body.imageUrl;
  await expect(single.locator(`img[src="${image}"]`)).toBeVisible();
  await single.getByRole('button',{name:'Save Listing',exact:true}).click();await expect(single).toHaveCount(0);
  const state=await(await request.get(`${api}/fixture/state`)).json();expect(state.variants).toEqual([{id:201,image_url:image}]);await healthy(page,evidence);
});

test('late canceled uploads cannot change a reopened editor or its current busy state',async({page,request})=>{
  const {dialog,row,evidence}=await editor(page,request);
  await request.post(`${api}/fixture/storage`,{data:{delay:500}});
  await row(11).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(row(11).getByRole('status')).toBeVisible();await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('row').filter({hasText:'Fixture panel set'}).getByRole('button',{name:'Edit',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeEnabled();
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(row(12).getByRole('button',{name:'Remove image for Middle panel',exact:true})).toBeVisible();
  await expect(row(11).getByRole('button',{name:'Remove image for First panel',exact:true})).toHaveCount(0);
  await healthy(page,evidence);
});

test('Visual Options still requires images for every sellable item before Save',async({page,request})=>{
  const {dialog,row,evidence}=await editor(page,request);
  await dialog.getByRole('checkbox',{name:/Visual options/}).check();
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(row(12).getByRole('button',{name:'Remove image for Middle panel',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Save Listing',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Every sellable visual option needs an image');expect(evidence.saves).toHaveLength(0);
  await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toBeVisible();await healthy(page,evidence);
});
test.afterAll(async()=>{if(worker?.connected)await new Promise(resolve=>{const timer=setTimeout(()=>worker.kill(),5000);worker.once('exit',()=>{clearTimeout(timer);resolve();});worker.send('stop');});});

async function editor(page,request,role='owner',width=1440,id=1){
  await request.post(`${api}/fixture/reset`);
  await page.setViewportSize({width,height:950});await staffFixture(page,{user:{role},permissions:['inventory.view','products.view','products.manage']});
  await page.routeWebSocket('**/socket.io/**',socket=>{
    socket.send('0{"sid":"fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
    socket.onMessage(message=>{if(message==='40')socket.send('40{"sid":"fixture"}');if(message==='2')socket.send('3');});
  });
  const login=await request.post(`${api}/fixture/login`,{data:{id}}),cookie=login.headers()['set-cookie'].split(';')[0];
  const csrf=await request.get(`${api}/api/csrf-token`,{headers:{cookie}});const {csrfToken}=await csrf.json();
  const evidence={pageerrors:[],console:[],failed:[],responses:[],saves:[],before:null,after:null};
  page.on('pageerror',error=>evidence.pageerrors.push(error.message));page.on('console',message=>{if(message.type()==='error')evidence.console.push(message.text());});
  page.on('requestfailed',req=>evidence.failed.push({path:new URL(req.url()).pathname,error:req.failure()?.errorText}));
  await page.addInitScript(()=>{window.uploadRejections=[];addEventListener('unhandledrejection',event=>window.uploadRejections.push(String(event.reason)));});
  await page.route(/\/api\/(?:ecommerce-listings(?:\/\d+)?|products\/upload-image|inventory|motorcycle-models|variants\/product\/\d+)(?:\?.*)?$/,async route=>{
    const incoming=route.request(),url=new URL(incoming.url());
    const response=await route.fetch({url:`${api}${url.pathname}${url.search}`,headers:{...incoming.headers(),cookie,'x-csrf-token':csrfToken}});
    if(url.pathname.endsWith('/upload-image'))evidence.responses.push({status:response.status(),body:await response.json()});
    if(incoming.method()==='PUT')evidence.saves.push({status:response.status(),body:incoming.postDataJSON()});
    await route.fulfill({response});
  });
  await page.goto(`/#/${role==='owner'?'admin':'staff'}/storefront`);
  await page.getByRole('row').filter({hasText:'Fixture panel set'}).getByRole('button',{name:'Edit',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Edit Set Listing',exact:true});
  const snapshot=()=>dialog.evaluate(node=>({text:node.innerText,title:node.querySelector('input')?.value,items:node.querySelectorAll('ol[aria-label="Selected set items"] > li').length,bodyHeight:node.querySelector('form')?.getBoundingClientRect().height}));
  evidence.before=await snapshot();
  return {dialog,evidence,snapshot,cookie,csrfToken,row:productId=>dialog.locator(`[data-product-item-id="${productId}"]`)};
}
async function healthy(page,evidence,{expectedHttpFailure=false}={}){
  expect(evidence.pageerrors).toEqual([]);expect(await page.evaluate(()=>window.uploadRejections)).toEqual([]);
  expect(evidence.console.filter(message=>!expectedHttpFailure || !/^Failed to load resource:.*status of (400|403|503)/.test(message))).toEqual([]);
  expect(evidence.failed.filter(req=>req.path.endsWith('/upload-image') && req.error!=='net::ERR_ABORTED')).toEqual([]);
}

for(const [role,width,id] of [['owner',1440,1],['store_staff',1440,2],['store_staff',390,2],['store_staff',768,2]])test(`${role} actual API/file input, ${width}px`,async({page,request},testInfo)=>{
  const {dialog,evidence,snapshot,row}=await editor(page,request,role,width,id);
  try {
    await dialog.getByLabel('Upload image for Middle panel',{exact:true}).setInputFiles(fixtureImage);
    await expect.poll(()=>evidence.responses.length).toBe(1);
    expect(evidence.responses[0].status).toBe(201);
    const image=evidence.responses[0].body.imageUrl;
    await expect(row(12).locator('img')).toHaveAttribute('src',image);await expect(row(12).getByText('Middle panel',{exact:true})).toBeVisible();
    await expect.poll(()=>row(12).locator('img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
    evidence.after=await snapshot();expect(evidence.after.items).toBe(3);expect(evidence.after.bodyHeight).toBeGreaterThan(100);
    await healthy(page,evidence);
    await dialog.getByRole('button',{name:'Save Listing',exact:true}).click();await expect(dialog).toHaveCount(0);
    await page.getByRole('row').filter({hasText:'Fixture panel set'}).getByRole('button',{name:'Edit',exact:true}).click();
    await expect(dialog.locator('ol > li').filter({hasText:'Middle panel'}).locator('img')).toHaveAttribute('src',image);
    const stored=await (await request.get(`${api}/fixture/state`)).json();expect(stored.items.find(item=>item.product_item_id===12).image_url).toBe(image);
    expect(evidence.saves[0]).toMatchObject({status:200,body:{option_images:[{product_item_id:11,image_url:null},{product_item_id:12,image_url:image},{product_item_id:13,image_url:null}]}});
    await healthy(page,evidence);
  } finally {
    await writeFile(path.join(os.tmpdir(),`10thwest-set-runtime-${role}-${width}.json`),JSON.stringify(evidence,null,2));
    await testInfo.attach('runtime-evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  }
});
