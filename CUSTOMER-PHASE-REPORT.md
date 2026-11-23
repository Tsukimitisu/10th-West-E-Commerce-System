# Customer correction phase - 10th West

Date: 17 October 2026. Baseline: `843d36d`. Scope: Customer, public storefront and shared customer authentication chrome only. Existing premium identity retained. Owner, Staff, Cashier and Super Admin workspace files were not modified.

## 1. Hero / carousel implementation

The Home hero is now `ManagedHeroCarousel`, followed directly by normal merchandising. It renders actual managed images, headlines, supporting text and supplied CTA destinations. One fallback Shop Parts hero appears when there is no eligible managed content. The previous hardcoded photographic hero is removed. Long copy has a focus-managed full-details dialog.

Manual previous/next, pagination, keyboard arrows on the carousel region and horizontal swipe are supported. Controls remain reachable, labeled and focus-visible. There is no autoplay timer, so hover/focus pauses and reduced-motion timing exceptions are unnecessary. Images use cover cropping without distortion. The hero is approximately 420px on phones and 500px on desktop, with bounded text.

## 2. Carousel data source

Existing public `GET /api/banners` provides active banners ordered by `display_order`: `image_url`, `title`, `subtitle`, `button_text`, `link_url`, `is_active`, `display_order`. Existing `GET /api/announcements` supplies globally enabled, published announcements. Future `published_at` announcements are excluded from the hero. Announcements follow ordered banners and render their actual text without an invented destination.

The promotions list is protected management data (`/api/discounts`); it is not exposed as a new public offer feed. Merchant `link_url` values can already point to an existing product, Shop search or motorcycle-model filter. Missing or unsafe destinations do not create a fake Shop link.

## 3. Owner-side requirements deferred

No target/link database field is required for basic banners: `link_url` already exists. A later Owner UI can offer validated product/model/search destination choices over that field.

Banner start/end scheduling is absent from the current model/API. A later Owner phase needs agreed scheduling fields and server eligibility rules; none were fabricated here. Announcements currently lack image, CTA/link, explicit priority and expiry fields. Those need explicit API/model support if desired later.

Existing management screens reference `hero_autoplay`, `hero_interval_ms`, `hero_show_dots`, `hero_show_arrows`, `hero_pause_on_hover`, but no public settings reader exposes them, and the settings write allowlist does not currently accept these hero keys. Owner-phase work must reconcile that contract before customer autoplay can be management-controlled. Mobile-specific images/focal positions are also absent; supplied image composition still matters.

## 4. Duplicate search removed

Removed the Home search band and its state/handler. Global header search remains. Desktop and phone tests cover part-number results and symbols-only no-results. Shop retains its contextual catalog search.

## 5. Guest-cart root cause

Anonymous backend carts already existed. A successful guest Add to Cart POST was followed by a frontend sync that skipped the server and restored an empty tab cache. Initial null-auth events could also clear guest state. During authentication restoration, empty guest selection hints could overwrite a saved account checkout selection.

A separate reviewed edge case allowed login to succeed after an unsuccessful cart merge. Matching an existing account product was not proof that guest quantities had merged.

## 6. Guest-cart implementation

Repaired the existing cookie-backed cart rather than replacing it with a second cart architecture. Guest additions refresh the authoritative server cart, update the badge, and work from Home, Shop, Product Detail and part-number search results. Quantity, removal and refresh/persistence are covered.

The guest browser snapshot is retained in localStorage for recovery; authenticated snapshots remain tab-scoped. Cached prices, stock, discounts and availability are never ordering authority. Server refresh and secure checkout validations remain in force. Server availability warnings and current prices are surfaced, and invalid selections are blocked before checkout.

## 7. Guest to authenticated cart

The existing locked merge transaction continues to group product/variant identity, combine quantities, clamp stock and maximum quantity, and consume the guest cart transactionally. The rotated server session retains only its own anonymous recovery identity. Customer cart refresh can retry that existing idempotent transaction after a failed login merge.

`GET /api/cart` adds the optional, user-bound `guest_merge: complete` acknowledgment only when confirmed. The frontend retains guest recovery data until confirmation and reconciliation; it does not blindly replay line additions. No schema, new endpoint, RBAC, payment or stock-calculation changes were made. Guest checkout selection transfers only when real guest items and a nonempty selection exist. Old-scope persistence cannot overwrite the authenticated scope.

Regression coverage reproduces the original empty badge, unconfirmed same-product merge loss and checkout-refresh selection loss, then verifies the fixes.

## 8. Fitment Year removal

Removed the customer year control, state, filtering branch, active chip and obsolete year query parameters. Motorcycle model, brand, color, availability, price and sorting remain. Product compatibility years and all inventory/operational data remain intact.

## 9. Announcements / offers

Removed the separate Home announcements/offers strip. Managed promotional content occupies the hero. Shop support and non-promotional trust information remain below merchandising. Notification functionality remains available in the header.

