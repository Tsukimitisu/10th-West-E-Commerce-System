import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { io as createSocket } from 'socket.io-client';
import pool from '../src/config/database.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const credentialFile = path.join(backendRoot, '.test-credentials.local');
const enabled = ['true', '1', 'yes'].includes(String(process.env.ENABLE_LIVE_DATABASE_TESTS || '').trim().toLowerCase());
const startedAt = new Date();
const marker = `live-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const createdProductIds = [];
const fixtureUserIds = [];
let childProcess;
let apiOrigin;
let backendStderr = '';

if (!enabled) {
  throw new Error('Set ENABLE_LIVE_DATABASE_TESTS=true to run mutating live-database concurrency verification.');
}
if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
  throw new Error('Live concurrency fixtures are disabled in production.');
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const safeResult = (response) => ({
  status: response.status,
  code: response.body?.code || null,
  message: response.body?.message || null,
});
const assertNotServerError = (response, label) => {
  assert.ok(response.status < 500, `${label} returned ${JSON.stringify(safeResult(response))}`);
};
const assertStatus = (response, expected, label) => {
  assert.equal(response.status, expected, `${label} returned ${JSON.stringify(safeResult(response))}`);
};
const uniqueKey = (scope) => `${marker}-${scope}`;

const readFixtureCredentials = async () => {
  const values = dotenv.parse(await readFile(credentialFile, 'utf8'));
  const sharedPassword = String(values.TEST_FIXTURE_PASSWORD || '').trim();
  assert.ok(sharedPassword, 'The ignored fixture credential file has no TEST_FIXTURE_PASSWORD.');

  const account = (name) => {
    const email = String(values[`E2E_${name}_EMAIL`] || '').trim().toLowerCase();
    const password = String(values[`E2E_${name}_PASSWORD`] || sharedPassword).trim();
    assert.ok(email && password, `Fixture credentials are missing for ${name}.`);
    return { email, password };
  };

  return {
    customer: account('CUSTOMER'),
    customerAlt: account('CUSTOMER_ALT'),
    cashier: account('CASHIER'),
    staff: account('STAFF'),
    staffNoPerms: account('STAFF_NO_PERMS'),
    owner: account('OWNER'),
    superadmin: account('SUPERADMIN'),
  };
};

const splitSetCookie = (headers) => {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,=]+=[^;,]*)/g);
};

class ApiSession {
  constructor(origin) {
    this.origin = origin;
    this.cookies = new Map();
    this.csrfToken = null;
  }

  captureCookies(headers) {
    for (const declaration of splitSetCookie(headers)) {
      const first = declaration.split(';', 1)[0];
      const separator = first.indexOf('=');
      if (separator <= 0) continue;
      const name = first.slice(0, separator).trim();
      const value = first.slice(separator + 1).trim();
      if (/max-age=0/i.test(declaration) || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(method, route, { body, headers = {}, csrf = true } = {}) {
    const normalizedMethod = method.toUpperCase();
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
    if (mutation && csrf && !this.csrfToken) await this.refreshCsrf();

    const requestHeaders = { accept: 'application/json', ...headers };
    const cookie = this.cookieHeader();
    if (cookie) requestHeaders.cookie = cookie;
    if (mutation && csrf) requestHeaders['x-csrf-token'] = this.csrfToken;
    if (body !== undefined) requestHeaders['content-type'] = 'application/json';

    const response = await fetch(`${this.origin}/api${route}`, {
      method: normalizedMethod,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    this.captureCookies(response.headers);
    const contentType = response.headers.get('content-type') || '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    return { status: response.status, body: responseBody, headers: response.headers };
  }

  async refreshCsrf() {
    const response = await this.request('GET', '/csrf-token', { csrf: false });
    assertStatus(response, 200, 'CSRF initialization');
    assert.ok(response.body?.csrfToken, 'CSRF response did not include a token.');
    this.csrfToken = response.body.csrfToken;
  }

  async login(credentials) {
    await this.refreshCsrf();
    const response = await this.request('POST', '/auth/login', { body: credentials });
    assertStatus(response, 200, `login for ${credentials.email}`);
    this.csrfToken = null;
    await this.refreshCsrf();
    return response.body.user;
  }
}

const reserveFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close((error) => {
      if (error) reject(error);
      else resolve(address.port);
    });
  });
});

const waitForBackend = async (child, origin) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The isolated backend exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${origin}/api/ready`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        const readiness = await response.json();
        if (readiness.core_ready === true) return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('The isolated backend did not become database-ready within 60 seconds.');
};

