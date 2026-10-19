import { expect, test } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { superadminFixture } from './superadminFixture.js';

// All API traffic is intercepted; no real account/settings writes occur.
for (const [role, target] of [['customer', '/'], ['store_staff', '/staff/dashboard'], ['owner', '/admin/dashboard'], ['super_admin', '/superadmin/dashboard']]) {
  test(`${role} login retains its existing route`, async ({ page }) => {
    await staffFixture(page, { loggedOut: true, user: { role } });
    await page.goto('/#/login');
    await page.locator('#login-email').fill('rider@example.test');
    await page.getByLabel('Password', { exact: true }).fill('CorrectPass123!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${target.replaceAll('/', '\\/')}$`));
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0);
  });
}

test('required 2FA enrollment reuses setup/verification before mounting the workspace', async ({ page }) => {
  const state = await staffFixture(page, { user: { role: 'super_admin', requires_2fa_enrollment: true } });
  await page.route('**/api/auth/2fa/verify', async route => {
    expect(route.request().postDataJSON().totp_code).toBe('123456');
    state.user = { ...state.user, two_factor_enabled: true, requires_2fa_enrollment: false, requires_2fa_challenge: false };
    return route.fulfill({ json: { recovery_codes: ['12345678-abcd1234'] } });
  });
  await page.goto('/#/superadmin/dashboard');
  await expect(page.getByRole('heading', { name: 'Set up two-factor authentication' })).toBeVisible();
  await expect(page.locator('.system-sidebar')).toHaveCount(0);
  await page.getByLabel('Current password').fill('CorrectPass123!');
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await expect(page.getByAltText('Authenticator setup QR code')).toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
  await expect(page.getByText('12345678-abcd1234', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I saved my codes — Continue' }).click();
  await expect(page.locator('.system-sidebar').first()).toBeAttached();
  await expect(page.getByRole('button', { name: 'I saved my codes ? Continue' })).toHaveCount(0);
});
test('an existing OAuth/session user can finish the same authenticator challenge', async ({ page }) => {
  const state = await staffFixture(page, { user: { role: 'store_staff', two_factor_enabled: true, requires_2fa_challenge: true } });
  await page.route('**/api/auth/2fa/challenge', async route => {
    if (route.request().postDataJSON().totp_code !== '123456') return route.fulfill({ status: 401, json: { message: 'Invalid two-factor authentication code.' } });
    state.user = { ...state.user, requires_2fa_challenge: false };
    return route.fulfill({ json: { message: 'Verified' } });
  });
  await page.goto('/#/staff/dashboard');
  await page.getByLabel('Authenticator or recovery code').fill('000000');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid two-factor authentication code.');
  await page.getByLabel('Authenticator or recovery code').fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('heading', { name: /Today's work/ })).toBeVisible();
});
test('Security Controls save/reload uses actual supported 2FA values', async ({ page }) => {
  const state = await superadminFixture(page);
  await page.goto('/#/superadmin/security');
  await page.getByLabel('Max Login Attempts', { exact: true }).fill('4');
  await page.getByRole('tab', { name: 'Two-Factor Auth' }).click();
  await page.getByRole('radio', { name: /Required for Everyone/ }).check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  expect(state.settings.security['2fa_enforcement']).toBe('required');
  expect(state.settings.security.max_login_attempts).toBe('4');
  await page.reload();
  await expect(page.getByLabel('Max Login Attempts', { exact: true })).toHaveValue('4');
  await page.getByRole('tab', { name: 'Two-Factor Auth' }).click();
  await expect(page.getByRole('radio', { name: /Required for Everyone/ })).toBeChecked();
});
