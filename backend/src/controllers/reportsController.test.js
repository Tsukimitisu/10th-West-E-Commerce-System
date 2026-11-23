import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const reports = await readFile(new URL('./reportsController.js', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('./dashboardController.js', import.meta.url), 'utf8');

test('revenue reports require settled payment and valid order integrity', () => {
  assert.match(reports, /payment_status IN \('paid', 'partially_refunded'\)/);
  assert.match(reports, /integrity_status, 'valid'/);
  assert.match(dashboard, /payment_status::text IN \('paid','partially_refunded'\)/);
  assert.match(dashboard, /COUNT\(\*\) FILTER \(WHERE COALESCE\(integrity_status, 'valid'\) = 'valid'\)::int AS total_orders/);
  assert.match(dashboard, /WHERE COALESCE\(o\.integrity_status, 'valid'\) = 'valid'/);
});

test('profit uses immutable sale-time cost and never subtracts discounts twice', () => {
  const profitStart = reports.indexOf('export const getProfitReport');
  const profitSource = reports.slice(profitStart);
  assert.match(profitSource, /oi\.unit_cost_snapshot/);
  assert.doesNotMatch(profitSource, /p\.buying_price/);
  assert.match(profitSource, /net_profit: profit/);
  assert.match(profitSource, /profit_exact: profitExact/);
});

test('top products preserve archived product snapshots and expose quantity_sold', () => {
  assert.match(reports, /LEFT JOIN products p ON oi\.product_id = p\.id/);
  assert.match(reports, /COALESCE\(p\.name, MAX\(oi\.product_name\)\)/);
  assert.match(reports, /quantity_sold: parseInt\(row\.total_sold\)/);
});
