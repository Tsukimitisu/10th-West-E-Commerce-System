const REQUIRED_CORE_RELATIONS = Object.freeze([
  'knex_migrations',
  'users',
  'sessions',
  'http_sessions',
  'permissions',
  'role_permissions',
  'products',
  'product_variants',
  'addresses',
  'carts',
  'cart_items',
  'wishlists',
  'orders',
  'order_items',
  'order_status_history',
  'payments',
  'stock_reservations',
  'stock_movements',
  'audit_logs',
  'idempotency_keys',
  'returns',
  'return_items',
  'refunds',
  'refund_attempts',
  'store_credits',
  'reviews',
  'chat_threads',
  'chat_participants',
  'chat_messages',
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
  await database.query('SELECT sid, sess, expire FROM http_sessions LIMIT 1');
  return { ready: true };
};

export const requiredCoreRelations = () => [...REQUIRED_CORE_RELATIONS];
