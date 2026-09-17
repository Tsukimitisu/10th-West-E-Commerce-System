export const roleLandingPath = (role) => ({
  owner: '/admin/dashboard',
  admin: '/admin/dashboard',
  super_admin: '/superadmin/dashboard',
  store_staff: '/staff/dashboard',
  cashier: '/pos',
}[role] || null);
