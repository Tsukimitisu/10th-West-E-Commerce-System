import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('messages hide the site footer and occupy the dynamic viewport', async () => {
  const [app, messages] = await Promise.all([
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/customer/Messages.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /hideFooter = hideChrome \|\| location\.pathname === '\/messages'/);
  assert.match(app, /!hideFooter && !isSuperAdmin && <Footer \/>/);
  assert.match(messages, /h-\[calc\(100dvh-4rem\)\]/);
  assert.match(messages, /min-h-0 min-w-0 flex-1 flex-col overflow-hidden/);
  assert.match(messages, /aria-label="Back to conversations"/);
  assert.match(messages, /min-h-11 min-w-0 flex-1 resize-none/);
});
