import {test,expect} from '@playwright/test';
import {staffFixture,staffUser} from './staffPhaseFixture.js';
import {readFile} from 'node:fs/promises';

// Two isolated browser profiles share only this mocked server. No business API
// reaches the shop. Actual SQL isolation is tested in multiDeviceOfflinePos.test.
for(const width of [1440,390])test(`two approved laptops sell and synchronize isolated allocations at ${width}px`,async({browser})=>{
  test.setTimeout(120000);
  const server={devices:new Map(),snapshots:new Map(),holds:new Map(),sales:new Map(),stock:4};
  const contexts=[];
  const product=allowance=>({id:1,name:'Offline Brake Pad',sku:'PAD-1',barcode:'12345678',part_number:'BRK-125',price:120,store_selling_price:120,available_stock:allowance,stock_quantity:server.stock,variants:[]});
  const reserved=()=>[...server.holds.values()].reduce((sum,r)=>sum+r.remaining,0);
  async function laptop(name,pin){
    const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});contexts.push(context);
    // Worker install requests have no page; intercept at context level too.
    if(process.env.E2E_TAILWIND_SCRIPT){const body=await readFile(process.env.E2E_TAILWIND_SCRIPT);await context.route(/^https:\/\/cdn\.tailwindcss\.com(?:\/|\?|$)/,route=>route.fulfill({contentType:'application/javascript',body}));}
    const page=await context.newPage();
    const connection={offline:false};
    await staffFixture(page,{permissions:['pos.access','inventory.adjust'],user:{role:'owner'}});
    await page.route('**/api/**',async route=>{
      if(connection.offline)return route.abort('internetdisconnected');
      const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/api/,'');
      const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(path==='/health')return reply({status:'OK'});
      if(path==='/pos/offline/devices')return reply({devices:[...server.devices.values()]});
      if(path==='/pos/offline/device'){
        if(req.method()==='POST'){
          const body=req.postDataJSON();let row=server.devices.get(body.device_uuid);
          if(!row){row={id:crypto.randomUUID(),device_uuid:body.device_uuid,name:body.name,is_active:true};server.devices.set(body.device_uuid,row);server.holds.set(row.id,{id:row.id,device_id:row.id,device_name:row.name,product_id:1,variant_id:null,target_quantity:0,remaining:0,quarantined:false});}
          return reply({device:row});
        }
        return reply({device:server.devices.get(url.searchParams.get('device_uuid')) || null});
      }
      if(path.startsWith('/pos/offline/device/') && req.method()==='DELETE'){
        const id=path.split('/').at(-1),row=[...server.devices.values()].find(d=>d.id===id);row.is_active=false;server.holds.get(id).quarantined=true;return reply({revoked:true,device_id:id});
      }
      if(path==='/pos/offline/reserve'){
        const body=req.postDataJSON(),hold=server.holds.get(body.device_id);expect(hold).toBeTruthy();
        expect(body.quantity-hold.remaining).toBeLessThanOrEqual(server.stock-reserved());hold.remaining=body.quantity;hold.target_quantity=body.quantity;return reply({saved:true});
      }
      if(path==='/pos/offline/reserves')return reply({reserves:[...server.holds.values()],stock:[{variant_id:null,stock_quantity:server.stock,offline_protected:reserved(),other_reserved:0,online_available:server.stock-reserved()}]});
      if(path==='/pos/offline/snapshot'){
        const id=req.postDataJSON().device_id,row=[...server.devices.values()].find(d=>d.id===id);
        if(!row?.is_active)return reply({code:'OFFLINE_POS_DEVICE_REVOKED',message:'Offline access for this computer has been revoked.'},403);
        const s={id:crypto.randomUUID(),device_id:id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+72*3600000).toISOString(),products:[product(server.holds.get(id).remaining)]};server.snapshots.set(s.id,s);return reply(s);
      }
      if(path==='/pos/products')return reply({products:[product(server.stock-reserved())]});
      if(path==='/pos/capabilities')return reply({can_access:true,can_discount:true,can_void:true,can_manage_offline_reserve:true});
      if(path==='/pos/daily-summary')return reply({transaction_count:server.sales.size,gross_sales:server.sales.size*120,cash_sales:server.sales.size*120,gcash_sales:0});
      if(path==='/pos/orders' && req.method()==='GET')return reply({orders:[]});
      if(path==='/pos/orders' && req.method()==='POST'){
        const body=req.postDataJSON(),key=req.headers()['idempotency-key'];expect(body.offline.transaction_id).toBe(key);expect(body.payment_method).toBe('cash');
        const snapshot=server.snapshots.get(body.offline.snapshot_id);expect(snapshot.device_id).toBe(body.offline.device_id);
        let receipt=server.sales.get(key);
        if(!receipt){const hold=server.holds.get(body.offline.device_id);expect(hold.quarantined).toBe(false);expect(hold.remaining).toBeGreaterThanOrEqual(body.items[0].quantity);hold.remaining-=body.items[0].quantity;server.stock-=body.items[0].quantity;
          receipt={id:server.sales.size+91,source:'pos',receipt_number:`POS-SYNC-${server.sales.size+91}`,status:'paid',payment_status:'paid',created_at:body.offline.created_at,payment_method:'cash',cashier_name:staffUser.name,items:[{product_name:'Offline Brake Pad',product_price:120,quantity:1,line_total:120}],subtotal_amount:120,total_amount:120,amount_tendered:200,change_due:80};server.sales.set(key,receipt);}
        return reply({order:receipt,receipt},201);
      }
      return route.fallback();
    });
    await page.goto('/#/pos');await expect(page.getByText('● Online',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Offline POS setup',exact:true}).click();await page.getByLabel('Computer name',{exact:true}).fill(name);await page.getByLabel('6-digit Offline POS PIN').fill(pin);await page.getByRole('button',{name:'Prepare Offline POS'}).click();
    await expect(page.getByText(/Offline POS Ready/)).toBeVisible({timeout:45000});
    const own=[...server.devices.values()].find(d=>d.name===name);expect(own).toBeTruthy();
    await page.getByLabel('Reserve product',{exact:true}).selectOption('1');await page.getByLabel('Device',{exact:true}).selectOption(own.id);await page.getByLabel('Offline reserve quantity',{exact:true}).fill('2');await page.getByRole('button',{name:'Save offline reserve',exact:true}).click();await expect(page.getByText('Offline stock reserve saved for the selected computer.')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.getByRole('button',{name:'Close',exact:true}).click();return {page,context,own,pin,connection};
  }
  try{
    const a=await laptop('Friend Laptop','482916');const b=await laptop('James Laptop','739125');expect(server.devices.size).toBe(2);expect([...server.devices.values()].every(d=>d.is_active)).toBe(true);expect(reserved()).toBe(4);
    for(const {page,context,pin,own,connection} of [a,b]){
      await page.evaluate(async()=>{await navigator.serviceWorker.ready;});connection.offline=true;await context.setOffline(true);await expect(page.getByText('● Offline mode',{exact:true})).toBeVisible();
      await page.getByRole('searchbox',{name:'Search products or scan a barcode'}).fill('12345678');await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Offline Brake Pad'})}).click();await page.getByRole('button',{name:/^Pay /}).click();await expect(page.getByRole('button',{name:/GCash/})).toBeDisabled();await page.getByLabel('Amount received').fill('200');await page.getByRole('button',{name:/^Charge /}).click();await expect(page.getByText('OFFLINE SALE · Pending synchronization')).toBeVisible();
      await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('Offline POS PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Unlock offline POS'}).click();await expect(page.getByText(/Pending sync: 1/)).toBeVisible();
      const metadata=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('10th-west-offline-pos',1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction('offline_access').objectStore('offline_access').get('grant');r.onsuccess=()=>resolve(r.result);});});expect(metadata.device_id).toBe(own.id);expect(JSON.stringify(metadata)).not.toContain(pin);
    }
    a.connection.offline=false;b.connection.offline=false;await Promise.all([a.context.setOffline(false),b.context.setOffline(false)]);
    await Promise.all([a,b].map(async({page})=>{await expect(page.getByText(/Sign in to synchronize/)).toBeVisible({timeout:15000});await page.getByRole('link',{name:'Sign in',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('LocalFixture-Only-8!');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page).toHaveURL(/#\/admin\/dashboard/);await page.goto('/#/pos');await expect(page.getByText('All transactions synchronized.')).toBeVisible({timeout:15000});}));
    expect(server.sales.size).toBe(2);expect(server.stock).toBe(2);expect(server.holds.get(a.own.id).remaining).toBe(1);expect(server.holds.get(b.own.id).remaining).toBe(1);
    await b.page.getByRole('button',{name:'Offline POS setup',exact:true}).click();
    await expect(b.page.getByText('Registered Offline POS Devices',{exact:true})).toBeVisible();await expect(b.page.getByText('James Laptop · This computer',{exact:true})).toBeVisible();
    b.page.once('dialog',dialog=>{expect(dialog.message()).toContain('Friend Laptop');return dialog.accept();});await b.page.getByRole('button',{name:'Revoke Friend Laptop',exact:true}).click();await expect(b.page.getByText('Friend Laptop revoked. Only its remaining stock is quarantined for review.')).toBeVisible();
    expect(server.devices.get(a.own.device_uuid).is_active).toBe(false);expect(server.devices.get(b.own.device_uuid).is_active).toBe(true);expect(server.holds.get(b.own.id).quarantined).toBe(false);
    await b.page.getByRole('button',{name:'Synchronize catalogue',exact:true}).click();await expect(b.page.getByText('Catalogue synchronized.',{exact:true})).toBeVisible();expect(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await b.page.screenshot({path:`test-results/multi-device-pos-${width}.png`});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
