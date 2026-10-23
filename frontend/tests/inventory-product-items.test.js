import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatItemLocation, formatItemPrice, itemStockLabel } from '../utils/inventoryProductItems.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('product item values use PHP prices and readable stock and location labels', () => {
  assert.equal(formatItemPrice(350), '₱350.00');
  assert.equal(formatItemLocation({ boxNumber: 'Box A-01', storageLocation: 'Shelf 2' }), 'Box A-01 / Shelf 2');
  assert.equal(formatItemLocation({ boxNumber: 'Box A-01' }), 'Box A-01');
  assert.equal(formatItemLocation({ storageLocation: 'Shelf 2' }), 'Shelf 2');
  assert.equal(formatItemLocation({}), 'Not specified');
  assert.equal(itemStockLabel({ stockQuantity: 0, lowStockThreshold: 5 }), 'Out of stock');
  assert.equal(itemStockLabel({ stockQuantity: 3, lowStockThreshold: 5 }), 'Low stock');
  assert.equal(itemStockLabel({ stockQuantity: 12, lowStockThreshold: 5 }), 'In stock');
});

test('product items browser has read-only table, search, filters, sorting, pagination, and fetch states', async () => {
  const [page, api] = await Promise.all([
    read('pages/owner/InventoryProductItemsView.jsx'), read('services/api.js'),
  ]);
  for (const label of ['Part Number', 'Item Name', 'Color', 'Price', 'Stock', 'Box / Location', 'Brand / Model', 'Category', 'Status']) {
    assert.ok(page.includes(label), label);
  }
  assert.match(page, /getInventoryProductItems\(\{ q: debouncedSearch, \.\.\.filters, page, pageSize: PAGE_SIZE, sortBy, sortDir \}\)/);
  assert.match(api, /inventory\/product-items\?/);
  assert.match(page, /Loading product items/);
  assert.match(page, /No product items found/);
  assert.match(page, /Unable to load product items\. Please try again/);
  assert.match(page, /Previous/);
  assert.match(page, /Next/);
  assert.doesNotMatch(page, /createInventoryItem|updateInventoryItem|adjustStock|deleteProduct|Add Inventory Item|Edit Item|Delete Item/);
});

test('staff and admin share a guarded inventory route, while super admin has its own navigation', async () => {
  const [app, dashboard, layout, superDashboard, superLayout] = await Promise.all([
    read('App.jsx'), read('pages/owner/AdminDashboard.jsx'), read('components/owner/AdminLayout.jsx'),
    read('pages/superadmin/SuperAdminDashboard.jsx'), read('components/superadmin/SuperAdminLayout.jsx'),
  ]);
  assert.match(app, /path="\/admin\/\*" element=\{user\?\.role === Role\.OWNER \|\| user\?\.role === Role\.ADMIN/);
  assert.match(app, /path="\/staff\/\*" element=\{user\?\.role === Role\.STORE_STAFF/);
  assert.match(app, /path="\/superadmin\/\*" element=\{user\?\.role === Role\.SUPER_ADMIN/);
  assert.match(dashboard, /'product-items': <InventoryProductItemsView/);
  assert.match(dashboard, /inventory\/product-items/);
  assert.match(layout, /id: 'product-items'.*permission: 'inventory.view'/);
  assert.match(superDashboard, /'product-items': <InventoryProductItemsView/);
  assert.match(superLayout, /id: 'product-items', label: 'Product Items'/);
});
