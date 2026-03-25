const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const res = await pool.query("SELECT * FROM deleted_users ORDER BY id DESC LIMIT 5");
    console.log(res.rows);
  } catch (err) { console.log(err.message); } finally { pool.end(); }
}
run();
