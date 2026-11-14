import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('restore uses authenticated POST and keeps privileged credentials out of storage and URLs', async () => {
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  const modal = await readFile(new URL('../components/superadmin/RestoreDatabaseDialog.jsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../pages/superadmin/BackupRecoveryView.jsx', import.meta.url), 'utf8');
  assert.match(api, /requestDatabaseRestore[^\n]+authenticatedFetch[^\n]+method: 'POST'/);
  assert.match(modal, /confirmation === 'RESTORE'/);
  assert.match(modal, /acknowledgement && confirmation/);
  assert.match(modal, /password\.length > 0/);
  assert.match(modal, /requiresTotp/);
  assert.match(modal, /disabled={!valid \|\| busy}/);
  assert.doesNotMatch(modal, /sessionStorage|localStorage|GITHUB_RESTORE_TOKEN|DATABASE_URL/);
  assert.match(page, /row\.status === 'completed' && row\.encrypted === true && !row\.deleted_at/);
  assert.match(page, /setInterval\(load, 5000\)/);
  assert.match(page, /Creating safety backup/);
  assert.match(page, /destructive_started/);
});
