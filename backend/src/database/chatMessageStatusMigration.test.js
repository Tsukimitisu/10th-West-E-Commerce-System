import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('chat delivery migration is additive, idempotent, and retry-safe', async () => {
  const source = await readFile(
    new URL('../../migrations/202609220001_chat_message_delivery_status.cjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /hasColumn\('chat_messages', 'delivered_at'\)/);
  assert.match(source, /hasColumn\('chat_messages', 'client_message_id'\)/);
  assert.match(source, /COALESCE\(delivered_at, read_at, seen_at\)/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_message_id/);
  assert.match(source, /WHERE client_message_id IS NOT NULL/);
  assert.match(source, /exports\.down/);
});
