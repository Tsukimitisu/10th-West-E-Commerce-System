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
  await addColumnIfMissing(knex, 'shipments', 'courier', (table) => table.string('courier', 40).defaultTo('jnt'));
  await addColumnIfMissing(knex, 'shipments', 'courier_name', (table) => table.string('courier_name', 120).defaultTo('J&T Express'));
  await addColumnIfMissing(knex, 'shipments', 'service_type', (table) => table.string('service_type', 40).defaultTo('standard'));
  await addColumnIfMissing(knex, 'shipments', 'metadata', (table) => table.jsonb('metadata').defaultTo(knex.raw("'{}'::jsonb")));
  await addColumnIfMissing(knex, 'shipments', 'created_by', (table) => table.integer('created_by').references('id').inTable('users').onDelete('SET NULL'));

  await addColumnIfMissing(knex, 'shipment_events', 'provider', (table) => table.string('provider', 40).defaultTo('manual'));
  await addColumnIfMissing(knex, 'shipment_events', 'event_time', (table) => table.timestamp('event_time', { useTz: true }).defaultTo(knex.fn.now()));
  await addColumnIfMissing(knex, 'shipment_events', 'raw_event', (table) => table.jsonb('raw_event').defaultTo(knex.raw("'{}'::jsonb")));

  await knex.raw(`
    UPDATE shipments
    SET provider = COALESCE(NULLIF(provider, ''), 'manual'),
        shipping_provider = COALESCE(NULLIF(shipping_provider, ''), 'internal'),
        tracking_provider = COALESCE(NULLIF(tracking_provider, ''), 'manual'),
        courier = COALESCE(NULLIF(courier, ''), 'jnt'),
        courier_name = COALESCE(NULLIF(courier_name, ''), 'J&T Express'),
        service_type = COALESCE(NULLIF(service_type, ''), 'standard'),
        metadata = COALESCE(metadata, '{}'::jsonb),
        normalized_status = COALESCE(NULLIF(normalized_status, ''), status);

    UPDATE shipment_events
    SET provider = COALESCE(NULLIF(provider, ''), 'manual'),
        event_time = COALESCE(event_time, occurred_at, created_at),
        raw_event = COALESCE(raw_event, payload, '{}'::jsonb);

    ALTER TABLE shipments ALTER COLUMN provider SET DEFAULT 'manual';
    ALTER TABLE shipments ALTER COLUMN shipping_provider SET DEFAULT 'internal';
    ALTER TABLE shipments ALTER COLUMN tracking_provider SET DEFAULT 'manual';
    ALTER TABLE shipments ALTER COLUMN courier SET DEFAULT 'jnt';
    ALTER TABLE shipments ALTER COLUMN courier_name SET DEFAULT 'J&T Express';
    ALTER TABLE shipments ALTER COLUMN service_type SET DEFAULT 'standard';
    ALTER TABLE shipments ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
    ALTER TABLE shipments ALTER COLUMN booking_idempotency_key DROP NOT NULL;

    ALTER TABLE shipment_events ALTER COLUMN provider SET DEFAULT 'manual';
    ALTER TABLE shipment_events ALTER COLUMN event_time SET DEFAULT NOW();
    ALTER TABLE shipment_events ALTER COLUMN raw_event SET DEFAULT '{}'::jsonb;

    ALTER TABLE shipments ALTER COLUMN courier SET NOT NULL;
    ALTER TABLE shipments ALTER COLUMN courier_name SET NOT NULL;
    ALTER TABLE shipments ALTER COLUMN service_type SET NOT NULL;
    ALTER TABLE shipments ALTER COLUMN metadata SET NOT NULL;

    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT c.conname INTO constraint_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'shipments'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) = 'UNIQUE (order_id)'
      LIMIT 1;
      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.shipments DROP CONSTRAINT %I', constraint_name);
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_tracking_number
      ON shipments(tracking_number)
      WHERE tracking_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_waybill_number
      ON shipments(waybill_number)
      WHERE waybill_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_active_order
      ON shipments(order_id)
      WHERE status NOT IN ('cancelled', 'returned');
    CREATE INDEX IF NOT EXISTS idx_shipment_events_manual_timeline
      ON shipment_events(shipment_id, event_time, id);
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_shipment_events_manual_timeline;
    DROP INDEX IF EXISTS idx_shipments_active_order;
    DROP INDEX IF EXISTS idx_shipments_waybill_number;
    DROP INDEX IF EXISTS idx_shipments_tracking_number;
  `);
  await dropColumnIfPresent(knex, 'shipment_events', 'raw_event');
  await dropColumnIfPresent(knex, 'shipment_events', 'event_time');
  await dropColumnIfPresent(knex, 'shipment_events', 'provider');
  await dropColumnIfPresent(knex, 'shipments', 'created_by');
  await dropColumnIfPresent(knex, 'shipments', 'metadata');
  await dropColumnIfPresent(knex, 'shipments', 'service_type');
  await dropColumnIfPresent(knex, 'shipments', 'courier_name');
  await dropColumnIfPresent(knex, 'shipments', 'courier');
};
