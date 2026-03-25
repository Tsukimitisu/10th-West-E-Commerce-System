const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const res = await pool.query("SELECT id, name, email FROM users");
    console.log(res.rows);
  } finally { pool.end(); }
}
run();
