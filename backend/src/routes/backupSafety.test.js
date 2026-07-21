import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('backup endpoint cannot create fake completed backup records', async () => {
  const source = await readFile(path.resolve(directory, 'admin.js'), 'utf8');
  const backupRoute = source.slice(
    source.indexOf("router.post('/backup'"),
    source.indexOf("router.get('/backup/history'")
  );

  assert.match(backupRoute, /status\(503\)/);
  assert.match(backupRoute, /BACKUP_PROVIDER_NOT_CONFIGURED/);
  assert.match(backupRoute, /backup\.request_blocked/);
  assert.doesNotMatch(backupRoute, /INSERT INTO backup_history/);
  assert.doesNotMatch(backupRoute, /Backup created successfully/);
});
