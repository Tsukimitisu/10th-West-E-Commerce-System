import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('published policy pages load owner content and use the safe RichText renderer', async () => {
  const pages = [
    ['PolicyPrivacy.jsx', 'privacy_policy'],
    ['ReturnPolicy.jsx', 'return_policy'],
    ['TermsOfService.jsx', 'terms_of_service'],
  ];
  for (const [file, type] of pages) {
    const source = await readFile(new URL(`../pages/Support/${file}`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`usePolicyDocument\\('${type}'\\)`));
    assert.match(source, /<RichText value=\{policy\.content\}/);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  }
  const api = await readFile(new URL('../services/api.js', import.meta.url), 'utf8');
  const policySection = api.slice(api.indexOf('export const updatePolicy'), api.indexOf('// ==================== Additional Mock Functions'));
  assert.match(policySection, /authenticatedFetch/);
  assert.doesNotMatch(policySection, /supabase\.from\('policies'\)/);
});
