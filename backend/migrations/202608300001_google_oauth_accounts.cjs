exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('user_oauth_accounts');

  if (!exists) {
    await knex.schema.createTable('user_oauth_accounts', (table) => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('provider', 50).notNullable();
      table.string('provider_user_id', 255).notNullable();
      table.string('provider_email', 255);
      table.text('profile_image_url');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.unique(['provider', 'provider_user_id'], { indexName: 'ux_user_oauth_provider_identity' });
      table.unique(['user_id', 'provider'], { indexName: 'ux_user_oauth_user_provider' });
    });
  }

  await knex.raw(`
    ALTER TABLE user_oauth_accounts
      DROP CONSTRAINT IF EXISTS user_oauth_accounts_provider_check;
    ALTER TABLE user_oauth_accounts
      ADD CONSTRAINT user_oauth_accounts_provider_check
      CHECK (provider = LOWER(BTRIM(provider)) AND LENGTH(BTRIM(provider)) > 0);

    CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_user_id
      ON user_oauth_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_oauth_accounts_provider_email
      ON user_oauth_accounts(provider, LOWER(provider_email))
      WHERE provider_email IS NOT NULL;

    INSERT INTO user_oauth_accounts (
      user_id, provider, provider_user_id, provider_email, profile_image_url
    )
    SELECT
      id,
      LOWER(BTRIM(oauth_provider)),
      BTRIM(oauth_id),
      CASE WHEN email_verified THEN LOWER(BTRIM(email)) ELSE NULL END,
      avatar
    FROM users
    WHERE NULLIF(BTRIM(oauth_provider), '') IS NOT NULL
      AND NULLIF(BTRIM(oauth_id), '') IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE user_oauth_accounts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS backend_service_role_only ON user_oauth_accounts;
    CREATE POLICY backend_service_role_only
      ON user_oauth_accounts
      FOR ALL
      USING (public.app_access_check())
      WITH CHECK (public.app_access_check());

    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE user_oauth_accounts FROM anon;
        REVOKE ALL ON SEQUENCE user_oauth_accounts_id_seq FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE user_oauth_accounts FROM authenticated;
        REVOKE ALL ON SEQUENCE user_oauth_accounts_id_seq FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE user_oauth_accounts TO service_role;
        GRANT ALL ON SEQUENCE user_oauth_accounts_id_seq TO service_role;
      END IF;
    END
    $roles$;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_oauth_accounts');
};
