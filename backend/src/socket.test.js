import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool from './config/database.js';
import { __testing } from './socket.js';

after(async () => {
  await pool.end().catch(() => {});
});

test('order socket payload is normalized for customer and staff clients', () => {
  const payload = __testing.normalizeOrderUpdatePayload(
    { id: 42, user_id: 7, status: 'paid', payment_status: 'paid', updated_at: '2026-06-26T00:00:00.000Z' },
    { previous_status: 'payment_pending', shipment_status: 'booked', timeline_event: { source: 'payment' } },
  );

  assert.deepEqual(payload, {
    id: 42,
    order_id: 42,
    user_id: 7,
    status: 'paid',
    previous_status: 'payment_pending',
    payment_status: 'paid',
    shipment_status: 'booked',
    updated_at: '2026-06-26T00:00:00.000Z',
    timeline_event: { source: 'payment' },
  });
});
