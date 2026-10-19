exports.up = async knex => {
  await knex.raw(`
    CREATE TABLE pos_offline_devices (
      id UUID PRIMARY KEY, device_uuid UUID NOT NULL UNIQUE, name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true, registered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_synced_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX pos_one_active_offline_device ON pos_offline_devices ((true)) WHERE is_active;
    CREATE TABLE pos_offline_reserves (
      id TEXT PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
      target_quantity INTEGER NOT NULL DEFAULT 0 CHECK(target_quantity BETWEEN 0 AND 10000),
      remaining INTEGER NOT NULL DEFAULT 0 CHECK(remaining >= 0 AND remaining <= target_quantity),
      quarantined BOOLEAN NOT NULL DEFAULT false,
      CHECK(id = product_id::text || ':' || COALESCE(variant_id,0)::text)
    );
    CREATE UNIQUE INDEX pos_offline_reserve_item ON pos_offline_reserves(product_id, COALESCE(variant_id,0));
    CREATE TABLE pos_offline_snapshots (
      id UUID PRIMARY KEY, device_id UUID NOT NULL REFERENCES pos_offline_devices(id),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
      catalogue JSONB NOT NULL
    );
    CREATE TABLE pos_offline_snapshot_items (
      snapshot_id UUID NOT NULL REFERENCES pos_offline_snapshots(id), item_key TEXT NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price >= 0), allowance INTEGER NOT NULL CHECK(allowance >= 0),
      consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed >= 0 AND consumed <= allowance),
      PRIMARY KEY(snapshot_id,item_key)
    );
    CREATE TABLE pos_offline_sales (
      transaction_id UUID PRIMARY KEY, device_id UUID NOT NULL REFERENCES pos_offline_devices(id),
      snapshot_id UUID NOT NULL REFERENCES pos_offline_snapshots(id), request_hash TEXT NOT NULL,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT, response JSONB NOT NULL,
      sold_at TIMESTAMPTZ NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Offline holds are part of the existing reserved_stock total. All existing
    -- storefront/checkout availability checks therefore already exclude them.
    CREATE FUNCTION protect_offline_pos_hold() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE held INTEGER;
    BEGIN
      IF TG_TABLE_NAME = 'products' THEN
        SELECT COALESCE(SUM(remaining),0) INTO held FROM pos_offline_reserves WHERE product_id=NEW.id AND variant_id IS NULL;
      ELSE
        SELECT COALESCE(SUM(remaining),0) INTO held FROM pos_offline_reserves WHERE product_id=NEW.product_id AND variant_id=NEW.id;
      END IF;
      IF COALESCE(NEW.reserved_stock,0) < held OR (held > 0 AND COALESCE(NEW.stock_quantity,0) < COALESCE(NEW.reserved_stock,0)) THEN
        RAISE EXCEPTION 'Stock is protected for offline POS' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER protect_product_offline_hold BEFORE UPDATE OF stock_quantity,reserved_stock ON products
      FOR EACH ROW EXECUTE FUNCTION protect_offline_pos_hold();
    CREATE TRIGGER protect_variant_offline_hold BEFORE UPDATE OF stock_quantity,reserved_stock ON product_variants
      FOR EACH ROW EXECUTE FUNCTION protect_offline_pos_hold();
    ALTER TABLE pos_offline_devices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pos_offline_reserves ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pos_offline_snapshots ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pos_offline_snapshot_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pos_offline_sales ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON pos_offline_devices,pos_offline_reserves,pos_offline_snapshots,pos_offline_snapshot_items,pos_offline_sales FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON pos_offline_devices,pos_offline_reserves,pos_offline_snapshots,pos_offline_snapshot_items,pos_offline_sales FROM anon;
      END IF;
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON pos_offline_devices,pos_offline_reserves,pos_offline_snapshots,pos_offline_snapshot_items,pos_offline_sales FROM authenticated;
      END IF;
    END $$;
  `);
};

exports.down = async knex => {
  const records = await knex('pos_offline_sales').first('transaction_id');
  const hold = await knex('pos_offline_reserves').where('remaining','>',0).first('id');
  const device = await knex('pos_offline_devices').where('is_active',true).first('id');
  const snapshot = await knex('pos_offline_snapshots').first('id');
  if (records || hold || device || snapshot) throw new Error('Reconcile offline sales, revoke devices and release reserves before rollback; preserve issued snapshots and the offline transaction ledger.');
  await knex.raw(`DROP TRIGGER protect_product_offline_hold ON products; DROP TRIGGER protect_variant_offline_hold ON product_variants;
    DROP FUNCTION protect_offline_pos_hold(); DROP TABLE pos_offline_sales,pos_offline_snapshot_items,pos_offline_snapshots,pos_offline_reserves,pos_offline_devices;`);
};