## 10. Buyer reviews

Review cards now use white surfaces, navy/graphite text, neutral borders, subdued verified-purchase labels and warm stars. The mobile rating summary is compact. Review data, eligibility, moderation and submission behavior are unchanged.

## 11. Customer account navigation

Replaced the account sidebar with horizontal top navigation on desktop and phones: Profile, Orders, Addresses, Messages, Wishlist and Returns. These are actual existing destinations. Security remains within Profile; notifications remain in the header. No unavailable pages were invented. The active account destination remains visible in the scrolling tab row. The normal storefront header stays present.

## 12. Login / Register navigation

Added a compact official-logo header and an obvious Back to Store action to customer auth routes. Centered Login/Register/recovery/verification/OAuth/2FA form composition remains. No split-screen auth layout was introduced.

## 13. Return-to behavior

Customer guards preserve the protected pathname and query string. Email login and OAuth completion use safe customer destinations and preserve checkout/Buy Now intent. Customer registration links preserve that intention. Normal login still has its existing Home default. Owner, Staff, Cashier and Super Admin role destinations are preserved and covered by existing/pure routing tests; those workspaces were not redesigned or visited in this phase.

## 14. Customer color consistency

Kept the official logo, existing navy/orange/neutral tokens, Barlow Condensed and Inter. Neutralized informational blue payment/profile/cart panels, decorative red account/support accents and the dark notification popup. Order details and return-request content now use readable light surfaces; progress uses navy. Danger, cancellation and sale semantics remain red. Customer styling is scoped away from operational shells.

MASTER, PRODUCT, DESIGN and the existing Impeccable sidecar now describe the implemented customer experience. No UI framework, package dependency, state-management replacement or new font was introduced. Hero data loads independently of the catalog, only the active hero image renders, and no animation/rotation loop was added.

## 15. Desktop QA

Inspected 1440px captures and checked 768/1024/1280px layouts. Customer surfaces include Home (two slides), Shop, Product/reviews, guest/authenticated Cart, populated Checkout, Login, Register, recovery/verification, Profile, Orders, Order Detail, Returns, Addresses, Wishlist, Messages, Notifications, Search and policy/support pages.

## 16. Mobile QA

Captured 390px and checked 375/430px, in addition to intermediate sizes. Account navigation, header search, hero controls/swipe, cart badge, auth escape navigation and reviews were verified. The effective confirmation set has no horizontal page overflow at all seven requested widths.

Two visual collections were followed by targeted confirmations for functional checkout selection recovery and accessibility repairs. Server interruption failures remain in the original local logs; they are not counted as successful inspections. Synthetic fixture responses are clearly marked and intercepted locally, with no cart/checkout/order/inventory/payment writes sent to the shared database.

## 17. Accessibility and review

The effective captured states have zero axe WCAG A/AA violations at 390px and 1440px. Fixed contact labels, checkout quantity labels, in-text policy link distinction, notification/order contrast and keyboard access to the scrollable order timeline. New carousel controls use meaningful labels, native buttons/links, visible focus and a shared focus-managed dialog. Existing reduced-motion rules remain.

Independent code-reviewer/Impeccable finish disposition: **ship**. All six material findings resolved; no remaining scoped Blocking finding. This is automated/captured-state evidence, not a certification of every unexercised third-party or media state.

## 18. Files changed

- `.gitignore`
- `.impeccable/design.json`
- `DESIGN.md`
- `PRODUCT.md`
- `backend/src/controllers/cartController.js`
- `backend/src/controllers/guestCartRecovery.test.js`
- `design-system/MASTER.md`
- `frontend/App.jsx`
- `frontend/components/FilterSidebar.jsx`
- `frontend/components/Navbar.jsx`
- `frontend/components/ReviewCard.jsx`
- `frontend/components/customer/AccountLayout.jsx`
- `frontend/components/customer/AuthHeader.jsx`
- `frontend/components/customer/ManagedHeroCarousel.jsx`
- `frontend/context/CartContext.jsx`
- `frontend/e2e/auth-session.spec.js`
- `frontend/e2e/brand-experience.spec.js`
- `frontend/e2e/customer-mobile-workspace.spec.js`
- `frontend/e2e/customer-phase.spec.js`
- `frontend/e2e/customerPhaseFixture.js`
- `frontend/pages/ForgotPassword.jsx`
- `frontend/pages/Home.jsx`
- `frontend/pages/Login.jsx`
- `frontend/pages/ProductDetail.jsx`
- `frontend/pages/ProductList.jsx`
- `frontend/pages/Register.jsx`
- `frontend/pages/ResetPassword.jsx`
- `frontend/pages/Support/Contact.jsx`
- `frontend/pages/Support/FAQ.jsx`
- `frontend/pages/Support/PolicyPrivacy.jsx`
- `frontend/pages/Support/ReturnPolicy.jsx`
- `frontend/pages/Support/TermsOfService.jsx`
- `frontend/pages/customer/AddressBook.jsx`
- `frontend/pages/customer/Cart.jsx`
- `frontend/pages/customer/Checkout.jsx`
- `frontend/pages/customer/MyReturns.jsx`
- `frontend/pages/customer/OrderDetail.jsx`
- `frontend/pages/customer/OrderHistory.jsx`
- `frontend/pages/customer/PaymentResult.jsx`
- `frontend/pages/customer/Profile.jsx`
- `frontend/pages/customer/RequestReturn.jsx`
- `frontend/pages/customer/Wishlist.jsx`
- `frontend/styles/auth.css`
- `frontend/styles/storefront.css`
- `frontend/tests/account-staff-issue-regression.test.js`
- `frontend/tests/customer-bug-regression.test.js`
- `frontend/tests/customer-phase.test.js`
- `frontend/tests/storefront-ui.test.js`
- `frontend/utils/customerReturnTo.js`
- `frontend/utils/managedHero.js`
- `frontend/utils/oauthCompletion.js`
- `CUSTOMER-PHASE-REPORT.md` (this report)

