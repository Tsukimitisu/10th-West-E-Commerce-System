import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('inventory form contains Box Location and official core fields without Rack', async () => {
  const source = await read('components/owner/InventoryItemForm.jsx');
  for (const label of ['Part Number', 'Product Name', 'Motorcycle Model', 'Store Selling Price', 'Cost Price', 'Minimum Stock', 'Box Location']) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, />Rack</i);
  assert.match(source, /\* 1\.15/);
});

test('receiving uses scanner-enter lookup and offers add-new inventory for unknown parts', async () => {
  const source = await read('components/owner/ReceiveStock.jsx');
  assert.match(source, /onSubmit=\{handleScan\}/);
  assert.match(source, /findInventoryItem/);
  assert.match(source, /Part Number Not Found/);
  assert.match(source, /InventoryItemForm/);
  assert.match(source, /batchReceiveStock/);
  assert.doesNotMatch(source, />Rack</i);
});

test('storefront listing selects inventory first, renders core fields read-only, and bounds media at ten', async () => {
  const source = await read('pages/owner/StorefrontListingsView.jsx');
  assert.match(source, /Select an inventory item/);
  assert.match(source, /Inventory Item/);
  assert.match(source, /Online Price \(\+15%\)/);
  assert.match(source, /at most 10 images\/videos/);
  assert.match(source, /uploadProductImage/);
  assert.match(source, /uploadProductVideo/);
  assert.doesNotMatch(source, /Cost Price/);
});

test('staff navigation exposes separate Inventory and Storefront listings workspaces', async () => {
  const [layout, dashboard] = await Promise.all([
    read('components/owner/AdminLayout.jsx'),
    read('pages/owner/AdminDashboard.jsx'),
  ]);
  assert.match(layout, /Storefront listings/);
  assert.match(layout, /Inventory/);
  assert.match(dashboard, /StorefrontListingsView/);
});
