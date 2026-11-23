import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { managedHeroSlides, bannerDestination } from "../utils/managedHero.js";
import {
  customerReturnTo,
  safeCustomerReturnTo,
} from "../utils/customerReturnTo.js";
import { oauthDestination } from "../utils/oauthCompletion.js";

test("managed banners retain actual destinations, active status and priority without invented schedules", () => {
  const slides = managedHeroSlides([
    {
      id: 1,
      title: "Second",
      is_active: true,
      display_order: 2,
      link_url: "/shop?search=oil",
    },
    { id: 2, title: "First", is_active: true, display_order: 1 },
    { id: 3, title: "Hidden", is_active: false },
  ]);
  assert.deepEqual(
    slides.map((item) => item.title),
    ["First", "Second"],
  );
  assert.equal(slides[0].destination, null);
  assert.equal(slides[1].destination.href, "/shop?search=oil");
  assert.deepEqual(managedHeroSlides([], []), []);
});
test("announcements honor actual publication timestamps and never invent links", () => {
  const slides = managedHeroSlides(
    [],
    [
      {
        id: 1,
        title: "Published",
        content: "<p>Store news</p>",
        is_published: true,
        published_at: "2020-01-01",
      },
      {
        id: 2,
        title: "Future",
        is_published: true,
        published_at: "2099-01-01",
      },
      { id: 3, title: "Draft", is_published: false },
    ],
    Date.parse("2026-10-17"),
  );
  assert.equal(slides.length, 1);
  assert.equal(slides[0].text, "Store news");
  assert.equal(slides[0].destination, null);
});
test("banner destinations reject scripts, credentials and protocol-relative links", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.test",
    "https://user:pass@evil.test",
  ])
    assert.equal(bannerDestination(value), null);
  assert.deepEqual(bannerDestination("#/products/42"), {
    href: "/products/42",
    internal: true,
  });
  assert.equal(bannerDestination("https://example.test/offer").internal, false);
});
test("customer return paths retain checkout and Buy Now intent but reject external and operational destinations", () => {
  assert.equal(
    customerReturnTo("?redirect=%2Fcheckout%3FbuyNow%3D1"),
    "/checkout?buyNow=1",
  );
  assert.equal(
    customerReturnTo("?redirect=/checkout&buyNow=1&error=anything"),
    "/checkout?buyNow=1",
  );
  assert.equal(
    safeCustomerReturnTo("/orders?status=processing"),
    "/orders?status=processing",
  );
  for (const value of [
    "//evil.test",
    "https://evil.test",
    "/admin/dashboard",
    "/staff/inventory",
    "/superadmin/dashboard",
    "/pos",
    "/login",
    "/%2f%2fevil.test",
    "/shop/../../admin",
  ])
    assert.equal(safeCustomerReturnTo(value), "/");
  assert.equal(
    oauthDestination({ role: "owner" }, "/checkout"),
    "/admin/dashboard",
  );
  assert.equal(
    oauthDestination({ role: "store_staff" }, "/checkout"),
    "/staff/dashboard",
  );
  assert.equal(oauthDestination({ role: "cashier" }, "/checkout"), "/pos");
  assert.equal(
    oauthDestination({ role: "super_admin" }, "/checkout"),
    "/superadmin/dashboard",
  );
});
test("customer account has horizontal navigation and auth chrome keeps a store escape route", async () => {
  const read = (file) =>
    readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const [account, app, header, home] = await Promise.all(
    [
      "components/customer/AccountLayout.jsx",
      "App.jsx",
      "components/customer/AuthHeader.jsx",
      "pages/Home.jsx",
    ].map(read),
  );
  assert.doesNotMatch(account, /<aside|lg:w-64/);
  assert.match(account, /customer-account-nav/);
  assert.match(app, /<AuthHeader/);
  assert.match(header, /Back to Store/);
  assert.match(home, /<ManagedHeroCarousel/);
  assert.doesNotMatch(
    home,
    /home-part-search|home-search-band|home-promotion-strip|BUILT FOR/,
  );
});
