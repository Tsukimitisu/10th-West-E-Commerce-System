import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chat database failures never return in-memory or REST mutation success', async () => {
  const source = await readFile(new URL('./chatController.js', import.meta.url), 'utf8');
  const runtime = source.slice(source.indexOf('export const getThreads'));
  assert.doesNotMatch(runtime, /createMemoryThread|getMemoryThread|sendMemoryMessage|supabaseRestRequest/);
  assert.match(runtime, /persistent storage is unavailable/);
  assert.match(runtime, /status\(isDatabaseConnectivityError\(error\) \? 503 : 500\)/);
});
