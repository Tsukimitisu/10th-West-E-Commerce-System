import '../src/config/environment.cjs';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decryptBackup } from '../src/services/backupCrypto.js';
import { encryptionKey } from '../src/services/backupConfig.js';

let directory;
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output') throw new Error();
  directory = await mkdtemp(path.join(tmpdir(), '10thwest-decrypt-'));
  const verified = path.join(directory, 'verified.dump');
  await decryptBackup(path.resolve(args[1]), verified, encryptionKey());
  // No plaintext destination is published until GCM authentication succeeds. Never overwrite.
  await copyFile(verified, path.resolve(args[3]), constants.COPYFILE_EXCL);
  console.log('Backup authenticated and decrypted. Use controlled PostgreSQL recovery procedures.');
} catch {
  console.error('Backup decryption failed. Check the key, file integrity and a new output path.');
  process.exitCode = 1;
} finally { if (directory) await rm(directory, { recursive: true, force: true }); }
