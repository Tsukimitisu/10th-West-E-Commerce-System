import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, afterEach, mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.DB_READ_MODE = 'postgres';

const { default: pool } = await import('../config/database.js');
const { getAuthAvailability } = await import('../routes/auth.js');
const { forgotPassword } = await import('./authController.js');
const { addToCart, updateCartItem } = await import('./cartController.js');
const { parseStatusFilter } = await import('./orderController.js');
const { commitCodReservations, restoreCommittedReservations } = await import('./orderWorkflowController.js');
const { normalizeItems } = (await import('./secureCheckoutController.js')).__testing;
const {
  normalizeCheckoutAddress,
  resolveCheckoutAddress,
  validateCheckoutAddressFields,
} = await import('../utils/checkoutAddress.js');
const { getPhoneVerificationState } = await import('../utils/phone.js');

afterEach(() => mock.restoreAll());
after(async () => pool.end().catch(() => {}));

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const completeAddress = {
  recipient_name: 'Test Rider',
  phone: '09171234567',
  street: '1 Main Street',
  barangay: 'Bagumbayan',
  city: 'Quezon City',
  state: 'Metro Manila (NCR)',
  postal_code: '1110',
  country: 'Philippines',
  province_code: 'NCR',
  city_code: '137404000',
  barangay_code: '137404001',
  lat: null,
  lng: null,
};

test('auth availability is truthful and exposes working TOTP without secrets', () => {
  const availability = getAuthAvailability();
  assert.equal(typeof availability.google.available, 'boolean');
  assert.equal(typeof availability.facebook.available, 'boolean');
  assert.equal(typeof availability.gcash.available, 'boolean');
  assert.equal(availability.two_factor.available, true);
  assert.equal(availability.two_factor.method, 'totp');
  assert.deepEqual(availability.phone_verification, {
    available: false,
    status: 'unavailable',
    reason: 'not_configured',
  });
  assert.doesNotMatch(JSON.stringify(availability), /secret|client_id|app_id/i);
});

test('phone verification state never reports an unverified number as verified', () => {
  assert.deepEqual(getPhoneVerificationState(''), {
    available: false, verified: false, status: 'not_verified', label: 'Not verified',
  });
  assert.deepEqual(getPhoneVerificationState('09171234567'), {
    available: false, verified: false, status: 'unavailable', label: 'Verification unavailable',
  });
});

