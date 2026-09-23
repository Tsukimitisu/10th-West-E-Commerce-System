import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('customer and operations notification panels fit the mobile viewport', async () => {
  const [navbar, operations] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/owner/AdminLayout.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(navbar, /fixed left-4 right-4 top-16/);
  assert.match(navbar, /sm:w-\[26rem\]/);
  assert.match(navbar, /overflow-x-hidden overflow-y-auto/);
  assert.match(navbar, /flex flex-wrap items-center gap-2 text-\[11px\]/);
  assert.match(navbar, /Loading notifications/);
  assert.match(navbar, /Unable to load notifications/);
  assert.match(navbar, /No notifications yet/);
  assert.match(operations, /fixed inset-x-4 top-16/);
  assert.match(operations, /\[overflow-wrap:anywhere\]/);
});
