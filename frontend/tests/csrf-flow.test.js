import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('frontend CSRF flow uses credentialed requests, the expected header, and one retry branch', async () => {
  const source = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  assert.match(source, /fetch\(`\$\{API_URL\}\/csrf-token`,\s*\{[\s\S]*?credentials:\s*'include'/);
  assert.match(source, /headers\['x-csrf-token'\]\s*=\s*csrfToken/);
  assert.match(source, /isCsrfFailure\(response\.status, responseBody\)[\s\S]*?forceRefresh:\s*true/);
  assert.match(source, /const retryResult\s*=\s*await executeRequest\(retryHeaders\)/);
  assert.match(source, /await refreshCsrfAfterSessionRotation\(\)/);
});
