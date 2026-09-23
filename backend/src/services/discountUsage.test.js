import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseDiscountUsage } from './discountUsage.js';

test('discount release decrements usage once and records a lifecycle reason', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM discount_usages')) return { rows: [{ id: 4, discount_id: 9, status: 'consumed' }] };
      return { rows: [] };
    },
  };
  assert.equal(await releaseDiscountUsage(client, { orderId: 12, reason: 'Provider failed' }), true);
  assert.match(calls[2].sql, /status='released'/);
  assert.match(calls[3].sql, /GREATEST\(0,used_count-1\)/);
});

test('an already released discount is idempotent', async () => {
  let calls = 0;
  const client = {
    query: async () => {
      calls += 1;
      return { rows: [{ id: 4, discount_id: 9, status: 'released' }] };
    },
  };
  assert.equal(await releaseDiscountUsage(client, { orderId: 12, reason: 'retry' }), false);
  assert.equal(calls, 1);
});
