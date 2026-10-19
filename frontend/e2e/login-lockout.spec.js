import { expect, test } from '@playwright/test';
import { staffFixture } from './staffPhaseFixture.js';
import { createHash } from 'node:crypto';

// All APIs are intercepted. These tests never submit real credentials to a backend.
const email = 'rider@example.test';
const password = 'WrongPassword123!';
const storageKey = '10thwest:login-lock';
const enterCredentials = async page => {
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
};

test('fifth failure shows a ticking timer, local unlock time, and privacy-safe refresh persistence', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  const now = Date.now();
  await page.clock.setFixedTime(new Date(now));
  let requests = 0;
  await page.route('**/api/auth/login', route => route.fulfill({ status: ++requests < 5 ? 401 : 429,
    json: requests < 5 ? { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      : { code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 900, message: 'Please wait.' } }));
  await page.goto('/#/login');
  await enterCredentials(page);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    if (attempt < 5) await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  }
  const notice = page.getByRole('region', { name: 'Too many failed attempts' });
  await expect(notice).toBeVisible();
  await expect(notice).toBeInViewport();
  await expect(notice).toContainText('15:00');
  await expect(notice.locator('.tabular-nums')).toBeInViewport();
  await expect(notice).not.toContainText(email);
  await expect(notice).toContainText('Available again at');
  await expect(notice.locator('.tabular-nums')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  await expect(notice.getByRole('link', { name: 'Reset password instead' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again in 15:00', exact: true })).toBeDisabled();
  await expect(notice.locator('[aria-live="polite"]')).toHaveAttribute('aria-atomic', 'true');
  await page.clock.setFixedTime(new Date(now + 1000));
  await expect(page.getByRole('button', { name: 'Try again in 14:59', exact: true })).toBeDisabled();
  const saved = await page.evaluate(key => sessionStorage.getItem(key), storageKey);
  expect(JSON.parse(saved)).toEqual({ identifier: expect.stringMatching(/^[a-f0-9]{64}$/), deadline: expect.any(Number), recovery: false });
  await expect(notice.locator('time')).toHaveAttribute('datetime', new Date(JSON.parse(saved).deadline).toISOString());
  for (const secret of [email, password, 'token', 'otp']) expect(saved.toLowerCase()).not.toContain(secret.toLowerCase());
  await page.reload();
  // Simulate an autofill input event without retaining email in our storage.
  await page.locator('#login-email').evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, email);
  await expect(page.getByRole('button', { name: 'Try again in 14:59', exact: true })).toBeDisabled();
  await page.locator('#login-email').fill('different@example.test');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  await expect(notice).toHaveCount(0);
  await page.locator('#login-email').fill(email);
  await expect(notice).toBeVisible();
  await page.clock.setFixedTime(new Date(now + 900000));
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(requests).toBe(5); // Expiry never submits credentials automatically.
});

test('expired saved state is removed on page load', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  await page.addInitScript(({ key, identifier }) => sessionStorage.setItem(key, JSON.stringify({ identifier, deadline: 1, recovery: false })), {
    key: storageKey, identifier: createHash('sha256').update(email).digest('hex'),
  });
  await page.goto('/#/login'); await enterCredentials(page);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test('successful login clears saved metadata for another identifier', async ({ page }) => {
  await staffFixture(page, { loggedOut: true, user: { role: 'customer' } });
  await page.addInitScript(({ key, identifier }) => sessionStorage.setItem(key, JSON.stringify({ identifier, deadline: Date.now() + 900000, recovery: false })), {
    key: storageKey, identifier: createHash('sha256').update('different@example.test').digest('hex'),
  });
  await page.goto('/#/login'); await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test('recovery-required warning has no countdown or persisted client block', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  await page.route('**/api/auth/login', route => route.fulfill({ status: 429, json: { code: 'ACCOUNT_RECOVERY_REQUIRED', message: 'Reset your password.' } }));
  await page.goto('/#/login'); await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const notice = page.getByRole('region', { name: 'Sign-in temporarily disabled' });
  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText('Try again in');
  await expect(notice).not.toContainText('Available again at');
  await expect(notice.getByRole('link', { name: 'Reset Password', exact: true })).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test('the deployment API client preserves HTTP status, lock code and remaining seconds', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  await page.route('**/api/auth/login', route => route.fulfill({ status: 429, headers: { 'Retry-After': '544' },
    json: { code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 544, message: 'Please wait.' } }));
  await page.goto('/#/login'); await expect(page.locator('#login-email')).toBeVisible();
  const error = await page.evaluate(async () => {
    const { login } = await import('/services/api.js');
    try { await login('mock@example.test', 'mock-password'); } catch (caught) {
      return { status: caught.status, code: caught.code, retry_after_seconds: caught.retry_after_seconds };
    }
  });
  expect(error).toEqual({ status: 429, code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 544 });
});

test('manipulating the stored timer cannot prevent a fresh authoritative lock response', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  await page.route('**/api/auth/login', route => route.fulfill({ status: 429,
    json: { code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 544, message: 'Please wait.' } }));
  await page.addInitScript(({ key, identifier }) => sessionStorage.setItem(key, JSON.stringify({ identifier, deadline: 1, recovery: false })), {
    key: storageKey, identifier: createHash('sha256').update(email).digest('hex'),
  });
  await page.goto('/#/login'); await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Too many failed attempts' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again in 09:0[34]/ })).toBeDisabled();
});
