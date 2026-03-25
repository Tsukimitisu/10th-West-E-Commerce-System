const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const result1 = await pool.query('SELECT count(*) FROM public.users');
    console.log('Public Users:', result1.rows[0].count);
    const result2 = await pool.query('SELECT count(*) FROM auth.users');
    console.log('Auth Users:', result2.rows[0].count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
