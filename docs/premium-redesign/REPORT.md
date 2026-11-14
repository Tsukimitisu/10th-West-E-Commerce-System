# 10th West premium frontend redesign

17 October 2026. Baseline: `1a4db41`. This is a second, structural redesign of the customer, authentication and operations experience. Implementation is local; nothing is pushed or deployed. Production acceptance still requires the manual UAT and merchant content work below.

## 1. Overall creative direction

Serious motorcycle retail: mechanical photography, clear part identification, controlled orange interaction and restrained navy framing. Light merchandise and data surfaces carry most of each page. The storefront allows larger imagery and display headings; business workspaces prioritize compact readable records. The changes include page composition, purchase hierarchy, mobile navigation and component structure, beyond a palette refresh.

## 2. Palette and exact tokens

The official logo is unchanged: 1230 × 1278, SHA-256 `a3780265dd8946bd2395164b81d20615d4362187b9638282e6944e34fd91624d`. Its sampled color families remain documented in `design-system/brand-palette.json`: navy `#001844`, red `#FC0D18`, orange `#FE760A`, white and black. Interface colors flatten those gradients and tune contrast:

- Obsidian / `--obsidian`: `#080A0E`.
- Deep navy / `--racing-navy`: `#111C3D`.
- Brand navy / `--navy-secondary`: `#192A5A`.
- Primary orange / `--performance-orange`: `#F36A21`.
- Warm orange / `--hot-orange`: `#FF8A1F`.
- Racing red / `--racing-red`: `#D62232`.
- White / `--surface`: `#FFFFFF`.
- Off-white / `--surface-muted`: `#F6F7F9`.
- Subtle surface / `--surface-subtle`: `#EEF0F4`.
- Graphite / `--text`: `#242832`.
- Secondary text / `--text-secondary`: `#565E6B`.
- Muted text / `--text-muted`: `#626B78`.
- Steel: `#697180`.
- Border / `--border`: `#DDE1E8`; strong border `#B4BDCC`; control border `#8B95A6`; dark border `#28324A`.
- Orange ink / `--accent-hover` and light-surface focus: `#A34110`.
- Dark-shell focus: warm orange `#FF8A1F`, exceeding 3:1 against both navy surfaces.
- Success / `--success`: `#166044`; warning / `--warning`: `#855016`; danger / `--danger`: `#AC1C2B`.

Primary orange actions use dark text. Red is reserved for danger, sales and critical states. Legacy decorative blue/purple aliases resolve to the navy/neutral family; provider logos retain their official colors. Controls use 8px radii, content cards 8–10px, dialogs 14px. Borders define groups; shadows are limited primarily to overlays. Normal transitions are 180–220ms with reduced-motion support.

## 3. Typography

Barlow Condensed 600/700 provides the automotive display voice. Inter 400–700 handles navigation, forms, product names, prices, settings and tables. Hero: 44px phone / 60px tablet / 68px desktop. Auth headings: 32px. Operations titles: 32/36px; technical administration titles: Inter 26/28px. Store sections: 28/32px. Product names: Inter 30/36px. Section headings in workspaces use Inter 18px. Supporting copy generally uses 13–14px; 12px remains for constrained part/timestamp metadata. Self-hosted WOFF2 binaries total 93,008 bytes with included SIL licenses.

## 4. Hero redesign

Replaced the product-card/merchant-art hero with one true full-width commerce banner: 500px desktop, 470px phone, “BUILT FOR THE RIDE.”, short copy, Shop Parts and Browse by Motorcycle. A single navy image overlay protects text. A subtle orange lower edge references the logo. Product search sits in a compact band immediately below the banner.

The configured merchant banners are anime/game imagery and unsuitable for the primary brand banner. A real engine-detail photograph by Rodrigo Rodrigues supplies the retail visual, without implying stock or manufacturer affiliation. Source and license links are in `frontend/public/brand/PHOTO-CREDITS.md`. Responsive files are approximately 223KB desktop and 72KB phone. Merchant announcements retain their images, text, links and manual carousel controls inside an expandable section.

## 5. Login and authentication

Removed the desktop split brand panel. All auth routes share one off-white canvas and centered light surface, maximum 460px, with the complete official logo. Login/Register use compact field rhythm, white bordered OAuth controls, orange submission and consistent recovery links. Forgot/reset/verification/provider callback and the login 2FA state share the composition. Existing provider discovery, redirects, error mapping, validation, submission locking, session/CSRF behavior and verification logic are retained.

## 6. Storefront

Rebuilt the compact header, phone logo/search/cart/menu arrangement and four-column dark footer. Search reveals independently of the phone menu. Account, notifications, messages and less frequent destinations remain available through the menu/account controls. Home follows motorcycle discovery, featured parts, genuine best sellers, maintenance/accessories, new/recent discovery, why shop and physical-shop support. Model cards adapt to the available real records. No stock, fitment, ratings or sales were fabricated.

