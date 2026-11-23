import { test, expect } from '@playwright/test';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { staffFixture } from './staffPhaseFixture.js';

// Real controllers, CSRF and SQL, isolated in PGlite. No remote DB or storage.
let api, worker;
test.beforeAll(async () => {
  test.setTimeout(60000);
  worker = fork(fileURLToPath(new URL('../../backend/test-support/listingEditorServer.js', import.meta.url)), [], {
    env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  worker.stdout.on('data', chunk => { output += chunk; });
  worker.stderr.on('data', chunk => { output += chunk; });
  api = await new Promise((resolve, reject) => {
    worker.once('message', message => resolve(`http://localhost:${message.port}`));
    worker.once('exit', () => reject(new Error(output)));
  });
});
test.afterAll(async () => {
  if (worker?.connected) await new Promise(resolve => {
    const timer = setTimeout(() => worker.kill(), 5000);
    worker.once('exit', () => { clearTimeout(timer); resolve(); });
    worker.send('stop');
  });
});

async function setup(page, request, role, viewport) {
  await request.post(`${api}/fixture/reset`);
  await request.post(`${api}/fixture/many-items`, { data: { count: 15 } });
  await page.setViewportSize(viewport);
  await staffFixture(page, { user: { role }, permissions: ['inventory.view', 'products.view', 'products.manage'] });
  await page.routeWebSocket('**/socket.io/**', socket => {
    socket.send('0{"sid":"fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
    socket.onMessage(message => { if (message === '40') socket.send('40{"sid":"fixture"}'); if (message === '2') socket.send('3'); });
  });
  const login = await request.post(`${api}/fixture/login`, { data: { id: role === 'owner' ? 1 : 2 } });
  const cookie = login.headers()['set-cookie'].split(';')[0];
  const { csrfToken } = await (await request.get(`${api}/api/csrf-token`, { headers: { cookie } })).json();
  const errors = { pageerror: [], console: [] };
  page.on('pageerror', error => errors.pageerror.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  await page.route(/\/api\/(?:ecommerce-listings(?:\/\d+)?|products\/upload-image|inventory|motorcycle-models|variants\/product\/\d+)(?:\?.*)?$/, async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    const response = await route.fetch({ url: `${api}${url.pathname}${url.search}`, maxRetries: incoming.method() === 'GET' ? 2 : 0, headers: { ...incoming.headers(), cookie, 'x-csrf-token': csrfToken } });
    await route.fulfill({ response });
  });
  // Real, decodable PNG and JPG selected through the browser file chooser.
  const files = await page.evaluate(() => ['image/png', 'image/jpeg'].map(type => {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 72;
    const context = canvas.getContext('2d'); context.fillStyle = '#f36a21'; context.fillRect(0, 0, 96, 72);
    return { type, data: canvas.toDataURL(type).split(',')[1] };
  }));
  await page.goto(`/#/${role === 'owner' ? 'admin' : 'staff'}/storefront`);
  const dialog = page.getByRole('dialog', { name: 'Edit Set Listing', exact: true });
  const open = async () => {
    await page.getByRole('row').filter({ hasText: 'Fixture panel set' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(dialog.locator('ol > li')).toHaveCount(15);
  };
  await open();
  return { dialog, open, errors, files, row: number => dialog.locator(`[data-product-item-id="${100 + number}"]`) };
}

async function snapshot(dialog, number) {
  return dialog.evaluate((node, number) => {
    const panel = node.querySelector('.brand-dialog-panel'), content = panel.lastElementChild;
    const rect = element => element ? element.getBoundingClientRect().toJSON() : null;
    const describe = element => element ? { tag: element.tagName, type: element.type, label: element.getAttribute('aria-label') } : null;
    const row = node.querySelector(`[data-product-item-id="${100 + number}"]`);
    return {
      panel: { box: rect(panel), clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight, scrollTop: panel.scrollTop, overflowY: getComputedStyle(panel).overflowY },
      content: { box: rect(content), clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, scrollTop: content.scrollTop, overflowY: getComputedStyle(content).overflowY },
      form: { exists: Boolean(node.querySelector('form')), box: rect(node.querySelector('form')) },
      header: rect(node.querySelector('h2')), row: rect(row), focused: describe(document.activeElement),
      body: { scrollTop: document.body.scrollTop, overflow: document.body.style.overflow }, documentScrollTop: document.documentElement.scrollTop,
      windowScrollY: scrollY, innerHeight, visualViewport: { height: visualViewport?.height, offsetTop: visualViewport?.offsetTop },
    };
  }, number);
}

async function visibleEditor(dialog, row, viewport) {
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Edit Set Listing', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  await expect(dialog.locator('form')).toBeVisible();
  await expect(row).toBeInViewport({ ratio: 0.8 });
  await expect(row.locator('[data-upload-key]')).toBeInViewport();
  const state = await snapshot(dialog, 15);
  expect(state.content.scrollHeight).toBeGreaterThan(state.content.clientHeight);
  expect(state.content.clientHeight).toBeGreaterThan(100);
  expect(state.content.scrollTop).toBeGreaterThanOrEqual(0);
  expect(state.content.scrollTop).toBeLessThanOrEqual(state.content.scrollHeight - state.content.clientHeight + 1);
  expect(state.panel.scrollTop).toBe(0);
  expect(state.panel.box.y).toBeGreaterThanOrEqual(-1);
  expect(state.panel.box.bottom).toBeLessThanOrEqual(viewport.height + 1);
  if (viewport.width < 640) expect(state.panel.box.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(await row.locator('[data-upload-key] button').first().evaluate(button => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

for (const role of ['owner', 'store_staff']) {
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1440, height: 950 }]) {
    test(`lower-row chooser return ${role} ${viewport.width}x${viewport.height}`, async ({ page, request }, testInfo) => {
      test.setTimeout(120000);
      const { dialog, open, errors, files, row } = await setup(page, request, role, viewport);
      const evidence = [];
      try {
        for (const number of [1, 4, 6, 10, 15]) {
          const item = row(number), input = item.locator('input[type=file]');
          await item.scrollIntoViewIfNeeded();
          const record = { number, before: await snapshot(dialog, number) }; evidence.push(record);
          const choosing = page.waitForEvent('filechooser');
          await item.locator('label, button').filter({ hasText: /^(Upload image|Replace image)$/ }).click();
          const chooser = await choosing;
          record.picker = await snapshot(dialog, number);
          const file = files[number % 2];
          await chooser.setFiles({ name: `panel-${number}.${number % 2 ? 'jpg' : 'png'}`, mimeType: file.type, buffer: Buffer.from(file.data, 'base64') });
          await expect(item.locator('[data-upload-key]')).toHaveAttribute('data-upload-state', 'completed');
          record.after = await snapshot(dialog, number);
          // Attach diagnostics even when the full-height/visibility assertions fail.
          await visibleEditor(dialog, item, viewport);
          await expect(item.locator('[data-upload-key] button').first()).toBeFocused();
          await expect.poll(() => item.locator('img').evaluate(image => image.naturalWidth)).toBe(96);
          const url = await item.locator('img').getAttribute('src');
          await dialog.getByRole('button', { name: 'Save Listing', exact: true }).click();
          await expect(dialog).toHaveCount(0); await open();
          await row(number).scrollIntoViewIfNeeded();
          await expect(row(number).locator('img')).toHaveAttribute('src', url);
          await visibleEditor(dialog, row(number), viewport);
          expect(errors.pageerror).toEqual([]); expect(errors.console).toEqual([]);
          // Replacement also uses the actual chooser, including for the last row.
          const replacing = page.waitForEvent('filechooser');
          await row(number).getByText('Replace image', { exact: true }).click();
          await (await replacing).setFiles({ name: 'replacement.png', mimeType: files[0].type, buffer: Buffer.from(files[0].data, 'base64') });
          await expect(row(number).locator('img')).not.toHaveAttribute('src', url);
          await expect(row(number).locator('[data-upload-key]')).toHaveAttribute('data-upload-state', 'completed');
          await visibleEditor(dialog, row(number), viewport);
          const replacementUrl = await row(number).locator('img').getAttribute('src');
          // Reopen per row to exercise persistence independently.
          await dialog.getByRole('button', { name: 'Save Listing', exact: true }).click();
          await expect(dialog).toHaveCount(0); await open();
          await expect(row(number).locator('img')).toHaveAttribute('src', replacementUrl);
        }
        expect(errors.pageerror).toEqual([]); expect(errors.console).toEqual([]);
      } finally {
        const path = testInfo.outputPath('mobile-layout-focus-evidence.json');
        await writeFile(path, JSON.stringify({ viewport, role, evidence, errors }, null, 2));
        await testInfo.attach('mobile-layout-focus-evidence', { path, contentType: 'application/json' });
      }
    });
  }
}

for (const role of ['owner', 'store_staff']) {
  test(`mobile render fallback stays reachable and retries unsaved work (${role})`, async ({ page, request }) => {
    const { dialog, row, files } = await setup(page, request, role, { width: 390, height: 844 });
    await dialog.getByRole('textbox', { name: 'Set title', exact: true }).fill('Unsaved mobile title');
    await row(15).scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.editorFault = true;
      const includes = Array.prototype.includes;
      Array.prototype.includes = function (value, ...rest) {
        if (window.editorFault && typeof value === 'string' && value.includes('/fixture-media/')) throw new Error('Fixture mobile render failure');
        return Reflect.apply(includes, this, [value, ...rest]);
      };
    });
    await row(15).locator('input[type=file]').setInputFiles({ name: 'fallback.png', mimeType: files[0].type, buffer: Buffer.from(files[0].data, 'base64') });
    await expect(dialog.getByText('Something went wrong while editing this listing.', { exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Retry editor', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('alert').getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('heading', { name: 'Edit Set Listing', exact: true })).toBeInViewport();
    await page.evaluate(() => { window.editorFault = false; });
    await dialog.getByRole('button', { name: 'Retry editor', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Set title', exact: true })).toHaveValue('Unsaved mobile title');
    await expect(dialog.locator('ol > li')).toHaveCount(15);
  });

  test(`picker return repairs browser scroll displacement and late viewport events (${role})`, async ({ page, request }) => {
    const viewport = { width: 390, height: 844 };
    const { dialog, errors, files, row } = await setup(page, request, role, viewport);
    const item = row(15);
    // A clipped shell must never become a competing scroll owner, even if a
    // browser attempts to restore an old ancestor scroll offset.
    await dialog.locator('.brand-dialog-panel').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const shell = await snapshot(dialog, 15);
    expect(shell.panel.scrollTop, JSON.stringify(shell)).toBe(0);
    await item.scrollIntoViewIfNeeded();
    const before = await snapshot(dialog, 15);
    const choosing = page.waitForEvent('filechooser');
    await item.getByRole('button', { name: 'Choose image for Panel 15', exact: true }).click();
    const chooser = await choosing;
    // Explicit fault injection, not a claim to emulate an Android gallery:
    // model a browser moving its scroll owner while the page is suspended.
    await page.setViewportSize({ width: 390, height: 540 });
    await dialog.locator('[data-modal-scroll]').evaluate(node => { node.scrollTop = 0; });
    await chooser.setFiles({ name: 'native-return.png', mimeType: files[0].type, buffer: Buffer.from(files[0].data, 'base64') });
    await expect(item.locator('[data-upload-key]')).toHaveAttribute('data-upload-state', 'completed');
    await page.setViewportSize(viewport);
    // Some native browsers deliver focus/resize after change has completed.
    await dialog.locator('[data-modal-scroll]').evaluate(node => { node.scrollTop = 0; window.dispatchEvent(new Event('focus')); visualViewport.dispatchEvent(new Event('resize')); });
    await expect.poll(async () => (await snapshot(dialog, 15)).content.scrollTop).toBeCloseTo(before.content.scrollTop, 0);
    await visibleEditor(dialog, item, viewport);
    await expect(item.getByRole('button', { name: 'Replace image for Panel 15', exact: true })).toBeFocused();
    expect(errors.pageerror).toEqual([]); expect(errors.console).toEqual([]);
    // A new touch must hand scrolling back to the user, with no stale snap.
    await dialog.locator('[data-modal-scroll]').dispatchEvent('pointerdown');
    await dialog.locator('[data-modal-scroll]').evaluate(node => { node.scrollTop = 0; window.dispatchEvent(new Event('focus')); });
    await expect(dialog.getByRole('textbox', { name: 'Set title', exact: true })).toBeInViewport();
    expect((await snapshot(dialog, 15)).content.scrollTop).toBe(0);
  });

  for (const width of [390, 768, 1440]) test(`lower-row cancel, failed upload, remove and close during upload ${role} ${width}px`, async ({ page, request }) => {
    test.setTimeout(60000);
    const viewport = { width, height: width === 390 ? 844 : 950 };
    const { dialog, open, errors, files, row } = await setup(page, request, role, viewport);
    const file = { name: 'panel.png', mimeType: files[0].type, buffer: Buffer.from(files[0].data, 'base64') };
    await row(15).scrollIntoViewIfNeeded();
    const choose = async () => {
      const choosing = page.waitForEvent('filechooser');
      await row(15).locator('[data-upload-key] button').first().click();
      return choosing;
    };
    await (await choose()).setFiles([]);
    await row(15).locator('input[type=file]').dispatchEvent('cancel');
    await visibleEditor(dialog, row(15), viewport);
    await request.post(`${api}/fixture/storage`, { data: { failure: { status: 400, message: 'Fixture gallery unavailable' } } });
    await (await choose()).setFiles(file);
    await expect(row(15).getByRole('alert')).toBeVisible();
    await visibleEditor(dialog, row(15), viewport);
    await request.post(`${api}/fixture/storage`, { data: {} });
    await (await choose()).setFiles(file);
    await expect(row(15).locator('[data-upload-key]')).toHaveAttribute('data-upload-state', 'completed');
    await row(15).getByRole('button', { name: 'Remove image for Panel 15', exact: true }).click();
    await expect(row(15).getByRole('button', { name: 'Choose image for Panel 15', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save Listing', exact: true }).click();
    await expect(dialog).toHaveCount(0); await open();
    await row(15).scrollIntoViewIfNeeded();
    await expect(row(15).getByRole('button', { name: 'Remove image for Panel 15', exact: true })).toHaveCount(0);
    await request.post(`${api}/fixture/storage`, { data: { hold: true } });
    await (await choose()).setFiles(file);
    await expect(row(15).locator('[data-upload-key]')).toHaveAttribute('data-upload-state', 'uploading');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await request.post(`${api}/fixture/storage`, { data: {} });
    await open();
    await expect(dialog.getByRole('button', { name: 'Save Listing', exact: true })).toBeEnabled();
    await expect(row(15).getByRole('button', { name: 'Remove image for Panel 15', exact: true })).toHaveCount(0);
    expect(errors.pageerror).toEqual([]);
    expect(errors.console.filter(message => !/^Failed to load resource:.*status of 400/.test(message))).toEqual([]);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}
