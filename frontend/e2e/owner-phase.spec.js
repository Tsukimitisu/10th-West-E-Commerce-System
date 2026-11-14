import { test, expect } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { ownerFixture } from './ownerPhaseFixture.js';

test('Owner account stays inside the Owner portal', async ({ page }) => {
  await staffFixture(page, { user: { role: 'owner' } });
  await page.goto('/#/admin/dashboard');
  await page.getByLabel('Open profile menu').click();
  await page.getByRole('link', { name: 'Account & security' }).click();
  await expect(page).toHaveURL(/#\/admin\/account/);
  await expect(page.locator('.operations-shell[data-workspace="owner"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account & Security', exact: true })).toBeVisible();
});

test('Owner phone sign-out is centered', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await staffFixture(page, { user: { role: 'owner' } });
  await page.goto('/#/admin/dashboard');
  await page.getByLabel('Open navigation', { exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace navigation' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign out?', exact: true });
  const box = await dialog.locator('.brand-dialog-panel').boundingBox();
  expect(Math.abs(box.y + box.height / 2 - 422)).toBeLessThan(3);
});

test('old banner route redirects to one Hero Carousel management experience', async ({ page }) => {
  await ownerFixture(page);
  await page.goto('/#/admin/banners');
  await expect(page).toHaveURL(/#\/admin\/hero-carousel$/);
  await expect(page.getByRole('heading', { name:'Hero Carousel',exact:true })).toBeVisible();
  const mobile=page.viewportSize().width<1024;
  if(mobile) await page.getByLabel('Open navigation',{exact:true}).click();
  const nav=mobile ? page.getByRole('dialog',{name:'Workspace navigation'}) : page.locator('.ops-desktop-sidebar');
  await expect(nav.getByRole('button', { name:'Hero Carousel',exact:true })).toHaveCount(1);
  await expect(nav.getByText('Banners',{exact:true})).toHaveCount(0);
});

test('Owner creates a product-linked slide consumed by the frozen customer hero', async ({ page }) => {
  const state=await ownerFixture(page,{ slides:[] });
  await page.goto('/#/admin/hero-carousel');
  await page.getByRole('button',{ name:'Add slide',exact:true }).click();
  const editor=page.getByRole('dialog',{ name:'Create hero slide',exact:true });
  await editor.getByLabel('Title',{exact:true}).fill('Brake parts for your next service');
  await editor.getByLabel('Existing image URL',{exact:true}).fill('/brand/ride-detail.webp');
  await editor.getByRole('combobox',{name:'Destination type',exact:true}).selectOption('product');
  await editor.getByLabel('Find a storefront product',{exact:true}).fill('BRK-H125');
  await editor.getByRole('button',{ name:/Front Brake Pad Set/ }).click();
  await editor.getByLabel('CTA label',{exact:true}).fill('Shop brake pads');
  await editor.getByRole('button',{name:'Create slide',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(state.slides[0].link_url).toBe('/products/98001');
  state.user=null;
  await page.goto('/#/'); await page.reload();
  await expect(page.getByRole('heading',{ name:'Brake parts for your next service',exact:true })).toBeVisible();
  await page.getByRole('link',{name:'Shop brake pads',exact:true}).click();
  await expect(page).toHaveURL(/#\/products\/98001/);
});

test('promotion linking retains commercial rules and opens useful Shop terms', async ({ page }) => {
  const state=await ownerFixture(page,{ slides:[] });
  await page.goto('/#/admin/hero-carousel');
  await page.getByRole('button',{name:'Add slide',exact:true}).click();
  const editor=page.getByRole('dialog',{ name:'Create hero slide',exact:true });
  await editor.getByLabel('Title',{exact:true}).fill('Weekend oil sale');
  await editor.getByRole('combobox',{name:'Destination type',exact:true}).selectOption('promotion');
  await editor.getByRole('combobox',{name:'Promotion campaign',exact:true}).selectOption('51');
  await expect(editor.getByText(/applies to the order subtotal/)).toBeVisible();
  await editor.getByLabel('CTA label',{exact:true}).fill('Shop the sale');
  await editor.getByRole('button',{name:'Create slide',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(state.slides[0].link_url).toBe('/shop?promotion=51');
  state.user=null; await page.goto('/#/'); await page.reload();
  await page.getByRole('link',{name:'Shop the sale',exact:true}).click();
  await expect(page).toHaveURL(/#\/shop\?promotion=51/);
  await expect(page.getByText('WEEKENDOIL',{exact:false}).first()).toBeVisible();
});

test('Owner edits schedule, display order and informational no-link slide', async ({ page }) => {
  const state=await ownerFixture(page);
  await page.goto('/#/admin/hero-carousel');
  await page.getByRole('button',{name:'Edit slide Maintenance essentials',exact:true}).filter({visible:true}).click();
  const editor=page.getByRole('dialog',{name:'Edit hero slide',exact:true});
  await editor.getByRole('combobox',{name:'Destination type',exact:true}).selectOption('none');
  await editor.getByRole('spinbutton',{name:/^Display order/}).fill('0');
  await editor.getByLabel('Start date/time',{exact:true}).fill('2099-10-20T10:00');
  await editor.getByLabel('End date/time',{exact:true}).fill('2099-10-22T10:00');
  await editor.getByRole('button',{name:'Save slide',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(state.slides[0].link_url).toBe(''); expect(state.slides[0].display_order).toBe(0);
  await expect(page.getByText('Scheduled',{exact:true}).filter({visible:true})).toBeVisible();
});

test('invalid image and unsafe destination are surfaced without saving', async ({ page }) => {
  const state=await ownerFixture(page,{slides:[]});
  await page.goto('/#/admin/hero-carousel'); await page.getByRole('button',{name:'Add slide',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Create hero slide',exact:true});
  await editor.getByLabel('Title',{exact:true}).fill('Information');
  await editor.getByLabel('Existing image URL',{exact:true}).fill('data:image/svg+xml,unsafe');
  await editor.getByRole('button',{name:'Create slide',exact:true}).click();
  await expect(editor.getByRole('alert')).toContainText('valid image URL');
  expect(state.slides).toHaveLength(0);
  await editor.getByLabel('Existing image URL',{exact:true}).fill('');
  await editor.getByLabel(/^Slide image/).setInputFiles({name:'not-an-image.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
  await expect(editor.getByRole('alert').first()).toContainText('no larger than 5 MB');
  expect(state.slides).toHaveLength(0);
});

test('carousel management error and empty states recover', async ({ page }) => {
  const state=await ownerFixture(page,{slides:[],failures:['/banners/all']});
  await page.goto('/#/admin/hero-carousel');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  state.failures=[]; await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No hero slides yet'})).toBeVisible();
});

test('product picker feedback follows initial, searched and restored result sets',async({page})=>{
  await ownerFixture(page);
  await page.route('**/api/banners/destinations?**',route=>{
    const search=new URL(route.request().url()).searchParams.get('search');
    const products=Array.from({length:search ? 1 : 25},(_,index)=>({id:index+1,name:`Brake service part ${index+1}`,part_number:`BRK-${index+1}`,motorcycle_model:'Click 125',price:650,image:'/images/product-fallback.svg'}));
    return route.fulfill({json:{products,hasMoreProducts:!search}});
  });
  await page.goto('/#/admin/hero-carousel');await page.getByRole('button',{name:'Add slide',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Create hero slide',exact:true});
  await editor.getByRole('combobox',{name:'Destination type',exact:true}).selectOption('product');
  await expect(editor.getByText('Showing the first 25 matches. Refine your search.',{exact:true})).toBeVisible();
  const search=editor.getByLabel('Find a storefront product',{exact:true});await search.fill('BRK-1');
  await expect(editor.getByText('Only active storefront listings can be selected.',{exact:true})).toBeVisible();
  await search.fill('');await expect(editor.getByText('Showing the first 25 matches. Refine your search.',{exact:true})).toBeVisible();
});

test('Owner reviews retain buyer context, real verification and moderation', async ({ page }) => {
  const state=await ownerFixture(page);
  await page.goto('/#/admin/reviews');
  await expect(page.getByRole('heading',{name:'Reviews',exact:true})).toBeVisible();
  await expect(page.getByText('Verified purchase',{exact:true})).toBeVisible();
  await expect(page.getByText('Jamie Rider',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  expect(state.reviews[0].review_status).toBe('approved');
  await expect(page.getByRole('heading',{name:'No reviews in this view'})).toBeVisible();
  await page.getByLabel('Review status',{exact:true}).selectOption('approved');
  await expect(page.getByText('Jamie Rider',{exact:true})).toBeVisible();
  await page.getByPlaceholder('Search product, buyer or review').fill('nothing matches');
  await expect(page.getByRole('heading',{name:'No reviews in this view'})).toBeVisible();
});

test('Owner reviews errors offer a safe retry', async ({ page }) => {
  const state=await ownerFixture(page,{failures:['/reviews/moderation']});
  await page.goto('/#/admin/reviews'); await expect(page.getByRole('alert')).toBeVisible();
  state.failures=[]; await page.getByRole('button',{name:'Retry reviews'}).click();
  await expect(page.getByText('Jamie Rider',{exact:true})).toBeVisible();
});

test('Owner profile and existing security APIs work inside the portal across refresh', async ({ page }) => {
  const state=await ownerFixture(page);
  await page.goto('/#/admin/account'); await page.reload();
  await expect(page.getByRole('heading',{name:'Account & Security',exact:true})).toBeVisible();
  await page.getByLabel('Full name',{exact:true}).fill('Morgan Shop Owner');
  await page.getByRole('button',{name:'Save account',exact:true}).click();
  await expect.poll(() => state.user.name).toBe('Morgan Shop Owner');
  await page.getByLabel('Current password',{exact:true}).fill('FixtureOnly!23');
  await page.getByLabel('New password',{exact:true}).fill('FixtureOnly!456');
  await page.getByLabel('Confirm new password',{exact:true}).fill('FixtureOnly!456');
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await expect(page.getByText('Your password has been changed.',{exact:true})).toBeVisible();
  await page.getByLabel('Confirm your password',{exact:true}).fill('FixtureOnly!23');
  await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();
  await page.getByLabel('Authenticator code',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'Verify & enable',exact:true}).click();
  await expect.poll(() => state.user.two_factor_enabled).toBe(true);
  await expect(page.locator('.customer-account-nav')).toHaveCount(0);
});

for (const role of ['customer','store_staff',null]) test(`Owner account denies ${role || 'unauthenticated'} access`, async ({page}) => {
  await staffFixture(page,{loggedOut:!role,user:role ? {role} : {}});
  await page.goto('/#/admin/account');
  await expect(page).not.toHaveURL(/#\/admin\/account$/);
  await expect(page.getByRole('heading',{name:'Account & Security',exact:true})).toHaveCount(0);
});

for (const width of [390,430,768,1024,1280,1440]) test(`Owner sign-out centered with focus and scroll safety at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900}); const state=await ownerFixture(page);
  await page.goto('/#/admin/dashboard');
  if(width<1024) await page.getByLabel('Open navigation',{exact:true}).click();
  const trigger=(width<1024 ? page.getByRole('dialog',{name:'Workspace navigation'}) : page.locator('.ops-desktop-sidebar')).getByRole('button',{name:'Sign out',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Sign out?',exact:true});
  await expect(dialog).toBeVisible();
  const box=await dialog.locator('.brand-dialog-panel').boundingBox();
  expect(Math.abs(box.y+box.height/2-450)).toBeLessThan(3); expect(Math.abs(box.x+box.width/2-width/2)).toBeLessThan(3);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await dialog.getByRole('button',{name:'Sign out',exact:true}).focus(); await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('button',{name:'Cancel',exact:true}).click(); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page).toHaveURL(/#\/login/); expect(state.user).toBeNull();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
