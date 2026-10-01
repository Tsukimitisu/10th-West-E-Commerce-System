const starts = (buffer, bytes, offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);

export const hasValidFileSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  switch (String(mimeType).toLowerCase()) {
    case 'image/jpeg': return starts(buffer, [0xff, 0xd8, 0xff]);
    case 'image/png': return starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif': return buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
    case 'image/webp': return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'video/mp4':
    case 'video/quicktime':
    case 'video/x-m4v': return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'video/webm': return starts(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'video/ogg': return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    default: return false;
  }
};

export const assertValidFileSignature = (buffer, mimeType) => {
  if (!hasValidFileSignature(buffer, mimeType)) {
    const error = new Error('File content does not match the declared media type.');
    error.status = 400;
    throw error;
  }
};
