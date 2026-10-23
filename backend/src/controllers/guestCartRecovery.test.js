import assert from "node:assert/strict";
import test, { after, afterEach, mock } from "node:test";
process.env.NODE_ENV = "test";
process.env.TEST_DATABASE_URL =
  "postgresql://invalid:invalid@127.0.0.1:1/cart_recovery_test";
process.env.DB_READ_MODE = "postgres";
const { default: pool } = await import("../config/database.js");
const { getCart, rotateGuestSession } = await import("./cartController.js");
afterEach(() => mock.restoreAll());
after(async () => pool.end().catch(() => {}));
const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
const request = () => ({
  user: { id: 42, role: "customer" },
  session: {
    pendingGuestCartSessionId: "server-owned-guest",
    save(callback) {
      callback();
    },
  },
});

test("rotated session retains anonymous recovery identity without carrying authenticated ownership", async () => {
  const req = {
    session: {
      cartSessionId: "server-owned-guest",
      regenerate(callback) {
        req.session = {
          save(done) {
            done();
          },
        };
        callback();
      },
    },
  };
  await rotateGuestSession(req);
  assert.equal(req.session.pendingGuestCartSessionId, "server-owned-guest");
  assert.notEqual(req.session.cartSessionId, "server-owned-guest");
  const signedIn = {
    session: {
      cartSessionId: "old-account-session",
      auth: { userId: 42 },
      regenerate(callback) {
        signedIn.session = {
          save(done) {
            done();
          },
        };
        callback();
      },
    },
  };
  await rotateGuestSession(signedIn);
  assert.equal(signedIn.session.pendingGuestCartSessionId, undefined);
});

test("failed merge retains server recovery ID and returns a sanitized failure, not an empty success", async () => {
  mock.method(pool, "connect", async () => {
    throw Object.assign(new Error("database connection unavailable"), {
      code: "ECONNREFUSED",
    });
  });
  mock.method(console, "error", () => {});
  const req = request(),
    res = response();
  await getCart(req, res);
  assert.equal(res.statusCode, 503);
  assert.equal(req.session.pendingGuestCartSessionId, "server-owned-guest");
  assert.equal(res.body.guest_merge, undefined);
  assert.equal(res.body.items, undefined);
});

test("recovery merges an existing account line once, clamps stock and acknowledges only after commit", async () => {
  let guestExists = true;
  let quantity = 7;
  let commits = 0;
  let connections = 0;
  const client = {
    release() {},
    async query(sql, params = []) {
      const text = String(sql);
      if (text === "COMMIT") {
        commits++;
        return { rows: [] };
      }
      if (text.includes("FROM carts") && text.includes("session_id"))
        return { rows: guestExists ? [{ id: 11 }] : [] };
      if (text.includes("FROM carts") && text.includes("user_id"))
        return { rows: [{ id: 20 }] };
      if (text.includes("SUM(quantity)"))
        return { rows: [{ product_id: 99, variant_id: null, quantity: 2 }] };
      if (text.includes("SELECT id, quantity"))
        return { rows: [{ id: 50, quantity }] };
      if (text.includes("AS available_stock"))
        return { rows: [{ available_stock: 8 }] };
      if (text.includes("UPDATE cart_items")) quantity = params[0];
      if (text.includes("DELETE FROM carts")) guestExists = false;
      return { rows: [] };
    },
  };
  mock.method(pool, "connect", async () => {
    connections++;
    return client;
  });
  mock.method(pool, "query", async (sql) => {
    const text = String(sql);
    if (text.includes("FROM carts")) return { rows: [{ id: 20 }] };
    if (text.includes("FROM cart_items ci"))
      return {
        rows: [
          {
            id: 50,
            product_id: 99,
            quantity,
            name: "Authoritative oil",
            inventory_status: "active",
            visibility_status: "active",
            effective_store_price: 400,
            available_stock: 8,
          },
        ],
      };
    return { rows: [] };
  });
  const req = request(),
    first = response();
  await getCart(req, first);
  assert.equal(commits, 1);
  assert.equal(quantity, 8);
  assert.equal(first.body.items.length, 1);
  assert.equal(first.body.items[0].quantity, 8);
  assert.equal(first.body.guest_merge, "complete");
  assert.equal(req.session.pendingGuestCartSessionId, undefined);
  assert.equal(req.session.guestCartMergeUserId, 42);
  assert.doesNotMatch(JSON.stringify(first.body), /server-owned-guest/);
  const second = response();
  await getCart(req, second);
  assert.equal(connections, 1);
  assert.equal(second.body.items[0].quantity, 8);
});

test("an acknowledgement from another user never confirms this account merge", async () => {
  mock.method(pool, "query", async (sql) => ({
    rows: String(sql).includes("FROM carts") ? [{ id: 20 }] : [],
  }));
  const req = {
    user: { id: 42, role: "customer" },
    session: { guestCartMergeUserId: 41 },
  };
  const res = response();
  await getCart(req, res);
  assert.equal(res.body.guest_merge, undefined);
});
