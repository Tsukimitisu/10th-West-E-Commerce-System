import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '..', '..', '.env');
console.log('[DB Config] Loading .env from:', envPath);
dotenv.config({ path: envPath });

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Missing Supabase Postgres connection string. Set SUPABASE_DB_URL or DATABASE_URL in backend/.env.'
  );
}

const pool = new Pool({
  connectionString,
  max: Number.parseInt(process.env.DB_POOL_MAX || '10', 10),
  connectionTimeoutMillis: Number.parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10),
  idleTimeoutMillis: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  query_timeout: Number.parseInt(process.env.DB_QUERY_TIMEOUT_MS || '10000', 10),
  statement_timeout: Number.parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10),
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

// Test connection
pool.on('connect', () => {
  console.log('Database connected successfully');
  console.log('Using Supabase Postgres connection');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

export default pool;
