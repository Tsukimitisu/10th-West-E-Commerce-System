export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

// Phone galleries can supply empty/generic/incorrect MIME metadata. Inspect
// only the header, and repeat the content check at the existing backend endpoint.
export async function productImageType(file) {
  if (!file || !file.size) throw new Error('Choose a non-empty image file.');
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) throw new Error('Image must be 5MB or smaller.');
  let bytes;
  try { bytes = new Uint8Array(await file.slice(0,16).arrayBuffer()); }
  catch { throw new Error('This photo could not be read. Select it again or choose another image.'); }
  const starts = signature => signature.every((byte,index)=>bytes[index]===byte);
  if (bytes.length >= 12) {
    if (starts([0xff,0xd8,0xff])) return 'image/jpeg';
    if (starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return 'image/png';
    const text = (start,end)=>String.fromCharCode(...bytes.slice(start,end));
    if (['GIF87a','GIF89a'].includes(text(0,6))) return 'image/gif';
    if (text(0,4)==='RIFF' && text(8,12)==='WEBP') return 'image/webp';
  }
  throw new Error('Unsupported image. Use a JPG, PNG, WebP or GIF photo.');
}
