import { notificationDestination } from './notificationDestination.js';

export const missingDataHelp = {
  'Not applicable': 'This field does not apply to this event.',
  'Not captured': 'This information was not stored, often in an older log entry. This is not an error.',
  Unavailable: 'The information cannot be retrieved right now. Try refreshing.',
  Unknown: 'A value is expected, but it could not be determined.',
  'Outcome not captured': 'Older or legacy log entries did not store an explicit outcome. This does not mean the action failed.',
};
const code = value => String(value || '').trim().toLowerCase().replace(/[ _]+/g, '.');
const labels = {
  login: 'Signed in', logout: 'Signed out', 'login.failed': 'Sign-in unsuccessful',
  'google.login': 'Signed in with Google', 'facebook.login': 'Signed in with Facebook',
  register: 'Account created', 'email.verified': 'Email verified', 'password.reset': 'Password reset', 'password.change': 'Password changed', 'admin.delete.user': 'Account deleted',
  'pos.sale': 'POS sale completed', 'pos.order.created': 'POS sale completed', 'pos.void': 'POS sale voided',
  'return.approve': 'Return approved', 'return.approved': 'Return approved', 'return.reject': 'Return rejected', 'return.rejected': 'Return rejected',
  'return.received': 'Returned item received', 'return.requested': 'Return requested', 'return.create': 'Return requested',
  'refund.succeeded': 'Refund completed', 'refund.failed': 'Refund needs attention', 'refund.processing': 'Refund started',
  'settings.update': 'Settings changed', 'settings.security.update': 'Security settings changed',
  'maintenance.started': 'Maintenance started', 'maintenance.ended': 'Maintenance ended', 'maintenance.change.failed': 'Maintenance change declined',
  'db.error': 'Database operation failed', 'database.error': 'Database operation failed',
  'offline.pos.sale.synced': 'Offline POS sale synchronized', 'offline.pos.sync.conflict': 'Offline POS sale needs attention',
  'offline.pos.device.registered': 'Offline POS computer registered', 'offline.pos.device.revoked': 'Offline POS computer access revoked',
  'offline.pos.device.approval.requested': 'Offline POS computer approval requested', 'offline.pos.device.approved': 'Offline POS computer approved', 'offline.pos.device.rejected': 'Offline POS computer request rejected',
  'account.security.unlock': 'Account sign-in restored', 'admin.lock.user': 'Account sign-in protected', 'admin.change.role': 'Account role changed', 'admin.reset.password': 'Account password reset',
  'backup.completed': 'Database backup completed', 'backup.failed': 'Database backup failed', 'backup.requested': 'Database backup requested',
  'database.restore.requested': 'Database recovery requested', 'database.restore.started': 'Database recovery started', 'database.restore.completed': 'Database recovered', 'database.restore.failed': 'Database recovery needs attention',
  'database.pre.restore.backup.created': 'Safety backup created',
  'order.create': 'Order created', 'order.created': 'Order created', 'order.update': 'Order updated', 'order.cancel': 'Order cancelled', 'payment.success': 'Payment confirmed',
};
export const metadataOf = log => {
  const value = log.details || log.metadata;
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : {};
  try { return JSON.parse(value) || {}; } catch { return {}; }
};
export function actionLabel(log, category = 'activity') {
  const raw = code(log.action || log.error_type);
  const provider = metadataOf(log).provider;
  if (raw.includes('oauth') && raw.includes('login')) return ['google', 'facebook'].includes(provider) ? `Signed in with ${provider === 'google' ? 'Google' : 'Facebook'}` : 'Signed in with a connected account';
  if (category === 'errors' && /db|database|sql|postgres/.test(raw)) return 'Database operation failed';
  if (labels[raw]) return labels[raw];
  const [area, verb] = raw.split('.');
  const nouns = { product: 'Product', order: 'Order', return: 'Return', refund: 'Refund', user: 'Account', account: 'Account', inventory: 'Inventory', review: 'Review', payment: 'Payment' };
  const verbs = { create: 'created', created: 'created', update: 'updated', updated: 'updated', delete: 'deleted', deleted: 'deleted', approve: 'approved', reject: 'rejected', cancel: 'cancelled', completed: 'completed' };
  return category === 'errors' ? 'Application problem detected' : nouns[area] && verbs[verb] ? `${nouns[area]} ${verbs[verb]}` : 'Application activity';
}
export function auditOutcome(log, category = 'activity') {
  if (category === 'errors') return { label: 'Failed', tone: 'danger' };
  const details = metadataOf(log);
  const value = code(log.result || log.outcome || details.outcome || details.result || log.status || (typeof log.success === 'boolean' ? log.success ? 'success' : 'failed' : ''));
  if (['success', 'successful', 'completed'].includes(value)) return { label: 'Successful', tone: 'success' };
  if (['failed', 'failure', 'error', 'denied'].includes(value)) return { label: 'Failed', tone: 'danger' };
  if (['warning', 'needs.attention'].includes(value)) return { label: 'Needs attention', tone: 'warning' };
  if (value === 'not.applicable') return { label: 'Not applicable', tone: 'neutral' };
  return { label: 'Outcome not captured', tone: 'neutral' };
}
export const actorLabel = log => log.user_name || (log.source === 'system' ? 'System' : 'Not captured');
export const auditTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-PH') : 'Not captured';
export const entityType = log => log.entity_type || log.entity || log.resource_type || '';
export const entityId = log => log.entity_id ?? log.resource_id ?? '';
const areas = { order: 'Order', orders: 'Order', return: 'Return', returns: 'Return', refund: 'Refund', product: 'Product', products: 'Product',
  user: 'Account', users: 'Account', system_settings: 'Settings', pos_offline_device: 'Offline POS computer', offline_pos_device: 'Offline POS computer',
  database_backup: 'Backup', backup: 'Backup', database_restore: 'Database recovery', conversation: 'Conversation' };
