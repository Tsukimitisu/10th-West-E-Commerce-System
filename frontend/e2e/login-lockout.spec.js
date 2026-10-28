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

for (const width of [390, 1440]) test(`compact failed-attempt alert, ticking lock, refresh, expiry and successful login at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await staffFixture(page, { loggedOut: true, user: { role: 'customer' } });
  const now = Date.now();
  await page.clock.setFixedTime(new Date(now));
  let requests = 0;
  await page.route('**/api/auth/login', route => {
    requests++;
    if (requests > 5) return route.fallback();
    return route.fulfill({ status: requests < 5 ? 401 : 429,
      json: requests < 5 ? { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
        : { code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 900, message: 'Please wait.' } });
  });
  let failedStyle;
  await page.goto('/#/login');
  await enterCredentials(page);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    if (attempt < 5) {
      const alert = page.getByRole('alert', { name: 'Sign-in feedback' });
      await expect(alert).toHaveText('Invalid login attempt.');
      await expect(page.locator('form [role="alert"]')).toHaveCount(1);
      failedStyle = await alert.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderTopColor, color: getComputedStyle(element).color }));
    }
  }
  const notice = page.getByRole('alert', { name: 'Sign-in feedback' });
  await expect(notice).toBeVisible();
  await expect(notice).toBeInViewport();
  await expect(notice).toContainText('15:00');
  await expect(notice.locator('.tabular-nums')).toBeInViewport();
  await expect(notice).not.toContainText(email);
  await expect(notice).toHaveText('Too many failed sign-in attempts. Try again in 15:00.');
  await expect(notice.getByRole('heading')).toHaveCount(0);
  await expect(notice.locator('.tabular-nums')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  await expect(page.getByRole('alert')).toHaveCount(1);
  const lockedStyle = await notice.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderTopColor, color: getComputedStyle(element).color }));
  expect(lockedStyle).toEqual(failedStyle);
  expect(await notice.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(110);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: testInfo.outputPath(`inline-lockout-${width}.png`), animations: 'disabled', fullPage: true });
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
  await expect(notice).toHaveAttribute('aria-live', 'polite');
  await expect(notice).toHaveAttribute('aria-atomic', 'true');
  await page.clock.setFixedTime(new Date(now + 1000));
  await expect(notice).toHaveText('Too many failed sign-in attempts. Try again in 14:59.');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
  const saved = await page.evaluate(key => sessionStorage.getItem(key), storageKey);
  expect(JSON.parse(saved)).toEqual({ identifier: expect.stringMatching(/^[a-f0-9]{64}$/), deadline: expect.any(Number), recovery: false });
  expect(JSON.parse(saved).deadline).toBe(now + 900000);
  for (const secret of [email, password, 'token', 'otp']) expect(saved.toLowerCase()).not.toContain(secret.toLowerCase());
  await page.reload();
  // Simulate an autofill input event without retaining email in our storage.
  await page.locator('#login-email').evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, email);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
  await page.locator('#login-email').fill('different@example.test');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  await expect(notice).toHaveCount(0);
  await page.clock.setFixedTime(new Date(now + 33000));
  await page.locator('#login-email').fill(email.toUpperCase());
  await expect(notice).toHaveText('Too many failed sign-in attempts. Try again in 14:27.');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
  await page.locator('#login-password').fill(password);
  await page.locator('#login-password').press('Enter');
  expect(requests).toBe(5);
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBe(saved);
  await page.clock.setFixedTime(new Date(now + 900000));
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(requests).toBe(5); // Expiry never submits credentials automatically.
  await page.locator('#login-password').fill('CorrectPassword123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(requests).toBe(6);
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
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

test('a different account can sign in immediately while the original account is locked', async ({ page }) => {
  await staffFixture(page, { loggedOut: true, user: { role: 'customer' } });
  const submittedEmails = [];
  await page.route('**/api/auth/login', route => {
    const submittedEmail = route.request().postDataJSON().email;
    submittedEmails.push(submittedEmail);
    if (submittedEmail !== email) return route.fallback();
    return route.fulfill({ status: 429,
      json: { code: 'ACCOUNT_TEMPORARILY_LOCKED', retry_after_seconds: 900, message: 'Please wait.' } });
  });
  await page.goto('/#/login'); await enterCredentials(page);
  const submit = page.getByRole('button', { name: 'Sign In', exact: true });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('alert', { name: 'Sign-in feedback' })).toBeVisible();
  await page.locator('#login-email').fill('another@example.test');
  await expect(page.getByRole('alert', { name: 'Sign-in feedback' })).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/#\/$/);
  expect(submittedEmails).toEqual([email, 'another@example.test']);
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test('recovery-required warning has no countdown or persisted client block', async ({ page }) => {
  await staffFixture(page, { loggedOut: true });
  await page.route('**/api/auth/login', route => route.fulfill({ status: 429, json: { code: 'ACCOUNT_RECOVERY_REQUIRED', message: 'Reset your password.' } }));
  await page.goto('/#/login'); await enterCredentials(page);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const notice = page.getByRole('alert', { name: 'Sign-in feedback' });
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
  await expect(page.getByRole('alert', { name: 'Sign-in feedback' })).toContainText(/Try again in 09:0[34]/);
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
});
