import test from 'node:test';
import assert from 'node:assert/strict';
import { actionLabel, auditOutcome, affectedItem, actorLabel, auditRecordLink, advancedAuditDetails, errorStatus, repeatedErrors, missingDataHelp } from '../utils/auditPresentation.js';
import { safeDiagnosticSummary } from '../utils/operationsDiagnostics.js';

test('audit actions are friendly and preserve truthful legacy missing states', () => {
  for (const [action, label] of [['login', 'Signed in'], ['logout', 'Signed out'], ['pos.sale', 'POS sale completed'], ['return.approve', 'Return approved'], ['return.reject', 'Return rejected'], ['maintenance.started', 'Maintenance started']]) assert.equal(actionLabel({ action }), label);
  assert.equal(actionLabel({ action: 'oauth login', details: { provider: 'google' } }), 'Signed in with Google');
  assert.equal(actionLabel({ error_type: 'DB ERROR' }, 'errors'), 'Database operation failed');
  assert.equal(affectedItem({ action: 'login' }), 'Not applicable');
  assert.equal(affectedItem({ action: 'settings.update' }), 'Not captured');
  assert.equal(actorLabel({ action: 'login' }), 'Not captured');
  assert.equal(auditOutcome({ action: 'pos.sale' }).label, 'Outcome not captured');
  assert.equal(auditOutcome({ details: { outcome: 'success' } }).label, 'Successful');
  assert.equal(auditOutcome({ details: { outcome: 'warning' } }).tone, 'warning');
  assert.equal(auditOutcome({}, 'errors').label, 'Failed');
  assert.match(missingDataHelp['Outcome not captured'], /does not mean the action failed/);
});

test('record links honor workspace permissions and never send Super Admin to a customer order', () => {
  const order = { entity_type: 'order', entity_id: 244 };
  assert.equal(auditRecordLink(order, 'super_admin'), null);
  assert.equal(auditRecordLink(order, 'owner'), '/admin/orders?order=244');
  assert.equal(auditRecordLink(order, 'store_staff'), null);
  assert.equal(auditRecordLink(order, 'store_staff', ['orders.view']), '/staff/orders?order=244');
  assert.equal(auditRecordLink({ entity_type: 'system_settings', entity_id: 'security' }, 'super_admin'), '/superadmin/security');
  assert.equal(affectedItem({ entity_type: 'system_settings', entity_id: 'maintenance_mode' }), 'Store maintenance');
});

test('advanced details are sanitized and errors never imply resolution without evidence', () => {
  const log = { id: 3, error_type: 'DB_ERROR', details: { password: 'fixture-secret', token: 'fixture-secret', provider: 'fixture-secret',
    body: { email: 'private@example.test' }, request_id: 'not-a-real-request', quantity: 2, outcome: 'failed' } };
  assert.doesNotMatch(JSON.stringify(advancedAuditDetails(log)), /fixture-secret|private@example|not-a-real-request|password|body/);
  assert.doesNotMatch(JSON.stringify(advancedAuditDetails({ details: { request_id: 'fixture-secret' }, ip_address: 'fixture-secret', entity_id: 'fixture-secret' })), /fixture-secret/);
  assert.equal(errorStatus(log), 'Needs attention');
  assert.equal(errorStatus({ details: { resolved: true } }), 'Needs attention');
  assert.equal(errorStatus({ details: { resolved: true, resolved_at: '2026-10-24T00:00:00Z' } }), 'Resolved');
  assert.equal(repeatedErrors([log, { ...log, id: 4 }, { id: 5, error_type: 'OTHER' }])[0].length, 2);
});

test('copied diagnostics include only safe health categories, time and reference', () => {
  const safe = safeDiagnosticSummary({ timestamp: '2026-10-24T00:00:00Z', reference: '11111111-1111-4111-8111-111111111111', overall: 'healthy',
    database: 'connected', email: 'must-not-leak-email-key', payments: 'configured', maintenance: 'inactive', recent_errors_24h: 2,
    backup: { status: 'successful', time: '2026-10-24T00:00:00Z', storage_key: 'must-not-leak-storage' },
    token: 'must-not-leak-token', customer: 'private@example.test', password: 'must-not-leak-password' });
  assert.equal(safe.database, 'connected'); assert.equal(safe.email, 'unavailable'); assert.equal(safe.recent_errors_24h, 2);
  assert.doesNotMatch(JSON.stringify(safe), /must-not-leak|private@example|storage_key|token|password/);
});