export const areaLabel = value => areas[value] || 'Affected record';
export const affectedItem = log => {
  const type = entityType(log), id = entityId(log);
  if (!type) return /^(?:login|logout|oauth.*login)$/.test(code(log.action)) ? 'Not applicable' : 'Not captured';
  if (type === 'system_settings') return { maintenance_mode: 'Store maintenance', security: 'Security settings', email: 'Email settings', payment: 'Payment settings', shipping: 'Shipping settings', returns: 'Return settings', tax: 'Tax settings', legal: 'Business registration settings', home: 'Storefront settings' }[id] || 'Store settings';
  return `${areaLabel(type)}${id !== '' ? ` #${String(id).length > 20 ? String(id).slice(0, 8) : id}` : ' — identifier not captured'}`;
};
export function auditRecordLink(log, role, permissions = []) {
  const type = entityType(log), id = entityId(log);
  if (role === 'super_admin') {
    if (type === 'system_settings') return String(id) === 'security' ? '/superadmin/security' : '/superadmin/settings';
    if (['user', 'users'].includes(type)) return '/superadmin/users';
    if (/backup|restore/.test(type)) return '/superadmin/backup';
    if (/offline.*device/.test(type)) return '/superadmin/offline-pos-devices';
    if (['product', 'products'].includes(type)) return '/superadmin/inventory/product-items';
    return null;
  }
  if (!id) return null;
  const target = notificationDestination({ reference_type: type, reference_id: id }, role, permissions);
  return target.resource ? target.path : null;
}
export const errorDescription = log => /db|database|sql|postgres/i.test(log.error_type || log.action || '')
  ? 'The application could not complete a database operation at this time. Some requests may have failed.'
  : 'The application detected a problem. Review system health and share the diagnostic reference with support if it continues.';
export const errorSeverity = log => {
  const level = ['high', 'medium', 'low'].includes(String(metadataOf(log).severity).toLowerCase())
    ? code(metadataOf(log).severity) : /db|database|sql|postgres/i.test(log.error_type || '') ? 'high' : 'medium';
  return { high: 'High', medium: 'Medium', low: 'Low' }[level];
};
export const errorStatus = log => metadataOf(log).resolved === true && Number.isFinite(Date.parse(metadataOf(log).resolved_at)) ? 'Resolved' : 'Needs attention';

// Defence for older direct-read clients too: only small known technical fields
// are rendered. Arbitrary legacy messages, credentials and request bodies stay out.
export function advancedAuditDetails(log) {
  const details = metadataOf(log);
  const metadata = {};
  const enums = new Set(['success', 'successful', 'completed', 'failed', 'failure', 'warning', 'needs_attention', 'pending', 'approved', 'rejected', 'received', 'refunded', 'paid', 'processing', 'resend', 'smtp', 'google', 'facebook', 'paymongo', 'cash', 'gcash', 'cod', 'high', 'medium', 'low']);
  for (const key of ['outcome', 'result', 'status', 'provider', 'payment_method', 'severity', 'quantity', 'amount', 'count', 'active', 'resolved', 'order_id', 'return_id', 'product_id', 'device_id', 'request_id', 'reference_id']) {
    const value = details[key];
    if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || enums.has(value)
      || key.endsWith('_id') && /^(?:\d{1,16}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.test(String(value || ''))) metadata[key] = value;
  }
  const rawCode = log.action || log.error_type || '';
  const rawId = String(entityId(log));
  const safeId = /^(?:\d{1,16}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}|system|security|maintenance_mode|store|payment|shipping|tax|returns|email|home|legal)$/i.test(rawId);
  const reference = /^(?:(?:activity|audit):)?\d{1,16}$|^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(String(log.id || '')) ? log.id : metadata.request_id || 'Not captured';
  return { action_code: /^[\w. :+-]{1,100}$/.test(rawCode) && !/bearer|password\s*[:=]|sk_(?:live|test)|re_[a-z\d]{12}|eyJ[a-z\d]{12}/i.test(rawCode) ? rawCode : 'Not captured',
    entity_type: /^[\w_]{1,80}$/.test(entityType(log)) ? entityType(log) : 'Not captured', entity_id: safeId ? entityId(log) : 'Not captured',
    source_ip: /^[a-f\d:.]{3,45}$/i.test(log.ip_address || '') ? log.ip_address : 'Not captured', reference, metadata };
}

export function repeatedErrors(logs) {
  const groups = new Map();
  for (const log of logs) {
    const key = `${log.error_type || log.action}:${log.endpoint || ''}`;
    const group = groups.get(key) || [];
    group.push(log); groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
