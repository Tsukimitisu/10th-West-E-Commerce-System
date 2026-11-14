import test from 'node:test';
import assert from 'node:assert/strict';
import { productImageType, PRODUCT_IMAGE_MAX_BYTES } from '../utils/imageUpload.js';

const headers = {
  'image/png':[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0],
  'image/jpeg':[0xff,0xd8,0xff,0xe0,0,0,0,0,0,0,0,0],
  'image/webp':[82,73,70,70,0,0,0,0,87,69,66,80],
  'image/gif':[71,73,70,56,57,97,0,0,0,0,0,0],
};
for (const [type,bytes] of Object.entries(headers)) test(`gallery ${type} content is recognized regardless of MIME metadata`,async()=>{
  for(const mime of [type,'','application/octet-stream','image/jpg','image/heic']) {
    assert.equal(await productImageType(new Blob([new Uint8Array(bytes)],{type:mime})),type);
  }
});
test('image selection rejects empty, unsupported/disguised, oversized and unreadable files safely',async()=>{
  await assert.rejects(productImageType(new Blob([])),/non-empty/);
  await assert.rejects(productImageType(new Blob(['<script>bad</script>'],{type:'image/png'})),/Unsupported image/);
  await assert.rejects(productImageType(new Blob([new Uint8Array(PRODUCT_IMAGE_MAX_BYTES+1)])),/5MB/);
  await assert.rejects(productImageType({size:12,slice(){throw new Error('Gallery inaccessible');}}),/could not be read/);
});
