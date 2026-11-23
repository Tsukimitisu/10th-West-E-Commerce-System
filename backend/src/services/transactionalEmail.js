import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getEmailConfigurationStatus } from './integrationReadiness.js';

const DEFAULT_EMAIL_TIMEOUT_MS = 15_000;
const MAX_EMAIL_TIMEOUT_MS = 30_000;

class PrivateResendClient extends Resend {
  // The SDK logs raw provider errors in development. Use only our sanitized
  // diagnostics below, in every environment.
  logError() {}
}

// This checks configuration, not DNS ownership or eventual inbox delivery.
export const inspectResendConfiguration = (env = process.env) => {
  const failures = [];
  let code = 'EMAIL_CONFIG_MISSING';
  for (const name of ['RESEND_API_KEY', 'RESEND_FROM']) {
    if (!String(env[name] || '').trim() || /YOUR[-_]|placeholder|replace[-_]/i.test(env[name])) failures.push(`${name} missing or placeholder`);
  }
  const sender = String(env.RESEND_FROM || '').trim();
  const mailbox = sender.includes('<') ? sender.match(/^[^<>\r\n]*<([^<>\r\n]+)>$/)?.[1] : sender;
  if (sender && !/^[^\s<>@,;]+@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(mailbox || '')) {
    failures.push('RESEND_FROM must be a valid sender mailbox');
    code = 'RESEND_SENDER_INVALID';
  }
  if (String(env.NODE_ENV).toLowerCase() === 'production' && /@(?:[a-z0-9-]+\.)?resend\.dev$/i.test(mailbox || '')) {
    failures.push('RESEND_FROM uses the resend.dev test domain; a verified sending domain is required');
    code = 'RESEND_TEST_SENDER';
  }
  if (env.EMAIL_PROVIDER_TIMEOUT_MS && (!/^\d+$/.test(env.EMAIL_PROVIDER_TIMEOUT_MS)
    || Number(env.EMAIL_PROVIDER_TIMEOUT_MS) < 1000 || Number(env.EMAIL_PROVIDER_TIMEOUT_MS) > MAX_EMAIL_TIMEOUT_MS)) {
    failures.push('EMAIL_PROVIDER_TIMEOUT_MS must be between 1000 and 30000');
    code = 'EMAIL_TIMEOUT_INVALID';
  }
  return { ready: failures.length === 0, failures, code: failures.length ? code : null };
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const configuredTimeoutMs = () => Math.min(
  MAX_EMAIL_TIMEOUT_MS,
  Math.max(1_000, Number.parseInt(
    process.env.EMAIL_PROVIDER_TIMEOUT_MS || process.env.VERIFICATION_DELIVERY_TIMEOUT_MS || '',
    10
  ) || DEFAULT_EMAIL_TIMEOUT_MS)
);

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    const error = new Error('Email provider request timed out.');
    error.code = 'EMAIL_PROVIDER_TIMEOUT';
    reject(error);
  }, timeoutMs);

  Promise.resolve(promise).then(
    (result) => {
      clearTimeout(timer);
      resolve(result);
    },
    (error) => {
      clearTimeout(timer);
      reject(error);
    }
  );
});

const safeErrorCode = (error) => {
  const raw = error?.code || error?.name || error?.statusCode || error?.status || 'EMAIL_DELIVERY_FAILED';
  const normalized = String(raw).toUpperCase();
  // Provider-controlled strings can contain PII/secrets. Only known codes may
  // enter logs; inspect messages below solely to select a fixed safe reason.
  return new Set([
    'EMAIL_PROVIDER_TIMEOUT', 'EMAIL_PROVIDER_INVALID_RESPONSE', 'VALIDATION_ERROR',
    'MISSING_API_KEY', 'RESTRICTED_API_KEY', 'SUSPENDED_API_KEY', 'INVALID_PERMISSION',
    'RATE_LIMIT_EXCEEDED', 'DAILY_QUOTA_EXCEEDED', 'MONTHLY_QUOTA_EXCEEDED',
    'APPLICATION_ERROR', 'SERVICE_UNAVAILABLE', 'RESEND_REJECTED',
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'EAI_AGAIN', 'EAUTH',
  ]).has(normalized) ? normalized : 'EMAIL_DELIVERY_FAILED';
};

