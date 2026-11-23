exports.up = async knex => {
  await knex.raw(`
    LOCK TABLE pos_offline_devices,pos_offline_reserves IN ACCESS EXCLUSIVE MODE;
    ALTER TABLE pos_offline_reserves ADD COLUMN device_id UUID REFERENCES pos_offline_devices(id) ON DELETE RESTRICT;
    -- Preserve quantities and legacy IDs. Ambiguous ownership remains protected,
    -- quarantined and unassigned; it must never be granted to every new device.
    UPDATE pos_offline_reserves SET device_id=(SELECT id FROM pos_offline_devices WHERE is_active LIMIT 1)
      WHERE (SELECT COUNT(*) FROM pos_offline_devices WHERE is_active)=1;
    UPDATE pos_offline_reserves SET quarantined=true WHERE device_id IS NULL;
    ALTER TABLE pos_offline_reserves ADD CONSTRAINT pos_unassigned_reserve_quarantined CHECK(device_id IS NOT NULL OR quarantined);
    DROP INDEX pos_offline_reserve_item;
    CREATE UNIQUE INDEX pos_offline_reserve_device_item ON pos_offline_reserves(device_id,product_id,COALESCE(variant_id,0)) WHERE device_id IS NOT NULL;
    CREATE UNIQUE INDEX pos_offline_reserve_unassigned_item ON pos_offline_reserves(product_id,COALESCE(variant_id,0)) WHERE device_id IS NULL;
    -- The original ID check remains valid for legacy records; new allocation IDs
    -- include device ownership. Snapshot item keys intentionally do not change.
    DO $$ DECLARE c RECORD; BEGIN
      FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='pos_offline_reserves'::regclass
        AND contype='c' AND pg_get_constraintdef(oid) LIKE '%id =%' LOOP
        EXECUTE format('ALTER TABLE pos_offline_reserves DROP CONSTRAINT %I',c.conname);
      END LOOP;
    END $$;
    DROP INDEX pos_one_active_offline_device;
  `);
};

exports.down = async knex => {
  await knex.raw(`
    LOCK TABLE pos_offline_devices,pos_offline_reserves IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF (SELECT COUNT(*) FROM pos_offline_devices WHERE is_active)>1
        OR EXISTS(SELECT 1 FROM pos_offline_reserves GROUP BY product_id,COALESCE(variant_id,0) HAVING COUNT(*)>1)
        OR (SELECT COUNT(DISTINCT device_id) FROM pos_offline_reserves)>1
        OR EXISTS(SELECT 1 FROM pos_offline_reserves WHERE device_id IS NULL AND remaining>0)
        OR EXISTS(SELECT 1 FROM pos_offline_reserves WHERE device_id IS NOT NULL AND device_id IS DISTINCT FROM (SELECT id FROM pos_offline_devices WHERE is_active LIMIT 1))
        OR (SELECT COUNT(DISTINCT device_id) FROM pos_offline_snapshots)>1
        OR (SELECT COUNT(DISTINCT device_id) FROM pos_offline_sales)>1 THEN
        RAISE EXCEPTION 'Multi-device offline state must be reconciled before rollback; protected stock and issued snapshots cannot be discarded';
      END IF;
    END $$;
    DROP INDEX pos_offline_reserve_device_item;
    DROP INDEX pos_offline_reserve_unassigned_item;
    ALTER TABLE pos_offline_reserves DROP CONSTRAINT pos_unassigned_reserve_quarantined;
    UPDATE pos_offline_reserves SET id=product_id::text || ':' || COALESCE(variant_id,0)::text;
    ALTER TABLE pos_offline_reserves DROP COLUMN device_id;
    ALTER TABLE pos_offline_reserves ADD CHECK(id=product_id::text || ':' || COALESCE(variant_id,0)::text);
    CREATE UNIQUE INDEX pos_offline_reserve_item ON pos_offline_reserves(product_id,COALESCE(variant_id,0));
    CREATE UNIQUE INDEX pos_one_active_offline_device ON pos_offline_devices ((true)) WHERE is_active;
  `);
};
