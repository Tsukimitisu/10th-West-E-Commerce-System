import { expect, test } from '@playwright/test';

const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
const customerTotp = process.env.E2E_CUSTOMER_TOTP;
const apiUrl = (process.env.E2E_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const acceptCookies = async (page) => {
  await page.addInitScript(() => localStorage.setItem('cookieConsent', 'all'));
};

const fillLoginForm = async (page, email, password) => {
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
};

const getCsrfToken = async (page) => {
  const response = await page.request.get(`${apiUrl}/csrf-token`);
  expect(response.ok(), 'CSRF token endpoint should be available').toBe(true);
  const body = await response.json();
  expect(body.csrfToken, 'CSRF token should be returned').toEqual(expect.any(String));
  return body.csrfToken;
};

test('database outage shows a stable service message and leaves login reusable without retries', async ({ page }) => {
  let loginRequestCount = 0;

  await page.route('**/api/auth/providers', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/csrf-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: 'isolated-e2e-csrf-token' }),
    });
  });
  await page.route('**/api/auth/login', async (route) => {
    loginRequestCount += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'internal database detail that must not be displayed',
        code: 'DATABASE_UNAVAILABLE',
      }),
    });
  });

  await acceptCookies(page);
  await page.goto('/#/login');
  const emailInput = page.getByPlaceholder('name@example.com');
  const passwordInput = page.getByPlaceholder('Enter your password');
  const submitButton = page.getByRole('button', { name: /sign in/i });
  await emailInput.fill('outage-test@example.test');
  await passwordInput.fill('WrongPassword123!');
  await submitButton.click();

  await expect(page.getByText('The service is temporarily unavailable. Please try again later.')).toBeVisible();
  await expect(page.getByText('internal database detail that must not be displayed')).toHaveCount(0);
  await expect(submitButton).toBeEnabled();
  await expect(emailInput).toBeEditable();
  await expect(passwordInput).toBeEditable();
  await expect.poll(() => loginRequestCount).toBe(1);

  await emailInput.fill('retry-ready@example.test');
  await passwordInput.fill('RetryReady123!');
  expect(loginRequestCount).toBe(1);
});

test('wrong credentials first submit returns 401 after CSRF initialization', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/csrf-token') || url.includes('/api/auth/login')) {
      requests.push({ method: request.method(), url });
    }
  });

  await acceptCookies(page);
  await page.goto('/#/login');
  await fillLoginForm(
    page,
    `missing-${testInfo.project.name.toLowerCase()}-${testInfo.workerIndex}@test.local`,
    'WrongPassword123!'
  );

  const loginResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/auth/login')
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /sign in/i }).click();
  const loginResponse = await loginResponsePromise;
  const responseBody = await loginResponse.json().catch(() => ({}));

  expect(loginResponse.status()).toBe(401);
  expect(responseBody.code).toBe('INVALID_CREDENTIALS');
  expect(String(responseBody.message || '')).toMatch(/invalid email or password/i);

  const firstCsrfRequestIndex = requests.findIndex((request) => request.url.includes('/api/csrf-token'));
  const firstLoginRequestIndex = requests.findIndex((request) => request.url.includes('/api/auth/login'));
  expect(firstCsrfRequestIndex, 'login should initialize a CSRF token before posting credentials').toBeGreaterThanOrEqual(0);
  expect(firstLoginRequestIndex).toBeGreaterThan(firstCsrfRequestIndex);
});

test.describe('credential-gated auth session checks', () => {
  test.skip(!customerEmail || !customerPassword, 'Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to run live auth checks.');

  test('customer sign-in creates a session, exposes profile, and logout clears it', async ({ context, page }) => {
    await acceptCookies(page);
    await page.goto('/#/login');
    await fillLoginForm(page, customerEmail, customerPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    if (customerTotp && await page.getByPlaceholder('000000').isVisible().catch(() => false)) {
      await page.getByPlaceholder('000000').fill(customerTotp);
      await page.getByRole('button', { name: /verify code/i }).click();
    }

    await expect(page).not.toHaveURL(/#\/login/);

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === 'twm.sid');
    expect(sessionCookie, 'twm.sid cookie should be issued by the backend').toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);

    const profileResponse = await page.request.get(`${apiUrl}/auth/profile`);
    expect(profileResponse.status()).toBe(200);
    const profile = await profileResponse.json();
    expect(profile.email).toBe(customerEmail);
    expect(Object.keys(profile)).not.toContain(`password_${'hash'}`);

    const csrfToken = await getCsrfToken(page);
    const logoutResponse = await page.request.post(`${apiUrl}/auth/logout`, {
      headers: {
        'x-csrf-token': csrfToken,
      },
    });
    expect(logoutResponse.status()).toBe(200);

    const profileAfterLogoutResponse = await page.request.get(`${apiUrl}/auth/profile`);
    expect(profileAfterLogoutResponse.status()).toBe(401);
  });
});
