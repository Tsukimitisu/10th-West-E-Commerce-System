const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing database connection string. Set SUPABASE_DB_URL or DATABASE_URL in backend/.env.');
}

module.exports = {
  client: 'pg',
  connection: {
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
    loadExtensions: ['.cjs'],
    extension: 'cjs',
  },
};
