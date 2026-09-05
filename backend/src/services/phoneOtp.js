import crypto from 'node:crypto';

const bounded = (value, fallback, min, max) => {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('Invalid OTP limit configuration.');
  return number;
};

export const phoneOtpConfig = (env = process.env) => ({
  available: env.PHONE_VERIFICATION_ENABLED === 'true' && env.PHONE_VERIFICATION_PROVIDER === 'semaphore'
    && Boolean(env.SEMAPHORE_API_KEY?.trim()) && Boolean(env.SESSION_SECRET?.trim()),
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
  const phone = String(value || '').replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(phone)) return `+63${phone.slice(1)}`;
  return /^\+639\d{9}$/.test(phone) ? phone : null;
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
