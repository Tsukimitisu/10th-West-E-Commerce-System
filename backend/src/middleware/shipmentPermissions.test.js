import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import pool from '../config/database.js';
import { requirePermission, requirePermissionForRoles, requireRole } from './auth.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

after(async () => {
  await pool.end().catch(() => {});
});

const makeResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('staff without granular shipping permissions is denied', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  try {
    for (const permission of ['shipments.manage', 'shipments.view']) {
      const req = { user: { id: 99, role: 'store_staff' } };
      const res = makeResponse();
      let nextCalled = false;
      await requirePermission(permission)(req, res, () => { nextCalled = true; });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, 'PERMISSION_DENIED');
      assert.equal(res.body.permission, permission);
    }
  } finally {
    pool.query = originalQuery;
  }
});

test('customer own-tracking path bypasses staff permission but remains ownership-scoped', async () => {
  const req = { user: { id: 10, role: 'customer' } };
  const res = makeResponse();
  let nextCalled = false;
  requirePermissionForRoles(
    'shipments.view',
    'admin',
    'super_admin',
    'owner',
    'store_staff'
  )(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  const controller = await readFile(path.resolve(directory, '..', 'controllers', 'shipmentController.js'), 'utf8');
  assert.match(controller, /o\.user_id = \$3/);
});

test('shipment mutation routes use the required granular permissions', async () => {
  const shipmentRoutes = await readFile(path.resolve(directory, '..', 'routes', 'shipments.js'), 'utf8');
  assert.match(shipmentRoutes, /'\/orders\/:orderId\/waybill'[\s\S]*?requireRole\(\.\.\.staffRoles\)[\s\S]*?requirePermission\('shipments\.manage'\)/);
  assert.match(shipmentRoutes, /'\/:shipmentId\/status'[\s\S]*?requireRole\(\.\.\.staffRoles\)[\s\S]*?requirePermission\('shipments\.manage'\)/);
  assert.match(shipmentRoutes, /'\/orders\/:orderId'.*customerOrShipmentViewer/);
});

test('customer role cannot create a manual waybill', () => {
  const req = { user: { id: 10, role: 'customer' } };
  const res = makeResponse();
  let nextCalled = false;
  requireRole('admin', 'super_admin', 'owner', 'store_staff')(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'ROLE_ACCESS_DENIED');
});
