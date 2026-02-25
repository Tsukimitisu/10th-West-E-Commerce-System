import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Supabase URL or service role key missing in environment. Check backend/.env');
}

export const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export default supabaseClient;
