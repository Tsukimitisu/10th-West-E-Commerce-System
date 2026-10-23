import { expect, test } from '@playwright/test';
import { superadminFixture } from './superadminFixture.js';

for (const width of [390, 1440]) test(`downloaded backup wizard at ${width}px reuses guarded restore (providers mocked)`, async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width, height: 950 });
  const state = await superadminFixture(page);
  const backup = { id: '00000000-0000-4000-8000-000000000004', filename: '10thwest-emergency-copy.dump.enc', source: 'uploaded_recovery', status: 'completed', encrypted: true, checksum: 'c'.repeat(64), size_bytes: 128, created_at: '2026-10-19T01:00:00Z' };
  let job = null; let uploads = 0; let restores = 0;
  await page.route('**/api/admin/backups/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({ json: { configured: true, restore_configured: true, restore_requires_totp: true, recovery_upload_configured: true, recovery_upload_max_bytes: 1024, retention_days: 14, storage: 'private', last_success: state.backups[0] } });
    if (path.endsWith('/recovery-upload')) {
      uploads++; expect(req.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(req.headers()['x-csrf-token']).toBeTruthy();
      state.backups.unshift(backup); return route.fulfill({ status: 201, json: { backup } });
    }
    if (path.endsWith('/restore')) {
      restores++; expect(path).toContain(backup.id);
      expect(req.postDataJSON()).toEqual({ acknowledgement: true, confirmation: 'RESTORE', password: 'ephemeral-test-password', totp_code: '123456' });
      job = { id: '00000000-0000-4000-8000-000000000005', backup_id: backup.id, backup_source: 'uploaded_recovery', backup_filename: backup.filename, status: 'queued', phase: 'queued' };
      return route.fulfill({ status: 202, json: { job } });
    }
    if (path.includes('/restores/')) return route.fulfill({ json: job });
    return route.fallback();
  });
  await page.goto('/#/superadmin/backup');
  await page.getByRole('button', { name: 'Restore downloaded backup', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'Restore downloaded backup', exact: true });
  const input = wizard.getByLabel('Backup file', { exact: true });
  const upload = wizard.getByRole('button', { name: 'Upload and check file', exact: true });
  await input.setInputFiles({ name: 'wrong.sql', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await expect(wizard.getByRole('alert')).toContainText('.dump.enc'); await expect(upload).toBeDisabled();
  await input.setInputFiles({ name: 'too-large.dump.enc', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2048) });
  await expect(wizard.getByRole('alert')).toContainText('smaller');
  await input.setInputFiles({ name: 'empty.dump.enc', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) });
  await expect(upload).toBeDisabled();
  await input.setInputFiles({ name: backup.filename, mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from('10TWBK1'), Buffer.alloc(121)]) });
  await expect(upload).toBeEnabled(); await upload.click();
  const ready = page.getByRole('dialog', { name: 'Backup ready for recovery', exact: true });
  await expect(ready).toBeVisible(); await expect(ready.getByText('Format verified', { exact: true })).toBeVisible();
  expect(await ready.innerText()).not.toMatch(/pg_restore|Docker|GitHub|storage_key|DATABASE_URL|ENCRYPTION_KEY/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `frontend/test-results/emergency-ready-${width}.png`, fullPage: true, animations: 'disabled' });
  await ready.getByRole('button', { name: 'Continue to restore', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Restore database backup?', exact: true });
  const restore = confirmation.getByRole('button', { name: 'Restore database', exact: true });
  await expect(restore).toBeDisabled();
  await expect(confirmation.getByText('The original backup date has not been verified.', { exact: true })).toBeVisible();
  await confirmation.getByLabel('I understand that newer database changes may be replaced.').check();
  await confirmation.getByLabel('Type RESTORE', { exact: true }).fill('RESTORE');
  await expect(restore).toBeDisabled();
  await confirmation.getByLabel('Current Super Admin password', { exact: true }).fill('ephemeral-test-password');
  await expect(restore).toBeDisabled();
  await confirmation.getByLabel('Current authenticator code', { exact: true }).fill('123456');
  await restore.click();
  await expect(page.getByRole('heading', { name: 'Database restoration', exact: true })).toBeVisible();
  job = { ...job, status: 'preparing', phase: 'safety_backup' };
  await expect(page.getByText('Creating safety backup...', { exact: true })).toBeVisible({ timeout: 8000 });
  job = { ...job, status: 'completed', phase: 'completed' };
  await expect(page.getByRole('heading', { name: 'Database restored successfully', exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Your system has been recovered from the selected backup.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh application', exact: true })).toBeVisible();
  expect(uploads).toBe(1); expect(restores).toBe(1);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain('ephemeral-test-password');
});
