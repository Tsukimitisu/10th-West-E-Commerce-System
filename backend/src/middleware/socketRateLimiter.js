import rateLimit, { messageLimiter } from './rateLimiter.js';

// Match Express's configured proxy trust decision; never trust forwarding
// headers unconditionally (Engine.IO requests do not have Express's req.ip).
export const socketClientIp = (req, trustProxy = () => false) => {
  const addresses = [req.socket?.remoteAddress || 'unknown',
    ...String(req.headers?.['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean).reverse()];
  let index = 0;
  while (index < addresses.length - 1 && trustProxy(addresses[index], index)) index++;
  return addresses[index];
};

const check = async (limiter, req) => {
  let denied;
  const response = {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) {
      denied = { status: this.statusCode,
        code: this.statusCode === 429 ? 'SOCKET_RATE_LIMITED' : 'SOCKET_RATE_LIMIT_UNAVAILABLE',
        message: this.statusCode === 429 ? 'Too many requests. Please wait before trying again.' : 'The service is temporarily unavailable. Please try again later.',
        ...(this.statusCode === 429 ? { retry_after_seconds: body.retryAfter } : {}) };
    },
  };
  await limiter(req, response, () => {});
  return denied;
};

export const createSocketProtection = ({ trustProxy, storage, existingSession = () => false } = {}) => {
  const key = action => req => `socket:${action}:${req.user?.id || 'guest'}:${req.ip}`;
  // Cheap process-local gates stop sustained abuse before it reaches the DB.
  // Shared production counters use the existing atomic DB-backed limiter.
  const connectionsLocal = rateLimit(60000, 60, { storage: 'memory', keyGenerator: key('connections-local') });
  const connections = rateLimit(60000, 60, { storage, keyGenerator: key('connections') });
  const packetsLocal = rateLimit(60000, 300, { storage: 'memory', keyGenerator: key('packets-local') });
  const packets = rateLimit(60000, 300, { storage, keyGenerator: key('packets') });
  const joins = rateLimit(60000, 30, { storage, keyGenerator: key('joins') });

  return {
    async connection(req, res, next) {
      // Existing long-polling requests/upgrades are not new connections.
      if (req._query?.sid && existingSession(req._query.sid)) return next();
      const context = { ip: socketClientIp(req, trustProxy) };
      const denied = await check(connectionsLocal, context) || await check(connections, context);
      if (!denied) return next();
      res.writeHead(denied.status, { 'Content-Type': 'application/json',
        ...(denied.retry_after_seconds ? { 'Retry-After': String(denied.retry_after_seconds) } : {}) });
      res.end(JSON.stringify(denied));
    },
    events(socket) {
      const context = { ip: socketClientIp(socket.request, trustProxy), user: socket.data.user };
      let violations = 0;
      return async (packet, next) => {
        const event = String(packet[0] || '');
        const category = /(?:^|:)(?:message|messages|send)(?:$|:)/i.test(event) ? messageLimiter
          : ['join', 'leaveAll', 'chat:join', 'chat:leave'].includes(event) ? joins : null;
        const denied = await check(packetsLocal, context) || await check(packets, context)
          || (category && await check(category, context));
        if (!denied) return next();
        socket.emit('rate_limit', denied);
        const acknowledge = packet.at(-1);
        if (typeof acknowledge === 'function') acknowledge({ error: denied });
        // Do not dispatch rejected packets or revalidate their sessions.
        if (++violations >= 3 || denied.status !== 429) socket.disconnect(true);
      };
    },
  };
};
