// Direct Supabase access from the browser is intentionally disabled. Keeping
// this null preserves old guard clauses without bundling the Supabase SDK or
// exposing an anon key in production builds.
export const supabase = null;

// Auth helpers
export const getUser = async () => {
  return null;
};

export const getSession = async () => {
  return null;
};

// Subscribe to auth state changes
export const onAuthStateChange = (callback) => {
  return { data: { subscription: { unsubscribe: () => {} } } };
};
