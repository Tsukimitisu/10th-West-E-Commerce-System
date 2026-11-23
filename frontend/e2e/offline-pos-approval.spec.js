import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {staffFixture} from './staffPhaseFixture.js';

test('approval lookup failure does not hide the staff request action',async({page})=>{
  await staffFixture(page,{permissions:['pos.access'],user:{role:'store_staff'}});
  let pending=null;
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname.replace(/^\/api/,'');
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/health')return reply({status:'OK'});
    if(path==='/pos/capabilities')return reply({can_access:true});
    if(path==='/pos/products')return reply({products:[]});
    if(path==='/pos/daily-summary')return reply({transaction_count:0});
    if(path==='/pos/offline/device')return reply({device:null});
    if(path==='/pos/offline/device-requests/current')return pending ? reply({status:'pending',request:pending}) : reply({message:'Approval status is temporarily unavailable.'},503);
    if(path==='/pos/offline/device-requests' && request.method()==='POST'){
      const body=request.postDataJSON();pending={id:crypto.randomUUID(),requested_name:body.name,requested_at:new Date().toISOString(),status:'pending'};
      return reply({status:'pending',request:pending});
    }
    return route.fallback();
  });
  await page.goto('/#/pos');await page.getByRole('button',{name:'Offline POS setup',exact:true}).click();
  await expect(page.getByText('Approval status is temporarily unavailable.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Request approval$/i})).toBeVisible({timeout:3000});
  await expect(page.getByLabel('6-digit Offline POS PIN')).toHaveCount(0);
  await page.getByLabel('Computer name',{exact:true}).fill('James Laptop');await page.getByRole('button',{name:/^Request approval$/i}).click();
  await expect(page.getByText(/^Pending approval$/i)).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Offline POS setup',exact:true}).click();
  await expect(page.getByText(/^Pending approval$/i)).toBeVisible();
});

