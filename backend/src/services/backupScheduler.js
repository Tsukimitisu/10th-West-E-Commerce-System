import { scheduleWindow } from './backupConfig.js';

// Run by the external scheduler every 15 minutes. No web-process timer is required.
export const runScheduledBackup = async ({ db, service, config, now = new Date() }) => {
  if (!config.enabled) return { status: 'disabled' };
  await db.query('INSERT INTO backup_scheduler (id,last_checked_at) VALUES (1,NOW()) ON CONFLICT (id) DO UPDATE SET last_checked_at = NOW()');
  try {
    const job = await service.request({ type: 'automatic', dailyKey: scheduleWindow(config, now).dailyKey });
    return job.skipped ? { status: 'already_completed' } : await job.completion;
  } catch (error) {
    if (error.code === 'BACKUP_BUSY') return { status: 'busy' };
    throw error;
  }
};
