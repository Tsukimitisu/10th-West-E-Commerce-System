import crypto from 'crypto';

const key = () => {
  const value = String(process.env.TWO_FACTOR_ENCRYPTION_KEY || '');
  if (value.length < 32) throw new Error('TWO_FACTOR_ENCRYPTION_KEY must contain at least 32 characters.');
  return crypto.createHash('sha256').update(value).digest();
};

export const encryptTwoFactorSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
};

export const decryptTwoFactorSecret = (payload) => {
  const [version, iv, tag, encrypted] = String(payload || '').split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Stored 2FA secret is not encrypted.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
};

export const generateRecoveryCodes = (count = 10) => Array.from({ length: count }, () =>
  `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`);

export const hashRecoveryCode = (code) => crypto
  .createHmac('sha256', key())
  .update(String(code).trim().toLowerCase())
  .digest('hex');