test('existing active staff laptop opens PIN preparation without request-history availability',async({page})=>{
  await staffFixture(page,{permissions:['pos.access'],user:{role:'store_staff'}});
  let approvalLookups=0;
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname.replace(/^\/api/,'');
    const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/health')return reply({status:'OK'});
    if(path==='/pos/capabilities')return reply({can_access:true});
    if(path==='/pos/products')return reply({products:[]});
    if(path==='/pos/daily-summary')return reply({transaction_count:0});
    if(path==='/pos/offline/device')return reply({device:{id:'11111111-1111-4111-8111-111111111111',device_uuid:url.searchParams.get('device_uuid'),name:'Friend Laptop',is_active:true}});
    if(path==='/pos/offline/device-requests/current'){approvalLookups++;return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Approval lookup unavailable"}'});}
    return route.fallback();
  });
  await page.goto('/#/pos');await page.getByRole('button',{name:'Offline POS setup',exact:true}).click();
  await expect(page.getByLabel('6-digit Offline POS PIN')).toBeVisible();
  await expect(page.getByRole('button',{name:'Prepare Offline POS',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Request Approval',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Approve computer',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Registered Offline POS Devices',exact:true})).toHaveCount(0);
  expect(approvalLookups).toBe(0);
});

// Every API is intercepted. Approval does not perform an inventory mutation.
for(const width of [1440,768,390])test(`staff requests, management approves and same laptop prepares at ${width}px`,async({browser})=>{
  test.setTimeout(120000);
  const friend={id:crypto.randomUUID(),device_uuid:crypto.randomUUID(),name:'Friend Laptop',is_active:true,registered_at:new Date().toISOString()};
  const devices=[friend],requests=[];const contexts=[];let snapshots=0,registerCalls=0;
  async function screen(role){
    const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});contexts.push(context);
    if(process.env.E2E_TAILWIND_SCRIPT){const body=await readFile(process.env.E2E_TAILWIND_SCRIPT);await context.route(/^https:\/\/cdn\.tailwindcss\.com(?:\/|\?|$)/,route=>route.fulfill({contentType:'application/javascript',body}));}
    const page=await context.newPage();await staffFixture(page,{permissions:['pos.access','inventory.adjust'],user:{role,name:role==='store_staff'?'James':'Owner'}});
    await page.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/api/,'');
      const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      if(path==='/health')return reply({status:'OK'});
      if(path==='/pos/capabilities')return reply({can_access:true,can_manage_offline_reserve:role!=='store_staff'});
      if(path==='/pos/products')return reply({products:[]});
      if(path==='/pos/daily-summary')return reply({transaction_count:0,gross_sales:0,cash_sales:0,gcash_sales:0});
      if(path==='/pos/orders')return reply({orders:[]});
      if(path==='/pos/offline/devices')return reply({devices});
      if(path==='/pos/offline/device-requests/current'){
        const uuid=url.searchParams.get('device_uuid'),device=devices.find(d=>d.device_uuid===uuid&&d.is_active);
        const request=requests.findLast(r=>r.device_uuid===uuid);
        return reply(device?{status:'approved',device}:{status:request?.status || 'none',request});
      }
      if(path==='/pos/offline/device-requests'){
        if(req.method()==='GET')return reply({requests});
        const data=req.postDataJSON();expect(data).not.toHaveProperty('pin');
        let row=requests.find(r=>r.device_uuid===data.device_uuid&&r.status==='pending');
        if(!row){row={id:crypto.randomUUID(),device_uuid:data.device_uuid,requested_name:data.name,requested_by_name:'James',status:'pending',requested_at:new Date().toISOString()};requests.push(row);}
        return reply({status:'pending',request:row});
      }
      if(path.match(/device-requests\/[^/]+\/(approve|reject)$/)){
        expect(['owner','admin','super_admin']).toContain(role);const row=requests.find(r=>r.id===path.split('/').at(-2));
        if(path.endsWith('/reject')){row.status='rejected';row.rejection_reason=req.postDataJSON().reason;return reply({status:'rejected',request:row});}
        row.status='approved';const device={id:crypto.randomUUID(),device_uuid:row.device_uuid,name:row.requested_name,is_active:true,registered_at:new Date().toISOString()};devices.push(device);return reply({status:'approved',device,request:row});
      }
      if(path==='/pos/offline/device'){
        if(req.method()==='POST'){registerCalls++;const data=req.postDataJSON(),device=devices.find(d=>d.device_uuid===data.device_uuid);expect(device?.is_active).toBe(true);return reply({device});}
        return reply({device:devices.find(d=>d.device_uuid===url.searchParams.get('device_uuid')) || null});
      }
      if(path==='/pos/offline/snapshot'){
        snapshots++;const id=req.postDataJSON().device_id;expect(devices.some(d=>d.id===id&&d.name==='James Laptop')).toBe(true);
        return reply({id:crypto.randomUUID(),device_id:id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+72*3600000).toISOString(),products:[]});
      }
      if(path.includes('/pos/offline/reserve'))throw new Error('Approval must not allocate stock');
      return route.fallback();
    });return page;
  }
  try{
    const james=await screen('store_staff');await james.goto('/#/pos');await james.getByRole('button',{name:'Offline POS setup',exact:true}).click();
    await expect(james.getByRole('heading',{name:'Request Device Approval',exact:true})).toBeInViewport();
    await expect(james.getByText('Not approved',{exact:true})).toBeVisible();await expect(james.getByLabel('6-digit Offline POS PIN')).toHaveCount(0);
    await james.getByLabel('Computer name',{exact:true}).fill('James Laptop');await james.getByRole('button',{name:'Request Approval',exact:true}).click();
    await expect(james.getByText('Pending Approval',{exact:true})).toBeVisible();expect(registerCalls).toBe(0);
    const uuid=requests[0].device_uuid;
    await james.reload();await james.getByRole('button',{name:'Offline POS setup',exact:true}).click();await expect(james.getByText('Pending Approval',{exact:true})).toBeVisible();
    // Verify rejection and requesting again before the final approval.
    const managerRole=width===1440 ? 'owner' : width===768 ? 'admin' : 'super_admin';
    const managementPath=managerRole==='super_admin' ? '/#/superadmin/offline-pos-devices' : '/#/admin/offline-pos-devices';
    const owner=await screen(managerRole);await owner.goto(managementPath);
    if(width<1024)await owner.getByRole('button',{name:'Open navigation',exact:true}).click();
    await owner.getByRole('button',{name:'Offline POS Devices',exact:true}).click();
    await expect(owner.getByRole('heading',{name:'Offline POS Devices',exact:true})).toBeVisible();await owner.getByRole('button',{name:'Reject',exact:true}).click();await owner.getByLabel('Rejection reason (optional)').fill('Confirm the computer name');await owner.getByRole('button',{name:'Reject request',exact:true}).click();
    await james.getByRole('button',{name:'Check approval status',exact:true}).click();await expect(james.getByText('Rejected',{exact:true})).toBeVisible();await expect(james.getByText('Confirm the computer name',{exact:true})).toBeVisible();await james.getByRole('button',{name:'Request Again',exact:true}).click();expect(requests[1].device_uuid).toBe(uuid);
    await owner.reload();await owner.getByRole('button',{name:'Approve',exact:true}).click();await expect(owner.getByRole('dialog')).toContainText('James Laptop');expect(await owner.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await owner.screenshot({path:`test-results/offline-approval-confirm-${width}.png`,animations:'disabled'});await owner.getByRole('button',{name:'Approve computer',exact:true}).click();await expect(owner.getByText(/Computer approved\. It may now prepare/)).toBeVisible();
    // Let the normal 15-second poll detect approval without a manual click.
    await expect(james.getByText('Computer approved. Create your 6-digit Offline POS PIN to finish setup.')).toBeVisible({timeout:20000});
    await james.getByLabel('6-digit Offline POS PIN').fill('739125');await james.getByRole('button',{name:'Prepare Offline POS',exact:true}).click();await expect(james.getByText(/Offline POS Ready/)).toBeVisible({timeout:45000});
    expect(registerCalls).toBe(1);expect(snapshots).toBe(1);expect(devices.length).toBe(2);expect(friend.is_active).toBe(true);expect(devices[1].device_uuid).toBe(uuid);expect(devices[1].id).not.toBe(friend.id);
    expect(await james.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await james.screenshot({path:`test-results/offline-approval-${width}.png`});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