const startBackend = async () => {
  const port = await reserveFreePort();
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['scripts/start-e2e.js'], {
    cwd: backendRoot,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      FRONTEND_ORIGIN: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:3000',
      SESSION_STORE: 'memory',
      COOKIE_SECURE: 'false',
      MAINTENANCE_CLEANUP_DISABLED: 'true',
      RESERVATION_CLEANUP_DISABLED: 'true',
    },
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    backendStderr = `${backendStderr}${chunk}`.slice(-12_000);
  });
  childProcess = child;
  await waitForBackend(child, origin);
  return { child, origin };
};

const stopBackend = async () => {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill();
  await Promise.race([
    new Promise((resolve) => childProcess.once('exit', resolve)),
    sleep(5_000),
  ]);
  if (childProcess.exitCode === null) childProcess.kill('SIGKILL');
};

const createProduct = async (name, stock) => {
  const identifier = `${marker}-${name}`.slice(0, 90);
  const result = await pool.query(
    `INSERT INTO products (
       part_number, name, description, price, buying_price, stock_quantity,
       low_stock_threshold, sku, barcode, status, is_deleted, product_type
     ) VALUES ($1,$2,$3,100,60,$4,1,$5,$6,'active',false,'single')
     RETURNING id, stock_quantity, reserved_stock`,
    [identifier, `Live verification ${name} ${marker}`, `Temporary live verification product ${marker}`, stock, identifier, `${identifier}-bar`]
  );
  const product = result.rows[0];
  createdProductIds.push(Number(product.id));
  await pool.query(
    `INSERT INTO stock_movements (
       product_id, quantity_delta, stock_before, stock_after, reason, reference_type, metadata
     ) VALUES ($1,$2,0,$2,'initial_stock','live_test',$3::jsonb)`,
    [product.id, stock, JSON.stringify({ marker })]
  );
  return Number(product.id);
};

const createAddress = async (session, suffix) => {
  const response = await session.request('POST', '/addresses', {
    body: {
      recipient_name: `Live Test ${suffix}`,
      phone: '09171234567',
      street: `${marker} ${suffix} Street`,
      barangay: 'Barangay 1',
      city: 'Manila',
      state: 'Metro Manila',
      postal_code: '1000',
      country: 'Philippines',
      is_default: false,
    },
  });
  assertStatus(response, 201, `address creation for ${suffix}`);
  return Number(response.body.address.id);
};

const createCheckout = (session, { productId, addressId, quantity = 1, key }) => session.request('POST', '/checkout', {
  headers: { 'Idempotency-Key': key },
  body: {
    items: [{ product_id: productId, quantity }],
    address_id: addressId,
    payment_method: 'cod',
  },
});

const cancelCheckout = async (session, orderId) => {
  const response = await session.request('POST', `/checkout/${orderId}/cancel`, { body: {} });
  assertStatus(response, 200, `checkout cancellation for order ${orderId}`);
};

const createPosSale = (session, { productId, key, quantity = 1 }) => session.request('POST', '/pos/orders', {
  headers: { 'Idempotency-Key': key },
  body: {
    items: [{ product_id: productId, quantity }],
    payment_method: 'cash',
    amount_tendered: 1000,
  },
});

const voidPosSale = async (session, orderId) => {
  const response = await session.request('POST', `/pos/orders/${orderId}/void`, {
    body: { reason: `Live verification cleanup ${marker}` },
  });
  assertStatus(response, 200, `POS void for order ${orderId}`);
};

const assertProductInventory = async (productId, expectedStock, expectedReserved) => {
  const result = await pool.query(
    'SELECT stock_quantity, reserved_stock FROM products WHERE id = $1',
    [productId]
  );
  assert.equal(Number(result.rows[0].stock_quantity), expectedStock);
  assert.equal(Number(result.rows[0].reserved_stock), expectedReserved);
  assert.ok(Number(result.rows[0].stock_quantity) >= 0);
  assert.ok(Number(result.rows[0].reserved_stock) >= 0);
  assert.ok(Number(result.rows[0].stock_quantity) >= Number(result.rows[0].reserved_stock));
};

const getOrderForKey = async (key) => {
  const result = await pool.query('SELECT * FROM orders WHERE checkout_idempotency_key = $1', [key]);
  assert.equal(result.rowCount, 1, `Expected one order for idempotency key ${key}.`);
  return result.rows[0];
};

