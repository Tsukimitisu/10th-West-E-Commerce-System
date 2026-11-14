import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { customerFixture } from './customerPhaseFixture.js';

const noOverflow = async page => expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
const stats = { todaySales: 350, todayInStoreSales: 200, todayOnlineSales: 150, todayInStoreOrders: 2, todayOnlineOrders: 1, totalOrders: 3, salesTrend: [], recentOrders: [], topProducts: [] };
for(const width of [390,768,1440]) test(`returns lifecycle, sales channels and hero controls at ${width}px`,async({page})=>{
  test.setTimeout(90000); await page.setViewportSize({width,height:900});
  await staffFixture(page,{user:{role:'owner'},permissions:['returns.view','returns.manage','refunds.process']});
  const returned={id:9,order_id:8,status:'pending',created_at:new Date().toISOString(),customer_name:'Test Customer',refund_amount:100,payment_method:'cod',refund_method:'original',items:[{name:'Brake Pad',quantity:1,price:100}]};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname.replace(/^\/api/,'');
    const reply=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/dashboard/stats')return reply(stats);
    if(path==='/returns')return reply([returned]);
    if(path==='/returns/9/approve'){returned.status='approved';return reply({return:returned});}
    if(path==='/returns/9/received'){expect(route.request().method()).toBe('PATCH');returned.status='received';return reply({return:returned});}
    if(path==='/returns/9/refund'){expect(route.request().postDataJSON().manual_reference).toBe('CASH-42');expect(route.request().headers()['idempotency-key']).toBeTruthy();returned.status='refunded';return reply({status:'succeeded'});}
    return route.fallback();
  });
  await page.goto('/#/admin/dashboard');
  await expect(page.getByText('In-store Sales',{exact:true})).toBeVisible();await expect(page.getByText('Online Sales',{exact:true})).toBeVisible();await noOverflow(page);
  await page.goto('/#/admin/returns');
  if(width<768)await page.getByRole('button',{name:'Review request'}).click();else await page.getByTitle('View',{exact:true}).click();
  await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mark item as received',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Process refund',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Mark item as received',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('button',{name:'Process refund',exact:true})).toBeDisabled();
  await page.getByLabel('Cash refund reference / receipt note').fill('CASH-42');await noOverflow(page);
  expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.screenshot({path:`test-results/return-received-${width}.png`});
  await page.getByRole('button',{name:'Process refund',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('dialog').getByText('Refunded',{exact:true})).toBeVisible();await noOverflow(page);

  await staffFixture(page,{permissions:['orders.view']});
  await page.route('**/api/dashboard/stats',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(stats)}));
  await page.goto('/#/staff/dashboard');await page.reload();await expect(page.locator('.staff-dashboard')).toBeVisible();await expect(page.getByText('In-store Sales',{exact:true})).toBeVisible();await expect(page.getByText('Online Sales',{exact:true})).toBeVisible();await noOverflow(page);

  await customerFixture(page,{authenticated:true});
  let submitted;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname.replace(/^\/api/,'');
    const reply=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/orders/8')return reply({id:8,status:'delivered',return_eligible:true,items:[{id:3,name:'Brake Pad',quantity:3,returnable_quantity:2,price:100}]});
    if(path==='/returns' && route.request().method()==='POST'){submitted=route.request().postDataJSON();return reply({id:9,...submitted});}
    if(path==='/returns/my-returns')return reply([{...returned,status:'received'}]);
    return route.fallback();
  });
  await page.goto('/#/orders/8/return');await page.reload();await page.getByRole('checkbox',{name:'Return Brake Pad',exact:true}).check();
  await page.getByRole('spinbutton',{name:'Return quantity for Brake Pad'}).fill('2');await page.getByPlaceholder('Describe the issue with the selected item(s).').fill('Wrong fit');
  await page.getByRole('radio',{name:'Store credit',exact:true}).check();await noOverflow(page);await page.getByRole('button',{name:'Submit Return Request'}).click();await expect(page.getByText('Return Request Submitted',{exact:true})).toBeVisible();expect(submitted.items).toEqual([{order_item_id:3,quantity:2}]);expect(submitted.refund_method).toBe('store_credit');
  await page.goto('/#/my-returns');await expect(page.getByText('Item received',{exact:true}).first()).toBeVisible();await noOverflow(page);
  await page.goto('/#/');const hero=page.getByRole('region',{name:'10th West store highlights'});await expect(hero).toBeVisible();
  const next=hero.getByRole('button',{name:'Next slide',exact:true});await next.focus();await expect(next).toBeFocused();await next.press('Enter');await expect(hero.locator('.managed-hero-count')).toHaveText('2 / 2');
  await hero.getByRole('button',{name:'Previous slide',exact:true}).focus();await page.keyboard.press('Enter');await expect(hero.locator('.managed-hero-count')).toHaveText('1 / 2');
  await hero.getByRole('button',{name:/Go to slide 2/}).click();await expect(hero.locator('.managed-hero-count')).toHaveText('2 / 2');
  await hero.evaluate(element=>{
    const touch=(x,y)=>new Touch({identifier:1,target:element,clientX:x,clientY:y});
    element.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(100,200)]}));
    element.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(220,205)]}));
  });await expect(hero.locator('.managed-hero-count')).toHaveText('1 / 2');
  await noOverflow(page);await page.screenshot({path:`test-results/operations-fix-${width}.png`});await hero.getByRole('link').first().click();await expect(page).toHaveURL(/#\/shop/);
});

test('preparation schema error is visible next to action and never claims ready',async({page})=>{
  await page.setViewportSize({width:390,height:900});await staffFixture(page,{permissions:['pos.access']});
  await page.route('**/api/health',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({status:'OK'})}));
  await page.route('**/api/pos/offline/device',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'OFFLINE_POS_SCHEMA_NOT_READY',message:'Offline POS database setup is not ready. Apply the offline POS migration before enabling this computer.'})}));
  await page.goto('/#/pos');await page.getByRole('button',{name:'Offline POS setup',exact:true}).click();
  await page.getByLabel('6-digit Offline POS PIN').fill('482916');await page.getByRole('button',{name:'Prepare Offline POS'}).click();
  await expect(page.getByText(/Apply the offline POS migration/)).toBeVisible({timeout:30000});await expect(page.getByText(/Offline POS Ready/)).toHaveCount(0);await expect(page.getByRole('button',{name:'Prepare Offline POS'})).toBeEnabled();await noOverflow(page);
});
