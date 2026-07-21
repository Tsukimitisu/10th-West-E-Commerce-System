import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const controllerPath = path.resolve(directory, '..', '..', 'controllers', 'shipmentController.js');

test('shipping webhook records accepted, rejected, and unmatched audit outcomes', async () => {
  const source = await readFile(controllerPath, 'utf8');
  assert.match(source, /'shipment\.webhook'/);
  assert.match(source, /'shipment\.webhook_rejected'/);
  assert.match(source, /'shipment\.webhook_unmatched'/);
  assert.match(source, /signature_verified: true/);
  assert.match(source, /signature_verified: false/);
});

test('shipping webhook audit metadata does not persist raw bodies or signatures', async () => {
  const source = await readFile(controllerPath, 'utf8');
  const webhookSection = source.slice(
    source.indexOf('export const shipmentWebhook'),
    source.indexOf('export const getTracking')
  );
  assert.doesNotMatch(webhookSection, /JSON\.stringify\(req\.body\)/);
  assert.doesNotMatch(webhookSection, /rawBody.*metadata|signature.*metadata/i);
});
