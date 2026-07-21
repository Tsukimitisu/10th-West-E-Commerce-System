import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCoreDatabaseReadiness, requiredCoreRelations } from './coreReadiness.js';

test('core readiness checks connectivity, required relations, and the PostgreSQL session table', async () => {
  const queries = [];
  const database = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('to_regclass')) return { rows: [] };
      return { rows: [{ connection: 1 }] };
    },
  };
  assert.deepEqual(await checkCoreDatabaseReadiness(database), { ready: true });
  assert.equal(queries.length, 3);
  assert.deepEqual(queries[1].params[0], requiredCoreRelations());
  assert.match(queries[2].sql, /FROM http_sessions/);
});

test('core readiness fails closed when an essential relation is missing', async () => {
  const database = {
    async query(sql) {
      if (sql.includes('to_regclass')) return { rows: [{ name: 'http_sessions' }] };
      return { rows: [] };
    },
  };
  await assert.rejects(() => checkCoreDatabaseReadiness(database), {
    code: 'DATABASE_SCHEMA_NOT_READY',
    missingRelations: ['http_sessions'],
  });
});

