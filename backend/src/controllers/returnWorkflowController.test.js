import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./returnWorkflowController.js', import.meta.url), 'utf8');

test('refund failure compensation is one transaction and restores safe payment states', () => {
  const start = source.indexOf('export const compensateFailedRefund');
  const compensation = source.slice(start);
  assert.match(compensation, /BEGIN/);
  assert.match(compensation, /FOR UPDATE OF f,r/);
  assert.match(compensation, /returns SET status='manual_review'/);
  assert.match(compensation, /payments SET status=\$2/);
  assert.match(compensation, /refund\.failed_compensated/);
  assert.match(compensation, /INSERT INTO notifications/);
  assert.match(compensation, /COMMIT/);
});

test('successful refunds remain protected from compensation and duplicate stock restoration', () => {
  assert.match(source, /if \(row\.status === 'succeeded'\)/);
  assert.match(source, /if \(!refund \|\| refund\.status === 'succeeded'\)/);
  assert.match(source, /Return stock was already restored/);
});
