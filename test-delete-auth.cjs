const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('SELECT count(*) FROM auth.users').then(res => {
  console.log('Auth users count:', res.rows[0].count);
  pool.end();
}).catch(console.error);