test('forgot password returns the same generic response for a missing account', async () => {
  mock.method(pool, 'query', async () => ({ rows: [] }));
  const res = makeResponse();
  await forgotPassword({ validatedData: { email: 'missing@example.test' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: 'If an account exists for this email, password reset instructions have been sent.',
  });
});

test('pending order status is accepted and invalid filters are rejected', () => {
  assert.equal(parseStatusFilter({ status: ' Pending ' }), 'pending');
  assert.equal(parseStatusFilter({}), null);
  assert.throws(() => parseStatusFilter({ status: 'not-a-status' }), {
    status: 400,
    code: 'INVALID_ORDER_STATUS',
  });
});

test('cart add and update endpoints reject quantities above 50 before database work', async () => {
  const connect = mock.method(pool, 'connect', async () => { throw new Error('database must not be called'); });
  const addRes = makeResponse();
  await addToCart({ body: { product_id: 1, quantity: 51 }, user: { id: 7 } }, addRes);
  assert.equal(addRes.statusCode, 400);
  assert.equal(addRes.body.message, 'Maximum quantity per item is 50.');

  const updateRes = makeResponse();
  await updateCartItem({ params: { id: 2 }, body: { quantity: 51 }, user: { id: 7 } }, updateRes);
  assert.equal(updateRes.statusCode, 400);
  assert.equal(updateRes.body.message, 'Maximum quantity per item is 50.');
  assert.equal(connect.mock.callCount(), 0);
});

test('adding an existing cart or wishlist item cannot take the final quantity above 50', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(String(sql));
      const source = String(sql);
      if (source.includes('FROM carts')) return { rows: [{ id: 20, user_id: 7 }], rowCount: 1 };
      if (source.includes('FROM products') && source.includes('FOR UPDATE')) {
        return { rows: [{ id: 1, stock_quantity: 100, reserved_stock: 0, has_variants: false }], rowCount: 1 };
      }
      if (source.includes('FROM cart_items')) return { rows: [{ id: 30, quantity: 50 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  mock.method(pool, 'connect', async () => client);
  const res = makeResponse();
  await addToCart({ body: { product_id: 1, quantity: 1 }, user: { id: 7 } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Maximum quantity per item is 50.');
  assert.ok(calls.some((sql) => sql === 'ROLLBACK'));
  assert.ok(!calls.some((sql) => sql.includes('UPDATE cart_items')));
});

test('checkout item normalization enforces the same limit for direct and merged quantities', () => {
  assert.throws(() => normalizeItems([{ product_id: 1, quantity: 51 }]), /Maximum quantity per item is 50/);
  assert.throws(() => normalizeItems([
    { product_id: 1, quantity: 30 },
    { product_id: 1, quantity: 21 },
  ]), /Maximum quantity per item is 50/);
});

test('checkout accepts an owned saved address and rejects another user address id', async () => {
  const ownedDb = {
    async query(_sql, params) {
      assert.deepEqual(params, [12, 7]);
      return { rows: [{ id: 12, user_id: 7, ...completeAddress }] };
    },
  };
  const saved = await resolveCheckoutAddress(ownedDb, { userId: 7, addressId: 12 });
  assert.equal(saved.id, 12);
  assert.equal(saved.recipient_name, completeAddress.recipient_name);

  await assert.rejects(
    () => resolveCheckoutAddress({ query: async () => ({ rows: [] }) }, { userId: 8, addressId: 12 }),
    (error) => error.status === 404 && error.message === 'Saved address not found.'
  );
});

test('checkout accepts a complete unsaved address when the user has no saved address', async () => {
  const noWritesDb = { query: async () => { throw new Error('unsaved address must not be inserted'); } };
  const address = await resolveCheckoutAddress(noWritesDb, {
    userId: 7,
    address: completeAddress,
    saveAddress: false,
    validateLocation: false,
  });
  assert.equal(address.id, null);
  assert.equal(address.country, 'Philippines');
  assert.match(address.address_string, /Quezon City/);
});

test('checkout optionally saves a validated new address', async () => {
  const db = {
    async query(sql, params) {
      assert.match(String(sql), /INSERT INTO addresses/);
      assert.equal(params[0], 7);
      return { rows: [{ id: 44, user_id: 7, ...completeAddress }] };
    },
  };
  const address = await resolveCheckoutAddress(db, {
    userId: 7,
    address: completeAddress,
    saveAddress: true,
    validateLocation: false,
  });
  assert.equal(address.id, 44);
});

test('checkout rejects incomplete or invalid new address payloads', () => {
  assert.throws(
    () => validateCheckoutAddressFields({ recipient_name: 'Test', phone: '123', city: 'Quezon City' }),
    (error) => Boolean(error.status === 400 && error.fieldErrors.phone && error.fieldErrors.street && error.fieldErrors.postal_code)
  );
  assert.equal(normalizeCheckoutAddress({ province: 'Bulacan', address_line: '2 Main' }).state, 'Bulacan');
});

test('COD stock commit uses guarded deduction and becomes idempotent after commit', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes("status = 'active' FOR UPDATE")) {
        return { rows: [{ product_id: 5, variant_id: null, quantity: 2 }], rowCount: 1 };
      }
      if (String(sql).includes('UPDATE products SET stock_quantity = stock_quantity -')) {
        return { rows: [{ stock_before: 7, stock_after: 5 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const updates = await commitCodReservations(client, 90, 7);
  assert.deepEqual(updates, [{ product_id: 5, variant_id: null, stock_quantity: 5 }]);
  const deduction = calls.find((call) => call.sql.includes('UPDATE products SET stock_quantity'));
  assert.match(deduction.sql, /stock_quantity >= \$1 AND reserved_stock >= \$1/);
  assert.deepEqual(deduction.params, [2, 5]);
  assert.equal(calls.find((call) => call.sql.includes('INSERT INTO stock_movements')).params[3], -2);

  const alreadyCommitted = {
    query: async (sql) => String(sql).includes("status = 'active'")
      ? { rows: [], rowCount: 0 }
      : { rows: [{ '?column?': 1 }], rowCount: 1 },
  };
  assert.deepEqual(await commitCodReservations(alreadyCommitted, 90, 7), []);
});

test('COD checkout rejects a failed guarded deduction as out of stock', async () => {
  const client = {
    async query(sql) {
      if (String(sql).includes("status = 'active' FOR UPDATE")) {
        return { rows: [{ product_id: 5, variant_id: null, quantity: 2 }], rowCount: 1 };
      }
      if (String(sql).includes('UPDATE products SET stock_quantity = stock_quantity -')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  await assert.rejects(() => commitCodReservations(client, 91, 7), { status: 409, code: 'OUT_OF_STOCK' });
});

test('cancellation restores committed stock once and ignores repeated restoration', async () => {
  let committed = true;
  let stock = 5;
  const client = {
    async query(sql) {
      const source = String(sql);
      if (source.includes("status = 'committed' FOR UPDATE")) {
        return committed
          ? { rows: [{ product_id: 5, variant_id: null, quantity: 2 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (source.includes('UPDATE products SET stock_quantity = stock_quantity +')) {
        const before = stock;
        stock += 2;
        return { rows: [{ stock_before: before, stock_after: stock }], rowCount: 1 };
      }
      if (source.includes("UPDATE stock_reservations SET status = 'released'")) committed = false;
      return { rows: [], rowCount: 1 };
    },
  };
  assert.deepEqual(await restoreCommittedReservations(client, 90, 7), [
    { product_id: 5, variant_id: null, stock_quantity: 7 },
  ]);
  assert.deepEqual(await restoreCommittedReservations(client, 90, 7), []);
  assert.equal(stock, 7);
});

test('COD order creation commits stock before its transaction commits', async () => {
  const source = await readFile(new URL('./secureCheckoutController.js', import.meta.url), 'utf8');
  const reservationInsert = source.indexOf('INSERT INTO stock_reservations');
  const stockCommit = source.indexOf('stockUpdates = await commitCodReservations');
  const transactionCommit = source.indexOf("await client.query('COMMIT')", stockCommit);
  assert.ok(reservationInsert > -1 && reservationInsert < stockCommit);
  assert.ok(stockCommit > -1 && stockCommit < transactionCommit);
  assert.match(source, /if \(paymentMethod === 'cod'\)/);
});
