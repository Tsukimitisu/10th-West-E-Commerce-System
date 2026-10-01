import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createOptimisticMessage,
  getMessageDeliveryStatus,
  upsertChatMessage,
} from '../utils/chatMessages.js';

test('message state resolves sending, sent, delivered, seen, and failed', () => {
  assert.equal(getMessageDeliveryStatus({ client_status: 'sending' }), 'sending');
  assert.equal(getMessageDeliveryStatus({ id: 1 }), 'sent');
  assert.equal(getMessageDeliveryStatus({ delivered_at: '2026-09-22T00:00:00Z' }), 'delivered');
  assert.equal(getMessageDeliveryStatus({ is_read: true }), 'read');
  assert.equal(getMessageDeliveryStatus({ client_status: 'failed' }), 'failed');
});

test('successful acknowledgement replaces its optimistic message without duplication', () => {
  const pending = createOptimisticMessage({
    clientMessageId: 'message_test_123',
    conversationId: 4,
    sender: { id: 8, role: 'customer' },
    text: 'Do you have this part?',
  });
  const saved = {
    id: 91,
    client_message_id: 'message_test_123',
    conversation_id: 4,
    sender_id: 8,
    message_text: pending.message_text,
    status: 'sent',
    created_at: pending.created_at,
  };
  const messages = upsertChatMessage([pending], saved);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 91);
  assert.equal(getMessageDeliveryStatus(messages[0]), 'sent');
});

test('customer and staff chat render own-message statuses and retry failures', async () => {
  const [customer, staff, indicator] = await Promise.all([
    readFile(new URL('../pages/customer/Messages.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/owner/ChatView.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/chat/MessageDeliveryStatus.jsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [customer, staff]) {
    assert.match(source, /createOptimisticMessage/);
    assert.match(source, /client_status: 'sending'/);
    assert.match(source, /client_status: 'failed'/);
    assert.match(source, /message:delivered/);
    assert.match(source, /message:read/);
    assert.match(source, /<MessageDeliveryStatus/);
  }
  assert.match(customer, /mine && <MessageDeliveryStatus/);
  assert.match(staff, /mine && <MessageDeliveryStatus/);
  assert.match(indicator, /Sending…/);
  assert.match(indicator, /Sent/);
  assert.match(indicator, /Delivered/);
  assert.match(indicator, /Seen/);
  assert.match(indicator, /Failed to send/);
  assert.match(indicator, /Retry/);
});
