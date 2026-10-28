import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { customerFixture,fixtureCart } from './customerPhaseFixture.js';

test.beforeEach(async({page})=>{
  const body=await fs.readFile(process.env.E2E_TAILWIND_SCRIPT || '../qa/staff-phase/tailwind-runtime.js');
  await page.route(/^https:\/\/cdn\.tailwindcss\.com(?:\/|\?|$)/,route=>route.fulfill({status:200,contentType:'application/javascript',body}));
});
const badge=(page,n)=>page.getByRole('button',{name:`Open cart, ${n} items`,exact:true});
const add=page=>page.locator('.product-card').first().getByRole('button',{name:/add to cart/i});

test('frozen Customer hero and global navigation remain intact',async({page})=>{
  await customerFixture(page);await page.goto('/#/');
  const hero=page.getByRole('region',{name:'10th West store highlights'});
  await expect(hero.getByRole('heading',{level:1})).toHaveText('Maintenance essentials');
  await hero.getByRole('button',{name:'Next slide',exact:true}).click();
  await expect(hero.getByRole('heading',{level:1})).toHaveText('Parts for your Click 125');
  await expect(hero.locator('input[type="search"]')).toHaveCount(0);
  await expect(page.locator('header').first()).toBeVisible();
});
test('frozen guest cart persists and refreshes authoritative product data',async({page})=>{
  const state=await customerFixture(page);await page.goto('/#/shop');await add(page).click();await expect(badge(page,1)).toBeVisible();
  await page.goto('/#/cart');const row=page.getByTestId('cart-row-98001');await row.getByRole('button',{name:/increase/i}).click();
  await expect(badge(page,2)).toBeVisible();await page.reload();await expect(badge(page,2)).toBeVisible();
  state.product.price=650;state.product.stock_quantity=1;await page.reload();await expect(row).toContainText('650.00');
  await row.getByRole('button',{name:/remove/i}).click();await expect(badge(page,0)).toBeVisible();
});
test('frozen guest merge and checkout return survive Owner integration',async({page})=>{
  const state=await customerFixture(page,{accountCart:fixtureCart(7)});await page.goto('/#/shop');await add(page).click();
  await expect(badge(page,1)).toBeVisible();await page.goto('/#/cart');await page.getByRole('button',{name:/checkout/i}).first().click();
  await page.getByRole('dialog').getByRole('button',{name:/sign in/i}).click();
  await page.getByPlaceholder('name@example.com').fill('rider@example.test');await page.getByPlaceholder('Enter your password').fill('fixture-password');
  await page.getByRole('button',{name:/^sign in$/i}).click();await expect(page).toHaveURL(/#\/checkout/);await expect(badge(page,8)).toBeVisible();
  expect(state.cart).toHaveLength(1);expect(state.writes.filter(call=>call.path==='/cart/add')).toHaveLength(1);
});
for(const width of [1440,390]) test(`frozen Customer account and auth chrome at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const state=await customerFixture(page,{authenticated:true});
  await page.goto('/#/profile');await expect(page.locator('.operations-sidebar')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Account navigation'})).toBeVisible();
  await expect(page.locator('header').first()).toBeVisible();
  state.user=null;await page.reload();await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByRole('link',{name:/back to store/i})).toBeVisible();
  await page.goto('/#/register');await expect(page.getByRole('link',{name:/back to store/i})).toBeVisible();
});
