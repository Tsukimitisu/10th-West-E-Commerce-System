// Public deployment checks only. Never print cookies, CSRF tokens or OAuth state.
const frontend = 'https://10th-west-e-commerce-system.vercel.app';
const backend = 'https://one0th-west-e-commerce-system.onrender.com';
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) process.exitCode = 1;
};
const get = async (path) => fetch(`${backend}${path}`, {
  headers: { Origin: frontend }, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000),
});
try {
  const csrf = await get('/api/csrf-token');
  check('CSRF endpoint', csrf.status === 200);
  check('Exact credentialed CORS', csrf.headers.get('access-control-allow-origin') === frontend && csrf.headers.get('access-control-allow-credentials') === 'true');
  check('CSRF response cannot be cached', /no-store/i.test(csrf.headers.get('cache-control') || ''));
  const cookie = csrf.headers.getSetCookie().find(value => value.startsWith('twm.sid=')) || '';
  check('Secure HttpOnly cross-site host-only session cookie issued', /;\s*Secure/i.test(cookie) && /;\s*HttpOnly/i.test(cookie) && /;\s*SameSite=None/i.test(cookie) && !/;\s*Domain=/i.test(cookie));
  const body = await csrf.json();
  check('CSRF token present', Boolean(body.csrfToken));
  for (const provider of ['google', 'facebook']) {
    const response = await get(`/api/auth/${provider}`);
    const target = new URL(response.headers.get('location') || '/', backend);
    const host = provider === 'google' ? 'accounts.google.com' : 'www.facebook.com';
    check(`${provider} redirects to provider with exact Render callback`, response.status === 302 && target.hostname === host && target.searchParams.get('redirect_uri') === `${backend}/api/auth/${provider}/callback`);
  }
  const readiness = await get('/api/auth/readiness');
  check('Deployment diagnostics available', readiness.status === 200);
  if (readiness.ok) {
    const result = await readiness.json();
    check('Production origin, proxy and PostgreSQL sessions', result.transport?.environment === 'production' && result.transport.origin_allowed && result.transport.request_secure && result.transport.trust_proxy === 1 && result.transport.session_store === 'postgres');
    check('Database, OAuth and PayMongo readiness', result.database_available && result.google?.available && result.facebook?.available && result.paymongo?.configured);
  }
} catch {
  console.error('FAIL Deployment request could not be completed. Check Render service health.');
  process.exitCode = 1;
}
