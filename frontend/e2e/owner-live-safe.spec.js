import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';

// Explicit opt-in: authentication/session writes only. All commerce mutations
// are blocked in the browser; probes below use GET and final session logout.
test.skip(process.env.OWNER_LIVE_QA!=='true','Opt in to safe live fixture authentication checks.');
const api=(process.env.E2E_API_URL || 'http://localhost:5000/api').replace(/\/$/,'');
for(const role of ['OWNER','STAFF','CASHIER']) test(`live ${role} access remains correct without a transaction`,async({page})=>{
  test.setTimeout(150000);
  const email=process.env[`E2E_${role}_EMAIL`],password=process.env[`E2E_${role}_PASSWORD`];
  test.skip(!email || !password,'No local fixture credentials.');
  const runtime=await fs.readFile(process.env.E2E_TAILWIND_SCRIPT || '../qa/staff-phase/tailwind-runtime.js');
  await page.route(/^https:\/\/cdn\.tailwindcss\.com(?:\/|\?|$)/,route=>route.fulfill({status:200,contentType:'application/javascript',body:runtime}));
  await page.addInitScript(()=>localStorage.setItem('cookieConsent','all'));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(!['GET','OPTIONS'].includes(route.request().method()) && !/\/auth\/(login|logout)$/.test(path)) return route.fulfill({status:409,json:{message:'Live QA blocks business and security mutations'}});
    // Read-only merchant fixtures keep the UI deterministic. Auth and POS access
    // checks continue to the real server and its existing authorization.
    if(!/\/api\/(?:auth\/|csrf-token|pos\/)/.test(path)) return route.fulfill({json:path.endsWith('/cart') ? {items:[]} : path.endsWith('unread-count') ? {count:0} : []});
    return route.continue();
  });
  try{
    await page.goto('/#/login');await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('Enter your password').fill(password);
    const response=page.waitForResponse(r=>r.url().endsWith('/auth/login') && r.request().method()==='POST',{timeout:60000});
    await page.getByRole('button',{name:/^sign in$/i}).click();expect((await response).status()).toBe(200);
    await expect(page).not.toHaveURL(/#\/login/,{timeout:60000});
    const probe=await page.request.get(`${api}/pos/capabilities`,{timeout:60000});expect(probe.status()).toBe(role==='STAFF' ? 403 : 200);
    if(role==='OWNER'){
      await page.goto('/#/admin/account');await expect(page.getByRole('heading',{name:'Account & Security',exact:true})).toBeVisible({timeout:60000});
      await page.reload();await expect(page.getByRole('heading',{name:'Account & Security',exact:true})).toBeVisible({timeout:60000});
      expect((await page.request.get(`${api}/banners/all`,{timeout:60000})).status()).toBe(200);
      expect((await page.request.get(`${api}/banners/destinations?type=all`,{timeout:60000})).status()).toBe(200);
    }else if(role==='STAFF'){
      await page.goto('/#/pos');await expect(page.getByRole('heading',{name:'POS access is not enabled'})).toBeVisible({timeout:60000});
      expect((await page.request.get(`${api}/banners/all`,{timeout:60000})).status()).toBe(403);
    }
  }finally{
    const csrf=await page.request.get(`${api}/csrf-token`,{timeout:60000});const {csrfToken}=await csrf.json();
    expect((await page.request.post(`${api}/auth/logout`,{headers:{'x-csrf-token':csrfToken},timeout:60000})).status()).toBe(200);
    expect((await page.request.get(`${api}/auth/profile`,{timeout:60000})).status()).toBe(401);
  }
});
