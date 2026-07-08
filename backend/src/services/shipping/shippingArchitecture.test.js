import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendSource = path.resolve(currentDirectory, '..', '..');
const repositoryRoot = path.resolve(backendSource, '..', '..');

const listSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !['dist', 'node_modules'].includes(entry.name)) {
      files.push(...await listSourceFiles(target));
    }
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(target);
  }
  return files;
};

test('active backend and frontend source contain no direct courier-specific integration', async () => {
  const files = [
    ...await listSourceFiles(backendSource),
    ...await listSourceFiles(path.join(repositoryRoot, 'frontend')),
  ].filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));
  const forbidden = /\bJNT_|direct_jnt|JNT_MOCK_MODE|jntShipments|createJnt|refreshJnt/i;
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (forbidden.test(source)) violations.push(path.relative(repositoryRoot, file));
  }
  assert.deepEqual(violations, []);
});

test('shipment and waybill mutation routes require staff roles and granular permissions', async () => {
  const shipmentRoutes = await readFile(path.join(backendSource, 'routes', 'shipments.js'), 'utf8');
  const waybillRoutes = await readFile(path.join(backendSource, 'routes', 'waybills.js'), 'utf8');
  assert.match(shipmentRoutes, /const staffRoles = \[\.\.\.STAFF_ROLES\]/);
  assert.match(shipmentRoutes, /router\.post\('\/book', authenticateToken, requireRole\(\.\.\.staffRoles\), requirePermission\('shipments\.manage'\)/);
  assert.match(shipmentRoutes, /requirePermissionForRoles\('shipments\.view'/);
  assert.match(shipmentRoutes, /requirePermission\('tracking\.refresh'\)/);
  assert.match(waybillRoutes, /requirePermission\('waybills\.generate'\), generateWaybill/);
  assert.match(waybillRoutes, /requirePermission\('waybills\.generate'\), reprintWaybill/);
});

test('shipping operations delegate through selected providers and persist sanitized errors', async () => {
  const controller = await readFile(path.join(backendSource, 'controllers', 'shipmentController.js'), 'utf8');
  assert.match(controller, /createShipment\(payload\)/);
  assert.match(controller, /generateProviderWaybill/);
  assert.match(controller, /getTrackingStatus/);
  assert.match(controller, /recordProviderError\(shipmentId, 'booking'/);
  assert.match(controller, /recordProviderError\(failedShipment\.rows\[0\]\?\.id, 'tracking_refresh'/);
  const publicShipmentMapper = controller.match(/const safeShipment = \(shipment\) => \(\{[\s\S]*?\n\}\);/)?.[0] || '';
  assert.doesNotMatch(publicShipmentMapper, /provider_metadata/);
});

test('readiness reports generic shipping and tracking state', async () => {
  const server = await readFile(path.join(backendSource, 'server.js'), 'utf8');
  const adminRoutes = await readFile(path.join(backendSource, 'routes', 'admin.js'), 'utf8');
  const integrationReadiness = await readFile(path.join(backendSource, 'services', 'integrationReadiness.js'), 'utf8');
  const publicReadiness = server.slice(server.indexOf("app.get('/api/ready'"), server.indexOf('// CSRF token endpoint'));
  assert.match(publicReadiness, /core_ready/);
  assert.match(publicReadiness, /commerce_ready/);
  assert.match(publicReadiness, /integrations_ready/);
  assert.doesNotMatch(publicReadiness, /shipping_provider|shipping_carrier|tracking_provider/);
  assert.match(adminRoutes, /buildAdminIntegrationReadiness/);
  assert.match(integrationReadiness, /shipping:\s*\{[\s\S]*?provider: shipping\.provider,[\s\S]*?carrier:/);
  assert.match(integrationReadiness, /tracking:\s*\{[\s\S]*?provider: tracking\.provider,[\s\S]*?carrier:/);
});