## 7. Product experience

Cards now use a large square image field, neutral brand/model metadata, readable Inter names, stronger prices, one stock line and an orange purchase button. Out-of-stock purchase controls are neutral and disabled. Ratings appear only when the existing data supplies them. List and grid views retain cart/wishlist/variant handling.

Product detail uses an unboxed gallery/information composition and section dividers. Add to Cart is labeled and primary; Buy Now is secondary. The phone purchase strip follows the same priority. Metadata exposes part number and actual motorcycle fitment when present. Descriptions/specifications/reviews and existing gallery, variants, sharing, messaging and purchase handlers remain. One neutral branded SVG placeholder replaces clipart-like fallback imagery.

## 8. Cart and checkout

Cart retains the item/summary split and now shows part number and compatibility metadata where provided. Checkout uses five numbered sections with separators and a sticky review summary. Shipping information is neutral; payment selection uses orange. The new `OrderSummary` module owns visual framing only. Authoritative cart, tax, discounts, address/shipping rules, COD/GCash availability and order submission calculations remain in their original callers.

## 9. Owner

Dashboard hierarchy is rebuilt around a prominent sales region, three supporting metrics and a distinct attention queue. Chart, inventory attention, recent orders and available top-product data follow. Dashboard and inventory use existing data definitions; differences between legacy aggregate scopes are preserved rather than silently recalculated.

Shared neutral cards, restrained headings, orange actions and the navy shell cover inventory, product items, listings, orders, reports, promotions, banners, customers, returns, security, content, settings and chat. Inventory search/filter/sort/barcode controls share one compact toolbar. The dense table retains all 11 required columns, sticky headers, contained scrolling and phone cards. Orders replaces the large wall of status chips with a native dropdown containing every supported status. Existing management handlers remain attached.

## 10. Staff

Staff uses the same operations family and existing permission-filtered navigation. Inventory and shared order/POS modules inherit the new presentation. No access was granted for testing. The available staff fixture correctly denies POS; the actual shared POS was inspected with the owner fixture. Full cashier/staff permission combinations remain a manual UAT item.

## 11. POS

Compact product selectors replace oversized merchandising tiles. Search, scanner and category controls precede the catalog; the desktop sale pane retains dense items, discount, subtotal, prominent total and Pay action. Phone retains its expandable sale pane and sticky summary. Navy header, official logo, light work surfaces and orange interaction establish a retail terminal identity. No sale, void or stock write was executed.

## 12. Super Admin

More restrained Inter titles, neutral metrics, technical data surfaces and navy navigation distinguish system administration from retail. Overview, users/roles, security, monitoring, audit, maintenance, backup/recovery and configuration share the system. Audit now has its own contextual display heading while retaining the existing MonitoringView data behavior. Security permissions, APIs and maintenance behavior are unchanged. Existing provider health/credential warnings remain truthful.

## 13. Shared components and architecture

Reused the official-image BrandLogo, BrandButton, StatusBadge, PriceDisplay, EmptyState, Skeleton, Toast, focus-managed Modal/Drawer, form controls, FilterBar/SearchField, PageHeader, SectionCard, MetricCard, Pagination and existing table patterns. Rebuilt ProductCard and AuthShell composition, added presentation-only OrderSummary, and consolidated styles into `frontend/styles/brand.css`, `storefront.css`, `auth.css` and `operations.css`. `index.css` owns runtime tokens/base behavior; `index.html` mirrors Tailwind aliases. Existing React/Vite, HashRouter, contexts, lazy routes and service interfaces remain. No package or UI framework was added.

## 14. Responsive results

33 route/state captures at 390px and 1440px, with layout checks at 375, 390, 430, 768, 1024, 1280 and 1440px. Final combined result: zero page overflows. Phone navigation, search, filters, product purchasing, account settings, inventory, POS and chat use deliberate compact arrangements. Tables and account navigation retain their own scroll regions; inventory uses structured phone cards. Local screenshots are indexed in `qa/premium-redesign/after/README.md` and excluded from commits.

## 15. Accessibility

Final captured states have zero axe violations under WCAG 2 A/AA and WCAG 2.1 AA tags at phone/desktop widths. Keyboard E2E covers drawer focus containment, Escape, focus restoration and scroll lock. Controls retain semantic labels, form names/labels where already supported, status text and practical touch targets. Reduced motion is tested. The finish review identified insufficient focus-outline contrast against navy; contextual warm-orange focus fixes it. Contrast is 7.08:1 on deep navy and 5.86:1 on brand navy. White surfaces retain dark orange ink. Automated results are not a complete screen-reader or WCAG certification.

## 16. Performance

