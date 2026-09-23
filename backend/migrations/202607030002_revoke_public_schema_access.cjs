exports.up = async function up(knex) {
  await knex.raw(`
    REVOKE ALL ON SCHEMA public FROM PUBLIC;

    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA public FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON SCHEMA public FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT USAGE ON SCHEMA public TO service_role;
      END IF;
    END
    $roles$;
  `);
};

exports.down = async function down() {
  // Deliberately irreversible: PUBLIC schema access must be restored only by
  // an explicit, reviewed migration.
};
