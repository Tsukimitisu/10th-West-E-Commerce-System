const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const result = await pool.query('SELECT count(*) FROM auth.users');
    console.log('User count:', result.rows[0].count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
