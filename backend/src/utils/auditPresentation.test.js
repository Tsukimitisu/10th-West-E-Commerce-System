import test from 'node:test';
import assert from 'node:assert/strict';
import { presentAuditRecord, safeAuditMetadata } from './auditPresentation.js';
import { auditOutcome, writeAuditLog } from './audit.js';

test('audit read projection strips credentials, PII, arbitrary messages, stacks and query parameters without changing history', () => {
  const original = { id: 1, action: 'login', user_name: 'Shop Operator', created_at: '2026-10-24T00:00:00Z',
    details: { password: 'fixture-private-password', token: 'fixture-private-token', email: 'private@example.test',
      body: { api_key: 'fixture-private-key' }, status: 'fixture-private-value', quantity: 3, outcome: 'success' },
    message: 'SELECT private SQL', stack_trace: 'private filesystem', endpoint: 'POST /api/auth/login?token=private', ip_address: '127.0.0.1' };
  const unchanged = JSON.stringify(original);
  const safe = presentAuditRecord(original);
  assert.deepEqual(safe.details, { quantity: 3, outcome: 'success' });
  assert.equal(safe.endpoint, 'POST /api/auth/login');
  assert.doesNotMatch(JSON.stringify(safe), /fixture-private|SELECT private|private@example|filesystem|stack_trace|api_key/);
  assert.equal(JSON.stringify(original), unchanged);
  assert.equal(presentAuditRecord({ id: 2, action: 'logout' }).result, null, 'never invent a legacy outcome');
  assert.equal(safeAuditMetadata('unstructured password=private'), null);
  assert.equal(presentAuditRecord({ entity_type: 'system_settings', entity_id: 'email' }).entity_id, 'email');
  const referenced = presentAuditRecord({ action: 'admin_change_role', details: { target_user_id: 44, new_role: 'store_staff' } });
  assert.equal(referenced.entity_type, 'user'); assert.equal(referenced.entity_id, 44);
});

test('new shared audit writes capture success/failure while rejecting a return is a successful administrative decision', async () => {
  const written = [];
  const db = { query: async (sql, args) => written.push({ sql, args }) };
  for (const action of ['login', 'return.reject', 'pos.sale', 'DATABASE_RESTORE_FAILED', 'login_failed']) await writeAuditLog(db, { action });
  assert.deepEqual(written.map(row => JSON.parse(row.args.at(-1)).outcome), ['success', 'success', 'success', 'failed', 'failed']);
  assert.equal(auditOutcome('maintenance.change_failed'), 'failed');
  assert.ok(written.every(row => /^INSERT INTO audit_logs/.test(row.sql)));
});