## 19. Commits

Implementation/test commits below are local only. A final documentation commit records this report. Nothing was pushed.

- `35b1534 fix(cart): preserve guest shopping and confirm sign-in merges`
- `09ca77d feat(home): make managed carousel the customer hero`
- `4640111 refactor(shop): remove customer fitment year filtering`
- `527ebd5 refactor(account): use horizontal customer account navigation`
- `f2409c0 fix(auth): retain store navigation and customer return paths`
- `425ae9f fix(customer): balance reviews notifications and order surfaces`
- `680358c test(customer): verify carousel cart and account corrections`

## 20. Frontend results

- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend test`: 113/113 passed.
- `npm --prefix frontend run build`: passed, using the documented local-compile value `VITE_API_URL=https://api.example.com/api`. Deployment environment files were not changed.
- `git diff --check`: passed.

## 21. Backend results

- `npm --prefix backend run lint`: passed.
- `npm --prefix backend test -- --test-timeout=60000`: 347/347 passed, no cancellations.
- `npm --prefix backend run audit:integrity`: passed (read-only).
- Focused guest-recovery tests: 4/4 passed, including failed recovery, stock clamping, replay and user-bound acknowledgment.

## 22. E2E results

- Customer phase plus existing cart-layout suite: **32/32 passed**, Chromium and mobile Chrome.
- Existing customer chat/notification checks: 4/4 passed across desktop/mobile projects.
- Existing isolated service-outage/auth error checks: 2/2 passed.
- Live customer session/cookie/profile/logout checks: 2/2 passed on the final isolated rerun. Initial runs returned HTTP 503 with backend DB_TIMEOUT while unrelated Home polling/catalog requests ran concurrently. Those original failures remain recorded. The rerun intercepted only unrelated requests; actual login, profile, cookie, CSRF and logout assertions remained real and unchanged.
- No real order, payment, sale, inventory update or refund was executed.

## 23. Remaining Customer problems / staging UAT

No requested Customer correction remains open in the inspected states. Staging UAT is still required for real merchant assets and links, browser/session-expiry persistence, variants and unavailable-item reconciliation, live Google/Facebook checkout return, valid email verification/reset links, 2FA, customer address edits, review attachments, and sandbox COD/GCash/shipping flows. Real-device Safari/touch and assistive-technology review remain appropriate. Product imagery quality is merchant content and was not replaced.

The live database timeout observed during unisolated session smoke is an environment reliability limitation, not concealed by a passing fixture test. Confirm production/staging session behavior before release. No deployment or push was performed.

## 24. Deferred to Staff

All Staff/Cashier workspace work, including sidebar colors, sign-out placement, inventory/POS and operational workflow changes. No Staff phase was started.

## 25. Deferred to Owner

Owner workspace/sidebar styling, review-management styling, banner-management redesign, scheduling/media/destination controls, public carousel settings contract, and Owner Account & Security/profile routing separation. This phase only consumes public managed content.

## 26. Deferred to Super Admin

All Super Admin access/login-specific changes and workspace redesign. No Super Admin phase was started.

## Local evidence

- Effective confirmation index: `qa/customer-fix/confirmation-summary.json`.
- Primary confirmation screenshots: `qa/customer-fix/pass-2/`.
- Final populated Checkout and quantity-label accessibility: `qa/customer-fix/pass-2-checkout-accessibility/`.
- Final Order Detail / Return Request accessibility: `qa/customer-fix/pass-2-final-confirmation/`.
- Original collection and failure evidence remain under `qa/customer-fix/` and ignored `customer-*.local.log` files.
- Current Web Interface Guidelines were fetched during review: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md.

Screenshots and browser artifacts remain local and ignored, not committed. Customer phase stops here.
