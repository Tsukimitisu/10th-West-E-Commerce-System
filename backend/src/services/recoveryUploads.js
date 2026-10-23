import busboy from 'busboy';
import { randomUUID, createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BackupError } from './backupConfig.js';
import { assertNoRestore } from './restoreControl.js';
import { publicBackup } from './databaseBackups.js';
import { writeAuditLog } from '../utils/audit.js';

export const recoveryUploadLimit = (env = process.env) => {
  const bytes = Number(env.BACKUP_RECOVERY_MAX_UPLOAD_BYTES || 64 * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > 256 * 1024 * 1024)
    throw new BackupError('RECOVERY_UPLOAD_CONFIG', 'The recovery file size limit is not configured safely.');
  return bytes;
};
const invalid = () => new BackupError('RECOVERY_UPLOAD_INVALID', 'Select a valid, non-empty 10th West encrypted backup (.dump.enc).', 400);
const tooLarge = () => new BackupError('RECOVERY_UPLOAD_SIZE', 'This backup exceeds the permitted upload size.', 413);
const filename = value => {
  if (typeof value !== 'string' || value.length > 180 || !/\.dump\.enc$/i.test(value)) throw invalid();
  return value.split(/[\\/]/).pop().replace(/[^a-z\d ._()-]/gi, '_');
};

// Recognition only. The existing worker authenticates AES-GCM and inspects the
// archive before any destructive operation. No key/decryption is used here.
export const recoveryInspector = limit => {
  const hash = createHash('sha256'); let bytes = 0; let header = Buffer.alloc(0);
  let resolveHeader; let rejectHeader;
  const ready = new Promise((resolve, reject) => { resolveHeader = resolve; rejectHeader = reject; });
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limit) return callback(tooLarge());
      if (header.length < 19) header = Buffer.concat([header, chunk.subarray(0, 19 - header.length)]);
      if (header.length >= 7 && !header.subarray(0, 7).equals(Buffer.from('10TWBK1'))) return callback(invalid());
      hash.update(chunk);
      if (header.length === 19) resolveHeader();
      callback(null, chunk);
    },
    flush(callback) { if (bytes <= 35) return callback(invalid()); callback(); },
  });
  stream.on('error', rejectHeader);
  return { stream, ready, result: () => ({ size: bytes, checksum: hash.digest('hex') }) };
};

