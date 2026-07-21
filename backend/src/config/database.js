import pg from 'pg';
import databaseConfigModule from './databaseConfig.cjs';

const { Pool } = pg;
const { getDatabaseConfig, sanitizeDatabaseError } = databaseConfigModule;
const databaseConfig = getDatabaseConfig();

console.log('[DB Config] Environment source:', databaseConfig.safeMetadata.environmentFile);
console.log('[DB Config] Connection metadata:', databaseConfig.safeMetadata);

const pool = new Pool(databaseConfig.pgPoolConfig);

// Test connection
pool.on('connect', () => {
  console.log('Database connected successfully');
  console.log('Database connection mode:', databaseConfig.safeMetadata.connectionMode);
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', sanitizeDatabaseError(err));
});

export default pool;
