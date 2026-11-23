import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/202608200001_manual_jnt_order_shipping.cjs');

test('manual J&T order migration flushes deferred triggers before altering orders', async () => {
  const statements = [];
  const knex = {
    schema: {
      async hasColumn() {
        return true;
      },
    },
    async raw(sql) {
      statements.push(sql.trim());
    },
  };

  await migration.up(knex);

  assert.equal(statements.length, 3);
  assert.match(statements[0], /^UPDATE orders/);
  assert.equal(statements[1], 'SET CONSTRAINTS ALL IMMEDIATE');
  assert.match(statements[2], /^ALTER TABLE orders/);
});
