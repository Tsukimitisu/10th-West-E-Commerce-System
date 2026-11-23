import { test,expect } from '@playwright/test';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { staffFixture } from './staffPhaseFixture.js';

let api,worker,fixtureImage;
const uniqueImages=[];
test.beforeAll(async({browser})=>{
  const folder=await mkdir(path.join(os.tmpdir(),'10thwest-set-upload-runtime'),{recursive:true});
  fixtureImage=path.join(folder || path.join(os.tmpdir(),'10thwest-set-upload-runtime'),'photo.png');
  const fixturePage=await browser.newPage();
  const encoded=await fixturePage.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=72;const ctx=canvas.getContext('2d');ctx.fillStyle='#ef7319';ctx.fillRect(0,0,96,72);return canvas.toDataURL('image/png').split(',')[1];});
  await fixturePage.close();await writeFile(fixtureImage,Buffer.from(encoded,'base64'));
  const imagePage=await browser.newPage();
  for(let index=0;index<15;index++){
    const encoded=await imagePage.evaluate(index=>{const canvas=document.createElement('canvas');canvas.width=96+index;canvas.height=72;const ctx=canvas.getContext('2d');ctx.fillStyle=`hsl(${index*23},80%,50%)`;ctx.fillRect(0,0,canvas.width,72);ctx.fillStyle='#000';ctx.fillText(`Panel ${index+1}`,8,30);return canvas.toDataURL('image/png').split(',')[1];},index);
    const file=path.join(path.dirname(fixtureImage),`panel-${index+1}.png`);await writeFile(file,Buffer.from(encoded,'base64'));uniqueImages.push(file);
  }
  await imagePage.close();
  worker=fork(fileURLToPath(new URL('../../backend/test-support/listingEditorServer.js',import.meta.url)),[],{env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe','ipc']});
  let output='';worker.stdout.on('data',chunk=>{output+=chunk;});worker.stderr.on('data',chunk=>{output+=chunk;});
  api=await new Promise((resolve,reject)=>{worker.once('message',message=>resolve(`http://localhost:${message.port}`));worker.once('exit',()=>reject(new Error(output)));});
});

