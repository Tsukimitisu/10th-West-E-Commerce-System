import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownerFixture } from './ownerPhaseFixture.js';

const pass=process.env.OWNER_QA_PASS;
test.skip(!pass,'Explicit bounded Owner screenshot pass only. All merchant APIs are intercepted.');
const root=path.resolve('..','qa','owner-phase',`pass-${pass || 'unset'}`);
const routes=['dashboard','inventory','orders','reports','promotions','hero-carousel','reviews','customers','returns','content','account','notifications','chat'];

for(const width of [1440,390]) test(`Owner visual pass ${pass} at ${width}px`,async({page})=>{
  test.setTimeout(180000);
  await fs.mkdir(root,{recursive:true});
  await page.setViewportSize({width,height:width===1440 ? 1000 : 844});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const state=await ownerFixture(page);
  const checks=[];
  const capture=async(name,axe=false)=>{
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(['dashboard','reports'].includes(name) ? 1800 : 350);
    const layout=await page.evaluate(()=>({pageWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,mainWidth:document.querySelector('main')?.clientWidth,mainScrollWidth:document.querySelector('main')?.scrollWidth}));
    const file=path.join(root,`${name}-${width}.png`);
    await page.screenshot({path:file,animations:'disabled',fullPage:true});
    let violations=[];
    if(axe){
      await page.addScriptTag({path:path.resolve('..','qa','rebrand','axe.min.js')});
      violations=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(row=>({id:row.id,impact:row.impact,nodes:row.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}));});
    }
    checks.push({name,width,...layout,violations});
  };
  for(const route of routes){
    await page.goto(`/#/admin/${route}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('[aria-label="Loading operations dashboard"]')).toHaveCount(0);
    if(route==='hero-carousel') await expect(page.getByRole('region',{name:'Hero slide records',includeHidden:true})).toHaveCount(1);
    if(route==='account') await expect(page.getByRole('heading',{name:'Account & Security',exact:true})).toBeVisible();
    if(route==='notifications') await expect(page.getByRole('heading',{name:'Owner notifications',exact:true})).toBeVisible();
    if(route==='reviews') await expect(page.getByText('Jamie Rider',{exact:true})).toBeVisible();
    await capture(route,['hero-carousel','reviews','account'].includes(route));
    if(route==='account'){
      await page.locator('#owner-security').scrollIntoViewIfNeeded();await capture('account-security',true);
    }
    if(route==='inventory' && width===390){
      await page.locator('main').evaluate(el=>{el.scrollTop=650;});await capture('inventory-records');
    }
    if(route==='hero-carousel'){
      await page.getByRole('button',{name:'Add slide',exact:true}).click();
      const editor=page.getByRole('dialog',{name:'Create hero slide',exact:true});
      await editor.getByLabel('Title',{exact:true}).fill('Motul oil weekend sale');
      await editor.getByLabel('Existing image URL',{exact:true}).fill('/brand/ride-detail.webp');
      await editor.getByRole('combobox',{name:'Destination type',exact:true}).selectOption('product');
      await expect(editor.getByRole('button',{name:/Front Brake Pad Set/})).toBeVisible();
      await capture('carousel-editor',true);
      await editor.getByRole('button',{name:'Create slide',exact:true}).scrollIntoViewIfNeeded();
      await capture('carousel-editor-destination',true);
      await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    }
  }
  await page.goto('/#/pos');
  await expect(page.getByRole('heading',{name:'Point of Sale',exact:true})).toBeVisible();
  await capture('pos');
  await page.goto('/#/admin/dashboard');
  if(width<1024){await page.getByLabel('Open navigation',{exact:true}).click();await capture('navigation-drawer',true);}
  const source=width<1024 ? page.getByRole('dialog',{name:'Workspace navigation'}) : page.locator('.ops-desktop-sidebar');
  await source.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Sign out?',exact:true})).toBeVisible();
  await capture('sign-out',true); await page.keyboard.press('Escape');
  state.user=null; await page.goto('/#/'); await page.reload();
  await expect(page.getByRole('heading',{name:'Maintenance essentials',exact:true})).toBeVisible();
  await capture('customer-home-integration');
  await fs.writeFile(path.join(root,`checks-${width}.json`),JSON.stringify({checks,errors},null,2));
  expect(errors).toEqual([]);
  for(const check of checks) expect(check.scrollWidth,check.name).toBeLessThanOrEqual(width+1);
});

test('Owner representative layout at intermediate widths',async({page})=>{
  test.setTimeout(180000); await ownerFixture(page); const checks=[];
  for(const width of [430,768,1024,1280]){
    await page.setViewportSize({width,height:900});
    for(const route of routes){
      await page.goto(`/#/admin/${route}`);await expect(page.locator('main h1').first()).toBeVisible();
      if(route==='account') await expect(page.getByRole('heading',{name:'Account & Security',exact:true})).toBeVisible();
      if(route==='notifications') await expect(page.getByRole('heading',{name:'Owner notifications',exact:true})).toBeVisible();
      const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);checks.push({width,route,scrollWidth});expect(scrollWidth).toBeLessThanOrEqual(width+1);
    }
    await page.goto('/#/admin/hero-carousel');await page.getByRole('button',{name:'Add slide',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Create hero slide',exact:true});await expect(dialog).toBeVisible();
    const box=await dialog.locator('.brand-dialog-panel').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
    await page.keyboard.press('Escape');
  }
  await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'intermediate-layouts.json'),JSON.stringify(checks,null,2));
});
