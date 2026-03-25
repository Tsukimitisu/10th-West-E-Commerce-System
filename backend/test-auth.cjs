const pg = require('pg');
require('dotenv').config({ path: '.env' });
console.log('Connecting to:', process.env.DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    console.log('running query...');
    const result = await pool.query('SELECT count(*) FROM auth.users');
    console.log('Auth users count:', result.rows[0].count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