const runCustomerSmoke = async ({ customer, productId }) => {
  assertStatus(await customer.request('GET', '/auth/profile'), 200, 'customer profile');
  assertStatus(await customer.request('GET', `/products/${productId}`), 200, 'product detail');
  assertStatus(await customer.request('GET', `/products?search=${encodeURIComponent(marker)}`), 200, 'storefront search');

  assertStatus(await customer.request('POST', '/cart/add', {
    body: { product_id: productId, quantity: 1 },
  }), 200, 'cart add');
  const cart = await customer.request('GET', '/cart');
  assertStatus(cart, 200, 'cart read');
  const item = cart.body.items.find((candidate) => Number(candidate.product_id) === productId);
  assert.ok(item, 'The live product was not present in the customer cart.');
  assertStatus(await customer.request('PUT', `/cart/update/${item.id}`, {
    body: { quantity: 2 },
  }), 200, 'cart update');
  assertStatus(await customer.request('DELETE', `/cart/remove/${item.id}`, { body: {} }), 200, 'cart remove');

  assertStatus(await customer.request('POST', '/wishlist', {
    body: { product_id: productId },
  }), 201, 'wishlist add');
  const wishlist = await customer.request('GET', '/wishlist');
  assertStatus(wishlist, 200, 'wishlist read');
  assert.ok(wishlist.body.some((entry) => Number(entry.product_id) === productId));
  assertStatus(await customer.request('DELETE', `/wishlist/${productId}`, { body: {} }), 200, 'wishlist remove');
  assertStatus(await customer.request('GET', '/notifications'), 200, 'notifications read');
  assertStatus(await customer.request('GET', '/notifications/unread-count'), 200, 'notification count');
};

