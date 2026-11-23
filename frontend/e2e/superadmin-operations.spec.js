import { expect, test } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { customerFixture, fixtureOrder } from './customerPhaseFixture.js';

const reference = '11111111-1111-4111-8111-111111111111';
async function operationsFixture(page) {
  await staffFixture(page, { user: { role: 'super_admin' } });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.copiedDiagnostic = value; } } }));
  const time = '2026-10-24T00:00:00Z';
  const state = { active: false, writes: 0, unavailable: false, errors: [
    { id: 21, error_type: 'DB_ERROR', created_at: time, endpoint: 'POST /api/checkout', details: { password: 'fixture-private-secret', token: 'fixture-private-secret', quantity: 2 } },
    { id: 22, error_type: 'DB_ERROR', created_at: time, endpoint: 'POST /api/checkout' },
  ], activity: [
    { id: 'audit:1', action: 'login', user_name: 'Shop Operator', created_at: time },
    { id: 'audit:2', action: 'settings.security.update', entity_type: 'system_settings', entity_id: 'security', user_name: 'Shop Operator', created_at: time, details: { outcome: 'success' } },
  ] };
  await page.route('**/api/admin/maintenance', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (body.password !== 'fixture-current-password' || body.totp_code !== '123456') return route.fulfill({ status: 403, json: { code: 'FRESH_AUTH_REQUIRED', message: 'Your current password could not be verified.' } });
      expect(body.acknowledgement).toBe(true); expect(body.reason).toBeTruthy();
      state.active = body.active; state.writes++;
      return route.fulfill({ json: { active: state.active } });
    }
    return route.fulfill({ json: {
      requires_totp: true,
      maintenance: { active: state.active, reason: 'Planned shop update', message: 'We will be back shortly.', started_by_name: 'Shop Operator', started_at: time },
      cleanup: { status: 'healthy', last_cleanup: time, last_result: 'successful', next_expected_run: time, last_counts: { sessions_expired: 2, http_sessions_deleted: 1, reservations_released: 4, idempotency_keys_deleted: 5, rate_limits_deleted: 6, notification_deliveries_deleted: 7 } },
      diagnostics: { application: '10th West', reference, timestamp: time, overall: 'healthy', website: 'online', database: 'connected', email: 'configured', payments: 'configured', backup: { status: 'successful', time, storage_key: 'fixture-private-storage' }, cleanup: { status: 'healthy', time }, recent_errors_24h: 2, maintenance: state.active ? 'active' : 'inactive', token: 'fixture-private-secret', email_address: 'private@example.test' },
    } });
  });
  await page.route('**/api/auth/activity-logs**', route => route.fulfill({ json: { logs: state.activity, total: state.activity.length } }));
  await page.route('**/api/admin/logs/errors**', route => route.fulfill({ status: state.unavailable ? 503 : 200, json: state.unavailable ? { message: 'Unavailable' } : state.errors }));
  await page.route('**/api/admin/logs/transactions**', route => route.fulfill({ json: [{ id: 'audit:3', action: 'pos.sale', user_name: 'Store Owner', entity_type: 'order', entity_id: 244, created_at: time, details: { outcome: 'success' } }] }));
  return state;
}

