import { roleLandingPath } from './roleLanding.js';

export const notificationFallback = role => ['owner', 'admin', 'store_staff'].includes(role)
  ? `${role === 'store_staff' ? '/staff' : '/admin'}/notifications`
  : roleLandingPath(role) || '/profile';

const safeId = value => /^[a-z0-9-]{1,64}$/i.test(String(value ?? '')) ? String(value) : null;

// Never follow a provider-supplied URL. Map known entities onto this role's routes.
export function notificationDestination(notification, role, permissions = []) {
  let metadata = notification.metadata;
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { metadata = {}; } }
  metadata ||= {};
  const type = `${notification.reference_type || ''} ${notification.type || ''}`.toLowerCase();
  const ref = notification.reference_id;
  const customer = role === 'customer';
  const management = ['owner', 'admin', 'super_admin'].includes(role);
  const base = role === 'store_staff' ? '/staff' : '/admin';
  const fallback = { path: notificationFallback(role) };
  const allowed = permission => management || (role === 'store_staff' && new Set(permissions).has(permission));
  const target = (path, resource, id) => ({ path, ...(id ? { resource, id } : {}) });

  if (/offline.*(pos|device)|device.*approval/.test(type)) {
    if (management) return target(`${role === 'super_admin' ? '/superadmin' : base}/offline-pos-devices`);
    return ['store_staff', 'cashier'].includes(role) ? target('/pos') : fallback;
  }
  if (/security|account|password|verification/.test(type)) {
    return target(role === 'super_admin' ? '/superadmin/security' : customer ? '/profile?tab=security'
      : ['owner', 'admin', 'store_staff'].includes(role) ? `${base}/account#security` : notificationFallback(role));
  }
  // Return notifications sometimes reference their order; prefer the explicit return ID.
  if (/return|refund/.test(type) || metadata.return_id) {
    const id = safeId(metadata.return_id || (/return|refund/.test(notification.reference_type || '') ? ref : null));
    if (customer) return target(`/my-returns${id ? `?return=${id}` : ''}`, 'return', id);
    if (role !== 'super_admin' && allowed('returns.view')) return target(`${base}/returns${id ? `?return=${id}` : ''}`, 'return', id);
    return fallback;
  }
  if (/conversation|message|chat|support|ticket/.test(type)) {
    const id = safeId(metadata.conversation_id || metadata.thread_id || ref);
    if (customer) return target(`/messages${id ? `?conversation=${id}` : ''}`, 'conversation', id);
    if (role !== 'super_admin' && allowed('chat.view')) return target(`${base}/chat${id ? `?conversation=${id}` : ''}`, 'conversation', id);
    return fallback;
  }
  if (/order|payment|shipment/.test(type)) {
    const id = safeId(metadata.order_id || ref);
    if (customer) return target(id ? `/orders/${id}` : '/orders', 'order', id);
    if (role !== 'super_admin' && allowed('orders.view')) return target(`${base}/orders${id ? `?order=${id}` : ''}`, 'order', id);
    return fallback;
  }
  if (/inventory|product|stock|promo/.test(type)) {
    const id = safeId(metadata.product_id || ref);
    if (customer) return target(id ? `/products/${id}` : '/shop', 'product', id);
    if (role !== 'super_admin' && allowed('inventory.view')) return target(`${base}/inventory${id ? `?product=${id}` : ''}`, 'product', id);
  }
  return fallback;
}

export async function resolveNotificationDestination(notification, role, { permissions = [], exists = async () => false } = {}) {
  const target = notificationDestination(notification, role, permissions);
  if (!target.resource) return target.path;
  try { if (await exists(target.resource, target.id)) return target.path; } catch { /* Missing or inaccessible records use a safe role destination. */ }
  return notificationFallback(role);
}
