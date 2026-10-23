import test from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeSettings } from './settings.js';

test('runtime settings parse typed defaults and retain missing defaults', async () => {
  const db = { query: async () => ({ rows: [
    { key: 'cash_enabled', value: 'false' },
    { key: 'rate', value: '12' },
  ] }) };
  const settings = await getRuntimeSettings(db, 'payment', { cash_enabled: true, rate: 0, gcash_enabled: false });
  assert.deepEqual(settings, { cash_enabled: false, rate: 12, gcash_enabled: false });
});