const runCheckoutIdempotency = async ({ customer, addressId, productId }) => {
  const key = uniqueKey('checkout-same');
  const [first, second] = await Promise.all([
    createCheckout(customer, { productId, addressId, quantity: 2, key }),
    createCheckout(customer, { productId, addressId, quantity: 2, key }),
  ]);
  [first, second].forEach((response) => assertNotServerError(response, 'concurrent checkout replay'));
  assert.ok([first, second].some((response) => response.status === 201));
  assert.ok([first, second].every((response) => [201, 409].includes(response.status)));
  const successfulResponses = [first, second].filter((response) => response.status === 201);
  if (successfulResponses.length === 2) {
    assert.equal(Number(successfulResponses[0].body.order_id), Number(successfulResponses[1].body.order_id));
  }

  const order = await getOrderForKey(key);
  const invariants = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM payments WHERE order_id = $1 AND method = 'cod') AS payments,
       (SELECT COUNT(*)::int FROM stock_reservations WHERE order_id = $1 AND product_id = $2) AS reservations,
       (SELECT COALESCE(SUM(quantity),0)::int FROM stock_reservations WHERE order_id = $1 AND product_id = $2) AS reserved_quantity,
       (SELECT COUNT(*)::int FROM audit_logs WHERE metadata->>'idempotency_key' = $3 AND action IN ('order.create','payment.create')) AS audit_events`,
    [order.id, productId, key]
  );
  assert.deepEqual(invariants.rows[0], {
    payments: 1,
    reservations: 1,
    reserved_quantity: 2,
    audit_events: 2,
  });

  assertStatus(await customer.request('GET', `/checkout/${order.id}`), 200, 'checkout read');
  assertStatus(await customer.request('POST', '/checkout/confirm', { body: { order_id: order.id } }), 200, 'COD checkout confirmation');
  assertStatus(await customer.request('GET', '/orders/my-orders'), 200, 'customer orders');
  assertStatus(await customer.request('GET', `/orders/${order.id}/invoice`), 200, 'customer invoice');

  const conflict = await createCheckout(customer, { productId, addressId, quantity: 1, key });
  assertStatus(conflict, 409, 'same checkout key with different payload');
  assert.equal(conflict.body.code, 'IDEMPOTENCY_KEY_CONFLICT');
  await cancelCheckout(customer, order.id);
  await assertProductInventory(productId, 5, 0);

  const concurrentConflictKey = uniqueKey('checkout-conflict');
  const conflictResponses = await Promise.all([
    createCheckout(customer, { productId, addressId, quantity: 1, key: concurrentConflictKey }),
    createCheckout(customer, { productId, addressId, quantity: 2, key: concurrentConflictKey }),
  ]);
  conflictResponses.forEach((response) => assertNotServerError(response, 'concurrent checkout conflict'));
  assert.deepEqual(conflictResponses.map((response) => response.status).sort(), [201, 409]);
  const conflictOrder = await getOrderForKey(concurrentConflictKey);
  await cancelCheckout(customer, conflictOrder.id);
};

const runSameStockCheckout = async ({ customer, customerAlt, addressId, alternateAddressId, productId }) => {
  const firstKey = uniqueKey('stock-customer-a');
  const secondKey = uniqueKey('stock-customer-b');
  const responses = await Promise.all([
    createCheckout(customer, { productId, addressId, key: firstKey }),
    createCheckout(customerAlt, { productId, addressId: alternateAddressId, key: secondKey }),
  ]);
  responses.forEach((response) => assertNotServerError(response, 'same-stock checkout race'));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  await assertProductInventory(productId, 1, 1);
  const winnerIndex = responses.findIndex((response) => response.status === 201);
  await cancelCheckout(winnerIndex === 0 ? customer : customerAlt, responses[winnerIndex].body.order_id);
  await assertProductInventory(productId, 1, 0);
};

const runPosIdempotency = async ({ cashier, owner, productId }) => {
  const key = uniqueKey('pos-same');
  const responses = await Promise.all([
    createPosSale(cashier, { productId, key }),
    createPosSale(cashier, { productId, key }),
  ]);
  responses.forEach((response) => assertNotServerError(response, 'concurrent POS replay'));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 201]);
  const order = await getOrderForKey(key);
  assert.ok(order.receipt_number, 'POS order has no receipt number.');
  assert.equal(Number(responses[0].body.order.id), Number(responses[1].body.order.id));
  const invariants = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM payments WHERE order_id=$1) AS payments,
       (SELECT COUNT(*)::int FROM stock_movements WHERE order_id=$1 AND reason='pos_sale') AS sale_movements,
       (SELECT COUNT(*)::int FROM orders WHERE receipt_number=$2) AS receipts`,
    [order.id, order.receipt_number]
  );
  assert.deepEqual(invariants.rows[0], { payments: 1, sale_movements: 1, receipts: 1 });
  await assertProductInventory(productId, 4, 0);

  const cashierVoid = await cashier.request('POST', `/pos/orders/${order.id}/void`, {
    body: { reason: `Cashier denial ${marker}` },
  });
  assertStatus(cashierVoid, 403, 'cashier POS void RBAC');
  await voidPosSale(owner, order.id);
  await assertProductInventory(productId, 5, 0);
  const movementCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM stock_movements
     WHERE order_id=$1 AND reason IN ('pos_sale','pos_void')`,
    [order.id]
  );
  assert.equal(movementCount.rows[0].count, 2);
};

const runPosVersusCheckout = async ({ customer, cashier, owner, addressId, productId }) => {
  const checkoutKey = uniqueKey('mixed-checkout');
  const posKey = uniqueKey('mixed-pos');
  const [checkout, pos] = await Promise.all([
    createCheckout(customer, { productId, addressId, key: checkoutKey }),
    createPosSale(cashier, { productId, key: posKey }),
  ]);
  [checkout, pos].forEach((response) => assertNotServerError(response, 'POS versus checkout race'));
  assert.deepEqual([checkout.status, pos.status].sort(), [201, 409]);
  const inventory = await pool.query('SELECT stock_quantity, reserved_stock FROM products WHERE id=$1', [productId]);
  const row = inventory.rows[0];
  assert.equal(Number(row.stock_quantity) - Number(row.reserved_stock), 0);
  assert.ok(Number(row.stock_quantity) >= 0 && Number(row.reserved_stock) >= 0);

  if (checkout.status === 201) await cancelCheckout(customer, checkout.body.order_id);
  else {
    const order = await getOrderForKey(posKey);
    await voidPosSale(owner, order.id);
  }
  await assertProductInventory(productId, 1, 0);
};

const runInventoryConcurrency = async ({ customer, owner, addressId, productId }) => {
  const additions = await Promise.all([
    owner.request('POST', '/inventory/bulk-update', {
      body: { updates: [{ product_id: productId, quantity: 2, adjustment_type: 'add', reason: marker }] },
    }),
    owner.request('POST', '/inventory/bulk-update', {
      body: { updates: [{ product_id: productId, quantity: 3, adjustment_type: 'add', reason: marker }] },
    }),
  ]);
  additions.forEach((response) => assertStatus(response, 200, 'concurrent inventory bulk update'));
  await assertProductInventory(productId, 15, 0);
  const records = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM stock_movements WHERE product_id=$1 AND reference_type='bulk_update') AS movements,
       (SELECT COUNT(*)::int FROM audit_logs WHERE entity_id=$1::text AND action='inventory.adjust' AND created_at >= $2) AS audits`,
    [productId, startedAt]
  );
  assert.deepEqual(records.rows[0], { movements: 2, audits: 2 });

  const checkoutKey = uniqueKey('inventory-reservation');
  const checkout = await createCheckout(customer, { productId, addressId, quantity: 5, key: checkoutKey });
  assertStatus(checkout, 201, 'inventory reservation checkout');
  const belowReserved = await owner.request('PUT', `/inventory/${productId}`, {
    body: { quantity: 4, adjustment_type: 'set', reason: marker },
  });
  assertStatus(belowReserved, 409, 'inventory update below reserved stock');
  await assertProductInventory(productId, 15, 5);
  await cancelCheckout(customer, checkout.body.order_id);
  await assertProductInventory(productId, 15, 0);
};

