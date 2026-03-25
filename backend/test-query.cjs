const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const result = await pool.query('SELECT auth.uid()');
    console.log('Query success');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