for (const width of [390, 768, 1440]) {
  test(`maintenance confirmation and operator guidance at ${width}px`, async ({ page }, testInfo) => {
    const state = await operationsFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/superadmin/maintenance');
    await expect(page.getByText('Open normally', { exact: true })).toBeVisible();
    await expect(page.getByText('3 expired session records', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Copy diagnostic summary' }).click();
    const copied = await page.evaluate(() => window.copiedDiagnostic);
    expect(copied).toContain(reference); expect(copied).not.toMatch(/fixture-private|private@example|Shop Operator|storage_key|token/);
    await page.getByRole('button', { name: 'Start Maintenance', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Start maintenance?' });
    await expect(dialog).toContainText('existing payment updates');
    await expect(dialog.getByRole('button', { name: 'Start Maintenance', exact: true })).toBeDisabled();
    await dialog.getByLabel('Reason', { exact: true }).fill('Planned shop update');
    await dialog.getByLabel('I understand who will be affected by this change.').check();
    await dialog.getByLabel('Current Super Admin password').fill('fixture-current-password');
    await expect(dialog.getByRole('button', { name: 'Start Maintenance', exact: true })).toBeDisabled();
    await dialog.getByLabel('Current authenticator code').fill('123456');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`maintenance-confirm-${width}.png`), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Start Maintenance', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Maintenance mode active', { exact: true })).toBeVisible();
    await expect(page.getByText('Shop Operator', { exact: true })).toBeVisible();
    expect(state.writes).toBe(1);
    await page.getByRole('button', { name: 'End Maintenance', exact: true }).click();
    const end = page.getByRole('dialog', { name: 'End maintenance?' });
    await expect(end.getByLabel('Current Super Admin password')).toHaveValue('');
    await end.getByRole('button', { name: 'Cancel' }).click();
    expect(state.active).toBe(true);
  });

  test(`audit rows, legacy outcomes, errors and advanced details at ${width}px`, async ({ page }, testInfo) => {
    await operationsFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/superadmin/audit-logs');
    await expect(page.getByText('Signed in', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('Outcome not captured', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('Not applicable', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: 'View details', exact: true }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Event details' });
    await expect(dialog.getByText('What happened', { exact: true })).toBeVisible();
    await expect(dialog.locator('pre')).toBeHidden();
    await dialog.getByText('Advanced technical details', { exact: true }).click();
    await expect(dialog.locator('pre')).toContainText('login');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Errors \d/ }).click();
    await expect(page.getByRole('heading', { name: 'Repeated problems' })).toBeVisible();
    await expect(page.getByText('Database operation failed', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'View details', exact: true }).filter({ visible: true }).first().click();
    await expect(dialog).toContainText('Some requests may have failed.');
    await expect(dialog).toContainText('Needs attention');
    await dialog.getByText('Advanced technical details', { exact: true }).click();
    await expect(dialog.locator('pre')).not.toContainText('fixture-private');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`audit-details-${width}.png`), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Transactions \d/ }).click();
    await expect(page.getByText('POS sale completed', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Order #244' })).toHaveCount(0);
    await page.getByPlaceholder('Search people, events or affected items…').fill('no-matching-events');
    await expect(page.getByText('No matching activity found.', { exact: true })).toBeVisible();
  });
}

test('failed error retrieval is Unavailable, never a false no-errors claim', async ({ page }) => {
  const state = await operationsFixture(page); state.unavailable = true;
  await page.goto('/#/superadmin/monitoring');
  await expect(page.getByText('Records unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No errors found for this period.', { exact: true })).toHaveCount(0);
});

test('customer maintenance message is branded, retryable and leaves payment completion reachable', async ({ page }) => {
  await customerFixture(page, { authenticated: true });
  let active = true;
  await page.route('**/api/maintenance-status', route => route.fulfill({ json: { active, message: 'We are updating the shop. Please try again shortly.' } }));
  await page.goto('/#/shop');
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly' })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await expect(page.getByAltText('10th West Motorcycle Parts & Accessories')).toBeVisible();
  await expect(page.getByText('There is no need to pay again.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly' })).toBeVisible();
  active = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly' })).toHaveCount(0);
  active = true;
  await page.goto('/#/cart');
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly' })).toBeVisible();
  await page.route('**/api/payments/orders/88001/status', route => route.fulfill({ json: fixtureOrder }));
  await page.evaluate(() => { window.location.hash = '/payment-result?order=88001&status=success'; });
  await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly' })).toHaveCount(0);
  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: 'We’ll be back shortly' })).toHaveCount(0);
});
