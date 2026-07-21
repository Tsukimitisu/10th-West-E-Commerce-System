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

test('product chat serializes concurrent message metadata updates per thread', async () => {
  const source = await readFile(new URL('./productChatController.js', import.meta.url), 'utf8');
  const start = source.indexOf('export const sendConversationMessage');
  const end = source.indexOf('export const markConversationRead', start);
  const handler = source.slice(start, end);
  const lockIndex = handler.indexOf('FOR UPDATE');
  const insertIndex = handler.indexOf('createChatMessage');

  assert.ok(lockIndex >= 0, 'The message handler must lock the conversation row.');
  assert.ok(insertIndex > lockIndex, 'The conversation lock must be acquired before inserting a message.');
});