const waitForSocketEvent = (socket, event, timeoutMs = 2_000) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), timeoutMs);
  socket.once(event, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
});

const connectSocket = async (session) => {
  const socket = createSocket(apiOrigin, {
    transports: ['websocket'],
    extraHeaders: { Cookie: session.cookieHeader() },
    reconnection: false,
    timeout: 5_000,
  });
  const outcome = await Promise.race([
    new Promise((resolve) => socket.once('connect', () => resolve({ connected: true }))),
    new Promise((resolve) => socket.once('connect_error', (error) => resolve({ connected: false, error }))),
    sleep(6_000).then(() => ({ connected: false, error: new Error('Socket connection timed out.') })),
  ]);
  assert.ok(outcome.connected, outcome.error?.message || 'Socket connection failed.');
  return socket;
};

const runChatConcurrency = async ({ customer, customerAlt, staff, productId }) => {
  const created = await customer.request('POST', '/chats/product/start', {
    body: { product_id: productId, initial_message: `initial-${marker}` },
  });
  assertStatus(created, 201, 'chat thread creation');
  const threadId = Number(created.body.conversation.id);

  const messages = await Promise.all([
    customer.request('POST', `/chats/${threadId}/messages`, {
      body: { message_text: `customer-${marker}` },
    }),
    staff.request('POST', `/seller/chats/${threadId}/messages`, {
      body: { message_text: `staff-${marker}` },
    }),
  ]);
  messages.forEach((response) => assertStatus(response, 201, 'concurrent chat message'));
  assert.notEqual(Number(messages[0].body.message.id), Number(messages[1].body.message.id));

  const persisted = await pool.query(
    `SELECT id, body, created_at FROM chat_messages
     WHERE thread_id=$1 AND body IN ($2,$3)
     ORDER BY created_at,id`,
    [threadId, `customer-${marker}`, `staff-${marker}`]
  );
  assert.equal(persisted.rowCount, 2);
  assert.ok(Number(persisted.rows[0].id) < Number(persisted.rows[1].id)
    || new Date(persisted.rows[0].created_at) <= new Date(persisted.rows[1].created_at));
  const thread = await pool.query(
    `SELECT last_message_id,
            (SELECT MAX(id) FROM chat_messages WHERE thread_id=$1) AS max_message_id
     FROM chat_threads WHERE id=$1`,
    [threadId]
  );
  assert.equal(Number(thread.rows[0].last_message_id), Number(thread.rows[0].max_message_id));
  assertStatus(await customer.request('GET', `/chats/${threadId}/messages`), 200, 'customer chat read');
  assertStatus(await customerAlt.request('GET', `/chats/${threadId}/messages`), 403, 'unauthorized chat read');

  const allowedSocket = await connectSocket(customer);
  const allowedJoin = waitForSocketEvent(allowedSocket, 'conversation:joined');
  allowedSocket.emit('chat:join', { thread_id: threadId });
  assert.equal(Number((await allowedJoin)?.thread_id), threadId, 'Authorized socket did not join its chat room.');
  allowedSocket.disconnect();

  const deniedSocket = await connectSocket(customerAlt);
  const deniedJoin = waitForSocketEvent(deniedSocket, 'conversation:joined', 750);
  deniedSocket.emit('chat:join', { thread_id: threadId });
  assert.equal(await deniedJoin, null, 'Unauthorized socket joined another customer chat room.');
  deniedSocket.disconnect();
};

