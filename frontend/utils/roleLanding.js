export const roleLandingPath = (role) => ({
  owner: '/admin/dashboard',
  admin: '/admin/dashboard',
  super_admin: '/superadmin/dashboard',
  store_staff: '/staff/dashboard',
  cashier: '/pos',
}[role] || null);

// Run before rendering a route, including restored sessions and history changes.
// Operations accounts use their workspace, never the customer storefront.
export function roleRouteRedirect(role, pathname) {
  const home = roleLandingPath(role);
  if (!home) return null;
  if (['/oauth-callback', '/oauth/callback', '/auth/callback', '/verify-email', '/forgot-password', '/reset-password'].includes(pathname)) return null;
  if (pathname === '/pos') return null;
  const base = home.split('/').slice(0, 2).join('/');
  if (base !== '/pos' && (pathname === base || pathname.startsWith(`${base}/`))) return null;
  if (role === 'super_admin' && /^\/super-admin(?:\/|$)/.test(pathname)) return null;
  return home;
}
