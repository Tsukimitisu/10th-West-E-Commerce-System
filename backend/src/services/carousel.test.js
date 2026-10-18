import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCarouselBanner, safeCarouselLink, withinCarouselSchedule, publicCarouselSlide, resolveCarouselTargets } from './carousel.js';

const base = { title: 'Oil weekend', image_url: 'https://res.cloudinary.com/shop/image/upload/oil.webp', destination_type: 'none', display_order: 1, is_active: true };
test('carousel validates bounded content, boolean, IDs, scheduling and order', () => {
  assert.equal(parseCarouselBanner(base).destination_type, 'none');
  for (const patch of [{ title: '' }, { title: 'x'.repeat(121) }, { destination_type: 'script' }, { destination_type: 'product', destination_id: '1;drop' }, { display_order: -1 }, { display_order: 1.2 }, { is_active: 'true' }, { starts_at: 'invalid' }, { starts_at: '2026-10-22T00:00:00Z', ends_at: '2026-10-21T00:00:00Z' }, { image_url: 'data:image/svg+xml,evil' }]) assert.throws(() => parseCarouselBanner({ ...base, ...patch }), { status: 400 });
  assert.equal(parseCarouselBanner({ ...base, title: '<script>evil</script>Parts' }).title, 'Parts');
});
test('carousel destinations reject executable, private, credential-bearing and malformed URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,evil', '//evil.test', '/admin/account', '/staff/dashboard', '/api/auth/profile', 'https://user:password@evil.test', '/%2f%2fevil.test', '/shop?redirect=/admin', '/shop%0a', '/shop\\evil']) assert.equal(safeCarouselLink(value), null, value);
  for (const value of ['/shop', '/products/14', '/shop?model=Click%20125', '/shop?promotion=2', 'https://example.com/sale']) assert.equal(safeCarouselLink(value), value);
});
test('public carousel only accepts active current schedules and projects approved fields', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  assert.equal(withinCarouselSchedule(base, now), true);
  for (const patch of [{ is_active: false }, { starts_at: '2026-10-22T00:00:00Z' }, { ends_at: '2026-10-20T00:00:00Z' }, { starts_at: 'broken' }]) assert.equal(withinCarouselSchedule({ ...base, ...patch }, now), false);
  const publicRow = publicCarouselSlide({ ...base, id: 1, secret: 'hidden', owner_id: 7, link_url: 'javascript:evil' });
  assert.equal(publicRow.secret, undefined); assert.equal(publicRow.owner_id, undefined); assert.equal(publicRow.link_url, '');
});
test('structured targets resolve in bounded batches and unavailable products are excluded', async () => {
  const rows = [
    { ...base, id: 1, destination_type: 'product', destination_id: 4 },
    { ...base, id: 2, destination_type: 'product', destination_id: 9 },
    { ...base, id: 3, destination_type: 'promotion', destination_id: 7 },
    { ...base, id: 4, destination_type: 'model', destination_id: 6 },
    { ...base, id: 5, destination_type: 'category', destination_id: 2 },
    { ...base, id: 6, destination_type: 'none' },
  ];
  const calls = [];
  const result = await resolveCarouselTargets(rows, async (sql, values) => {
    calls.push({ sql, values });
    return { rows: sql.includes('FROM products') ? [{ id: 4 }] : sql.includes('FROM discounts') ? [{ id: 7 }] : sql.includes('FROM categories') ? [{ id: 2 }] : [{ id: 6, model_name: 'Click 125' }] };
  });
  assert.equal(calls.length, 4); assert.equal(result.length, 5);
  assert.deepEqual(result.map(row => row.link_url), ['/products/4', '/shop?promotion=7', '/shop?model=Click%20125', '/shop?category=2', '']);
  assert.match(calls.find(call => call.sql.includes('discounts')).sql, /is_active=true/);
  assert.match(calls.find(call => call.sql.includes('products')).sql, /visibility_status='active'/);
});
test('set listing destinations validate, link to the set page and drop unavailable sets', async () => {
  assert.equal(parseCarouselBanner({ ...base, destination_type: 'set', destination_id: 9, button_text: 'View Set' }).destination_id, 9);
  assert.throws(() => parseCarouselBanner({ ...base, destination_type: 'set' }), { status: 400 });
  assert.equal(safeCarouselLink('/sets/9'), '/sets/9');
  assert.equal(safeCarouselLink('/sets/abc'), null);
  const rows = [{ ...base, id: 1, destination_type: 'set', destination_id: 9 }, { ...base, id: 2, destination_type: 'set', destination_id: 10 }, { ...base, id: 3, destination_type: 'none', button_text: 'Ignored' }];
  const calls = [];
  const result = await resolveCarouselTargets(rows, async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 9, name: 'Mio 125 M3 Fairings' }] }; });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /listing_type='set' AND l\.visibility_status='active'/);
  assert.match(calls[0].sql, /ip\.inventory_status='active'/);
  assert.deepEqual(result.map(row => [row.id, row.link_url]), [[1, '/sets/9'], [3, '']]);
  assert.equal(publicCarouselSlide(result[1]).link_url, '');
  const managed = await resolveCarouselTargets(rows, async () => ({ rows: [] }), { forManagement: true, includeUnavailable: true });
  assert.equal(managed.find(row => row.id === 2).destination_unavailable, true);
});
