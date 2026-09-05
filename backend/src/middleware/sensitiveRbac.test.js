import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import pool from '../config/database.js';
import { requirePermissionForRoles } from './auth.js';
import { STAFF_ROLES } from '../constants/schemaEnums.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(directory, '..', relativePath), 'utf8');

after(async () => {
  await pool.end().catch(() => {});
});

const makeResponse = () => ({
  statusCode: null,
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

test('cashier without orders.view is denied by role-aware permission middleware', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [{ has_permission: false }] });
  try {
    const req = { user: { id: 17, role: 'cashier' } };
    const res = makeResponse();
    let nextCalled = false;
    await requirePermissionForRoles('orders.view', ...STAFF_ROLES)(
      req,
      res,
      () => { nextCalled = true; }
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.permission, 'orders.view');
  } finally {
    pool.query = originalQuery;
  }
});

test('sensitive routes enforce granular permissions for all staff roles', async () => {
  const [orders, payments, chat, chats, staff] = await Promise.all([
    readSource('routes/orders.js'),
    readSource('routes/payments.js'),
    readSource('routes/chat.js'),
    readSource('routes/chats.js'),
    readSource('routes/staff.js'),
  ]);

  assert.match(orders, /operationsRoles = \[\.\.\.STAFF_ROLES\]/);
  assert.match(payments, /staffPermission\('payments\.manage'\)/);
  assert.match(payments, /staffPermission\('payments\.view'\)/);
  assert.match(chat, /staffPermission\('chat\.view'\)/);
  assert.match(chat, /staffPermission\('chat\.reply'\)/);
  assert.match(chats, /staffPermission\('chat\.view'\)/);
  assert.match(chats, /staffPermission\('chat\.reply'\)/);
  assert.match(staff, /requirePermission\('staff\.manage'\)/);
});

test('Socket.IO uses permission-scoped rooms and no broad staff room', async () => {
  const socket = await readSource('socket.js');
  assert.match(socket, /can_view_chat/);
  assert.match(socket, /can_reply_chat/);
  assert.match(socket, /staff:orders/);
  assert.match(socket, /staff:chat/);
  assert.match(socket, /staff:payments/);
  assert.match(socket, /staff:shipping/);
  assert.doesNotMatch(socket, /(?:join|to)\('staff'\)/);
  assert.doesNotMatch(socket, /socket\.broadcast\.emit\('user:(?:online|offline)'/);
});

test('staff permission and status changes validate before committing atomically', async () => {
  const controller = await readSource('controllers/staffController.js');
  assert.match(controller, /You cannot change your own permissions/);
  assert.match(controller, /One or more permission IDs do not exist/);
  assert.match(controller, /Duplicate permission IDs are not allowed/);
  assert.match(controller, /SELECT id, name, email, role, is_active[\s\S]*FOR UPDATE/);
  assert.doesNotMatch(controller, /UPDATE users SET is_active = NOT is_active WHERE id = \$1/);
});
