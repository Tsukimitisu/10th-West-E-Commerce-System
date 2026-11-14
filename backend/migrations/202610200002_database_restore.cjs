// Recovery controls must survive restoration of the application public schema.
exports.up = async knex => {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS recovery_control;
    CREATE TABLE IF NOT EXISTS recovery_control.database_restore_jobs (
      id UUID PRIMARY KEY, backup_id UUID NOT NULL, requested_by INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued','preparing','restoring','validating','completed','failed')),
      phase TEXT NOT NULL DEFAULT 'queued', requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, failure_code TEXT,
      github_run_url TEXT, destructive_started BOOLEAN NOT NULL DEFAULT FALSE,
      safety_backup_id UUID, safety_metadata JSONB, selected_metadata JSONB NOT NULL,
      events JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_database_restore
      ON recovery_control.database_restore_jobs ((true))
      WHERE status IN ('queued','preparing','restoring','validating');
    CREATE TABLE IF NOT EXISTS recovery_control.state (
      id INTEGER PRIMARY KEY CHECK (id = 1), maintenance BOOLEAN NOT NULL DEFAULT FALSE,
      restore_job_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO recovery_control.state (id) VALUES (1) ON CONFLICT DO NOTHING;
    REVOKE ALL ON SCHEMA recovery_control FROM PUBLIC;
    REVOKE ALL ON ALL TABLES IN SCHEMA recovery_control FROM PUBLIC;
    ALTER TABLE recovery_control.database_restore_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE recovery_control.state ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON SCHEMA recovery_control FROM anon;
        REVOKE ALL ON ALL TABLES IN SCHEMA recovery_control FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON SCHEMA recovery_control FROM authenticated;
        REVOKE ALL ON ALL TABLES IN SCHEMA recovery_control FROM authenticated;
      END IF;
    END $$;`);
};

exports.down = async knex => {
  await knex.raw(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM recovery_control.state WHERE maintenance)
      OR EXISTS (SELECT 1 FROM recovery_control.database_restore_jobs WHERE status IN ('queued','preparing','restoring','validating'))
    THEN RAISE EXCEPTION 'Cannot remove active database recovery controls'; END IF;
    END $$;
    DROP TABLE recovery_control.database_restore_jobs;
    DROP TABLE recovery_control.state;
    DROP SCHEMA recovery_control;`);
};
