const REQUIRED_CORE_RELATIONS = Object.freeze([
  'knex_migrations',
  'users',
  'sessions',
  'http_sessions',
  'permissions',
  'role_permissions',
  'products',
  'orders',
  'order_items',
  'payments',
  'stock_movements',
  'audit_logs',
  'idempotency_keys',
]);

export class CoreSchemaError extends Error {
  constructor(missingRelations) {
    super('The core database schema is not ready.');
    this.name = 'CoreSchemaError';
    this.code = 'DATABASE_SCHEMA_NOT_READY';
    this.missingRelations = missingRelations;
  }
}

export const checkCoreDatabaseReadiness = async (database) => {
  await database.query('SELECT 1');
  const result = await database.query(
    `SELECT required.name
     FROM unnest($1::text[]) AS required(name)
     WHERE to_regclass('public.' || required.name) IS NULL
     ORDER BY required.name`,
    [REQUIRED_CORE_RELATIONS]
  );
  const missingRelations = result.rows.map((row) => row.name);
  if (missingRelations.length > 0) throw new CoreSchemaError(missingRelations);
  await database.query('SELECT sid, expire FROM http_sessions LIMIT 1');
  return { ready: true };
};

export const requiredCoreRelations = () => [...REQUIRED_CORE_RELATIONS];

