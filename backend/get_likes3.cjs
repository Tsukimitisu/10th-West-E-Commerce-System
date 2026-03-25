const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  try {
    const res = await pool.query("SELECT id, email FROM users WHERE email='Jamesrev0223@gmail.com'");
    const id = res.rows[0].id;
    console.log("ID to delete:", id);
    const delRes = await pool.query("DELETE FROM users WHERE id=", [id]);
    console.log("Deleted:", delRes.rowCount);
  } catch (err) { console.log(err.message); } finally { pool.end(); }
}
run();
