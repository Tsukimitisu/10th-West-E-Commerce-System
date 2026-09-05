import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderWorkflowNotification } from './notifications.js';

test('order workflow notification persists an exact order link', async () => {
  let params;
  const db = { query: async (_sql, values) => {
    params = values;
    return { rows: [{ id: 1, user_id: values[0], metadata: JSON.parse(values[7]) }] };
  } };
  const result = await createOrderWorkflowNotification(db, {
    userId: 4, orderId: 99, status: 'shipped', title: 'Shipment update',
  });
  assert.equal(result.metadata.link, '/orders/99');
  assert.equal(params[4], 99);
  assert.equal(params[5], 'order');
});