const advanceOrderToDelivered = async (owner, orderId) => {
  for (const status of ['processing', 'packed', 'ready_for_pickup', 'shipped', 'out_for_delivery']) {
    const response = await owner.request('PATCH', `/orders/${orderId}/status`, {
      body: { status, note: marker },
    });
    assertStatus(response, 200, `order transition to ${status}`);
  }
  assertStatus(await owner.request('PUT', `/orders/${orderId}/confirm-delivery`, { body: {} }), 200, 'delivery confirmation');
};

const runReturnConcurrency = async ({ customer, owner, addressId, productId, customerUserId, originalStoreCredit }) => {
  const checkout = await createCheckout(customer, {
    productId,
    addressId,
    key: uniqueKey('return-order'),
  });
  assertStatus(checkout, 201, 'return test checkout');
  const orderId = Number(checkout.body.order_id);
  await advanceOrderToDelivered(owner, orderId);
  await assertProductInventory(productId, 0, 0);

  const orderItemResult = await pool.query('SELECT id FROM order_items WHERE order_id=$1', [orderId]);
  const orderItemId = Number(orderItemResult.rows[0].id);
  const review = await customer.request('POST', '/reviews', {
    body: { product_id: productId, rating: 5, comment: `Verified live review ${marker}` },
  });
  assertStatus(review, 201, 'verified-purchase review');

  const returnBody = {
    order_id: orderId,
    reason: `Live duplicate return verification ${marker}`,
    refund_method: 'store_credit',
    items: [{ order_item_id: orderItemId, quantity: 1 }],
  };
  const requests = await Promise.all([
    customer.request('POST', '/returns', { body: returnBody }),
    customer.request('POST', '/returns', { body: returnBody }),
  ]);
  requests.forEach((response) => assertNotServerError(response, 'duplicate return request'));
  assert.deepEqual(requests.map((response) => response.status).sort(), [201, 409]);
  const returnRows = await pool.query('SELECT * FROM returns WHERE order_id=$1', [orderId]);
  assert.equal(returnRows.rowCount, 1);
  const returnId = Number(returnRows.rows[0].id);

  assertStatus(await owner.request('PATCH', `/returns/${returnId}/approve`, {
    body: { note: marker },
  }), 200, 'return approval');
  const refundKey = uniqueKey('return-refund');
  const refunds = await Promise.all([
    owner.request('POST', `/returns/${returnId}/refund`, {
      headers: { 'Idempotency-Key': refundKey },
      body: {},
    }),
    owner.request('POST', `/returns/${returnId}/refund`, {
      headers: { 'Idempotency-Key': refundKey },
      body: {},
    }),
  ]);
  refunds.forEach((response) => assertNotServerError(response, 'concurrent return refund'));
  assert.equal(refunds.filter((response) => response.status === 200).length, 1);
  assert.ok(refunds.every((response) => [200, 202, 409].includes(response.status)));

  const replay = await owner.request('POST', `/returns/${returnId}/refund`, {
    headers: { 'Idempotency-Key': refundKey },
    body: {},
  });
  assertStatus(replay, 200, 'completed return refund replay');

  const invariants = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM refunds WHERE return_id=$1) AS refunds,
       (SELECT COUNT(*)::int FROM stock_movements WHERE order_id=$2 AND reason='return') AS return_movements,
       (SELECT returned_quantity::int FROM order_items WHERE id=$3) AS returned_quantity,
       (SELECT COUNT(*)::int FROM store_credits WHERE user_id=$4 AND reference_id=$1 AND reference_type='return') AS credits,
       (SELECT COUNT(*)::int FROM order_status_history WHERE order_id=$2 AND to_status IN ('return_requested','return_approved','refunded','partially_refunded')) AS timeline_events,
       (SELECT status::text FROM returns WHERE id=$1) AS return_status,
       (SELECT status::text FROM refunds WHERE return_id=$1) AS refund_status,
       (SELECT status::text FROM orders WHERE id=$2) AS order_status,
       (SELECT payment_status::text FROM orders WHERE id=$2) AS order_payment_status,
       (SELECT status::text FROM payments WHERE order_id=$2 ORDER BY created_at DESC LIMIT 1) AS payment_status,
       (SELECT COUNT(*)::int FROM audit_logs WHERE created_at >= $5 AND (
          (entity_type='return' AND entity_id=$1::text AND action IN ('return.create','return.approve'))
          OR (entity_type='refund' AND action IN ('refund.prepare','refund.complete') AND metadata->>'return_id'=$1::text)
       )) AS audit_events`,
    [returnId, orderId, orderItemId, customerUserId, startedAt]
  );
  assert.deepEqual(invariants.rows[0], {
    refunds: 1,
    return_movements: 1,
    returned_quantity: 1,
    credits: 1,
    timeline_events: 3,
    return_status: 'refunded',
    refund_status: 'succeeded',
    order_status: 'partially_refunded',
    order_payment_status: 'partially_refunded',
    payment_status: 'partially_refunded',
    audit_events: 4,
  });
  await assertProductInventory(productId, 1, 0);
  const user = await pool.query('SELECT store_credit FROM users WHERE id=$1', [customerUserId]);
  assert.equal(Number(user.rows[0].store_credit), Number(originalStoreCredit) + 100);
};

const verifyFixtureUsers = async (credentials) => {
  const expected = [
    [credentials.customer.email, 'customer'],
    [credentials.customerAlt.email, 'customer'],
    [credentials.cashier.email, 'cashier'],
    [credentials.staff.email, 'store_staff'],
    [credentials.staffNoPerms.email, 'store_staff'],
    [credentials.owner.email, 'owner'],
    [credentials.superadmin.email, 'super_admin'],
  ];
  const result = await pool.query(
    `SELECT id,email,role,is_active,is_deleted,store_credit
     FROM users WHERE email=ANY($1::text[])`,
    [expected.map(([email]) => email)]
  );
  assert.equal(result.rowCount, expected.length, 'Run seed:test-fixtures again; one or more live fixtures are missing.');
  const byEmail = new Map(result.rows.map((row) => [row.email, row]));
  for (const [email, role] of expected) {
    const user = byEmail.get(email);
    assert.equal(user.role, role);
    assert.equal(user.is_active, true);
    assert.equal(user.is_deleted, false);
    fixtureUserIds.push(Number(user.id));
  }
  return byEmail;
};

const cleanup = async ({ customerUserId, originalStoreCredit } = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productIds = createdProductIds;
    const orderRows = await client.query(
      `SELECT id FROM orders
       WHERE checkout_idempotency_key LIKE $1
          OR id IN (SELECT order_id FROM order_items WHERE product_id=ANY($2::int[]))`,
      [`${marker}%`, productIds]
    );
    const orderIds = orderRows.rows.map((row) => Number(row.id));
    const returnRows = orderIds.length
      ? await client.query('SELECT id FROM returns WHERE order_id=ANY($1::int[])', [orderIds])
      : { rows: [] };
    const returnIds = returnRows.rows.map((row) => Number(row.id));

    if (fixtureUserIds.length) {
      await client.query('DELETE FROM notifications WHERE user_id=ANY($1::int[]) AND created_at >= $2', [fixtureUserIds, startedAt]);
      await client.query('DELETE FROM activity_logs WHERE user_id=ANY($1::int[]) AND created_at >= $2', [fixtureUserIds, startedAt]);
      await client.query('DELETE FROM audit_logs WHERE actor_user_id=ANY($1::int[]) AND created_at >= $2', [fixtureUserIds, startedAt]);
      await client.query('DELETE FROM sessions WHERE user_id=ANY($1::int[]) AND created_at >= $2', [fixtureUserIds, startedAt]);
      await client.query('DELETE FROM login_attempts WHERE email IN (SELECT email FROM users WHERE id=ANY($1::int[])) AND created_at >= $2', [fixtureUserIds, startedAt]);
    }
    if (returnIds.length) {
      await client.query("DELETE FROM store_credits WHERE reference_type='return' AND reference_id=ANY($1::int[])", [returnIds]);
      await client.query('DELETE FROM refunds WHERE return_id=ANY($1::int[])', [returnIds]);
      await client.query('DELETE FROM returns WHERE id=ANY($1::int[])', [returnIds]);
    }
    if (orderIds.length) {
      await client.query('DELETE FROM payments WHERE order_id=ANY($1::int[])', [orderIds]);
      await client.query('DELETE FROM orders WHERE id=ANY($1::int[])', [orderIds]);
    }
    await client.query('DELETE FROM idempotency_keys WHERE key LIKE $1', [`${marker}%`]);
    if (productIds.length) {
      await client.query('DELETE FROM chat_threads WHERE product_id=ANY($1::int[])', [productIds]);
      await client.query('DELETE FROM cart_items WHERE product_id=ANY($1::int[])', [productIds]);
      await client.query('DELETE FROM wishlists WHERE product_id=ANY($1::int[])', [productIds]);
      await client.query('DELETE FROM reviews WHERE product_id=ANY($1::int[])', [productIds]);
      await client.query('DELETE FROM stock_adjustments WHERE product_id=ANY($1::int[])', [productIds]);
      await client.query('DELETE FROM stock_movements WHERE product_id=ANY($1::int[])', [productIds]);
      await client.query('DELETE FROM products WHERE id=ANY($1::int[])', [productIds]);
    }
    await client.query('DELETE FROM addresses WHERE street LIKE $1', [`${marker}%`]);
    if (customerUserId && originalStoreCredit !== undefined) {
      await client.query('UPDATE users SET store_credit=$2 WHERE id=$1', [customerUserId, originalStoreCredit]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const main = async () => {
  let state = {};

  try {
    const credentials = await readFixtureCredentials();
    const usersByEmail = await verifyFixtureUsers(credentials);
    const customerUser = usersByEmail.get(credentials.customer.email);
    const originalStoreCredit = Number(customerUser.store_credit);
    state = { customerUserId: Number(customerUser.id), originalStoreCredit };
    const server = await startBackend();
    apiOrigin = server.origin;

    const sessions = Object.fromEntries(
      Object.keys(credentials).map((name) => [name, new ApiSession(apiOrigin)])
    );
    await Promise.all(Object.entries(sessions).map(([name, session]) => session.login(credentials[name])));

    const noPermissions = await sessions.staffNoPerms.request('GET', '/inventory');
    assertStatus(noPermissions, 403, 'staff without inventory permission');
    assertStatus(await sessions.staff.request('GET', '/inventory'), 200, 'permitted staff inventory read');
    assertStatus(await sessions.owner.request('GET', '/dashboard/stats'), 200, 'owner dashboard');
    assertStatus(await sessions.superadmin.request('GET', '/admin/settings'), 200, 'super admin settings');

    const products = {
      smoke: await createProduct('smoke', 5),
      checkout: await createProduct('checkout-idempotency', 5),
      sameStock: await createProduct('same-stock', 1),
      pos: await createProduct('pos-idempotency', 5),
      mixed: await createProduct('pos-versus-checkout', 1),
      inventory: await createProduct('inventory', 10),
      chat: await createProduct('chat', 1),
      returns: await createProduct('returns', 1),
    };
    const addressId = await createAddress(sessions.customer, 'customer');
    const alternateAddressId = await createAddress(sessions.customerAlt, 'alternate');

    const checks = [
      ['customer storefront/cart/wishlist/profile/notifications', () => runCustomerSmoke({ customer: sessions.customer, productId: products.smoke })],
      ['checkout idempotency and COD artifacts', () => runCheckoutIdempotency({ customer: sessions.customer, addressId, productId: products.checkout })],
      ['same-stock checkout race', () => runSameStockCheckout({ customer: sessions.customer, customerAlt: sessions.customerAlt, addressId, alternateAddressId, productId: products.sameStock })],
      ['POS idempotency, receipt, stock, and void RBAC', () => runPosIdempotency({ cashier: sessions.cashier, owner: sessions.owner, productId: products.pos })],
      ['POS versus online checkout race', () => runPosVersusCheckout({ customer: sessions.customer, cashier: sessions.cashier, owner: sessions.owner, addressId, productId: products.mixed })],
      ['inventory locking, no lost update, and reservations', () => runInventoryConcurrency({ customer: sessions.customer, owner: sessions.owner, addressId, productId: products.inventory })],
      ['chat messages, ordering, CSRF, and room authorization', () => runChatConcurrency({ customer: sessions.customer, customerAlt: sessions.customerAlt, staff: sessions.staff, productId: products.chat })],
      ['return deduplication and single stock restoration', () => runReturnConcurrency({ customer: sessions.customer, owner: sessions.owner, addressId, productId: products.returns, ...state })],
    ];

    for (const [label, check] of checks) {
      await check();
      console.log(`PASS: ${label}`);
    }

    for (const session of Object.values(sessions)) {
      const logout = await session.request('POST', '/auth/logout', { body: {} });
      assertStatus(logout, 200, 'fixture logout');
    }
    console.log(`Live database verification passed: ${checks.length} checks.`);
  } finally {
    await stopBackend();
    await cleanup(state);
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`Live database verification failed: ${error.message}`);
  if (backendStderr.trim()) {
    const redacted = backendStderr
      .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[redacted]@')
      .replace(/(password|secret|token|key)\s*[:=]\s*[^\s,}]+/gi, '$1=[redacted]');
    console.error(`Isolated backend stderr (tail):\n${redacted.trim()}`);
  }
  process.exitCode = 1;
});
