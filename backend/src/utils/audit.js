const json = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

export const auditOutcome = action => /(?:^|[._ ])(?:failed|failure|error|denied)(?:$|[._ ])/i.test(action || '') ? 'failed' : 'success';

// Reuse the existing unified history for both Activity and Transactions.
export const unifiedAuditCte = `WITH unified_logs AS (
  SELECT CONCAT('activity:', al.id)::text AS unified_id, 'activity'::text AS source,
    al.user_id AS actor_user_id, al.action, al.entity_type, al.entity_id::text AS entity_id,
    al.ip_address, al.user_agent, NULL::jsonb AS before_data, NULL::jsonb AS after_data,
    al.details AS metadata, al.created_at AT TIME ZONE 'UTC' AS created_at FROM activity_logs al
  UNION ALL
  SELECT CONCAT('audit:', au.id)::text, 'audit'::text, au.actor_user_id, au.action,
    au.entity_type, au.entity_id, au.ip_address, au.user_agent, au.before_data,
    au.after_data, au.metadata, au.created_at FROM audit_logs au
)`;

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
    json({ outcome: auditOutcome(action), ...metadata }),
  ],
);
