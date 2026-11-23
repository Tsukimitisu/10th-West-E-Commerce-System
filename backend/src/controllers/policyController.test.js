import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePolicyType } from './policyController.js';

test('policy type normalizer supports privacy alias and rejects invalid types', () => {
  assert.equal(normalizePolicyType('privacy'), 'privacy_policy');
  assert.equal(normalizePolicyType('privacy_policy'), 'privacy_policy');
  assert.equal(normalizePolicyType('return_policy'), 'return_policy');
  assert.equal(normalizePolicyType('not-a-policy'), null);
  assert.equal(normalizePolicyType(''), null);
});
