# Owner phase delivery report

17 October 2026. Baseline: `87e00c7`. Scope: Owner corrections only, with the explicitly permitted Customer carousel integration and backward-compatible shared component extraction. Customer and Staff remain frozen. Super Admin was not started. Nothing was pushed.

Implementation and isolated verification are finished. **Deployment is pending the additive carousel migration and operator UAT.** The shared remote database was not migrated and merchant content was not changed. New slide metadata cannot be saved there until that migration is deployed.

## 1. Owner brand and colors

Owner uses the established official logo, Barlow Condensed headings and Inter controls/data. Its light business workspace has an Obsidian structural shell and restrained orange actions. No global brand tokens, fonts or image assets changed.

Exact inherited tokens: Obsidian `#080A0E`, Deep Navy `#111C3D`, Brand Navy `#192A5A`, Performance Orange `#F36A21`, Hot Orange `#FF8A1F`, Racing Red `#D62232`, White `#FFFFFF`, Off White `#F6F7F9`, Graphite `#242832`, secondary text `#565E6B`, neutral border `#DDE1E8`, control border `#8B95A6`, dark border `#28324A`. The selected sidebar row is subdued `#181D28`. Named semantic statuses retain existing accessible treatments.

## 2. Sidebar

Owner opts into `.owner-sidebar`: official compact logo, Owner portal label, Obsidian background, neutral labels/icons, thin orange selection edge and orange selected icon. Sign out has an explicit visible label and remains pinned below the independently scrolling navigation. Collapsed desktop navigation remains supported.

## 3. Navigation organization

Existing supported modules are grouped into Overview, Sales, Catalog, Marketing, Insights, Communication and Account. Product Items, Storefront Listings and Staff & roles remain available. Hero Carousel appears once. Account and topbar profile/security links stay in `/admin/account`. Staff navigation, permissions and System routes were not changed.

## 4. Old Banner experience

The old large Banner management screen is replaced by Hero Carousel. Existing `BannersView.jsx` is a compatibility export; `/admin/banners` redirects to `/admin/hero-carousel`. Existing database records and `/api/banners` contracts remain the storage foundation. No banner records were deleted or merchant content migrated during this work.

## 5. Hero Carousel management

The management page explains that its slides appear in the Home hero. Desktop uses a compact preview/slide/destination/schedule/status/order/actions table; phones use structured records. Create/edit, delete confirmation, empty/error/retry and saved feedback are present. Text announcements share the same management page in a separate tab, preserving their existing publication toggle and CRUD.

## 6. Backend storage and APIs

Existing `banners`, `announcements`, `discounts`, product/listing, category and motorcycle-model records are reused. Banner route naming remains compatible. Existing management authorization remains Owner/Admin/Super Admin; Staff, Customer and Cashier cannot manage carousel content.

New protected `GET /api/banners/destinations` supplies bounded destination choices. Public `GET /api/banners` filters and projects only approved current content. Public `GET /api/banners/destinations/promotion/:id` exposes safe terms only for an available campaign linked by a current active slide. No arbitrary active coupon enumeration is introduced.

## 7. Slide fields

Title, supporting text, image URL/upload, alt text, CTA label, destination type/ID or validated URL, active state, display order, start and end timestamps. Content lengths, IDs, booleans, order, timestamp/timezone and URL protocols are validated on the server. Image and URL traversal/control/executable payloads are rejected. Stored HTML previews remain sanitized.

## 8. Scheduling

Only active slides within their current date window are public. Future, expired and invalid schedules are excluded; end must follow start. The Owner form uses local device time and submits timezone-bearing timestamps. Blank limits are unbounded. Text announcements also enforce their publication date on both PostgreSQL and REST public reads, rather than relying on the Customer display filter. A failing HTTP regression reproduced the original early-publication leak before its server repair.

## 9. Ordering

The existing numeric `display_order` is reused. Lower values appear first; IDs resolve ties. No drag package or new ordering subsystem was added. Existing text announcements retain their separate publication-date ordering after banner slides.

## 10. Preview and images

The compact editor preview uses the actual selected image, approximate crop/overlay, headline, text and CTA. It explicitly describes its approximation. No image is a valid text-only slide. Existing Cloudinary/product-image upload infrastructure is reused, with JPG/PNG/WebP/GIF and 5 MB client checks, local preview cleanup and visible upload errors. No new image provider or secret was introduced. Real provider uploads were not performed against shared merchant content.

## 11. Destination types

Implemented: storefront product, existing promotion, existing Shop category, active motorcycle model, allowlisted existing storefront page, validated external HTTP(S) link and informational/no link. No unsupported category model or fake customer promotion page was created. Unsafe/private internal routes, credentials, protocol-relative links and executable schemes are rejected.

