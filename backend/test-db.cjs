require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT * FROM registration_otps LIMIT 1')
  .then(() => { console.log('✅ Table exists'); pool.end(); })
  .catch(e => { console.error('❌ Table missing or error:', e.message); pool.end(); });
