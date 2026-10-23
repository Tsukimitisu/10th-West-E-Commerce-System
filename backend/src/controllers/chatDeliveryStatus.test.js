import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('saved chat messages expose sent, delivered, and read states', async () => {
  const source = await read('./productChatController.js');
  assert.match(source, /const deliveryStatus = isRead \? 'read' : row\.delivered_at \? 'delivered' : 'sent'/);
  assert.match(source, /status: deliveryStatus/);
  assert.match(source, /delivery_status: deliveryStatus/);
  assert.match(source, /delivered_at: row\.delivered_at \|\| null/);
  assert.match(source, /res\.status\(creation\.created \? 201 : 200\)\.json\(\{ message: messagePayload/);
});

test('authorized conversation fetch marks only incoming messages delivered', async () => {
  const source = await read('./productChatController.js');
  const start = source.indexOf('export const getConversationMessages');
  const end = source.indexOf('export const getSellerConversation', start);
  const handler = source.slice(start, end);
  assert.ok(handler.indexOf('canAccessConversation') < handler.indexOf('markIncomingMessagesDelivered'));
  assert.match(source, /sender_id <> \$2/);
  assert.match(source, /emitConversationDelivered/);
  assert.match(source, /message_ids: delivered\.rows\.map/);
});

test('read updates imply delivery and remain participant-authorized', async () => {
  const [controller, buyerRoutes, sellerRoutes] = await Promise.all([
    read('./productChatController.js'),
    read('../routes/chats.js'),
    read('../routes/sellerChats.js'),
  ]);
  const start = controller.indexOf('export const markConversationRead');
  const end = controller.indexOf('export const archiveSellerConversation', start);
  const handler = controller.slice(start, end);
  assert.ok(handler.indexOf('canAccessConversation') < handler.indexOf('UPDATE chat_messages'));
  assert.match(handler, /delivered_at = COALESCE\(delivered_at, CURRENT_TIMESTAMP\)/);
  assert.match(handler, /read_at = COALESCE\(read_at, CURRENT_TIMESTAMP\)/);
  assert.match(buyerRoutes, /router\.use\(authenticateToken\)/);
  assert.match(sellerRoutes, /requirePermission\('chat\.reply'\), markConversationRead/);
});

test('client message ids make retries idempotent', async () => {
  const source = await read('./productChatController.js');
  assert.match(source, /CLIENT_MESSAGE_ID_PATTERN/);
  assert.match(source, /ON CONFLICT \(thread_id, sender_id, client_message_id\)/);
  assert.match(source, /return \{ message: existing\.rows\[0\], created: false \}/);
  assert.match(source, /if \(creation\.created\) await notifyRecipient/);
});
