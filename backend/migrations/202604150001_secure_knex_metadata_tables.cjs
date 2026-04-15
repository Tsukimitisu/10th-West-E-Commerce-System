const TABLE_POLICIES = [
  {
    tableName: 'knex_migrations',
    policyName: 'knex_migrations_restricted_access',
  },
  {
    tableName: 'knex_migrations_lock',
    policyName: 'knex_migrations_lock_restricted_access',
  },
];

async function enableRestrictedRls(knex, tableName, policyName) {
  await knex.raw(`
    DO $$
    BEGIN
      IF to_regclass('public.${tableName}') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS ${policyName} ON public.${tableName}';
        EXECUTE 'CREATE POLICY ${policyName} ON public.${tableName} FOR ALL USING (current_setting(''role'', true) = ''service_role'') WITH CHECK (current_setting(''role'', true) = ''service_role'')';
      END IF;
    END
    $$;
  `);
}

async function disableRestrictedRls(knex, tableName, policyName) {
  await knex.raw(`
    DO $$
    BEGIN
      IF to_regclass('public.${tableName}') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS ${policyName} ON public.${tableName}';
        EXECUTE 'ALTER TABLE public.${tableName} DISABLE ROW LEVEL SECURITY';
      END IF;
    END
    $$;
  `);
}

exports.up = async function up(knex) {
  for (const { tableName, policyName } of TABLE_POLICIES) {
    await enableRestrictedRls(knex, tableName, policyName);
  }
};

exports.down = async function down(knex) {
  for (const { tableName, policyName } of TABLE_POLICIES) {
    await disableRestrictedRls(knex, tableName, policyName);
  }
};
