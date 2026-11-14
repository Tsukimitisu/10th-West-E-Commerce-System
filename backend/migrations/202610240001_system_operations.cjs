// Maintenance mode itself remains in the existing system_settings table.
exports.up = async knex => knex.raw(`
  CREATE TABLE system_cleanup_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    run_id UUID,
    running BOOLEAN NOT NULL DEFAULT FALSE,
    last_started_at TIMESTAMPTZ,
    last_completed_at TIMESTAMPTZ,
    last_result TEXT CHECK (last_result IN ('successful', 'failed')),
    last_counts JSONB,
    failure_code TEXT
  );
  INSERT INTO system_cleanup_status (id) VALUES (1);
`);
exports.down = async knex => {
  const result = await knex.raw('SELECT running FROM system_cleanup_status WHERE id=1');
  if (result.rows[0]?.running) throw new Error('Wait for automatic cleanup to finish before rollback.');
  await knex.schema.dropTable('system_cleanup_status');
};
