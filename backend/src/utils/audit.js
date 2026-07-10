const json = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

export const requestIp = (req) => req?.clientIp || req?.ip || null;

export const requestUserAgent = (req) => {
  if (req?.clientUa) return req.clientUa;
  if (typeof req?.get === 'function') return req.get('user-agent') || null;
  return null;
};

export const writeAuditLog = (client, {
  req = null,
  actorUserId = null,
  action,
  entityType,
  entityId,
  beforeData = null,
  afterData = null,
  metadata = null,
}) => client.query(
  `INSERT INTO audit_logs (
     actor_user_id, action, entity_type, entity_id, ip_address, user_agent,
     before_data, after_data, metadata
   ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
  [
    actorUserId,
    action,
    entityType,
    entityId === undefined || entityId === null ? null : String(entityId),
    requestIp(req),
    requestUserAgent(req),
    json(beforeData),
    json(afterData),
    json(metadata),
  ],
);
