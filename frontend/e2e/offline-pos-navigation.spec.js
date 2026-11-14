import {test,expect} from '@playwright/test';
import {ownerFixture} from './ownerPhaseFixture.js';

const requests=['pending','approved','rejected','expired','cancelled'].map((status,index)=>({
  id:`request-${index}`,requested_name:`${status} Laptop`,requested_by_name:'James',status,requested_at:'2026-10-21T10:00:00Z',reviewed_at:status==='pending'?null:'2026-10-21T11:00:00Z',
}));
async function fixture(page,role){
  await ownerFixture(page,{user:{role},permissions:role==='store_staff'?['pos.access','inventory.adjust']:[]});
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname.replace(/^\/api/,'');
    const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/pos/offline/device-requests')return reply({requests});
    if(path==='/pos/offline/devices')return reply({devices:[{id:'friend-device',name:'Friend Laptop',is_active:true,registered_at:'2026-10-20T10:00:00Z'}]});
    if(path==='/pos/products')return reply({products:[]});
    return route.fallback();
  });
}
for(const width of [1440,390])for(const role of ['owner','admin','super_admin'])test(`${role} discovers Offline POS Devices from sidebar at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await fixture(page,role);
  const system=role==='super_admin',prefix=system?'/superadmin':'/admin';
  // Start at a different existing page: direct-route tests cannot catch missing navigation.
  await page.goto(`/#${prefix}/${system?'inventory/product-items':'orders'}`);
  if(width<1024)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  const menu=page.getByRole('button',{name:'Offline POS Devices',exact:true});
  await expect(menu).toBeVisible();
  await expect(menu.locator('..')).toContainText(system?'Platform':'Sales');
  await menu.click();await expect(page).toHaveURL(new RegExp(`#${prefix}/offline-pos-devices$`));
  await expect(page.getByRole('heading',{name:'Offline POS Devices',exact:true})).toBeVisible();
  await expect(page.getByText('pending Laptop',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reject',exact:true})).toBeVisible();
  await expect(page.getByText('Friend Laptop',{exact:true})).toBeVisible();
  await page.getByText('Recent approval decisions',{exact:true}).click();
  for(const status of ['approved','rejected','expired','cancelled'])await expect(page.getByText(new RegExp(`${status} Laptop`))).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Offline POS Devices',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('staff cannot see the management menu or enter any management page directly',async({page})=>{
  await fixture(page,'store_staff');await page.goto('/#/staff/dashboard');
  await expect(page.getByRole('button',{name:'Offline POS Devices',exact:true})).toHaveCount(0);
  for(const path of ['/staff/offline-pos-devices','/admin/offline-pos-devices','/superadmin/offline-pos-devices']){
    await page.goto(`/#${path}`);await expect(page).not.toHaveURL(new RegExp(`#${path}$`));
    await expect(page.getByRole('heading',{name:'Offline POS Devices',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Approve computer',exact:true})).toHaveCount(0);
  }
});
