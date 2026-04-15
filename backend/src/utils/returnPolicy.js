import pool from '../config/database.js';

export const DEFAULT_RETURN_WINDOW_DAYS = 15;
export const RETURNABLE_ORDER_STATUSES = new Set(['completed', 'delivered']);
const ACTIVE_RETURN_STATUSES = new Set(['pending', 'approved']);

const normalizeWindowDays = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_RETURN_WINDOW_DAYS;
  }

  return Math.min(parsed, 365);
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getReturnSettings = async (db = pool) => {
  try {
    const result = await db.query(
      "SELECT key, value FROM system_settings WHERE category = 'returns' AND key IN ('return_window_days')"
    );

    const settings = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));

    return {
      returnWindowDays: normalizeWindowDays(settings.return_window_days),
    };
  } catch (error) {
    console.error('Failed to load return settings, using defaults:', error);
    return {
      returnWindowDays: DEFAULT_RETURN_WINDOW_DAYS,
    };
  }
};

export const buildReturnEligibility = ({ order, latestReturn, returnWindowDays, now = new Date() }) => {
  const normalizedWindow = normalizeWindowDays(returnWindowDays);
  const status = String(order?.status || '').toLowerCase();
  const deliveredAt = parseDate(order?.delivered_at) || (
    RETURNABLE_ORDER_STATUSES.has(status)
      ? parseDate(order?.updated_at) || parseDate(order?.created_at)
      : null
  );
  const deadlineAt = deliveredAt
    ? new Date(deliveredAt.getTime() + normalizedWindow * 24 * 60 * 60 * 1000)
    : null;
  const latestReturnStatus = latestReturn?.status ? String(latestReturn.status).toLowerCase() : null;

  if (!RETURNABLE_ORDER_STATUSES.has(status)) {
    return {
      eligible: false,
      message: 'Returns are available only for delivered orders.',
      deliveredAt,
      deadlineAt,
      returnWindowDays: normalizedWindow,
    };
  }

  if (!deliveredAt || !deadlineAt) {
    return {
      eligible: false,
      message: 'Return eligibility for this order is unavailable right now.',
      deliveredAt,
      deadlineAt,
      returnWindowDays: normalizedWindow,
    };
  }

  if (ACTIVE_RETURN_STATUSES.has(latestReturnStatus)) {
    return {
      eligible: false,
      message: `A return request for this order is already ${latestReturnStatus}.`,
      deliveredAt,
      deadlineAt,
      returnWindowDays: normalizedWindow,
    };
  }

  if (latestReturnStatus === 'rejected') {
    return {
      eligible: false,
      message: 'This order already has a processed return request.',
      deliveredAt,
      deadlineAt,
      returnWindowDays: normalizedWindow,
    };
  }

  if (now > deadlineAt) {
    return {
      eligible: false,
      message: `The ${normalizedWindow}-day return period has expired for this order.`,
      deliveredAt,
      deadlineAt,
      returnWindowDays: normalizedWindow,
    };
  }

  return {
    eligible: true,
    message: `Return request available until ${deadlineAt.toLocaleDateString('en-PH')}.`,
    deliveredAt,
    deadlineAt,
    returnWindowDays: normalizedWindow,
  };
};