test('object-valued upload error stays inline instead of crashing React',async({page,request},testInfo)=>{
  const {dialog,evidence,row}=await editor(page,request);
  await request.post(`${api}/fixture/storage`,{data:{failure:{status:400,message:{error:'Storage rejected the image'}}}});
  await row(12).locator('input[type=file]').setInputFiles(fixtureImage);
  await expect(row(12).getByRole('alert')).toContainText('could not be uploaded');
  await expect(row(12).locator('[data-upload-key]')).toHaveAttribute('data-upload-state','failed');
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

async function editor(page,request,role='owner',width=1440,id=1,itemCount=3){
  await request.post(`${api}/fixture/reset`);
  if(itemCount>3)await request.post(`${api}/fixture/many-items`,{data:{count:itemCount}});
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
    const response=await route.fetch({url:`${api}${url.pathname}${url.search}`,maxRetries:incoming.method()==='GET'?2:0,headers:{...incoming.headers(),cookie,'x-csrf-token':csrfToken}});
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

for(const [role,width,id] of [['owner',390,1],['owner',768,1],['owner',1440,1],['store_staff',390,2],['store_staff',1440,2]])test(`15 unique set items retain upload associations and reachable controls at ${width}px (${role})`,async({page,request},testInfo)=>{
  test.setTimeout(90000);
  const {dialog,evidence,snapshot,row}=await editor(page,request,role,width,id,15);
  evidence.role=role;evidence.viewportWidth=width;
  evidence.operations=[];
  const imageById=new Map();
  try{
    await dialog.getByRole('textbox',{name:'Set title',exact:true}).fill(`15 panels at ${width}`);
    await dialog.getByRole('textbox',{name:'E-commerce Description',exact:true}).fill('Preserve all fifteen items and their unique images');
    for(const number of [1,2,3,4,5,6,10,15]){
      const productId=100+number,operation={productItemId:productId,states:[]};
      evidence.operations.push(operation);
      const item=row(productId),input=item.locator('input[type=file]');
      await item.getByText(`Panel ${number}`,{exact:true}).scrollIntoViewIfNeeded();
      // The visible trigger owns focus; the native input has no layout/focus
      // box for a returning mobile picker to scroll into a clipped panel.
      const trigger=item.getByRole('button',{name:`Choose image for Panel ${number}`,exact:true});
      await trigger.focus();
      await expect(trigger).toBeFocused();
      operation.layout=await item.evaluate(node=>{
        const input=node.querySelector('input[type=file]'),label=node.querySelector('[data-upload-key] button'),rect=label.getBoundingClientRect(),ancestors=[];
        for(let parent=label.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(/auto|scroll|hidden|clip/.test(style.overflowY))ancestors.push({tag:parent.tagName,className:parent.className,clientHeight:parent.clientHeight,scrollHeight:parent.scrollHeight,scrollTop:parent.scrollTop});}
        const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        const header=node.closest('[role=dialog]').querySelector('h2'),headerRect=header.getBoundingClientRect();
        return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},reachable:label.contains(hit),inputNotRendered:input.getClientRects().length===0,headerVisible:headerRect.y>=0 && headerRect.bottom<=innerHeight && header.contains(document.elementFromPoint(headerRect.x+headerRect.width/2,headerRect.y+headerRect.height/2)),ancestors};
      });
      expect(operation.layout.reachable,`Panel ${number} upload is reachable`).toBe(true);
      expect(operation.layout.inputNotRendered).toBe(true);
      expect(operation.layout.headerVisible).toBe(true);
      expect(operation.layout.ancestors.find(parent=>parent.className.includes('brand-dialog-panel')).scrollTop).toBe(0);
      if(number===4 || number===15){
        const choosing=page.waitForEvent('filechooser');await trigger.click();
        const chooser=await choosing;await chooser.setFiles([]);
        operation.states.push({state:'native-chooser-canceled'});
      }
      await request.post(`${api}/fixture/storage`,{data:{hold:true}});
      operation.states.push({state:'selected',itemCount:await dialog.locator('ol > li').count()});
      const before=evidence.responses.length;
      await input.setInputFiles(uniqueImages[number-1]);
      await expect(item.getByRole('status')).toBeVisible();await expect(input).toBeDisabled();
      const field=item.locator('[data-upload-key]');
      await expect(field).toHaveAttribute('data-upload-key',`item:${productId}`);
      await expect(field).toHaveAttribute('data-upload-state','uploading');
      operation.operationId=await field.getAttribute('data-upload-operation');expect(operation.operationId).toBeTruthy();
      await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeDisabled();
      operation.states.push({state:'uploading',inputDisabled:true,saveDisabled:true});
      await request.post(`${api}/fixture/storage`,{data:{hold:false}});
      await expect.poll(()=>evidence.responses.length).toBe(before+1);
      const response=evidence.responses[before];operation.response=response;expect(response.status).toBe(201);
      imageById.set(productId,response.body.imageUrl);
      await expect(item.locator('img')).toHaveAttribute('src',response.body.imageUrl);
      await expect.poll(()=>item.locator('img').evaluate(img=>img.naturalWidth)).toBe(95+number);
      await expect(input).toBeEnabled();await expect(dialog.getByRole('button',{name:'Save Listing',exact:true})).toBeEnabled();
      await expect(field).toHaveAttribute('data-upload-state','completed');
      await expect(field).toHaveAttribute('data-upload-operation',operation.operationId);
      operation.states.push({state:'completed',itemCount:await dialog.locator('ol > li').count(),inputDisabled:false,saveDisabled:false});
      for(const [id,image] of imageById)await expect(row(id).locator('img')).toHaveAttribute('src',image);
      expect(await dialog.locator('ol > li').count()).toBe(15);
      await expect(dialog.getByRole('heading',{name:'Edit Set Listing',exact:true})).toBeVisible();
      if(number===4)await page.screenshot({path:path.join(os.tmpdir(),`10thwest-set-upload-focus-after-${role}-${width}-item4.png`)});
      await healthy(page,evidence);
    }
    expect(new Set(evidence.operations.map(operation=>operation.operationId)).size).toBe(8);
    evidence.after=await snapshot();
    await dialog.getByRole('button',{name:'Save Listing',exact:true}).click();await expect(dialog).toHaveCount(0);
    const stored=await(await request.get(`${api}/fixture/state`)).json();
    expect(stored.items).toHaveLength(15);
    expect(stored.uploads).toHaveLength(8);
    for(const item of stored.items)expect(item.image_url).toBe(imageById.get(item.product_item_id) ?? null);
    await page.getByRole('row').filter({hasText:`15 panels at ${width}`}).getByRole('button',{name:'Edit',exact:true}).click();
    await expect(dialog.getByRole('textbox',{name:'Set title',exact:true})).toHaveValue(`15 panels at ${width}`);
    await expect(dialog.getByRole('textbox',{name:'E-commerce Description',exact:true})).toHaveValue('Preserve all fifteen items and their unique images');
    expect(await dialog.locator('ol > li').count()).toBe(15);
    for(const [id,image] of imageById)await expect(row(id).locator('img')).toHaveAttribute('src',image);
    await healthy(page,evidence);
  }finally{
    await writeFile(path.join(os.tmpdir(),`10thwest-set-runtime-15-items-${role}-${width}.json`),JSON.stringify(evidence,null,2));
    await testInfo.attach('runtime-evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  }
});
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