export const createRecoveryUploadService = ({ db, runtime, env = process.env, audit = writeAuditLog }) => {
  const log = (action, record, actor, metadata = {}) => audit(db, { actorUserId: actor, action, entityType: 'backup', entityId: record.id, metadata });
  return {
    async receive(req, actor) {
      const maximum = recoveryUploadLimit(env);
      if (!/^multipart\/form-data\s*;/i.test(req.headers['content-type'] || '')) throw invalid();
      if (Number(req.headers['content-length'] || 0) > maximum + 16384) throw tooLarge();
      let lock;
      try { lock = await runtime.lock(); }
      catch { throw new BackupError('RECOVERY_UPLOAD_UNAVAILABLE', 'Emergency recovery is unavailable. Please contact your system administrator.'); }
      if (!lock) throw new BackupError('BACKUP_BUSY', 'Another backup or recovery operation is in progress.', 409);
      let record; let uploadAttempted = false; let parser; let fileTask; let bodyLimit;
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(invalid()), 120000); timeout.unref?.();
      const onAborted = () => abort.abort(invalid());
      req.once('aborted', onAborted);
      lock.signal?.addEventListener('abort', onAborted, { once: true });
      if (lock.signal?.aborted) onAborted();
      try {
        await assertNoRestore(db);
        try { parser = busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: 1, fields: 0, parts: 2, fileSize: maximum + 1, headerPairs: 30 } }); }
        catch { throw invalid(); }
        const parsed = new Promise((resolve, reject) => {
          const stop = error => { reject(error instanceof BackupError ? error : invalid()); abort.abort(error); };
          let received = 0;
          bodyLimit = new Transform({ transform(chunk, _encoding, callback) {
            received += chunk.length; callback(received > maximum + 16384 ? tooLarge() : null, chunk);
          } });
          bodyLimit.on('error', stop);
          parser.on('error', stop);
          for (const event of ['filesLimit','fieldsLimit','partsLimit']) parser.on(event, () => stop(invalid()));
          parser.once('close', resolve);
          abort.signal.addEventListener('abort', () => { req.unpipe(bodyLimit); bodyLimit.destroy(); parser.destroy(); reject(abort.signal.reason instanceof BackupError ? abort.signal.reason : invalid()); }, { once: true });
          parser.on('file', (name, file, info) => {
            file.on('limit', () => stop(tooLarge()));
            file.on('error', stop);
            fileTask = (async () => {
              if (name !== 'backup') throw invalid();
              const safeName = filename(info.filename);
              const id = randomUUID();
              const inserted = await db.query(`INSERT INTO backup_records (id,storage_key,filename,backup_type,status,created_by,source,recovery_expires_at,started_at)
                VALUES ($1,$2,$3,'manual','running',$4,'uploaded_recovery',NOW()+INTERVAL '24 hours',NOW()) RETURNING *`, [id, `recovery-uploads/${id}/snapshot.dump.enc`, safeName, actor]);
              record = inserted.rows[0];
              const inspector = recoveryInspector(maximum);
              const inspected = pipeline(file, inspector.stream, { signal: abort.signal });
              inspected.catch(stop);
              await inspector.ready;
              uploadAttempted = true;
              await Promise.all([runtime.uploadStream(record, inspector.stream, abort.signal), inspected]);
              return inspector.result();
            })();
            fileTask.catch(stop);
          });
          if (req.aborted || abort.signal.aborted) stop(invalid()); else req.pipe(bodyLimit).pipe(parser);
        });
        await parsed;
        if (!fileTask) throw invalid();
        const artifact = await fileTask;
        abort.signal.throwIfAborted(); await lock.assertHeld();
        await log('RECOVERY_UPLOAD_CREATED', record, actor, { size_bytes: artifact.size, checksum: artifact.checksum });
        const completed = await db.query(`UPDATE backup_records SET status='completed', completed_at=NOW(), size_bytes=$2, checksum=$3, error_summary=NULL WHERE id=$1 RETURNING *`, [record.id, artifact.size, artifact.checksum]);
        return publicBackup(completed.rows[0]);
      } catch (error) {
        abort.abort(); req.unpipe(bodyLimit); bodyLimit?.destroy(); parser?.destroy();
        await fileTask?.catch(() => {});
        if (record) {
          const removed = !uploadAttempted;
          // An interrupted provider request may commit after its first delete.
          // Retain cleanup metadata for a second, scheduled deletion attempt.
          if (uploadAttempted) await runtime.remove(record).catch(() => {});
          await db.query(`UPDATE backup_records SET status='failed', completed_at=NOW(), error_summary='Recovery upload was not accepted.',
            recovery_expires_at=NOW(), deleted_at=CASE WHEN $2 THEN NOW() ELSE NULL END WHERE id=$1`, [record.id, removed]);
          await log('RECOVERY_UPLOAD_FAILED', record, actor).catch(() => {});
        }
        console.error('RECOVERY_UPLOAD_FAILED', { backup_id: record?.id || null, code: error instanceof BackupError ? error.code : 'RECOVERY_UPLOAD_FAILED' });
        throw error instanceof BackupError && (error.status < 500 || error.code.startsWith('RECOVERY_UPLOAD')) ? error : new BackupError('RECOVERY_UPLOAD_FAILED', 'The backup file could not be uploaded. Please try again or contact your system administrator.');
      } finally { clearTimeout(timeout); req.off('aborted', onAborted); lock.signal?.removeEventListener('abort', onAborted); await lock.release(); }
    },
  };
};
