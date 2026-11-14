'use strict';

const addColumnIfMissing = async (knex, tableName, columnName, defineColumn) => {
  if (!(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.schema.alterTable(tableName, (table) => defineColumn(table));
  }
};

const dropColumnIfPresent = async (knex, tableName, columnName) => {
  if (await knex.schema.hasColumn(tableName, columnName)) {
    await knex.schema.alterTable(tableName, (table) => table.dropColumn(columnName));
  }
};

exports.up = async function up(knex) {
  await addColumnIfMissing(knex, 'orders', 'shipping_provider', (table) => table.string('shipping_provider', 40).defaultTo('internal'));
  await addColumnIfMissing(knex, 'orders', 'courier_name', (table) => table.string('courier_name', 120).defaultTo('J&T Express'));
  await addColumnIfMissing(knex, 'orders', 'shipping_status', (table) => table.string('shipping_status', 40).defaultTo('pending'));
  await addColumnIfMissing(knex, 'orders', 'delivery_method', (table) => table.string('delivery_method', 40).defaultTo('standard'));

  await knex.raw(`
    UPDATE orders
    SET shipping_fee = COALESCE(shipping_fee, 0),
        shipping_provider = COALESCE(NULLIF(shipping_provider, ''), 'internal'),
        courier = COALESCE(NULLIF(courier, ''), 'jnt'),
        courier_name = COALESCE(NULLIF(courier_name, ''), 'J&T Express'),
        shipping_status = COALESCE(NULLIF(shipping_status, ''), 'pending'),
        delivery_method = COALESCE(NULLIF(delivery_method, ''), 'standard');
  `);

  // Flush the existing deferred order-integrity constraint trigger before DDL.
  // PostgreSQL rejects ALTER TABLE while that UPDATE has pending trigger events.
  await knex.raw('SET CONSTRAINTS ALL IMMEDIATE');

  await knex.raw(`
    ALTER TABLE orders ALTER COLUMN shipping_fee SET DEFAULT 0;
    ALTER TABLE orders ALTER COLUMN shipping_provider SET DEFAULT 'internal';
    ALTER TABLE orders ALTER COLUMN courier SET DEFAULT 'jnt';
    ALTER TABLE orders ALTER COLUMN courier_name SET DEFAULT 'J&T Express';
    ALTER TABLE orders ALTER COLUMN shipping_status SET DEFAULT 'pending';
    ALTER TABLE orders ALTER COLUMN delivery_method SET DEFAULT 'standard';

    ALTER TABLE orders ALTER COLUMN shipping_provider SET NOT NULL;
    ALTER TABLE orders ALTER COLUMN courier_name SET NOT NULL;
    ALTER TABLE orders ALTER COLUMN shipping_status SET NOT NULL;
    ALTER TABLE orders ALTER COLUMN delivery_method SET NOT NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE orders ALTER COLUMN courier DROP DEFAULT');
  await dropColumnIfPresent(knex, 'orders', 'delivery_method');
  await dropColumnIfPresent(knex, 'orders', 'shipping_status');
  await dropColumnIfPresent(knex, 'orders', 'courier_name');
  await dropColumnIfPresent(knex, 'orders', 'shipping_provider');
};