## 12. Product linking

The searchable picker shows image, name, part number, normalized model and online price for active storefront listings only. Search is debounced 250 ms and capped at 25 visible matches with accurate refinement guidance. Online price uses the unchanged shared catalog-pricing helpers. A live read-only probe found and corrected an initial assumption that `ecommerce_price` was stored; regression coverage now rejects that SQL reference and checks the existing 620 to 713 computation. Hidden/deleted/unavailable targets are not published, and management identifies unavailable destinations.

## 13. Promotion linking

Existing promotions are order-wide coupon campaigns; they have no product eligibility relation or dedicated customer promotion route. Slides therefore link to `/shop?promotion=<id>`, which displays the real code and terms. It does not alter catalog prices or automatically apply a discount. Checkout retains all existing eligibility, price and stock authority. The editor displays campaign type/value, enabled state and schedule context. Editing retains an older selected campaign even outside the first 100 recent choices.

## 14. Customer integration

The existing managed, manual Customer hero retains its spacing, colors, layout, controls, fallback, keyboard and swipe behavior. Only optional metadata, safe external-link behavior and meaningful Shop destinations were added. The public server revalidates linked target availability; only current approved content is returned. Owner create/edit to Customer consumption was tested through intercepted in-memory fixtures, plus real Express route tests with mocked database access. No shared merchant slide was created or edited.

## 15. Customer files touched

- `frontend/components/customer/ManagedHeroCarousel.jsx`: use optional image alt text; external CTAs open separately with `noopener noreferrer`.
- `frontend/utils/managedHero.js`: optional schedule filtering and alt metadata; legacy unscheduled rows remain supported.
- `frontend/pages/ProductList.jsx`: consume/remove a real category query filter and conditionally render promotion context only when present.
- `frontend/components/customer/PromotionContext.jsx`: new small conditional code/terms notice for promotion-linked destinations.

Shared `App.jsx` changes only extend the existing Staff startup guard to Owner/Admin. Shared `services/api.js` adds carousel reads and reports management-loading failures honestly. Customer Home, guest-cart logic, checkout/return logic, account navigation, auth presentation, review styles and storefront CSS were not redesigned or edited.

## 16. Reviews

Owner review records now use neutral white rows, shared search/status controls, navy/graphite type, warm stars, subdued real verified-purchase badges and compact existing approval/rejection actions. Product, buyer, date, comment and actual status remain visible. Filtering, moderation, empty and error/retry states are covered. No review data model, Customer review styling or moderation semantics were added.

## 17. Owner Account & Security route

`/admin/account` stays inside the Owner sidebar/topbar. Direct entry and refresh remain Owner-specific. Customer, Staff and unauthenticated access are denied/redirected by existing route guards. Topbar Profile and Account & security links use this route; the latter targets its security section. The previous jump to Customer Profile is removed for Owner only.

## 18. Profile reuse

Existing name, email, phone and avatar APIs are reused. Provider-managed email and email-change verification behavior remain intact. The shared account implementation retains stale-response/session-generation protection. Owner adds a supported profile-photo presentation with local preview, file checks and cleanup; no duplicate profile backend was created.

## 19. Security reuse

Existing password/local-password, authenticator setup/verify/disable, recovery codes, provider availability, current sessions and session revocation APIs are reused. Connected provider/status information is shown only when reported. Security actions were tested with intercepted fixtures; real account password, email, avatar and 2FA mutations were intentionally not performed. Revocation is confirmed and follows the existing session-expiry handling.

## 20. Sign out

Owner uses the proven operations confirmation in a body portal. Its panel is centered, compact and limited to 384 px, including over an open mobile drawer. Focus enters the dialog, Tab is trapped, Escape/Cancel return focus to the connected trigger, and counted scroll locks release after nested dialogs close. Existing logout/session semantics remain unchanged. Confirmation, cancellation and session end passed at all six widths.

## 21. Mobile navigation

Below the desktop sidebar breakpoint, Owner has a proper focus-managed operations drawer with a close control, role identity, independently scrollable business links and pinned Sign out. The compact phone topbar uses Obsidian, the official logo, page context and account/notification actions. Owner remains an operations portal rather than Customer account tabs.

## 22. Responsive results

Bounded two-pass inspection is complete. Confirmation captures are in ignored local `qa/owner-phase/pass-2/`: 1440 px desktop and 390 px mobile. There are 40 captures, including editor details, security, inventory records, drawer, sign out and limited Customer Home integration. Intermediate layout verification covers 13 Owner routes at 430, 768, 1024 and 1280 px: 52 checks. No page overflow or browser runtime error was recorded. Sign-out behavior was separately exercised at 390, 430, 768, 1024, 1280 and 1440 px.

