import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePolicyContent } from './sanitizePolicy.js';

test('policy HTML keeps narrow formatting and safe links', () => {
  const value = sanitizePolicyContent('<h2>Returns</h2><p><strong>Keep</strong> <em>receipts</em> <a href="https://example.org/help" onclick="alert(1)">Help</a></p>');
  assert.match(value, /<h2>Returns<\/h2>/);
  assert.match(value, /<strong>Keep<\/strong>/);
  assert.match(value, /href="https:\/\/example.org\/help"/);
  assert.doesNotMatch(value, /onclick/);
});

test('policy HTML strips executable markup, attributes, and unsafe URLs', () => {
  const value = sanitizePolicyContent('<script>alert(1)</script><style>body{display:none}</style><iframe src="https://bad.test"></iframe><object></object><embed src="data:text/html,x"><p onmouseover="run()">Safe <a href="javascript:run()">bad</a> <a href="data:text/html,x">data</a></p>');
  assert.doesNotMatch(value, /script|style|iframe|object|embed|onmouseover|javascript:|data:/i);
  assert.match(value, /<p>Safe/);
});
