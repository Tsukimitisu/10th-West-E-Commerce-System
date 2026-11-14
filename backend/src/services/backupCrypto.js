import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, appendFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('10TWBK1');
export const encryptBackup = async (source, target, key, signal) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const file = await open(target, 'wx', 0o600);
  await file.write(Buffer.concat([MAGIC, iv]));
  await file.close();
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: 'a', mode: 0o600 }), { signal });
  await appendFile(target, cipher.getAuthTag());
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) { signal?.throwIfAborted(); hash.update(chunk); }
  return { checksum: hash.digest('hex'), size: (await stat(target)).size };
};
export const decryptBackup = async (source, target, key) => {
  const file = await open(source, 'r');
  const size = (await file.stat()).size;
  const header = Buffer.alloc(19);
  const tag = Buffer.alloc(16);
  try { await file.read(header, 0, 19, 0); await file.read(tag, 0, 16, size - 16); } finally { await file.close(); }
  if (size <= 35 || !header.subarray(0, 7).equals(MAGIC)) throw new Error('Invalid backup format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(7));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(source, { start: 19, end: size - 17 }), decipher, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
};
