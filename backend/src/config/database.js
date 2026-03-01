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
