import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/policy_publication_test';

const { default: pool } = await import('../config/database.js');
const { getPolicyByType, upsertPolicy } = await import('./policyController.js');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('policy publication sanitizes both saved content and legacy content on public read', async () => {
  const captured = [];
  mock.method(pool, 'query', async (sql, params) => {
    captured.push({ sql, params });
    if (sql.startsWith('INSERT')) return { rows: [{ type: 'return_policy', title: 'Returns', content: params[2] }] };
    return { rows: [{ type: 'return_policy', title: 'Returns', content: '<h2>Return policy</h2><img src=x onerror=alert(1)><a href="javascript:alert(1)">unsafe</a>' }] };
  });
  try {
    const owner = response();
    await upsertPolicy({ params: { type: 'return_policy' }, body: { title: 'Returns', content: '<p><strong>Keep</strong> receipts</p><script>alert(1)</script>' } }, owner);
    assert.equal(owner.statusCode, 200);
    assert.match(captured[0].params[2], /<strong>Keep<\/strong>/);
    assert.doesNotMatch(captured[0].params[2], /script|alert/i);

    const customer = response();
    await getPolicyByType({ params: { type: 'return_policy' } }, customer);
    assert.equal(customer.statusCode, 200);
    assert.match(customer.body.content, /<h2>Return policy<\/h2>/);
    assert.doesNotMatch(customer.body.content, /img|onerror|javascript:/i);
  } finally {
    mock.restoreAll();
    await pool.end();
  }
});
