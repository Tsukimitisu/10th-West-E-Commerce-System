// Read-only projection of historical logs. Never return arbitrary legacy JSON,
// request bodies, stack traces or credential-bearing messages to the browser.
const scalarKeys = new Set(['outcome', 'result', 'status', 'success', 'provider', 'method', 'auth_method', 'payment_method',
  'order_id', 'return_id', 'product_id', 'variant_id', 'device_id', 'request_id', 'reference_id', 'target_user_id', 'locked_user_id', 'unlocked_user_id', 'deleted_user_id', 'new_role', 'quantity', 'amount', 'total',
  'active', 'enabled', 'is_active', 'resolved', 'resolved_at', 'severity', 'count', 'changed_at', 'before', 'after',
  'max_login_attempts', 'lockout_duration_minutes', 'session_timeout_minutes', 'password_min_length',
  'password_require_uppercase', 'password_require_lowercase', 'password_require_number', 'password_require_special']);
const safeString = value => typeof value === 'string' && value.length <= 100
  && /^[a-z\d_. :+-]+$/i.test(value) && !/bearer|password\s*:|sk_(?:live|test)|re_[a-z\d]{12}|eyJ[a-z\d]{12}/i.test(value);
const enumValues = new Set(['success', 'successful', 'completed', 'failed', 'failure', 'error', 'warning', 'needs_attention', 'not_applicable',
  'pending', 'approved', 'rejected', 'received', 'refund_processing', 'refunded', 'manual_review', 'paid', 'unpaid', 'processing',
  'delivered', 'shipped', 'cancelled', 'active', 'inactive', 'open', 'closed', 'resend', 'smtp', 'google', 'facebook', 'oauth', 'password',
  'local', 'cash', 'cod', 'gcash', 'paymongo', 'high', 'medium', 'low', 'customer', 'owner', 'admin', 'super_admin', 'store_staff', 'cashier', 'FRESH_AUTH_REQUIRED', 'FRESH_TOTP_REQUIRED']);
const safeIdentifier = value => /^(?:\d{1,16}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.test(String(value || ''));
const safeEnum = value => enumValues.has(value) ? value : typeof value === 'string' && enumValues.has(value.toLowerCase()) ? value.toLowerCase() : null;

export function safeAuditMetadata(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (!scalarKeys.has(key)) continue;
    if (item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) safe[key] = item;
    else if (typeof item === 'string' && (safeEnum(item) || key.endsWith('_id') && safeIdentifier(item))) safe[key] = safeEnum(item) || item;
    else if (['changed_at', 'resolved_at'].includes(key) && /^\d{4}-\d{2}-\d{2}T/.test(item) && Number.isFinite(Date.parse(item))) safe[key] = new Date(item).toISOString();
  }
  return Object.keys(safe).length ? safe : null;
}

export const presentAuditRecord = (row, category = 'activity') => {
  const details = safeAuditMetadata(row.details || row.metadata);
  let type = row.entity_type, id = row.entity_id;
  // Some existing writers recorded the affected ID in metadata rather than in
  // the entity columns. Use that recorded reference; never invent a legacy ID.
  if (!type) for (const [key, area] of [['return_id', 'return'], ['order_id', 'order'], ['product_id', 'product'],
    ['target_user_id', 'user'], ['locked_user_id', 'user'], ['unlocked_user_id', 'user'], ['deleted_user_id', 'user'], ['device_id', 'offline_pos_device']]) {
    if (safeIdentifier(details?.[key])) { type = area; id = details[key]; break; }
  }
  return ({
  id: row.id,
  action: safeString(row.action) ? row.action : null,
  error_type: safeString(row.error_type) ? row.error_type : null,
  entity_type: safeString(type) ? type : null,
  entity_id: safeIdentifier(id) || ['system', 'security', 'maintenance_mode', 'store', 'payment', 'shipping', 'tax', 'returns', 'email', 'home', 'legal'].includes(id) ? id : null,
  user_id: row.user_id ?? row.actor_user_id ?? null,
  user_name: typeof row.user_name === 'string' ? row.user_name.slice(0, 150) : null,
  source: ['activity', 'audit', 'application'].includes(row.source) ? row.source : category === 'errors' ? 'application' : null,
  created_at: row.created_at || null,
  ip_address: /^[a-f\d:.]{3,45}$/i.test(row.ip_address || '') ? row.ip_address : null,
  endpoint: /^(?:[A-Z]+ )?\/api\/[a-z\d_/:.-]+$/i.test(String(row.endpoint || '').split('?')[0]) ? String(row.endpoint).split('?')[0] : null,
  result: safeEnum(row.result || row.outcome || row.status),
  success: typeof row.success === 'boolean' ? row.success : null,
  details,
  before_data: safeAuditMetadata(row.before_data), after_data: safeAuditMetadata(row.after_data),
});
};
