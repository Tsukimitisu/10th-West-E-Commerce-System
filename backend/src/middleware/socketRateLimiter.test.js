import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import pool from '../config/database.js';
import { createSocketProtection, socketClientIp } from './socketRateLimiter.js';

after(() => pool.end());
let nextIp = 1;
const request = () => ({ socket: { remoteAddress: `192.0.2.${nextIp++}` }, headers: {}, _query: {} });
const response = () => ({ writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = JSON.parse(body); } });
const socket = (req = request(), id = 7) => ({ request: req, data: { user: { id } }, emitted: [], disconnected: false,
  emit(event, data) { this.emitted.push({ event, data }); }, disconnect() { this.disconnected = true; } });
const mockDb = t => {
  const counters = new Map();
  t.mock.method(pool, 'query', async (sql, args) => {
    if (!String(sql).startsWith('INSERT')) return { rows: [] };
    assert.match(args[0], /^[a-f0-9]{64}$/);
    const count = (counters.get(args[0]) || 0) + 1;
    counters.set(args[0], count);
    return { rows: [{ request_count: count, retry_after_seconds: 60 }] };
  });
  return counters;
};

test('socket client IP follows proxy trust and ignores forged forwarding on untrusted connections', () => {
  const req = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '198.51.100.2, 192.0.2.3' } };
  assert.equal(socketClientIp(req), '10.0.0.1');
  assert.equal(socketClientIp(req, (_ip, hop) => hop < 1), '192.0.2.3');
});

test('connection attempts return controlled 429 before auth; normal polling is not counted', async () => {
  const guard = createSocketProtection({ storage: 'memory', existingSession: id => id === 'existing-session' });
  const req = request(); let allowed = 0;
  for (let i = 0; i < 60; i++) await guard.connection(req, response(), () => allowed++);
  const denied = response(); await guard.connection(req, denied, () => assert.fail());
  assert.equal(allowed, 60); assert.equal(denied.status, 429);
  assert.equal(denied.body.code, 'SOCKET_RATE_LIMITED'); assert.ok(Number(denied.headers['Retry-After']) > 0);
  await guard.connection({ ...req, _query: { sid: 'existing-session' } }, response(), () => allowed++);
  assert.equal(allowed, 61);
  const forgedSession = response();
  await guard.connection({ ...req, _query: { sid: 'made-up-session' } }, forgedSession, () => assert.fail());
  assert.equal(forgedSession.status, 429);
});

test('connection counters are persistent and the local gate shields DB storage after the limit', async t => {
  const counters = mockDb(t), guard = createSocketProtection({ storage: 'db' }), req = request();
  for (let i = 0; i < 65; i++) await guard.connection(req, response(), () => {});
  assert.equal([...counters.values()].reduce((a, b) => a + b, 0), 60);
});

test('join flood is stopped before downstream auth/handlers and repeated abuse disconnects', async () => {
  const guard = createSocketProtection({ storage: 'memory' }), client = socket();
  const events = guard.events(client); let handled = 0, acknowledged;
  for (let i = 0; i < 33; i++) await events(['chat:join', {}, reply => { acknowledged = reply; }], () => handled++);
  assert.equal(handled, 30); assert.equal(client.disconnected, true);
  assert.equal(client.emitted.length, 3); assert.equal(acknowledged.error.status, 429);
  assert.equal(acknowledged.error.code, 'SOCKET_RATE_LIMITED');
});

test('all events including typing and unknown names have a bounded quota', async () => {
  const guard = createSocketProtection({ storage: 'memory' }), client = socket(); let handled = 0;
  const events = guard.events(client);
  for (let i = 0; i < 301; i++) await events([i % 2 ? 'typing:start' : 'unknown', {}], () => handled++);
  assert.equal(handled, 300); assert.equal(client.emitted.at(-1).data.status, 429);
});

test('message quota reuses persistent HTTP message limits and survives socket reconnection', async t => {
  mockDb(t); const guard = createSocketProtection({ storage: 'memory' }), client = socket(); let handled = 0;
  for (let i = 0; i < 31; i++) await guard.events(client)(['chat:message', {}], () => handled++);
  assert.equal(handled, 30);
  const reconnect = socket(client.request); await guard.events(reconnect)(['message:send', {}], () => assert.fail());
  assert.equal(reconnect.emitted[0].data.status, 429);
  const differentUser = socket(client.request, 8);
  await guard.events(differentUser)(['chat:message', {}], () => handled++);
  assert.equal(handled, 31);
});

test('persistent limiter outage fails closed with a safe service-unavailable response', async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async () => { throw Object.assign(new Error('unavailable'), { code: 'ECONNREFUSED' }); });
  const guard = createSocketProtection({ storage: 'db' }), denied = response();
  await guard.connection(request(), denied, () => assert.fail());
  assert.equal(denied.status, 503); assert.equal(denied.body.code, 'SOCKET_RATE_LIMIT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(denied.body), /ECONNREFUSED|password|token/);
});

test('real localhost Socket.IO client receives safe event error and disconnect after repeated excess joins', async t => {
  const server = createServer(), realtime = new Server(server), guard = createSocketProtection({ storage: 'memory' });
  realtime.engine.use(guard.connection);
  realtime.on('connection', client => {
    client.data.user = { id: 99 }; client.use(guard.events(client));
    client.on('chat:join', (_body, ack) => ack({ ok: true }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = io(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false });
  t.after(async () => { client.close(); await new Promise(resolve => realtime.close(resolve)); });
  await once(client, 'connect');
  for (let i = 0; i < 30; i++) assert.deepEqual(await client.emitWithAck('chat:join', {}), { ok: true });
  const warning = once(client, 'rate_limit'), disconnected = once(client, 'disconnect');
  client.emit('chat:join', {}); client.emit('chat:join', {}); client.emit('chat:join', {});
  const [error] = await warning; assert.equal(error.status, 429); assert.ok(error.retry_after_seconds > 0);
  assert.equal((await disconnected)[0], 'io server disconnect');
});

test('real Engine.IO handshake returns JSON 429 before session/auth work when connection quota is exhausted', async t => {
  const server = createServer(), realtime = new Server(server);
  const guard = createSocketProtection({ storage: 'memory', trustProxy: (_ip, hop) => hop < 1 });
  const req = { ...request(), headers: { 'x-forwarded-for': '192.0.2.250' } };
  for (let i = 0; i < 60; i++) await guard.connection(req, response(), () => {});
  let authenticated = 0;
  realtime.engine.use(guard.connection);
  realtime.use((_socket, next) => { authenticated++; next(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => realtime.close(resolve)));
  const reply = await fetch(`http://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=polling`, {
    headers: { 'X-Forwarded-For': '192.0.2.250' },
  });
  assert.equal(reply.status, 429); assert.ok(Number(reply.headers.get('Retry-After')) > 0);
  assert.equal((await reply.json()).code, 'SOCKET_RATE_LIMITED'); assert.equal(authenticated, 0);
});
