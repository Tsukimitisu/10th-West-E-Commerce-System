require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createTable = async () => {
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS registration_otps (email VARCHAR(255) PRIMARY KEY, otp_hash VARCHAR(255) NOT NULL, expires_at TIMESTAMP WITH TIME ZONE NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);');
    console.log('✅ Table registration_otps has been created!');
  } catch(e) {
    console.error('❌ Error creating table:', e);
  } finally {
    pool.end();
  }
};

createTable();
