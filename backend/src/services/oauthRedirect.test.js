import assert from 'node:assert/strict';
import test from 'node:test';
import { redirectOAuthResult } from './oauthRedirect.js';

test('OAuth redirects use exact frontend origin, explicit result and allowlisted reasons only', () => {
  const previous = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = 'https://10th-west-e-commerce-system.vercel.app';
  try {
    for (const provider of ['google', 'facebook']) {
      let url;
      const response = { redirect: value => { url = value; } };
      redirectOAuthResult(response, provider);
      assert.equal(url, `https://10th-west-e-commerce-system.vercel.app/#/oauth-callback?provider=${provider}&status=success`);
      redirectOAuthResult(response, provider, 'state_mismatch');
      assert.equal(url, `https://10th-west-e-commerce-system.vercel.app/#/oauth-callback?provider=${provider}&status=failed&reason=state_mismatch`);
      redirectOAuthResult(response, provider, 'secret-provider-error');
      assert.ok(url.endsWith('reason=callback_failed'));
      assert.doesNotMatch(url, /secret|token|localhost/);
    }
  } finally {
    if (previous === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previous;
  }
});