Inspected Owner surfaces: Dashboard, Inventory, Orders, Reports, Promotions, Hero Carousel/editor, Reviews, Customers, Returns/refunds, Content, Account/security, Notifications, Chat, POS, drawer and Sign out. Existing inventory/order/report/POS business workflows were retained rather than rewritten.

## 23. Accessibility, performance and review

Fifteen axe WCAG A/AA/2.1 AA checks across the new management/account/reviews/dialog states returned zero violations. Keyboard focus, labels, practical 44 px controls, status text, Escape, focus return, nested scroll locking and reduced-motion inheritance were checked. This is scoped automated evidence, not a claim of complete assistive-technology certification.

Performance changes are bounded: debounced/limited product search, batched target revalidation instead of per-slide queries, parallel destination reads, lazy Owner account loading and revoked preview object URLs. No framework, dependency, global font or asset refresh was introduced.

The requested design, responsive, React, diagnosis, code-review and security skills were applied. Impeccable's detector returned no findings. Independent finish-review disposition is **ship**. Publication boundary, stale documentation, normalized-model search, picker feedback and the later live-schema/pricing correction were all reviewed as resolved. No Blocking findings remain. Local review evidence: `qa/owner-phase/finish-review.md` and `finish-verdict.md`.

## 24. Files changed

43 files including this report. Exact paths:

```text
.gitignore
.impeccable/design.json
DESIGN.md
OWNER-PHASE-REPORT.md
backend/migrations/202610170001_hero_carousel_metadata.cjs
backend/src/controllers/carouselController.js
backend/src/routes/announcements-publication.test.js
backend/src/routes/announcements.js
backend/src/routes/banners.js
backend/src/routes/banners.test.js
backend/src/services/carousel.js
backend/src/services/carousel.test.js
backend/src/services/carouselMigration.test.js
design-system/MASTER.md
design-system/pages/owner.md
frontend/App.jsx
frontend/components/customer/ManagedHeroCarousel.jsx
frontend/components/customer/PromotionContext.jsx
frontend/components/operations/OperationsAccountView.jsx
frontend/components/operations/OperationsShell.jsx
frontend/components/operations/OperationsSidebar.jsx
frontend/components/operations/OperationsTopbar.jsx
frontend/components/operations/WorkspaceNotifications.jsx
frontend/components/owner/AdminLayout.jsx
frontend/components/owner/CarouselSlideEditor.jsx
frontend/components/owner/Modal.jsx
frontend/e2e/owner-customer-regression.spec.js
frontend/e2e/owner-live-safe.spec.js
frontend/e2e/owner-phase.spec.js
frontend/e2e/owner-visual-qa.spec.js
frontend/e2e/ownerPhaseFixture.js
frontend/pages/ProductList.jsx
frontend/pages/owner/AdminDashboard.jsx
frontend/pages/owner/BannersView.jsx
frontend/pages/owner/HeroCarouselView.jsx
frontend/pages/owner/OwnerAccountView.jsx
frontend/pages/owner/ReviewsView.jsx
frontend/pages/staff/StaffAccountView.jsx
frontend/pages/staff/StaffNotificationsView.jsx
frontend/services/api.js
frontend/styles/owner.css
frontend/tests/owner-carousel.test.js
frontend/utils/managedHero.js
```

## 25. Migration and rollout prerequisite

`202610170001_hero_carousel_metadata.cjs` adds `destination_type`, `destination_id`, `starts_at`, `ends_at` and `alt_text`; it conditionally adds existing compatibility field `button_text` where absent. It preserves existing records and defaults older slides to legacy linking. Rollback retains the older `button_text` field. Repeatability/record preservation and migration-source validation passed in isolated tests.

**The migration has not been applied to the shared remote database.** Deploy/test it first in an isolated database, then apply through the normal controlled release process before using new management saves. Use the appropriate direct/session migration connection if Supabase transaction pooling cannot provide migration session semantics. No runtime DDL or automatic remote migration was introduced. Pre-migration public banner reads remain compatible; new metadata writes explicitly report the missing prerequisite.

## 26. Local commits

- `d171bff` — `feat(owner): align branded shell and dedicated account security`
- `008d7dd` — `feat(carousel): manage linked and scheduled home hero slides`
- `16a030d` — `fix(owner): integrate reviews with premium operations design`
- `cbad534` — `test(owner): verify carousel account and frozen role workflows`
- `c3ceaf5` — `docs(owner): record workspace design and carousel deployment boundary`

This report and the final pricing-documentation clarification are committed separately as the delivery record. The complete list, including that commit's own hash, is available with `git log --oneline 87e00c7..HEAD`. Nothing was pushed.

