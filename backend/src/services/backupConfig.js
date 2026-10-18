import { CronExpressionParser } from 'cron-parser';

export class BackupError extends Error {
  constructor(code, message, status = 503) { super(message); this.code = code; this.status = status; }
}
export const backupConfig = (env = process.env) => {
  const retentionDays = Number(env.BACKUP_RETENTION_DAYS || 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new BackupError('BACKUP_CONFIG', 'Backup retention must be between 1 and 3650 days.');
  const cron = env.BACKUP_CRON || '0 2 * * *';
  if (!/^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*$/.test(cron.trim())) throw new BackupError('BACKUP_CONFIG', 'BACKUP_CRON must specify one daily time: minute hour * * *.');
  const timezone = env.BACKUP_TIMEZONE || 'Asia/Manila';
  try { CronExpressionParser.parse(cron, { tz: timezone }); new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
  catch { throw new BackupError('BACKUP_CONFIG', 'Backup schedule or timezone is invalid.'); }
  const enabled = env.BACKUP_ENABLED || 'false';
  if (!['true', 'false'].includes(enabled)) throw new BackupError('BACKUP_CONFIG', 'BACKUP_ENABLED must be true or false.');
  return { enabled: enabled === 'true', retentionDays, cron, timezone };
};
export const scheduleWindow = (config, now = new Date()) => {
  const due = CronExpressionParser.parse(config.cron, { tz: config.timezone, currentDate: new Date(now.getTime() + 1) }).prev().toDate();
  const next = CronExpressionParser.parse(config.cron, { tz: config.timezone, currentDate: now }).next().toDate();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(due).map(part => [part.type, part.value]));
  return { next: next.toISOString(), dailyKey: `automatic-${parts.year}-${parts.month}-${parts.day}` };
};
export const encryptionKey = (env = process.env) => {
  if (!/^[a-f\d]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || '')) throw new BackupError('BACKUP_KEY_MISSING', 'Backup encryption key must be configured as 64 hexadecimal characters.');
  return Buffer.from(env.BACKUP_ENCRYPTION_KEY, 'hex');
};
