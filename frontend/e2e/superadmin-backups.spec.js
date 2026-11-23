import { expect, test } from '@playwright/test';
import { superadminFixture } from './superadminFixture.js';
import { staffFixture, staffPermissions } from './staffPhaseFixture.js';
import { ownerFixture } from './ownerPhaseFixture.js';
import { customerFixture } from './customerPhaseFixture.js';

const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
test('Super Admin deep link survives staggered session restoration', async ({ page }) => {
  await superadminFixture(page, { profileDelays: [1, 1000] });
  await page.goto('/#/superadmin/security');
  await expect(page.getByRole('heading', { name: 'Security controls', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/superadmin\/security/);
});
for (const width of [390, 768, 1440]) test(`Super Admin shell and accessible shared tabs at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await superadminFixture(page);
  await page.goto('/#/superadmin/security');
  await expect(page.getByRole('heading', { name: 'Security controls', exact: true })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Security category' });
  await tabs.getByRole('tab', { name: 'Account Lockout' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Password Rules' })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: 'Password Rules' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Suspicious Activity' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await tabs.getByRole('tab', { name: 'Two-Factor Auth' }).hover();
  await expect(tabs.getByRole('tab', { name: 'Two-Factor Auth' })).toHaveCSS('background-color', 'rgb(243, 244, 246)');
  await expect(tabs.getByRole('tab', { name: 'Account Lockout' })).toHaveCSS('background-color', 'rgb(255, 245, 237)');
  await noOverflow(page);
  await page.screenshot({ path: `test-results/superadmin-security-${width}.png`, fullPage: true });
  if (width < 1024) await page.getByLabel('Open navigation', { exact: true }).click();
  const sidebar = page.locator('.system-sidebar').filter({ visible: true });
  await expect(sidebar).toHaveCSS('background-color', 'rgb(9, 11, 15)');
  await expect(sidebar.getByText('System admin', { exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Configuration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'System configuration' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tax Rates' }).click();
  await expect(page.getByRole('tab', { name: 'Tax Rates' })).toHaveCSS('background-color', 'rgb(255, 245, 237)');
  await noOverflow(page);
  await page.screenshot({ path: `test-results/superadmin-config-${width}.png`, fullPage: true });
  await page.goto('/#/superadmin/backup');
  await expect(page.getByRole('heading', { name: 'Backup & recovery' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create backup', exact: true })).toBeEnabled();
  await noOverflow(page);
  await page.screenshot({ path: `test-results/superadmin-backup-${width}.png`, fullPage: true });
  if (width < 1024) await page.getByLabel('Open navigation', { exact: true }).click();
  const visibleSidebar = page.locator('.system-sidebar').filter({ visible: true });
  await visibleSidebar.getByRole('button', { name: 'Sign out', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Sign out?', exact: true });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(visibleSidebar.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
});

test('Security and Configuration values persist after saves and refresh; failures stay visible', async ({ page }) => {
  const state = await superadminFixture(page);
  await page.goto('/#/superadmin/security');
  await page.getByLabel('Max Login Attempts', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  expect(state.settings.security.max_login_attempts).toBe('7');
  await page.reload();
  await expect(page.getByLabel('Max Login Attempts', { exact: true })).toHaveValue('7');
  await page.getByRole('tab', { name: 'Password Rules' }).click();
  await page.getByLabel('Minimum Password Length', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  state.failSave = true;
  await page.getByRole('tab', { name: 'Two-Factor Auth' }).click();
  await page.getByRole('radio').last().check();
  await page.getByRole('button', { name: /Saved|Save settings/, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Settings could not be saved');
  state.failSave = false;
  await page.goto('/#/superadmin/settings');
  await page.getByLabel('Store Name', { exact: true }).fill('Isolated Test Store');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Store Name', { exact: true })).toHaveValue('Isolated Test Store');
  await page.getByRole('tab', { name: 'Shipping', exact: true }).click();
  await page.getByLabel(/Standard Flat Rate/).fill('-1');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('manual backup confirms, reports progress, completes, downloads, deletes with confirmation and reports failures', async ({ page }) => {
  test.setTimeout(45000);
  const state = await superadminFixture(page);
  await page.goto('/#/superadmin/backup');
  await page.getByRole('button', { name: 'Create backup', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create database backup?' }).getByRole('button', { name: 'Create backup', exact: true }).click();
  await expect(page.getByText('Preparing backup...', { exact: true })).toBeVisible();
  await expect(page.getByText('Backup completed successfully.', { exact: true })).toBeVisible({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download backup from/ }).first().click();
  expect((await download).suggestedFilename()).toBe('private.dump.enc');
  await page.getByRole('button', { name: /Delete backup from/ }).last().click();
  await page.getByRole('dialog', { name: 'Delete database backup?' }).getByRole('button', { name: 'Delete backup', exact: true }).click();
  await expect(page.getByText('Backup deleted.', { exact: true })).toBeVisible();
  expect(state.backups.some(row => row.deleted_at)).toBe(true);
  state.failBackup = true;
  await page.getByRole('button', { name: 'Create backup', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create database backup?' }).getByRole('button', { name: 'Create backup', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Backup failed. Check system logs.', { timeout: 15000 });
});

test('existing Super Admin views remain reachable without mutating operations', async ({ page }) => {
  const state = await superadminFixture(page);
  for (const route of ['dashboard','users','monitoring','maintenance','audit-logs','inventory/product-items']) {
    await page.goto(`/#/superadmin/${route}`);
    await expect(page.locator('.operations-shell[data-workspace="system"]')).toBeVisible();
    await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  }
  expect(state.writes).toHaveLength(0);
});

test('a rejected backup request closes confirmation and exposes the safe error', async ({ page }) => {
  const state = await superadminFixture(page);
  state.failRequest = true;
  await page.goto('/#/superadmin/backup');
  await page.getByRole('button', { name: 'Create backup', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create database backup?' }).getByRole('button', { name: 'Create backup', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Backup already in progress.');
});

test('small Customer, Staff and Owner regression smoke preserves their framing', async ({ browser, baseURL }) => {
  for (const role of ['customer','staff','owner']) {
    const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1000 } });
    if (role === 'customer') {
      await customerFixture(page, { authenticated: true });
      await page.goto('/#/'); await expect(page.locator('.storefront-header')).toBeVisible();
      await page.goto('/#/profile'); await expect(page.getByRole('navigation', { name: 'Account navigation' })).toBeVisible();
    } else {
      await (role === 'staff' ? staffFixture : ownerFixture)(page, { permissions: [...staffPermissions, 'pos.access'] });
      await page.goto(`/#/${role === 'staff' ? 'staff' : 'admin'}/dashboard`);
      await expect(page.locator(`.${role}-sidebar`)).toHaveCSS('background-color', 'rgb(9, 11, 15)');
      if (role === 'owner') { await page.goto('/#/pos'); await expect(page.locator('.pos-header')).toHaveCSS('background-color', 'rgb(9, 11, 15)'); }
    }
    await noOverflow(page);
    await page.close();
  }
});
