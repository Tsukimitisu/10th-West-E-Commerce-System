const SUPABASE_REST_TIMEOUT_MS = Number.parseInt(process.env.SUPABASE_REST_TIMEOUT_MS || '10000', 10);
const DB_READ_FALLBACK_TTL_MS = Number.parseInt(process.env.DB_READ_FALLBACK_TTL_MS || '600000', 10);
let bypassDatabaseReadsUntil = 0;

const getSupabaseRestConfig = () => {
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  // Server-side REST fallback must never run with an anonymous/browser key.
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    restUrl: `${baseUrl}/rest/v1`,
    apiKey,
  };
};

export const hasSupabaseRestConfig = () => Boolean(getSupabaseRestConfig());

export const isDatabaseConnectivityError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  const isConnectivityError = message.includes('connection timeout')
    || message.includes('connection terminated')
    || message.includes('timeout')
    || message.includes('etimedout')
    || ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', '57P01', '08006'].includes(code);

  if (isConnectivityError) {
    markDatabaseReadFallback();
  }

  return isConnectivityError;
};

export const markDatabaseReadFallback = () => {
  const ttl = Number.isFinite(DB_READ_FALLBACK_TTL_MS) && DB_READ_FALLBACK_TTL_MS > 0
    ? DB_READ_FALLBACK_TTL_MS
    : 600000;
  bypassDatabaseReadsUntil = Date.now() + ttl;
};

export const shouldUseDatabaseReadFallback = () => {
  const hasRestConfig = hasSupabaseRestConfig();
  const readMode = String(process.env.DB_READ_MODE || '').trim().toLowerCase();
  if (readMode === 'postgres') {
    return false;
  }

  if (readMode === 'supabase_rest') {
    if (!hasRestConfig) {
      console.warn('DB_READ_MODE=supabase_rest ignored because SUPABASE_SERVICE_ROLE_KEY is not configured.');
    }
    return hasRestConfig;
  }

  return hasRestConfig && Date.now() < bypassDatabaseReadsUntil;
};

const buildSupabaseRestUrl = (path, queryParams = {}) => {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error('Supabase REST credentials are not configured.');
  }

  const params = new URLSearchParams();
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });

  const url = `${config.restUrl}/${String(path).replace(/^\/+/, '')}${params.toString() ? `?${params.toString()}` : ''}`;

  return { config, url };
};

export const supabaseRestRequest = async (path, {
  method = 'GET',
  queryParams = {},
  body,
  prefer,
  headers = {},
} = {}) => {
  const { config, url } = buildSupabaseRestUrl(path, queryParams);
  const timeoutMs = Number.isFinite(SUPABASE_REST_TIMEOUT_MS) && SUPABASE_REST_TIMEOUT_MS > 0
    ? SUPABASE_REST_TIMEOUT_MS
    : 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        apikey: config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const responseBody = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(responseBody?.message || responseBody?.hint || `Supabase REST request failed with ${response.status}`);
      error.status = response.status;
      error.body = responseBody;
      throw error;
    }

    return responseBody;
  } finally {
    clearTimeout(timeout);
  }
};

export const supabaseRestFetch = async (path, queryParams = {}) =>
  supabaseRestRequest(path, { method: 'GET', queryParams });
