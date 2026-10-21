import {test,expect} from '@playwright/test';
import {staffFixture,staffUser} from './staffPhaseFixture.js';
import {readFile} from 'node:fs/promises';

const DEVICE='11111111-1111-4111-8111-111111111111';
const SNAPSHOT='22222222-2222-4222-8222-222222222222';
test.use({ignoreHTTPSErrors:true});
async function fixture(page){
  const state=await staffFixture(page,{permissions:['pos.access','inventory.adjust'],user:{role:'owner'}});
  state.unreachable=false;state.synced=[];state.allowance=3;
  const product=()=>({id:1,name:'Offline Brake Pad',sku:'PAD-1',barcode:'12345678',part_number:'BRK-125',price:120,store_selling_price:120,available_stock:state.allowance,stock_quantity:10,variants:[]});
  await page.route('**/api/**',async route=>{
    const req=route.request();const path=new URL(req.url()).pathname.replace(/^\/api/,'');
    if(state.unreachable)return route.abort('internetdisconnected');
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/health')return reply({status:'OK'});
    if(path==='/pos/offline/device'){if(req.method()==='POST')state.device={id:DEVICE,device_uuid:req.postDataJSON().device_uuid,name:req.postDataJSON().name || '10th West POS',is_active:true};return reply({device:state.device || null});}
    if(path==='/pos/offline/devices')return reply({devices:state.device ? [state.device] : []});
    if(path==='/pos/offline/snapshot')return reply({id:SNAPSHOT,device_id:DEVICE,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+72*3600000).toISOString(),products:[product()]});
    if(path==='/pos/products')return reply({products:[product()]});
    if(path==='/pos/capabilities')return reply({can_access:true,can_discount:true,can_void:true,can_manage_offline_reserve:true});
    if(path==='/pos/daily-summary')return reply({transaction_count:0,gross_sales:0,cash_sales:0,gcash_sales:0});
    if(path==='/pos/orders' && req.method()==='GET')return reply({orders:[]});
    if(path==='/pos/orders' && req.method()==='POST'){
      const body=req.postDataJSON();const key=req.headers()['idempotency-key'];
      expect(body.payment_method).toBe('cash');expect(body.offline.transaction_id).toBe(key);expect(body.items[0].unit_price).toBe(120);
      if(!state.synced.includes(key)){state.synced.push(key);state.allowance-=body.items[0].quantity;}
      state.receipt={id:91,order_id:91,source:'pos',receipt_number:'POS-SYNC-91',status:'paid',payment_status:'paid',created_at:body.offline.created_at,payment_method:'cash',cashier_name:staffUser.name,items:[{product_name:'Offline Brake Pad',product_price:120,quantity:1,line_total:120}],subtotal_amount:120,total_amount:120,amount_tendered:200,change_due:80};
      return reply({receipt:state.receipt},201);
    }
    if(path==='/pos/orders/91/receipt')return reply({receipt:state.receipt});
    return route.fallback();
  });
  return state;
}

for(const width of [1440,768,390])test(`cached POS cash sale, offline restart and authenticated resynchronization at ${width}px`,async({page,context})=>{
  test.setTimeout(90000);
  if(process.env.E2E_TAILWIND_SCRIPT){const body=await readFile(process.env.E2E_TAILWIND_SCRIPT);await context.route(/^https:\/\/cdn\.tailwindcss\.com(?:\/|\?|$)/,route=>route.fulfill({contentType:'application/javascript',body}));}
  await page.setViewportSize({width,height:900});const state=await fixture(page);
  await page.goto('/#/pos');await expect(page.getByText('● Online',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Offline POS setup',exact:true}).click();
  await page.getByLabel('6-digit Offline POS PIN').fill('482916');
  await page.getByRole('button',{name:'Prepare Offline POS'}).click();
  await expect(page.getByText(/Offline POS Ready/)).toBeVisible({timeout:45000});
  await expect(page.getByText('● Online',{exact:true})).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.screenshot({path:`test-results/offline-pos-ready-${width}.png`});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/offline-pos-${width}.png`});
  // The worker must cache the shell and external styling runtime before outage.
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  state.unreachable=true;await context.setOffline(true);
  await expect(page.getByText('● Offline mode',{exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Search products or scan a barcode'}).fill('12345678');
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Offline Brake Pad'})}).click();
  await page.getByRole('button',{name:/^Pay /}).click();
  await expect(page.getByRole('button',{name:/GCash/})).toBeDisabled();
  await expect(page.getByText('Online payments are unavailable while offline. Cash payments are still available.').last()).toBeVisible();
  await page.getByLabel('Amount received').fill('200');
  await page.getByRole('button',{name:/^Charge /}).click();
  await expect(page.getByText('OFFLINE SALE · Pending synchronization')).toBeVisible();
  const before=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('10th-west-offline-pos',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return new Promise(resolve=>{const r=db.transaction('pending_sales').objectStore('pending_sales').getAll();r.onsuccess=()=>resolve(r.result);});});
  expect(before).toHaveLength(1);const uuid=before[0].id;expect(before[0].payment_method).toBe('cash');
  // A real fresh page (not just a React remount), with backend and network down.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByLabel('Offline POS PIN',{exact:true}).fill('482916');
  await page.getByRole('button',{name:'Unlock offline POS'}).click();
  await expect(page.getByText(/Pending sync: 1/)).toBeVisible();
  await expect(page.getByText(/Last inventory sync:/)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Recent sales',exact:true}).click();await expect(page.getByText('Pending sync',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close recent sales'}).click();
  await page.evaluate(()=>{location.hash='/admin/dashboard';});await expect(page.getByText('This area requires an internet connection.')).toBeVisible();
  await page.getByRole('link',{name:'Return to POS'}).click();
  await expect(page.getByText('● Offline mode',{exact:true})).toBeVisible();
  state.unreachable=false;await context.setOffline(false);
  // Session has not survived the offline restart; queue is retained until login.
  await expect(page.getByText(/Sign in to synchronize/)).toBeVisible({timeout:15000});
  await page.getByRole('link',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Email', {exact:true}).fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('LocalFixture-Only-8!');
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page).toHaveURL(/#\/admin\/dashboard/);
  await page.goto('/#/pos');await expect(page.getByText('All transactions synchronized.')).toBeVisible({timeout:15000});expect(state.synced).toEqual([uuid]);
  await page.getByRole('button',{name:'Recent sales',exact:true}).click();await expect(page.getByText('Synchronized',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Receipt/}).click();await expect(page.getByText('POS-SYNC-91',{exact:true})).toBeVisible();
  expect(state.synced).toHaveLength(1);
});

test('backend unreachable despite navigator online and first-use offline remain safe',async({page})=>{
  const state=await fixture(page);state.unreachable=true;await page.goto('/#/pos');
  await expect(page.getByText('Offline POS is not ready on this computer.')).toBeVisible({timeout:15000});expect(await page.evaluate(()=>navigator.onLine)).toBe(true);
});
