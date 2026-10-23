exports.up = async knex => knex.raw(`
  CREATE TABLE pos_offline_device_requests (
    id UUID PRIMARY KEY,
    device_uuid UUID NOT NULL,
    requested_name TEXT NOT NULL CHECK(length(requested_name) BETWEEN 1 AND 80),
    requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','expired')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT CHECK(length(rejection_reason) <= 300),
    approved_device_id UUID REFERENCES pos_offline_devices(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK(status <> 'approved' OR (approved_device_id IS NOT NULL AND reviewed_at IS NOT NULL))
  );
  CREATE UNIQUE INDEX pos_offline_device_request_pending ON pos_offline_device_requests(device_uuid) WHERE status='pending';
  CREATE INDEX pos_offline_device_request_history ON pos_offline_device_requests(requested_at DESC);
  ALTER TABLE pos_offline_device_requests ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON pos_offline_device_requests FROM PUBLIC;
  DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON pos_offline_device_requests FROM anon; END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON pos_offline_device_requests FROM authenticated; END IF;
  END $$;
`);
exports.down = async knex => {
  const result=await knex.raw('SELECT EXISTS(SELECT 1 FROM pos_offline_device_requests) AS populated');
  if(result.rows[0].populated)throw new Error('Preserve device approval history before rolling back this migration.');
  await knex.raw('DROP TABLE pos_offline_device_requests');
};
