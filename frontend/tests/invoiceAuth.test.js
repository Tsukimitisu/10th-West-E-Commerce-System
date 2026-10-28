import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const api = readFileSync(new URL('../services/api.js', import.meta.url), 'utf8');
const screens = ['customer/OrderConfirmation', 'customer/OrderDetail', 'owner/OrdersView'];

test('all invoice buttons use the shared authenticated opener and display failures', () => {
  for (const screen of screens) {
    const source = readFileSync(new URL(`../pages/${screen}.jsx`, import.meta.url), 'utf8');
    assert.match(source, /openOrderInvoice\(/);
    assert.doesNotMatch(source, /window\.open\([^\n]*\/invoice/);
    assert.match(source, /catch\([^\n]*(?:setInvoiceError|setStatusError)/);
  }
});

function harness(response = new Response('<!doctype html><html>Invoice</html>', { headers: { 'Content-Type': 'text/html' } })) {
  const calls = [];
  const tab = { closed: false, opener: {}, location: {}, close() { this.closed = true; } };
  const timers = [];
  let blob;
  let popup = tab;
  const context = vm.createContext({
    API_URL: 'https://api.example.test/api', Blob, FormData, AbortController, AbortSignal, Event,
    URL: { createObjectURL(value) { blob = value; return 'blob:https://shop.example.test/invoice'; }, revokeObjectURL(url) { calls.push(['revoke', url]); } },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
    fetch: async (url, options) => { calls.push(['fetch', url, options]); if (response instanceof Error) throw response; return response; },
    window: { open(...args) { calls.push(['open', ...args]); return popup; }, dispatchEvent() {} },
    getCsrfToken: async () => { throw new Error('GET must not request a CSRF token'); },
    isCsrfFailure: () => false, isSessionAuthFailure: status => status === 401,
    clearAuthSession: () => calls.push(['clearSession']),
  });
  const start = api.indexOf('const authenticatedFetch =');
  const end = api.indexOf('let pendingPasswordPolicy;', start);
  vm.runInContext(`${api.slice(start, end).replace('export async function', 'async function')}\nglobalThis.openInvoice = openOrderInvoice;`, context);
  return { open: context.openInvoice, tab, calls, timers, get blob() { return blob; }, blockPopup() { popup = null; } };
}

test('invoice uses authenticated cookie fetch, opens synchronously, and navigates to a revocable HTML blob without tokens', async () => {
  const h = harness();
  const request = h.open(42);
  assert.equal(h.calls[0][0], 'open');
  await request;
  const [, url, options] = h.calls.find(call => call[0] === 'fetch');
  assert.equal(url, 'https://api.example.test/api/orders/42/invoice');
  assert.equal(options.credentials, 'include');
  assert.equal(options.headers.Accept, 'text/html');
  assert.equal(h.tab.opener, null);
  assert.equal(h.blob.type, 'text/html;charset=utf-8');
  assert.match(await h.blob.text(), /Invoice/);
  assert.equal(h.tab.location.href, 'blob:https://shop.example.test/invoice');
  assert.doesNotMatch(JSON.stringify(h.calls), /[?#](?:access_)?token=/);
  assert.ok(h.timers.at(-1).delay >= 60000);
  h.timers.at(-1).fn();
  assert.equal(h.calls.at(-1)[0], 'revoke');
});

for (const status of [401, 403, 500]) {
  test(`HTTP ${status} closes the blank tab and rejects for application error feedback`, async () => {
    const h = harness(new Response(JSON.stringify({ message: status === 401 ? 'Access token required' : 'Invoice unavailable' }), { status, headers: { 'Content-Type': 'application/json' } }));
    await assert.rejects(h.open(42), error => error.status === status);
    assert.equal(h.tab.closed, true);
    assert.equal(h.blob, undefined);
  });
}

test('network failure closes the blank tab and popup blocking gives a friendly error', async () => {
  const h = harness(new Error('offline'));
  await assert.rejects(h.open(42), /Unable to reach the server/);
  assert.equal(h.tab.closed, true);
  const blocked = harness();
  blocked.blockPopup();
  await assert.rejects(blocked.open(42), /allow pop-ups/i);
  assert.equal(blocked.calls.some(call => call[0] === 'fetch'), false);
});

test('a closed popup or non-HTML success cannot display raw JSON or leak an object URL', async () => {
  const h = harness();
  const request = h.open(42);
  h.tab.closed = true;
  await request;
  assert.equal(h.blob, undefined);
  const invalid = harness(new Response('{"message":"not an invoice"}', { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(invalid.open(42));
  assert.equal(invalid.tab.closed, true);
  assert.equal(invalid.blob, undefined);
});
