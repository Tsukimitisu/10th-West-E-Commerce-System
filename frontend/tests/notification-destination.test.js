import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationDestination as destination, resolveNotificationDestination, notificationFallback } from '../utils/notificationDestination.js';

const order = { reference_type: 'order', reference_id: 42, metadata: { link: 'https://evil.test' } };
test('notifications use exact role-authorized entities, never supplied links', () => {
  assert.equal(destination(order, 'customer').path, '/orders/42');
  assert.equal(destination(order, 'owner').path, '/admin/orders?order=42');
  assert.equal(destination(order, 'admin').path, '/admin/orders?order=42');
  assert.equal(destination(order, 'store_staff', ['orders.view']).path, '/staff/orders?order=42');
  assert.equal(destination(order, 'store_staff').path, '/staff/notifications');
  assert.equal(destination(order, 'super_admin').path, '/superadmin/dashboard');
  assert.equal(destination(order, 'cashier').path, '/pos');
});
test('return IDs override order references and conversation IDs open exact chat', () => {
  const returned = { ...order, type: 'return.received', metadata: JSON.stringify({ return_id: 9 }) };
  assert.equal(destination(returned, 'customer').path, '/my-returns?return=9');
  assert.equal(destination(returned, 'owner').path, '/admin/returns?return=9');
  assert.equal(destination({ type: 'chat.message', metadata: { conversation_id: 8 } }, 'customer').path, '/messages?conversation=8');
  assert.equal(destination({ type: 'chat.message', reference_id: 8 }, 'store_staff', ['chat.view']).path, '/staff/chat?conversation=8');
});
test('device, inventory and security notifications stay in the appropriate workspace', () => {
  assert.equal(destination({ type: 'offline_pos_device_approved' }, 'store_staff').path, '/pos');
  assert.equal(destination({ type: 'offline_pos_device_requested' }, 'owner').path, '/admin/offline-pos-devices');
  assert.equal(destination({ type: 'offline_pos_device_requested' }, 'super_admin').path, '/superadmin/offline-pos-devices');
  assert.equal(destination({ type: 'security_alert' }, 'super_admin').path, '/superadmin/security');
  assert.equal(destination({ type: 'account_update' }, 'owner').path, '/admin/account#security');
  assert.equal(destination({ reference_type: 'inventory', reference_id: 4 }, 'store_staff', ['inventory.view']).path, '/staff/inventory?product=4');
});
test('missing, deleted and forbidden records fall back safely; successful checks retain exact IDs', async () => {
  for (const role of ['customer', 'owner', 'store_staff', 'super_admin', 'cashier']) {
    assert.equal(await resolveNotificationDestination(order, role, { permissions: ['orders.view'], exists: async () => false }), notificationFallback(role));
    assert.equal(await resolveNotificationDestination(order, role, { permissions: ['orders.view'], exists: async () => { throw { status: 403 }; } }), notificationFallback(role));
  }
  assert.equal(await resolveNotificationDestination(order, 'customer', { exists: async (resource, id) => resource === 'order' && id === '42' }), '/orders/42');
  assert.equal(destination({ type: 'unknown', metadata: { link: '/superadmin/users' } }, 'customer').path, '/profile');
  assert.equal(destination({ ...order, reference_id: '../profile?returnTo=https://evil.test' }, 'customer').path, '/orders');
});
