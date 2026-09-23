import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('inventory form uses managed Motorcycle Model and Color without Category or Rack', async () => {
  const source = await read('components/owner/InventoryItemForm.jsx');
  for (const label of ['Part Number', 'Product Name', 'Motorcycle Model', 'Store Selling Price', 'Cost Price', 'Minimum Stock', 'Box Location']) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, />Rack</i);
  assert.doesNotMatch(source, />Category</i);
  assert.match(source, /motorcycle_model_id/);
  assert.match(source, /\+ Add Motorcycle Model/);
  assert.match(source, />Color/);
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
  const [source, picker] = await Promise.all([
    read('pages/owner/StorefrontListingsView.jsx'),
    read('components/owner/InventoryPickerModal.jsx'),
  ]);
  assert.match(source, /Select an inventory item/);
  assert.match(source, /Inventory Item/);
  assert.match(source, /E-commerce Price \(\+15%\)/);
  assert.match(source, /at most 10 images\/videos/);
  assert.match(source, /uploadProductImage/);
  assert.match(source, /uploadProductVideo/);
  assert.doesNotMatch(source, /Cost Price/);
  assert.doesNotMatch(source, /<select disabled=\{Boolean\(editing\)\} required value=\{form\.inventory_item_id\}/);
  assert.match(source, /Choose Inventory Item/);
  assert.match(source, /No color specified/);
  assert.match(picker, /Search part number, product, model, brand, color or Box/);
  assert.match(picker, /Already listed/);
  assert.match(picker, /PAGE_SIZE = 10/);
});

test('inventory save gives success feedback, refreshes the list, and model manager supports add and deactivate', async () => {
  const [view, manager] = await Promise.all([
    read('pages/owner/InventoryView.jsx'),
    read('components/owner/MotorcycleModelManager.jsx'),
  ]);
  assert.match(view, /Inventory item added successfully/);
  assert.match(view, /Item was added but hidden by current filters/);
  assert.match(view, /setProducts\(\(current\) => wasEditing/);
  assert.match(view, /await fetchData\(\)/);
  assert.match(manager, /Motorcycle model added successfully/);
  assert.match(manager, /value="inactive"/);
});

test('staff navigation exposes Inventory and Storefront Listings without duplicate Products management', async () => {
  const [layout, dashboard, app] = await Promise.all([
    read('components/owner/AdminLayout.jsx'),
    read('pages/owner/AdminDashboard.jsx'),
    read('App.jsx'),
  ]);
  assert.match(layout, /Storefront Listings/);
  assert.match(layout, /Inventory/);
  assert.doesNotMatch(layout, /id: 'products', label: 'Products'/);
  assert.match(dashboard, /StorefrontListingsView/);
  assert.doesNotMatch(dashboard, /import ProductsView/);
  assert.doesNotMatch(dashboard, /products: <ProductsView/);
  assert.match(dashboard, /Product management is now handled through Inventory/);
  assert.match(dashboard, /\['products', 'categories', 'variants'\]/);
  assert.match(app, /path="\/products\/manage"/);
  assert.match(app, /\/staff\/inventory/);
  assert.match(app, /\/admin\/inventory/);
});

test('operations dashboards source inventory alerts from the inventory API', async () => {
  const [ownerDashboard, staffDashboard, security] = await Promise.all([
    read('pages/owner/DashboardView.jsx'),
    read('pages/staff/StaffDashboardView.jsx'),
    read('pages/owner/SecurityView.jsx'),
  ]);
  assert.match(ownerDashboard, /getInventory/);
  assert.doesNotMatch(ownerDashboard, /getProducts/);
  assert.match(staffDashboard, /getInventory/);
  assert.doesNotMatch(staffDashboard, /getProducts/);
  assert.match(security, /Storefront Listings/);
});
