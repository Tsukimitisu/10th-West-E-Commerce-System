import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/202607210001_codify_runtime_schema_requirements.cjs');

const REQUIRED_INDEXES = [
  'idx_carts_session_id',
  'idx_cart_items_cart_product',
  'idx_orders_payment_intent_unique',
  'idx_reviews_status',
  'idx_users_email_change_token',
  'idx_users_pending_email',
];

const RUNTIME_SCHEMA_SOURCES = [
  '../utils/notifications.js',
  '../controllers/addressController.js',
  '../controllers/cartController.js',
  '../controllers/chatController.js',
  '../controllers/orderController.js',
  '../controllers/paymentController.js',
  '../controllers/productController.js',
  '../controllers/returnController.js',
  '../controllers/reviewController.js',
  '../controllers/userController.js',
  '../routes/variants.js',
];

test('runtime request modules contain no schema DDL fallback', async () => {
  for (const relativePath of RUNTIME_SCHEMA_SOURCES) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TYPE|SCHEMA|FUNCTION|TRIGGER|POLICY|VIEW|EXTENSION)\b|\b(?:ADD|DROP)\s+CONSTRAINT\b/i,
      `${relativePath} must rely exclusively on tracked Knex migrations`
    );
  }
});

test('required index migration rejects duplicate payment intents before creating indexes', async () => {
  const statements = [];
  const knex = {
    async raw(sql) {
      statements.push(sql);
      if (sql.includes('HAVING COUNT(*) > 1')) return { rows: [{ duplicate_found: 1 }] };
      return { rows: [] };
    },
  };

  await assert.rejects(() => migration.up(knex), {
    code: 'ORDERS_PAYMENT_INTENT_DUPLICATES',
  });
  assert.match(statements[0], /LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE/);
  assert.equal(statements.some((sql) => /CREATE (?:UNIQUE )?INDEX/i.test(sql)), false);
});

test('required index migration creates all drifted indexes and reverses them safely', async () => {
  const upStatements = [];
  const upKnex = {
    async raw(sql) {
      upStatements.push(sql);
      return { rows: [] };
    },
  };

  await migration.up(upKnex);
  const createSource = upStatements.join('\n');
  assert.match(createSource, /ALTER TABLE public\.reviews DROP CONSTRAINT %I/);
  assert.match(createSource, /ARRAY\['product_id', 'user_id'\]::name\[\]/);
  for (const indexName of REQUIRED_INDEXES) assert.match(createSource, new RegExp(indexName));
  assert.match(
    createSource,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_unique[\s\S]*WHERE payment_intent_id IS NOT NULL/
  );

  const downStatements = [];
  await migration.down({
    async raw(sql) {
      downStatements.push(sql);
      return { rows: [] };
    },
  });
  const dropSource = downStatements.join('\n');
  for (const indexName of REQUIRED_INDEXES) {
    assert.match(dropSource, new RegExp(`DROP INDEX IF EXISTS ${indexName}`));
  }
});
