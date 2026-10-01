import test from 'node:test';
import assert from 'node:assert/strict';
import { hasValidFileSignature } from './fileSignature.js';

test('file signatures reject scripts disguised with an image MIME type', () => {
  assert.equal(hasValidFileSignature(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
});

test('file signatures accept supported real headers and reject MIME mismatches', () => {
  const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  assert.equal(hasValidFileSignature(png, 'image/png'), true);
  assert.equal(hasValidFileSignature(png, 'image/jpeg'), false);
});
