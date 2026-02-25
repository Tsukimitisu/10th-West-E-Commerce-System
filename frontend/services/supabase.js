import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
// Get these from: Supabase Dashboard > Project Settings > API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

const hasCredentials =
  supabaseUrl &&
  supabasePublishableKey &&
  supabasePublishableKey !== 'YOUR_SUPABASE_ANON_KEY_HERE';

if (!hasCredentials) {
  console.warn('Missing Supabase environment variables. Using fallback mode. Please check your .env.local file.');
}

export const supabase = hasCredentials
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

// Auth helpers
export const getUser = async () => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getSession = async () => {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Subscribe to auth state changes
export const onAuthStateChange = (callback) => {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
};
