# Focused UI and GCash hotfix - 18 October 2026

Customer navigation uses the existing storefront header, a compact accessible mobile top sheet, and horizontal account links. Profile, Orders, Addresses and Messages are the existing routes. Security remains within Profile; Notifications remains the existing header popover. Wishlist and Returns remain reachable through the existing desktop account menu. No new account routes were invented.

Order confirmation uses a navy information header, white item summary, actual reported totals and four actions. The API mapper now preserves order number, item name and variant snapshot. `confirmed_totals` prevents the confirmation page from using legacy client-side fallback VAT. GCash confirmation requires backend Paid; return query strings never settle payment.

Product options use the existing `product_variants.product_id` relation. Separate inventory Product Items/listings are never grouped by name. Mobile opens a purchase sheet; desktop options remain inline. Quantity, stock and the existing Buy Now session/cart flows are reused. Public variant availability excludes reserved units; a null variant price correctly uses base price plus adjustment.

Staff changes are scoped to `.staff-sidebar` and Staff shell selectors. A more specific selector prevents the shared navy sidebar CSS from overriding Staff black. Sign-out uses the unchanged shared dialog.

## Payment diagnosis and behavior

The deterministic failing reproduction was `node --test backend/src/controllers/paymongoWebhook.test.js`: a successful mocked PayMongo checkout became local `failed` during `releaseExpiredReservations`. Checkout confirmation also expired locally without contacting PayMongo. The payment-status endpoint only read local state, so a missed/delayed webhook could not repair it; once reservations were released, a later paid webhook failed finalization. The parser also selected `payments[0]`, which can be an earlier failed attempt. A late failed webhook could publish a Failed socket notification despite the database remaining Paid.

Read-only shared-database inspection found ten GCash history entries labelled `Payment reservation expired`; this supports the reproduced code path, but does not verify the provider receipt for any individual historical order.

Reconciliation now retrieves the stored PayMongo checkout reference with server credentials and a bounded timeout. Expiry/cancellation requires provider confirmation; unknown/processing/timeouts preserve reservations. Paid has precedence, updates serialize under row locks, retries reuse the existing payable session, and events retain signature validation, correlation, amount/currency checks and idempotency. Webhook notifications cannot override the database state. Multiple attempts select the paid payment.

Previously released orders can recover stock only when unreserved units remain available. Otherwise payment is recorded Paid, the order stays in payment_pending with a manual fulfillment review history/audit entry, and no stock is deducted. Historical shared orders were not modified during this task. An already-paid payment ledger also repairs an order downgraded by the old timer without another stock deduction. Their status can reconcile after deployment through the existing payment-status endpoint or a valid paid webhook.

## Verification

- Frontend lint and 115 unit/source-contract tests pass.
- Backend lint and 369 isolated tests pass, including GCash state/signature/correlation/history recovery and real controller tests for reserved variant stock and null-price fallback.
- Production build passes with `VITE_API_URL=https://api.example.com/api` for compile verification. The existing Checkout duplicate aria-label build warning predates this diff.
- Read-only `audit:integrity`: passed; existing quarantined legacy records remain.
- 11 safe Playwright checks intercept all API requests: Customer menu/account/product/confirmation at 390/768/1440, pending-to-paid return reconciliation, Buy Now selection, server-cart selection persistence, and Staff sidebar/sign-out at 390/430/768/1024/1280/1440. Keyboard, backdrop dismissal, scroll lock, focus return, stock limits and overflow are covered. Screenshots were visually inspected.
- Diff review: no unresolved blocking findings. Owner/Super Admin implementation and styling were not edited. The design detector's existing Inter/palette warnings conflict with the pinned brand or concern incumbent code; they do not justify unrelated redesign.

## Deployment / manual UAT

Use an isolated staging database and PayMongo test credentials to verify hosted GCash success, failure, cancellation, delayed webhook/reload, Owner payment display, invoice access and shortage recovery. No live or chargeable transaction was run. No shared-database backfill was performed.

Read-only migration check: `202610170001_hero_carousel_metadata.cjs` is absent from the configured shared database's knex_migrations records. Production/shared deployment still needs this existing carousel migration before management slide saves. No migration was applied; no isolated local database was configured or required for these fixture tests.

## Changed files

- Payments: backend/src/controllers/secureCheckoutController.js, backend/src/services/paymongo.js, backend/src/controllers/paymongoWebhook.test.js
- Product stock: backend/src/controllers/productController.js, backend/src/controllers/productVariantStock.test.js
- Customer: frontend/components/Navbar.jsx, frontend/components/customer/AccountLayout.jsx, frontend/pages/customer/OrderConfirmation.jsx, frontend/pages/customer/PaymentResult.jsx, frontend/pages/ProductDetail.jsx, frontend/services/api.js, frontend/styles/storefront.css
- Staff: frontend/styles/staff.css
- Verification: frontend/tests/account-staff-issue-regression.test.js, frontend/tests/storefront-ui.test.js, frontend/e2e/focused-hotfix.spec.js, this report
