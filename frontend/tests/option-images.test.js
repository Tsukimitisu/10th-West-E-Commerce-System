import test from 'node:test';
import assert from 'node:assert/strict';
import { optionImageSources } from '../utils/optionImages.js';

test('an option image precedes the unchanged cover and generic fallback',()=>{
  assert.deepEqual(optionImageSources('/uploads/red.webp','/uploads/kit.webp'),['/uploads/red.webp','/uploads/kit.webp','/images/product-fallback.svg']);
});
test('missing/invalid option images use the listing cover and never executable URLs',()=>{
  for(const value of [null,'','javascript:alert(1)','data:text/html,test','//unsafe.test/image'])
    assert.deepEqual(optionImageSources(value,'/uploads/cover.webp'),['/uploads/cover.webp','/images/product-fallback.svg']);
});
test('fallbacks are deduplicated and blocked image hosts do not suppress the cover',()=>{
  assert.deepEqual(optionImageSources('/uploads/cover.webp','/uploads/cover.webp'),['/uploads/cover.webp','/images/product-fallback.svg']);
  assert.deepEqual(optionImageSources('https://images.unsplash.com/test','/uploads/cover.webp'),['/uploads/cover.webp','/images/product-fallback.svg']);
});
