import { expect, test } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { superadminFixture } from './superadminFixture.js';

// Every API is intercepted. No real SMS, email, accounts or settings are changed.
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
for (const width of [390, 1440]) {
  test(`login countdown and recovery lock at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await staffFixture(page, { loggedOut: true });
    let calls = 0;
    await page.route('**/api/auth/login', route => route.fulfill({ status: 429, json: ++calls === 1
      ? { code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 3, message: 'Please wait.' }
      : { code: 'ACCOUNT_RECOVERY_REQUIRED', message: 'Reset your password.' } }));
    await page.goto('/#/login');
    await page.locator('#login-email').fill('rider@example.test');
    await page.locator('#login-password').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Sign-in feedback' })).toContainText('Too many failed sign-in attempts. Try again in 00:0');
    await expect(page.getByRole('button', { name: /Try again in 00:0[123]/ })).toBeDisabled();
    await expect(page.getByRole('alert', { name: 'Sign-in feedback' })).not.toContainText('rider@example.test');
    await noOverflow(page);
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled({ timeout: 6000 });
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Sign-in feedback' })).toContainText('Sign-in temporarily disabled.');
    await expect(page.getByRole('link', { name: 'Contact Support' })).toBeVisible();
    await page.getByRole('link', { name: 'Reset Password', exact: true }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByRole('button', { name: 'Phone', exact: true })).toBeVisible();
  });

  test(`email and phone recovery reuse password reset at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await staffFixture(page, { loggedOut: true });
    const grant = 'a'.repeat(64);
    let resetBody;
    await page.route('**/api/auth/forgot-password', route => route.fulfill({ json: { message: 'If an account exists for this email, password reset instructions have been sent.' } }));
    await page.route('**/api/auth/forgot-password/phone', route => route.fulfill({ json: { challenge_id: '00000000-0000-4000-8000-000000000001', expires_in: 300, resend_after: 60 } }));
    await page.route('**/api/auth/forgot-password/phone/verify', route => route.fulfill({ json: { reset_token: grant } }));
    await page.route('**/api/auth/verify-reset-token', route => route.fulfill({ json: { valid: true, email: 'r•••••••@example.test', expires_at: new Date(Date.now() + 600000).toISOString() } }));
    await page.route('**/api/auth/reset-password', route => { resetBody = route.request().postDataJSON(); return route.fulfill({ json: { message: 'Password reset successfully.' } }); });
    await page.goto('/#/forgot-password');
    await page.getByLabel('Email Address').fill('missing@example.test');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    await page.getByLabel('Phone number').fill('09123456789');
    await page.getByRole('button', { name: 'Send Reset Code' }).click();
    await expect(page.getByRole('status')).toContainText('If an eligible account');
    await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
    await page.getByLabel('Verification code').fill('123456');
    await noOverflow(page);
    await page.getByRole('button', { name: 'Verify Code' }).click();
    await expect(page).toHaveURL(/#\/reset-password$/);
    expect(page.url()).not.toContain(grant);
    await page.getByLabel('New password', { exact: true }).fill('NewRecoveryPassword123!');
    await page.getByLabel('Confirm new password', { exact: true }).fill('NewRecoveryPassword123!');
    await noOverflow(page);
    await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
    await expect(page.getByText('Your password has been successfully reset.', { exact: true })).toBeVisible();
    expect(resetBody).toEqual({ token: grant, newPassword: 'NewRecoveryPassword123!' });
  });

  test(`masked locked accounts and expiry refresh at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await superadminFixture(page);
    await page.clock.install();
    let monitoringCalls = 0, showTemporary = true;
    await page.route('**/api/admin/logs/suspicious', route => {
      monitoringCalls++;
      return route.fulfill({ json: { server_time: new Date().toISOString(), failed_login_clusters: [], bulk_operations: [], locked_accounts: [
        ...(showTemporary ? [{ id: 11, category: 'customer account', masked_email: 'c•••••••@example.test', login_attempts: 5, lock_stage: 1, locked_until: new Date(Date.now() + 10000).toISOString(), recovery_required: false }] : []),
        { id: 12, category: 'customer account', masked_email: 'r•••••••@example.test', login_attempts: 5, lock_stage: 3, locked_until: null, recovery_required: true },
      ] } });
    });
    await page.goto('/#/superadmin/security');
    await expect(page.getByText('Progressive protection', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Suspicious Activity' }).click();
    const recovery = page.locator('article').filter({ hasText: 'r•••••••@example.test' });
    await expect(recovery).toContainText('Recovery required');
    await expect(recovery).not.toContainText('Try again in');
    await expect(page.getByText('c•••••••@example.test', { exact: true })).toBeVisible();
    const initialCalls = monitoringCalls; showTemporary = false;
    await page.clock.fastForward(11000);
    await expect(page.getByText('c•••••••@example.test', { exact: true })).toHaveCount(0, { timeout: 6000 });
    expect(monitoringCalls).toBe(initialCalls + 1);
    await noOverflow(page);
  });

  test(`read-only administrative email at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await superadminFixture(page);
    let editBody;
    await page.route(/\/api\/admin\/users(?:\?.*)?$/, route => route.fulfill({ json: { total: 1, users: [{ id: 33, name: 'Managed Staff', email: 'staff@example.test', phone: '', role: 'store_staff', is_active: true }] } }));
    await page.route('**/api/staff/33', route => { editBody = route.request().postDataJSON(); return route.fulfill({ json: { message: 'Staff member updated' } }); });
    await page.goto('/#/superadmin/users');
    await expect(page.getByText('Managed Staff', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: /Actions for Managed Staff/ }).filter({ visible: true }).click();
    await page.getByRole('menuitem', { name: 'Edit user' }).click();
    await expect(page.getByText('Verified account identifier', { exact: true })).toBeVisible();
    await expect(page.locator('#managed-user-email')).toHaveCount(0);
    await page.getByLabel('Full Name *', { exact: true }).fill('Updated Staff');
    await noOverflow(page);
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await expect.poll(() => editBody).toBeTruthy();
    expect(editBody).not.toHaveProperty('email');
  });
}
