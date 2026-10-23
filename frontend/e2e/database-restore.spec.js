import { expect, test } from '@playwright/test';
import { superadminFixture } from './superadminFixture.js';

for (const width of [390, 1440]) test(`guarded restore confirmation and progress at ${width}px (all providers mocked)`, async ({ page }) => {
  test.setTimeout(55000);
  await page.setViewportSize({ width, height: 950 });
  const state = await superadminFixture(page);
  let job = null;
  const requests = [];
  await page.route('**/api/admin/backups/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { configured: true, restore_configured: true, restore_requires_totp: true, automatic_enabled: true, scheduler_status: 'healthy', retention_days: 14, storage: 'private', last_success: state.backups[0], restore_job: null } });
    if (url.pathname.endsWith('/restore') && route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON());
      job = { id: '00000000-0000-4000-8000-000000000003', backup_id: state.backups[0].id, status: 'queued', phase: 'queued' };
      return route.fulfill({ status: 202, json: { job } });
    }
    if (url.pathname.includes('/restores/')) return route.fulfill({ json: job });
    return route.fallback();
  });
  await page.goto('/#/superadmin/backup');
  const restore = page.getByRole('button', { name: /^Restore backup from/ }).first();
  await expect(restore).toBeEnabled(); await restore.click();
  const dialog = page.getByRole('dialog', { name: 'Restore database backup?', exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `frontend/test-results/restore-confirm-${width}.png`, fullPage: true, animations: 'disabled' });
  const submit = dialog.getByRole('button', { name: 'Restore database', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('I understand that newer database changes may be replaced.').check();
  await dialog.getByLabel('Type RESTORE', { exact: true }).fill('RESTORE');
  await dialog.getByLabel('Current Super Admin password', { exact: true }).fill('ephemeral-test-password');
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Current authenticator code', { exact: true }).fill('123456');
  await expect(submit).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await dialog.locator('.brand-dialog-panel').boundingBox();
  expect(box.width).toBeLessThanOrEqual(width);
  expect(box.height).toBeLessThanOrEqual(950);
  await submit.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Database restoration', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recovery in progress', exact: true })).toBeDisabled();
  job = { ...job, status: 'preparing', phase: 'safety_backup' };
  await expect(page.getByText('Creating safety backup...', { exact: true })).toBeVisible({ timeout: 8000 });
  if (width === 1440) {
    job = { ...job, phase: 'downloading' };
    await expect(page.getByText('Checking backup file...', { exact: true })).toBeVisible({ timeout: 8000 });
    job = { ...job, phase: 'verifying' };
    await expect(page.getByText('Checking backup file...', { exact: true })).toBeVisible({ timeout: 8000 });
  }
  job = { ...job, status: 'restoring', phase: 'restoring', destructive_started: true };
  await expect(page.getByText('Restoring database...', { exact: true })).toBeVisible({ timeout: 8000 });
  if (width === 390) {
    job = { ...job, status: 'failed', phase: 'restoring', destructive_started: true };
    await expect(page.getByRole('heading', { name: 'Recovery requires attention', exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/The system remains protected in maintenance mode/)).toBeVisible();
  } else {
    job = { ...job, status: 'validating', phase: 'validating' };
    await expect(page.getByText('Checking restored data...', { exact: true })).toBeVisible({ timeout: 8000 });
    job = { ...job, status: 'completed', phase: 'completed', restored_from: state.backups[0].created_at };
    await expect(page.getByRole('heading', { name: 'Database restored successfully', exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Refresh application', exact: true })).toBeVisible();
  }
  expect(requests).toEqual([{ acknowledgement: true, confirmation: 'RESTORE', password: 'ephemeral-test-password', totp_code: '123456' }]);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain('ephemeral-test-password');
});

test('failure before destructive work honestly reports that restoration did not change production', async ({ page }) => {
  await superadminFixture(page);
  await page.route('**/api/admin/backups/status', route => route.fulfill({ json: { configured: true, restore_configured: true, retention_days: 14, restore_job: { id: '00000000-0000-4000-8000-000000000003', status: 'failed', destructive_started: false } } }));
  await page.goto('/#/superadmin/backup');
  await expect(page.getByRole('heading', { name: 'Recovery stopped safely', exact: true })).toBeVisible();
  await expect(page.getByText('Your current database was not changed.', { exact: true })).toBeVisible();
});
