import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getEmailConfigurationStatus } from './integrationReadiness.js';

const DEFAULT_EMAIL_TIMEOUT_MS = 15_000;
const MAX_EMAIL_TIMEOUT_MS = 30_000;

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
  const normalized = String(raw).toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 80);
  return normalized || 'EMAIL_DELIVERY_FAILED';
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
  dependencies = {},
}) => {
  const configuration = getEmailConfigurationStatus();
  const provider = configuration.provider;
  const startedAt = Date.now();
  const logContext = {
    provider,
    request_id: requestId,
    user_id: userId,
  };

  console.info('EMAIL_SEND_START', logContext);

  if (!configuration.ready) {
    const result = failedResult(provider, 'EMAIL_CONFIG_MISSING', false);
    console.warn('EMAIL_SEND_FAILED', {
      ...logContext,
      code: result.code,
      retryable: result.retryable,
      duration_ms: Date.now() - startedAt,
    });
    return result;
  }

  try {
    let messageId = null;

    if (provider === 'resend') {
      const resend = dependencies.resendClient || new Resend(process.env.RESEND_API_KEY);
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
        throw error;
      }
      messageId = response?.data?.id || null;
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
    const result = failedResult(provider, code, isRetryableFailure(error, code));
    console.warn('EMAIL_SEND_FAILED', {
      ...logContext,
      code: result.code,
      retryable: result.retryable,
      duration_ms: Date.now() - startedAt,
    });
    return result;
  }
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
<html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px">
    <div style="border-radius:14px;background:#ffffff;border:1px solid #e5e7eb;overflow:hidden">
      <div style="background:#111827;color:#ffffff;padding:24px;text-align:center">
        <h1 style="margin:0;font-size:24px">10th West Moto</h1>
      </div>
      <div style="padding:30px">
        <p style="font-size:16px">Hi ${safeName},</p>
        <p style="font-size:16px;line-height:1.6">Your account needs email verification. Use the button below to activate your account.</p>
        <p style="margin:28px 0;text-align:center"><a href="${safeUrl}" style="display:inline-block;border-radius:8px;background:#dc2626;color:#ffffff;padding:14px 26px;text-decoration:none;font-weight:700">Verify my account</a></p>
        <p style="color:#4b5563;line-height:1.6">This verification link expires in ${expiryText}.</p>
        <p style="color:#4b5563;line-height:1.6">If you did not create this account, you may ignore this email.</p>
        <p style="font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, open this link:<br><a href="${safeUrl}" style="color:#2563eb">${safeUrl}</a></p>
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
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:24px"><h1>10th West Moto</h1><p>Hi ${safeName},</p><p>We received a request to reset your password.</p><p><a href="${safeUrl}" style="display:inline-block;border-radius:8px;background:#dc2626;color:#fff;padding:14px 26px;text-decoration:none;font-weight:700">Reset my password</a></p><p>This link expires in 1 hour. If you did not request this, you may ignore this email.</p><p style="font-size:12px;word-break:break-all">${safeUrl}</p></div></body></html>`,
    requestId,
    userId,
    idempotencyKey: requestId ? `password-reset-${requestId}` : null,
    dependencies,
  });
};
