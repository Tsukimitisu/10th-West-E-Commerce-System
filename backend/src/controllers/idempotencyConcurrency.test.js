import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile } from 'node:fs/promises';
import pool from '../config/database.js';
import { __testing as checkoutTesting } from './secureCheckoutController.js';
import { __testing as posTesting } from './posController.js';

after(async () => {
  await pool.end().catch(() => {});
});

const scriptedClient = (responses) => {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response || { rows: [] };
    },
  };
};

test('checkout idempotency claim is atomic and replays completed same-payload requests', async () => {
  const claimedClient = scriptedClient([{ rows: [{ id: 1, request_hash: 'hash-a', status: 'processing' }] }]);
  const claimed = await checkoutTesting.claimCheckoutIdempotencyKey(claimedClient, {
    userId: 7,
    key: 'checkout-race-key',
    requestHash: 'hash-a',
  });
  assert.equal(claimed.claimed, true);
  assert.match(claimedClient.calls[0].sql, /INSERT INTO idempotency_keys/);
  assert.match(claimedClient.calls[0].sql, /ON CONFLICT \(user_id, scope, key\) DO NOTHING/);

  const replayClient = scriptedClient([
    { rows: [] },
    { rows: [{ id: 1, request_hash: 'hash-a', status: 'completed', response_status: 201, response_body: { order_id: 10 } }] },
  ]);
  const replay = await checkoutTesting.claimCheckoutIdempotencyKey(replayClient, {
    userId: 7,
    key: 'checkout-race-key',
    requestHash: 'hash-a',
  });
  assert.equal(replay.claimed, false);
  assert.equal(replay.row.response_body.order_id, 10);
  assert.match(replayClient.calls[1].sql, /FOR UPDATE/);
});

test('checkout idempotency rejects different payloads and in-progress duplicate races cleanly', async () => {
  const conflictClient = scriptedClient([
    { rows: [] },
    { rows: [{ id: 1, request_hash: 'hash-a', status: 'completed' }] },
  ]);
  await assert.rejects(
    () => checkoutTesting.claimCheckoutIdempotencyKey(conflictClient, {
      userId: 7,
      key: 'checkout-race-key',
      requestHash: 'hash-b',
    }),
    { status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' },
  );

  const inProgressClient = scriptedClient([{ rows: [] }, { rows: [] }]);
  await assert.rejects(
    () => checkoutTesting.claimCheckoutIdempotencyKey(inProgressClient, {
      userId: 7,
      key: 'checkout-race-key',
      requestHash: 'hash-a',
    }),
    { status: 409, code: 'CHECKOUT_IN_PROGRESS' },
  );
});

test('POS idempotency claim is atomic and replays completed same-payload requests', async () => {
  const claimedClient = scriptedClient([{ rows: [{ id: 2, request_hash: 'hash-a', status: 'processing' }] }]);
  const claimed = await posTesting.claimPosIdempotencyKey(claimedClient, {
    userId: 4,
    key: 'pos-race-key',
    requestHash: 'hash-a',
  });
  assert.equal(claimed.claimed, true);
  assert.match(claimedClient.calls[0].sql, /INSERT INTO idempotency_keys/);
  assert.match(claimedClient.calls[0].sql, /ON CONFLICT \(user_id, scope, key\) DO NOTHING/);

  const replayClient = scriptedClient([
    { rows: [] },
    { rows: [{ id: 2, request_hash: 'hash-a', status: 'completed', response_status: 201, response_body: { receipt: { order_id: 20 } } }] },
  ]);
  const replay = await posTesting.claimPosIdempotencyKey(replayClient, {
    userId: 4,
    key: 'pos-race-key',
    requestHash: 'hash-a',
  });
  assert.equal(replay.claimed, false);
  assert.equal(replay.row.response_body.receipt.order_id, 20);
  assert.match(replayClient.calls[1].sql, /FOR UPDATE/);
});

test('POS idempotency rejects different payloads and in-progress duplicate races cleanly', async () => {
  const conflictClient = scriptedClient([
    { rows: [] },
    { rows: [{ id: 2, request_hash: 'hash-a', status: 'completed' }] },
  ]);
  await assert.rejects(
    () => posTesting.claimPosIdempotencyKey(conflictClient, {
      userId: 4,
      key: 'pos-race-key',
      requestHash: 'hash-b',
    }),
    { status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' },
  );

  const inProgressClient = scriptedClient([{ rows: [] }, { rows: [] }]);
  await assert.rejects(
    () => posTesting.claimPosIdempotencyKey(inProgressClient, {
      userId: 4,
      key: 'pos-race-key',
      requestHash: 'hash-a',
    }),
    { status: 409, code: 'POS_REQUEST_IN_PROGRESS' },
  );
});

test('duplicate checkout and POS requests return before duplicate order, payment, stock, or receipt work', async () => {
  const checkoutSource = await readFile(new URL('./secureCheckoutController.js', import.meta.url), 'utf8');
  const checkoutReplay = checkoutSource.indexOf('if (!idempotency.claimed)');
  assert.ok(checkoutReplay > -1);
  assert.ok(checkoutReplay < checkoutSource.indexOf('INSERT INTO orders'));
  assert.ok(checkoutReplay < checkoutSource.indexOf('INSERT INTO payments'));
  assert.ok(checkoutReplay < checkoutSource.indexOf('INSERT INTO stock_reservations'));
  assert.match(checkoutSource, /res\.status\(saved\.response_status \|\| 200\)\.json\(saved\.response_body\)/);
  assert.doesNotMatch(checkoutSource, /\{\s*code:\s*error\.code\s*\}/);

  const posSource = await readFile(new URL('./posController.js', import.meta.url), 'utf8');
  const posReplay = posSource.indexOf('if (!idempotency.claimed)');
  assert.ok(posReplay > -1);
  assert.ok(posReplay < posSource.indexOf('INSERT INTO orders'));
  assert.ok(posReplay < posSource.indexOf('INSERT INTO payments'));
  assert.ok(posReplay < posSource.indexOf('INSERT INTO stock_movements'));
  assert.ok(posReplay < posSource.indexOf('receiptNumber'));
  assert.match(posSource, /res\.status\(saved\.response_status \|\| 201\)\.json\(saved\.response_body\)/);
  assert.doesNotMatch(posSource, /diagnostic:\s*error\.message/);
});
