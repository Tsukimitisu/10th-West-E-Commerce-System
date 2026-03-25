const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const res = await pool.query("DELETE FROM users WHERE email='jamesrev235@gmail.com' RETURNING *");
    console.log(res.rows);
  } catch (err) { console.log(err.message); } finally { pool.end(); }
}
run();
