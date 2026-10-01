import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('notification routes sanitize database failures and share the outage contract', async () => {
  const source = await readFile(new URL('./notifications.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /json\(\{\s*message:\s*error\.message/);
  assert.match(source, /sanitizeDatabaseError\(error\)/);
  assert.match(source, /isDatabaseUnavailableError\(error\)/);
  assert.match(source, /code:\s*'DATABASE_UNAVAILABLE'/);
});
