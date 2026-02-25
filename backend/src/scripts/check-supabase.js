import dns from 'dns/promises';
import { URL } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const run = async () => {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
  const dbHost = databaseUrl
    ? (() => {
        try {
          return new URL(databaseUrl).hostname;
        } catch {
          return '';
        }
      })()
    : '';

  const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

  console.log('Supabase connectivity check');
  console.log('DB host:', dbHost || '(not set)');
  console.log('Project URL:', projectUrl || '(not set)');

  if (dbHost) {
    try {
      const addrs = await dns.lookup(dbHost, { all: true });
      console.log('DNS lookup for DB host succeeded:', addrs.map((a) => a.address).join(', '));
    } catch (err) {
      console.error('DNS lookup for DB host failed:', err.message || err);
    }
  } else {
    console.log('No DB host to resolve (SUPABASE_DB_URL/DATABASE_URL not set)');
  }

  if (projectUrl) {
    try {
      const url = projectUrl.replace(/\/+$/, '');
      console.log('Testing HTTPS reachability to', url);
      const res = await fetch(url, { method: 'GET' });
      console.log('HTTPS reachable; status', res.status);
    } catch (err) {
      console.error('HTTPS request to project URL failed:', err.message || err);
    }
  } else {
    console.log('No Supabase project URL found in env (SUPABASE_URL/VITE_SUPABASE_URL)');
  }

  console.log('\nNext steps:');
  console.log('- If DNS lookup failed, try flushing DNS: "ipconfig /flushdns" and retry.');
  console.log('- If HTTPS fails, check firewall/proxy/VPN or try from another network.');
  console.log('- You can also run migrations from a machine with access, or run SQL in the Supabase SQL editor.');
};

run().catch((err) => {
  console.error('Fatal error during check:', err);
  process.exit(1);
});
