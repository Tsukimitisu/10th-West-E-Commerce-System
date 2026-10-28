import { expect, test } from "@playwright/test";
import {
  customerFixture,
  fixtureBanners,
  fixtureCart,
  fixtureProduct,
} from "./customerPhaseFixture.js";
const badge = (page, n) =>
  page.getByRole("button", { name: `Open cart, ${n} items`, exact: true });
const add = (page) =>
  page
    .locator(".product-card")
    .filter({ hasText: fixtureProduct.name })
    .first()
    .getByRole("button", { name: /add to cart/i });
const signIn = async (page) => {
  await page.getByPlaceholder("name@example.com").fill("rider@example.test");
  await page.getByPlaceholder("Enter your password").fill("fixture-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
};
test("guest cart adds, updates, persists, revalidates and removes", async ({
  page,
}) => {
  const state = await customerFixture(page);
  await page.goto("/#/");
  await add(page).click();
  await expect(badge(page, 1)).toBeVisible();
  await page.goto("/#/cart");
  const row = page.getByTestId("cart-row-98001");
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /increase/i }).click();
  await expect(badge(page, 2)).toBeVisible();
  await page.reload();
  await expect(badge(page, 2)).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("shopCoreGuestCart"))[0].quantity,
    ),
  ).toBe(2);
  state.product.price = 650;
  state.product.stock_quantity = 1;
  await page.reload();
  await expect(row).toContainText("650.00");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /price updated|exceeds available stock/i })
      .first(),
  ).toBeVisible();
  await row.getByRole("button", { name: /remove/i }).click();
  await expect(badge(page, 0)).toBeVisible();
  await page.reload();
  await expect(row).toHaveCount(0);
});
for (const route of ["/shop", "/products/98001", "/shop?search=OIL-98001"])
  test(`guest add from ${route}`, async ({ page }) => {
    await customerFixture(page);
    await page.goto(`/#${route}`);
    if (route.startsWith("/products"))
      await page
        .getByRole("button", { name: /add to cart/i })
        .first()
        .click();
    else await add(page).click();
    await expect(badge(page, 1)).toBeVisible();
    await expect(page).not.toHaveURL(/#\/login/);
  });
test("guest login merges once within stock and returns to checkout with selection", async ({
  page,
}) => {
  const state = await customerFixture(page, { accountCart: fixtureCart(7) });
  await page.goto("/#/shop");
  await add(page).click();
  await expect(badge(page, 1)).toBeVisible();
  await page.goto("/#/cart");
  await page
    .getByRole("button", { name: /checkout/i })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /sign in/i })
    .click();
  await expect(page).toHaveURL(/login.*redirect/);
  await signIn(page);
  await expect(page).toHaveURL(/#\/checkout/);
  await expect(badge(page, 8)).toBeVisible();
  expect(state.cart).toHaveLength(1);
  expect(state.writes.filter((call) => call.path === "/cart/add")).toHaveLength(
    1,
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(
        sessionStorage.getItem("shopCoreCart_700001_checkout_selection"),
      ),
    ),
  ).toEqual([98001]);
});
test("authenticated cart still refreshes and updates", async ({ page }) => {
  await customerFixture(page, { authenticated: true, cart: fixtureCart() });
  await page.goto("/#/cart");
  await expect(badge(page, 2)).toBeVisible();
  await page
    .getByTestId("cart-row-98001")
    .getByRole("button", { name: /increase/i })
    .click();
  await expect(badge(page, 3)).toBeVisible();
});
test("managed hero controls, swipe, keyboard and real CTA work", async ({
  page,
}) => {
  await customerFixture(page, {
    banners: [
      ...fixtureBanners,
      { id: 3, title: "Inactive offer", is_active: false },
    ],
  });
  await page.goto("/#/");
  const hero = page.getByRole("region", { name: "10th West store highlights" });
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
    "Maintenance essentials",
  );
  await expect(
    hero.getByRole("link", { name: "Shop maintenance" }),
  ).toHaveAttribute("href", "#/shop?search=oil");
  await hero.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
    "Parts for your Click 125",
  );
  await hero.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
    "Maintenance essentials",
  );
  await hero.dispatchEvent("touchstart", {
    touches: [{ identifier: 0, clientX: 280, clientY: 200 }],
  });
  await hero.dispatchEvent("touchend", {
    changedTouches: [{ identifier: 0, clientX: 80, clientY: 205 }],
  });
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
    "Parts for your Click 125",
  );
  await expect(page.getByText("Inactive offer")).toHaveCount(0);
  await expect(
    page.locator("#home-part-search,.home-search-band,.home-promotion-strip"),
  ).toHaveCount(0);
  await hero.getByRole("link", { name: "Find Click parts" }).click();
  await expect(page).toHaveURL(/shop\?model=Click%20125/);
});
test("empty hero fallback disappears with one banner; no unnecessary controls", async ({
  page,
}) => {
  const state = await customerFixture(page, { banners: [] });
  await page.goto("/#/");
  await expect(
    page.getByRole("heading", { name: "Parts built for the ride." }),
  ).toBeVisible();
  state.banners = [fixtureBanners[0]];
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Maintenance essentials" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Parts built for the ride." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next slide", exact: true }),
  ).toHaveCount(0);
});
test("announcements consolidate; future and unpublished content stays out", async ({
  page,
}) => {
  await customerFixture(page, {
    banners: [],
    announcements: [
      {
        id: 1,
        title: "Shop hours update",
        content: "<p>Open on Sunday.</p>",
        is_published: true,
        published_at: "2020-01-01",
      },
      {
        id: 2,
        title: "Future publication",
        content: "Later",
        is_published: true,
        published_at: "2099-01-01",
      },
      { id: 3, title: "Unpublished draft", is_published: false },
    ],
  });
  await page.goto("/#/");
  const hero = page.getByRole("region", { name: "10th West store highlights" });
  await expect(
    hero.getByRole("heading", { name: "Shop hours update" }),
  ).toBeVisible();
  await expect(hero.getByText("Open on Sunday.")).toBeVisible();
  await expect(hero.getByRole("link")).toHaveCount(0);
  await expect(hero.getByText("Future publication")).toHaveCount(0);
});
test("Shop removes year filters and preserves symbol-only no results", async ({
  page,
}) => {
  await customerFixture(page);
  await page.goto(
    "/#/shop?year=2024&year_from=2020&year_to=2026&model=Click%20125",
  );
  await expect(page).not.toHaveURL(/year/);
  await expect(page).toHaveURL(/model=Click(?:%20|\+)125/);
  await expect(page.getByText(/fitment year/i)).toHaveCount(0);
  await expect(add(page)).toBeVisible();
  await page.goto("/#/shop?search=%25%25%25");
  await expect(page.locator(".product-card")).toHaveCount(0);
});
test("account uses top navigation on desktop and phone", async ({ page }) => {
  await customerFixture(page, { authenticated: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#/profile");
    await expect(page.locator(".account-workspace aside")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Account navigation" });
    await nav.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "My Orders", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Orders", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  }
});
test("auth routes keep store navigation and login preserves intended orders", async ({
  page,
}) => {
  await customerFixture(page);
  for (const route of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ]) {
    await page.goto(`/#${route}`);
    await expect(
      page.getByRole("link", { name: "Back to Store", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".customer-auth-header img")).toBeVisible();
  }
  await page.goto("/#/orders?status=processing");
  await expect(page).toHaveURL(/redirect=%2Forders%3Fstatus%3Dprocessing/);
  await signIn(page);
  await expect(page).toHaveURL(/#\/orders\?status=processing/);
  await expect(page.locator(".storefront-header")).toBeVisible();
});

test("unconfirmed merge with an existing account line retains guest recovery data", async ({
  page,
}) => {
  const state = await customerFixture(page, {
    accountCart: fixtureCart(2),
    mergeConfirmed: false,
  });
  await page.goto("/#/shop");
  await add(page).click();
  await expect(badge(page, 1)).toBeVisible();
  await page.goto("/#/login?redirect=/cart");
  await signIn(page);
  await expect(page).toHaveURL(/#\/cart/);
  await expect(badge(page, 2)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("shopCoreGuestCart"))?.[0]?.quantity,
    ),
  ).toBe(1);
  state.mergeConfirmed = true;
  state.cart = fixtureCart(3);
  await page.reload();
  await expect(badge(page, 3)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("shopCoreGuestCart")),
  ).toBeNull();
});

test("authenticated checkout keeps its selected cart after a full refresh", async ({
  page,
}) => {
  await customerFixture(page, { authenticated: true, cart: fixtureCart(2) });
  await page.goto("/#/cart");
  await expect(badge(page, 2)).toBeVisible();
  await page.getByTestId("cart-row-98001").getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /checkout/i })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/checkout/);
  await expect(
    page.getByText(fixtureProduct.name, { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem("shopCoreGuestCart_selected", "[]");
    sessionStorage.setItem("shopCoreGuestCart_checkout_selection", "[]");
  });
  await page.reload();
  await expect(
    page.getByText(fixtureProduct.name, { exact: true }).first(),
  ).toBeVisible();
});

test("header search finds a part number and gives no results for symbols on desktop and phone", async ({
  page,
}) => {
  await customerFixture(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#/");
    if (width < 1024)
      await page
        .getByRole("button", { name: "Open product search", exact: true })
        .click();
    const search = page
      .getByRole("searchbox", { name: "Search products", exact: true })
      .filter({ visible: true });
    await search.fill("OIL-98001");
    const results = page.locator(".storefront-header, #mobile-product-search");
    await expect(
      results
        .getByRole("link", { name: /Rider 4T Engine Oil/ })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await search.fill("%%%");
    await expect(
      page
        .getByText("No products found", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      results
        .getByRole("link", { name: /Rider 4T Engine Oil/ })
        .filter({ visible: true }),
    ).toHaveCount(0);
  }
});
