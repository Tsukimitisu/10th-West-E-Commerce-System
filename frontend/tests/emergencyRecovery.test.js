import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('emergency wizard uses authenticated multipart upload and existing guarded confirmation', async () => {
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  const wizard = await readFile(new URL('../components/superadmin/EmergencyRecoveryDialog.jsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../pages/superadmin/BackupRecoveryView.jsx', import.meta.url), 'utf8');
  assert.match(api, /new FormData\(\); body\.append\('backup', file\)/);
  assert.match(api, /authenticatedFetch\(`\$\{API_URL\}\/admin\/backups\/recovery-upload`/);
  assert.match(wizard, /accept="\.dump\.enc"/);
  assert.match(wizard, /selected\.size > maximum/);
  assert.match(wizard, /selected\.size === 0/);
  assert.match(wizard, /Format verified/);
  assert.match(wizard, /Continue to restore/);
  assert.doesNotMatch(wizard, /decrypt|DATABASE_URL|ENCRYPTION_KEY|SERVICE_ROLE|GITHUB_RESTORE_TOKEN|localStorage|sessionStorage/);
  assert.match(page, /setRestoreBackup\(backup\)/);
  assert.match(page, /No command-line tools are required/);
  assert.match(page, /application must first be redeployed/);
});
