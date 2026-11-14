import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const controllerPath = path.resolve(directory, '..', '..', 'controllers', 'shipmentController.js');

test('manual waybill and status changes record explicit audit outcomes', async () => {
  const source = await readFile(controllerPath, 'utf8');
  assert.match(source, /'shipment\.manual_waybill\.create'/);
  assert.match(source, /'shipment\.manual_status\.update'/);
  assert.match(source, /provider: 'manual'/);
});

test('manual shipment audit metadata excludes raw request bodies', async () => {
  const source = await readFile(controllerPath, 'utf8');
  assert.doesNotMatch(source, /JSON\.stringify\(req\.body\)/);
  assert.doesNotMatch(source, /rawBody|webhook|signature_verified/i);
});
