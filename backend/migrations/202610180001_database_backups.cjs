exports.up = async function up(knex) {
  await knex.schema.createTable('backup_records', table => {
    table.uuid('id').primary();
    table.string('storage_key', 255).notNullable().unique();
    table.string('filename', 255).notNullable();
    table.string('backup_type', 16).notNullable();
    table.string('status', 16).notNullable();
    table.string('daily_key', 32);
    table.integer('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('deleted_at', { useTz: true });
    table.bigInteger('size_bytes');
    table.string('checksum', 64);
    table.boolean('encrypted').notNullable().defaultTo(true);
    table.string('error_summary', 240);
    table.index(['created_at']);
  });
  await knex.raw("ALTER TABLE backup_records ADD CONSTRAINT backup_record_status CHECK (status IN ('queued','running','completed','failed')), ADD CONSTRAINT backup_record_type CHECK (backup_type IN ('manual','automatic'))");
  await knex.raw("CREATE UNIQUE INDEX backup_daily_success ON backup_records(daily_key) WHERE status = 'completed' AND daily_key IS NOT NULL");
  await knex.schema.createTable('backup_scheduler', table => {
    table.integer('id').primary();
    table.timestamp('last_checked_at', { useTz: true }).notNullable();
  });
  // No browser/PostgREST access to backup metadata. Management uses the backend role.
  await knex.raw('ALTER TABLE backup_records ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE backup_scheduler ENABLE ROW LEVEL SECURITY');
  await knex.raw('REVOKE ALL ON backup_records, backup_scheduler FROM PUBLIC');
  await knex.raw(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON backup_records, backup_scheduler FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON backup_records, backup_scheduler FROM authenticated; END IF;
  END $$`);
};
exports.down = async function down(knex) {
  await knex.schema.dropTable('backup_scheduler');
  await knex.schema.dropTable('backup_records');
};
