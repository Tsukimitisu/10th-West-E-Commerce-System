const statuses = new Set(['healthy', 'needs_attention', 'not_running', 'unavailable', 'online', 'connected', 'configured', 'successful', 'failed', 'not_captured', 'active', 'inactive']);
const status = value => statuses.has(value) ? value : 'unavailable';
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export const safeDiagnosticSummary = (data = {}) => ({
  application: '10th West', timestamp: time(data.timestamp),
  reference: /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(data.reference || '') ? data.reference : 'Unavailable',
  ...( /^[a-f\d]{7,40}$/i.test(data.commit || '') ? { commit: data.commit.slice(0, 12) } : {}),
  overall: status(data.overall), website: status(data.website), database: status(data.database),
  email: status(data.email), payments: status(data.payments), maintenance: status(data.maintenance),
  backup: { status: status(data.backup?.status), time: time(data.backup?.time) },
  cleanup: { status: status(data.cleanup?.status), time: time(data.cleanup?.time) },
  recent_errors_24h: Number.isInteger(data.recent_errors_24h) && data.recent_errors_24h >= 0 ? data.recent_errors_24h : null,
});
