import crypto from 'node:crypto';
import { normalizePhilippineMobile, PHILIPPINE_MOBILE_REGEX } from '../utils/phone.js';

const bounded = (value, fallback, min, max) => {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('Invalid OTP limit configuration.');
  return number;
};

export const PHONE_PROVIDERS = ['textbee', 'semaphore'];
const providerKey = { textbee: 'TEXTBEE_API_KEY', semaphore: 'SEMAPHORE_API_KEY' };
export const phoneProvider = (env = process.env) => String(env.PHONE_VERIFICATION_PROVIDER || '').trim().toLowerCase();

// Readiness is provider-aware: only the selected provider's credential is required.
export const phoneOtpConfig = (env = process.env) => ({
  available: env.PHONE_VERIFICATION_ENABLED === 'true' && PHONE_PROVIDERS.includes(phoneProvider(env))
    && Boolean(env[providerKey[phoneProvider(env)]]?.trim()) && Boolean(env.SESSION_SECRET?.trim()),
  expiry: bounded(env.OTP_EXPIRY_MINUTES, 5, 1, 10),
  length: bounded(env.OTP_CODE_LENGTH, 6, 6, 8),
  attempts: bounded(env.OTP_MAX_ATTEMPTS, 5, 1, 5),
  cooldown: bounded(env.OTP_RESEND_COOLDOWN_SECONDS, 60, 60, 3600),
  daily: bounded(env.OTP_DAILY_LIMIT, 5, 1, 10),
});

export const phoneOtpReadiness = () => {
  try {
    const { available } = phoneOtpConfig();
    return { available, status: available ? 'configured' : 'unavailable', reason: available ? null : 'not_configured' };
  } catch {
    return { available: false, status: 'unavailable', reason: 'invalid_configuration' };
  }
};

export const canonicalPhone = (value) => {
  const phone = normalizePhilippineMobile(value);
  return PHILIPPINE_MOBILE_REGEX.test(phone) ? phone : null;
};

export const hashPhoneCode = (userId, phone, code) => crypto.createHmac('sha256', process.env.SESSION_SECRET)
  .update(`${userId}:${phone}:${code}`).digest('hex');

export const sendSemaphoreCode = async ({ phone, code, expiry }, request = fetch) => {
  const response = await request('https://api.semaphore.co/api/v4/otp', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      apikey: process.env.SEMAPHORE_API_KEY,
      number: phone.slice(1),
      code,
      message: `Your 10th West Moto verification code is {otp}. Expires in ${expiry} minutes. Do not share this code.`,
      sendername: process.env.SEMAPHORE_SENDER_NAME || '10THWEST',
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload) || !payload[0]?.message_id
    || !['queued', 'pending', 'sent'].includes(String(payload[0].status).toLowerCase())) {
    throw new Error('SMS delivery could not be started. Please try again later.');
  }
  // Provider response includes the OTP; never persist, log, or return it.
};

const deliveryFailure = () => new Error('SMS delivery could not be started. Please try again later.');
const otpMessage = (code, expiry) => `Your 10th West Moto verification code is ${code}. Expires in ${expiry} minutes. Do not share this code.`;

export const sendTextBeeCode = async ({ phone, code, expiry }, request = fetch, env = process.env) => {
  const apiKey = env.TEXTBEE_API_KEY?.trim();
  if (!apiKey || !canonicalPhone(phone)) throw deliveryFailure();
  const baseUrl = String(env.TEXTBEE_API_BASE_URL || 'https://api.textbee.dev/api/v1').trim().replace(/\/+$/, '');
  const timeout = Number(env.TEXTBEE_TIMEOUT_MS) > 0 ? Math.min(Number(env.TEXTBEE_TIMEOUT_MS), 30000) : 10000;
  let payload = null;
  try {
    const response = await request(`${baseUrl}/gateway/send-sms`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ recipients: [phone], message: otpMessage(code, expiry) }),
    });
    payload = response.ok ? await response.json().catch(() => null) : null;
  } catch {
    // Network/timeout errors may echo request details; replace with a generic error.
    throw deliveryFailure();
  }
  if (payload?.data?.success !== true || !payload.data.smsBatchId) throw deliveryFailure();
};

export const sendPhoneVerificationCode = async (input, request = fetch, env = process.env) => {
  const provider = phoneProvider(env);
  if (provider === 'textbee') return sendTextBeeCode(input, request, env);
  if (provider === 'semaphore') return sendSemaphoreCode(input, request);
  throw deliveryFailure();
};