const failureReason = (error, code) => {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = `${error?.code || error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (code === 'EMAIL_PROVIDER_TIMEOUT' || ['ETIMEDOUT', 'ESOCKET'].includes(code)) return 'timeout';
  if (code === 'EMAIL_PROVIDER_INVALID_RESPONSE') return 'invalid_response';
  if (/testing emails|test sender/.test(message)) return 'test_sender_restricted';
  if (/domain.*not.*verif|not.*verif.*domain/.test(message)) return 'domain_not_verified';
  if (/suppress|bounc/.test(message)) return 'suppressed_or_bounced';
  if (status === 401 || /api.?key.*invalid|invalid.*api.?key/.test(message) || code === 'EAUTH') return 'invalid_api_key';
  if (status === 429) return 'rate_limited';
  if (/invalid.*(?:sender|from)|(?:sender|from).*invalid/.test(message)) return 'invalid_sender';
  if (['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code) || (!status && /fetch|network/.test(message))) return 'network';
  return 'provider_rejected';
};

const isRetryableFailure = (error, code) => {
  const status = Number(error?.statusCode || error?.status || 0);
  return code === 'EMAIL_PROVIDER_TIMEOUT'
    || status === 408
    || status === 429
    || status >= 500
    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'EAI_AGAIN'].includes(code);
};

const createSmtpTransport = (configuration) => {
  const port = configuration.transport.port || 587;
  return nodemailer.createTransport({
    host: configuration.transport.host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      user: configuration.transport.user,
      pass: configuration.transport.pass,
    },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: Number.parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10),
    greetingTimeout: Number.parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '10000', 10),
    socketTimeout: Number.parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10),
  });
};

const failedResult = (provider, code, retryable) => ({
  provider,
  accepted: false,
  code,
  retryable,
});

export const sendTransactionalEmail = async ({
  to,
  subject,
  html,
  text,
  requestId = null,
  userId = null,
  idempotencyKey = null,
  eventType = 'transactional',
  dependencies = {},
}) => {
  const configuration = getEmailConfigurationStatus();
  const provider = configuration.provider;
  const startedAt = Date.now();
  const logContext = {
    provider,
    event_type: eventType,
    request_id: requestId,
    user_id: userId,
  };

  console.info('EMAIL_SEND_START', logContext);

  const resendConfiguration = provider === 'resend' ? inspectResendConfiguration() : null;
  if (!configuration.ready || resendConfiguration?.ready === false) {
    const result = failedResult(provider, resendConfiguration?.code || 'EMAIL_CONFIG_MISSING', false);
    console.warn('EMAIL_SEND_FAILED', {
      ...logContext,
      code: result.code,
      reason: 'configuration',
      retryable: result.retryable,
      duration_ms: Date.now() - startedAt,
    });
    return result;
  }

  try {
    let messageId = null;

    if (provider === 'resend') {
      const resend = dependencies.resendClient || new PrivateResendClient(process.env.RESEND_API_KEY);
      const response = await withTimeout(
        resend.emails.send({
          from: process.env.RESEND_FROM,
          to,
          subject,
          html,
          text,
        }, idempotencyKey ? { idempotencyKey } : undefined),
        configuredTimeoutMs()
      );

      if (response?.error) {
        const error = new Error('Resend rejected the email request.');
        error.code = response.error.name || response.error.statusCode || 'RESEND_REJECTED';
        error.statusCode = response.error.statusCode;
        error.message = String(response.error.message || 'Resend rejected the email request.');
        throw error;
      }
      messageId = response?.data?.id;
      if (typeof messageId !== 'string' || !messageId.trim()) {
        throw Object.assign(new Error('Email provider returned no valid send ID.'), { code: 'EMAIL_PROVIDER_INVALID_RESPONSE' });
      }
    } else if (provider === 'smtp') {
      const transporter = dependencies.smtpTransport || createSmtpTransport(configuration);
      const response = await withTimeout(transporter.sendMail({
        from: process.env.EMAIL_FROM || '"10th West Moto" <noreply@10thwestmoto.com>',
        to,
        subject,
        html,
        text,
      }), configuredTimeoutMs());
      messageId = response?.messageId || null;
    } else {
      return failedResult(provider, 'EMAIL_PROVIDER_UNSUPPORTED', false);
    }

    const result = {
      provider,
      accepted: true,
      messageId,
    };
    console.info('EMAIL_SEND_SUCCESS', {
      ...logContext,
      message_id_present: Boolean(messageId),
      duration_ms: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const code = safeErrorCode(error);
    const reason = failureReason(error, code);
    const status = Number(error?.statusCode || error?.status || 0);
    const result = failedResult(provider, code, reason === 'network' || isRetryableFailure(error, code));
    console.warn('EMAIL_SEND_FAILED', {
      ...logContext,
      code: result.code,
      reason,
      provider_status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
      retryable: result.retryable,
      duration_ms: Date.now() - startedAt,
    });
    return result;
  }
};

export const emailBrandHeader = (actionUrl) => {
  let logo = '';
  try {
    const origin = new URL(actionUrl);
    if (['https:', 'http:'].includes(origin.protocol)) {
      const source = escapeHtml(new URL('/brand/10th-west-logo.png', origin.origin).href);
      logo = `<img src="${source}" alt="10th West Motorcycle Parts &amp; Accessories" width="80" height="85" style="display:block;margin:0 auto 12px;width:80px;height:85px;object-fit:contain">`;
    }
  } catch { /* Text branding remains available when no public asset URL exists. */ }
  return `<div style="background:#05070b;color:#ffffff;padding:24px;text-align:center;border-bottom:3px solid #ed621d">${logo}<p style="margin:0;font-size:20px;font-weight:700">10TH WEST</p><p style="margin:6px 0 0;font-size:11px;color:#d8dee8">Motorcycle Parts &amp; Accessories</p></div>`;
};

export const sendVerificationEmail = ({
  email,
  name,
  verificationUrl,
  expiresInMinutes,
  requestId,
  userId,
  dependencies,
}) => {
  const safeName = escapeHtml(String(name || '').trim() || 'there');
  const safeUrl = escapeHtml(verificationUrl);
  const expiryText = `${expiresInMinutes} minute${Number(expiresInMinutes) === 1 ? '' : 's'}`;
  const subject = 'Verify your 10th West Moto account';
  const text = [
    `Hi ${String(name || '').trim() || 'there'},`,
    '',
    'Your 10th West Moto account needs email verification.',
    `Verify your account: ${verificationUrl}`,
    '',
    `This verification link expires in ${expiryText}.`,
    'If you did not create this account, you may ignore this email.',
  ].join('\n');
  const html = `
<!doctype html>
<html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px">
    <div style="border-radius:12px;background:#ffffff;border:1px solid #e5e7eb;overflow:hidden">
      ${emailBrandHeader(verificationUrl)}
      <div style="padding:30px">
        <p style="font-size:16px">Hi ${safeName},</p>
        <p style="font-size:16px;line-height:1.6">Your account needs email verification. Use the button below to activate your account.</p>
        <p style="margin:28px 0;text-align:center"><a href="${safeUrl}" style="display:inline-block;border-radius:8px;background:#ed621d;color:#05070b;padding:14px 26px;text-decoration:none;font-weight:700">Verify my account</a></p>
        <p style="color:#4b5563;line-height:1.6">This verification link expires in ${expiryText}.</p>
        <p style="color:#4b5563;line-height:1.6">If you did not create this account, you may ignore this email.</p>
        <p style="font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, open this link:<br><a href="${safeUrl}" style="color:#a83b0d">${safeUrl}</a></p>
      </div>
    </div>
  </div>
</body></html>`;

  return sendTransactionalEmail({
    to: email,
    subject,
    html,
    text,
    requestId,
    userId,
    idempotencyKey: requestId ? `verification-${requestId}` : null,
    eventType: 'verification',
    dependencies,
  });
};

export const sendPasswordResetEmail = ({
  email,
  name,
  resetUrl,
  requestId,
  userId,
  dependencies,
}) => {
  const safeName = escapeHtml(String(name || '').trim() || 'there');
  const safeUrl = escapeHtml(resetUrl);
  return sendTransactionalEmail({
    to: email,
    subject: 'Password Reset - 10th West Moto',
    text: `Hi ${String(name || '').trim() || 'there'},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you may ignore this email.`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:24px">${emailBrandHeader(resetUrl)}<p>Hi ${safeName},</p><p>We received a request to reset your password.</p><p><a href="${safeUrl}" style="display:inline-block;border-radius:8px;background:#ed621d;color:#05070b;padding:14px 26px;text-decoration:none;font-weight:700">Reset my password</a></p><p>This link expires in 1 hour. If you did not request this, you may ignore this email.</p><p style="font-size:12px;word-break:break-all">${safeUrl}</p></div></body></html>`,
    requestId,
    userId,
    idempotencyKey: requestId ? `password-reset-${requestId}` : null,
    eventType: 'password_reset',
    dependencies,
  });
};
