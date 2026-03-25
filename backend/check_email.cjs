const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const res = await pool.query("SELECT * FROM users WHERE email='Jamesrev235@gmail.com'");
    console.log(res.rows);
  } finally { pool.end(); }
}
run();
