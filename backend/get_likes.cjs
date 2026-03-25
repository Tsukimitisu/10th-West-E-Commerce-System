const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const res = await pool.query("SELECT email FROM users;");
    console.log(res.rows.map(r => r.email));
  } catch (err) { console.log(err.message); } finally { pool.end(); }
}
run();
