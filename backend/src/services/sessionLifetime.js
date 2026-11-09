const parseDurationMs = (value, fallbackMs) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallbackMs;

  const match = text.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;

  const unit = match[2] || 's';
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
};

export const getSessionTtlMs = () => parseDurationMs(
  process.env.SESSION_TTL || process.env.SESSION_TTL_SECONDS,
  Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000)
);

export const sessionValiditySql = (alias = '') => {
  const prefix = alias ? `${alias}.` : '';
  return `COALESCE(${prefix}explicitly_refreshed_at,${prefix}created_at) > NOW()-make_interval(mins => $3)
    AND COALESCE(${prefix}last_active,${prefix}created_at) > NOW()-make_interval(mins => LEAST(30,$3))`;
};

export const sessionDeadline = (row, policy) => Math.min(
  new Date(row.expires_at).getTime(),
  new Date(row.explicitly_refreshed_at || row.created_at).getTime() + policy.session_timeout_minutes * 60000,
  new Date(row.last_active || row.created_at).getTime() + Math.min(30, policy.session_timeout_minutes) * 60000,
);