## 27. Frontend verification

- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend test`: 115/115 passed.
- `npm --prefix frontend run build`: passed with the documented safe compile-check value `VITE_API_URL=https://api.example.com/api`. This validates production compilation, not deployment connectivity.

Logs are local under `qa/owner-phase/frontend-*-final.log`.

## 28. Backend verification

- `npm --prefix backend run lint`: passed.
- `npm --prefix backend test -- --test-timeout=60000`: 354/354 passed using the existing isolated test runner.
- `npm --prefix backend run audit:integrity`: passed; read-only against the configured database.
- `npm --prefix backend run migrations:verify`: 50 migration sources, no duplicate timestamps, passed.

Carousel HTTP tests cover one/multiple/no slides, schedules, active states, target availability, product/promotion/no-link output, order, malformed content, unsafe destinations, authorization, safe projections, pricing reuse and pre-migration reads/write failure. Announcement HTTP publication tests cover PostgreSQL and REST paths. No schema, stock, payment or merchant-content mutation was performed against the shared database.

## 29. Owner E2E

21 Owner scenarios in Chromium and mobile Chrome: 42 distinct passing cases. They cover account route/refresh, profile/password/authenticator API reuse, denied account roles, carousel compatibility route, product and promotion creation-to-Customer consumption, schedules/order/no-link, invalid image handling, loading failures, review moderation/search/states, picker feedback, and centered accessible sign out at all six widths.

The combined role run initially had 88/90 green cases. Two harness issues used a hidden desktop navigation selector on mobile and simulated logout by changing only fixture-server state before an auth-page navigation. The tests were corrected without changing the product. All six affected Owner/Customer cases passed on targeted rerun; all 90 distinct role scenarios are green. Local evidence: `role-regressions-final.log` plus `role-regressions-rerun.log`.

Three additional live checks passed on fresh local servers with maintenance/reservation cleanup disabled: Owner login/account refresh/protected management read/picker read/POS authorization/logout; Staff login/POS denial/management denial/logout; Cashier login/POS authorization/logout. Real business/security mutations were blocked. Real transactions were not attempted.

## 30. Customer regression protection

Five regression scenarios in both browser projects: 10 distinct passing cases. They verify managed hero controls/global chrome, guest-cart persistence and authoritative refresh, guest merge and checkout return, top account navigation and auth Back to Store at desktop/phone widths. No global Customer stylesheet, Home composition, cart logic, account layout, auth surface or review presentation changed.

## 31. Staff regression protection

All 19 genuine Staff scenarios passed in both browser projects: 38 cases covering login/restoration, allowed navigation/actions, account/2FA, permissions, direct POS denial, legitimate assigned POS, Cashier access, mobile drawer and centered sign out. The existing test named `shared shell retains the frozen Owner defaults` was excluded because it asserts the obsolete Owner colors and Customer-profile routing that this authorized Owner phase corrects. The Staff suite itself was not edited.

Only the Staff account/notification files became thin wrappers around extracted implementations; their default DOM/copy/styles remain equivalent. `staff.css` is unchanged. Four account/notification screenshots were compared with frozen Staff captures: geometry and appearance match; desktop notification differences are the original pointer-hover state and tiny rendering noise, not a new theme. The phone notification screenshot matches exactly. Evidence is local in `qa/owner-phase/frozen-staff/`.

## 32. Remaining Owner limitations

No unresolved implementation or review blocker is known. Deployment of the new carousel metadata remains pending the unapplied migration. End-to-end create/edit was proved with isolated records and mocked SQL, not a migrated live staging database. Promotion destinations honestly use the current order-wide coupon model; there is no product-specific campaign relation to filter. Text announcements retain their existing field set and order. Previews approximate responsive crops; real merchant imagery may require editorial adjustment. No full screen-reader, Safari/iOS, camera or physical scanner certification is claimed.

## 33. Manual UAT required

On an isolated migrated staging environment, validate actual Cloudinary upload success/failure, existing slide compatibility, product/category/model/coupon destinations, future/expired publication, numeric ordering and legacy deep links. Validate Owner contact/email verification, avatar, password, real authenticator/recovery and session revocation with dedicated test accounts. Check real shop barcode hardware/camera, supported mobile browsers and report exports. Exercise a controlled inventory/order/POS/payment/shipping/refund scenario only in the appropriate non-production environment. Shared production merchant data was deliberately left untouched.

## 34. Deferred to Super Admin

All Super Admin login/access, credentials, workspace/sidebar, account/security and configuration corrections remain deferred. No Super Admin page, route or credential was changed. This delivery stops at Owner.