Responsive WebP photography, intrinsic dimensions, high-priority hero loading and below-fold lazy product images. Inter is preloaded; both font families remain self-hosted with swap. Existing lazy route splitting and dependencies are preserved. Home/product rendering is simpler, with smaller product groups. No measured Core Web Vitals improvement is claimed. The official 946KB source logo is retained as requested and benefits from normal caching; product content remains the largest visual constraint.

## 17. Files changed

See `FILES.txt` for the complete path manifest relative to baseline `1a4db41`. This iteration changes frontend presentation/tests and design/report documentation. There are no backend, API, schema, RBAC, environment or payment-service changes.

## 18. Commits

See `COMMITS.txt` for separate local commits covering the system, storefront, hero/merchandising, auth, product purchasing, cart/checkout/account, operations, POS, technical administration, verification and documentation. No push or deployment.

## 19. Tests

- Frontend lint: passed.
- Frontend node tests: 108/108 passed.
- Production Vite build: passed. Used the repository-approved compile-check `VITE_API_URL=https://api.example.com/api`; deployment still needs its existing real configured public API URL. No environment file was edited.
- Backend lint: passed.
- Backend tests with 60-second timeout: 343/343 passed. The historically intermittent email-change timeout did not recur.
- Backend read-only integrity audit: passed. No repairs or cleanup performed.

## 20. Safe E2E

43 distinct selected checks passed: desktop smoke/brand (16), mobile smoke/brand (16), role login/session restoration (4), desktop cart layout/inventory access (4), phone cart/chat/notification workspace (3). Added composition checks verify the banner dimensions, loaded photograph, centered auth and independent mobile search. Dark-shell keyboard focus assertions verify the final focus correction.

An initial mobile notification test still targeted the retired phone bell position; it now opens the menu and asserts the same notification content/overflow behavior. A focus confirmation initially simulated programmatic mouse-mode focus; it was corrected to establish keyboard modality before asserting `:focus-visible`. Both confirmations pass. Transactional, stock-changing and maintenance E2E suites were not run against the shared remote database.

## 21. Pages inspected and review

Required desktop/mobile pairs: Home, Shop, Product, Login, Register, populated Cart, Checkout, Profile; Owner Dashboard, Inventory, POS, Orders, Reports; Staff Inventory/POS denial; Super Admin Overview, Monitoring and Audit. Additional captures cover recovery/verification, empty cart, customer orders/chat, owner listings/product items/banners/promotions/customers/returns/chat, staff dashboard and system users/maintenance.

The first inspection collected defects into one batch; the second confirmed them. A fresh independent Impeccable/code-reviewer pass inspected all required pairs and the changed diff. Its material focus/persistence/provenance findings were resolved in the final handoff; the final verdict is recorded in `REVIEW.md`. No further aesthetic polish loop followed. In-app browser discovery was unavailable, so project Playwright rendered the evidence. Synthetic populated cart is clearly labeled; checkout uses a local buy-now session with real product 46. No order or sale was submitted.

The requested ui-ux-pro-max workflow ran and is archived. Its crypto/glass/glow suggestions were rejected against the explicit brand brief. The separate concept-seed invocation reported a Windows assertion and retained no key; no seed was fabricated or rerolled. The user's explicit banner/auth/operations composition governs. `design-system/MASTER.md` remains authoritative; the finish documenter records the built system in DESIGN.md and its sidecar.

## 22. Remaining content-quality limitations

Several actual product records lack photography, contain test-like names, or use an inappropriate checkmark/third-party watermarked image. Model/fitment records are sparse and inconsistent in naming. Existing merchant promotions contain game/anime imagery; they remain manageable and inspectable in announcements but no longer define the main hero. No database record or product photo was altered. Replace and verify these assets through normal merchant workflows before public acceptance. Existing dashboard aggregate scopes can report different populations; no business calculation was changed to reconcile them. Uncommon modal/error/data combinations have not all been individually inspected.

## 23. Manual UAT before production acceptance

- Actual Google/Facebook redirects, registration, verification mail, reset mail, 2FA, linked accounts, session restoration and idle logout with approved test accounts.
- COD/GCash/PayMongo success, failure, cancellation and refunds in a sandbox; price/stock changes during checkout and real delivery-address rules.
- Role combinations, barcode hardware, inventory receipt/adjustment, POS payment/void/discount and receipt printing using isolated test data.
- J&T waybill booking, shipment status, tracking and delivery confirmation in an approved test environment.
- Return/refund evidence and decisions, chat delivery/read state, notification interaction and live updates between authorized test users.
- Real phones/tablets, Safari, screen reader, zoom and keyboard navigation across less common states.
- Thermal/barcode printing, invoice/report PDF page breaks, email-client rendering, and isolated system maintenance/backup/recovery operations.
- Merchant approval of catalog photography, fitment data, banner content and existing warranty/returns copy.

Local preview: `http://localhost:5173/`. Shared production data was not used for destructive acceptance testing.
