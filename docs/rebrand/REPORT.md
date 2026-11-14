# 10th West visual rebrand report

Implemented locally on 17 October 2026. The visual implementation and bounded review are ready for acceptance. Production acceptance still requires the manual UAT in section 21; this report does not certify unexecuted payment, inventory or integration workflows. Nothing was pushed or deployed.

## 1. Brand direction

Premium motorcycle parts retail with readable business operations: navy/obsidian framing, light merchandise and data surfaces, orange primary actions and selective red danger/sale accents. Restrained angular separators reference the supplied logo. Product imagery, part identification and purchasing controls take priority over decoration.

## 2. Extracted logo palette

The official `frontend/public/brand/10th-west-logo.png` is unchanged, 1230 × 1278 pixels. SHA-256: `a3780265dd8946bd2395164b81d20615d4362187b9638282e6944e34fd91624d`.

Representative median pixel samples are navy `#001844`, red `#FC0D18`, orange `#FE760A`, white `#FFFFFF` and black `#000000`. These are samples from the logo's color families, not a claim that its gradients contain only five colors. The flattened interface palette uses obsidian `#05070B`, navy `#12204E` / `#1A2B61`, red `#D52231`, orange `#ED621D` / `#F47A20`, white `#FFFFFF`, off-white `#F5F6F8`, steel `#687182`, light border `#D8DEE8` and dark border `#27324D`. Small orange links use accessible ink `#A83B0D`; orange filled actions use dark text. Extraction method and source fingerprint are in `design-system/brand-palette.json`.

## 3. Typography

Barlow Condensed 600/700 supplies the compact automotive heading voice. Inter 400–700 keeps forms, checkout, prices and tables readable. Both are self-hosted WOFF2 with font-display swap and included SIL licenses. The three font binaries total 93,008 bytes. Display typography is restricted to headings and companion brand names.

## 4. Design system

`design-system/MASTER.md` is the authority. The requested ui-ux-pro-max design-system workflow was run and persisted; its generic suggestions were reconciled with the pinned motorcycle brief. Research is archived in `design-system/research/`. Tokens have primitive, semantic and component roles. `DESIGN.md` and `.impeccable/design.json` document the built system for future work and defer to MASTER. Existing React/Vite, Tailwind configuration, state management and route architecture remain in use.

## 5. Shared components

Official-image `BrandLogo` replaces the synthetic mark; `BrandMark` remains a compatibility export. Standardized BrandButton/Button, IconButton, PageHeader, SectionHeader, Input, SearchInput, Select, Checkbox, Radio, Textarea, Card/SectionCard, ProductCard, StatusBadge, StockBadge, Price, DataTable, DataToolbar/FilterBar, Pagination, navigation Tabs, Modal, Drawer, BottomSheet, Toast, Skeleton, EmptyState, ErrorState and ConfirmationDialog. Existing modal focus management is reused for customer and operations drawers and confirmations. Existing components remain the main integration points rather than introducing another UI framework.

## 6. Customer experience

Reworked the customer header, mobile navigation, footer, Home, Shop, Product, cart drawer, Cart, Checkout, auth shell and account workspace. Home leads with “Parts Built for the Ride.”, product search, model browsing, real catalog merchandising and shop support. Cards emphasize merchandise, price, actual fitment metadata and stock. Product detail preserves its gallery and purchasing handlers. Cart and checkout use light structured surfaces, clear summaries and orange actions while retaining existing price, tax, shipping and payment calculations. Profile, addresses, wishlist, orders, chat and support share the family. OAuth callback and invalid/reset/verification states show the official mark. Existing search normalization and symbols-only protections remain in place.

## 7. Owner workspace

Navy role navigation, orange current-page indicator, off-white content and shared headers/cards unify dashboard, inventory, product items, storefront listings, orders, reports, customers, promotions, banners, returns, chat, settings, security, content and backup screens. Inventory exposes part number, name, model, color, box, available/minimum stock, store/online prices, status and actions, with local sorting/filtering/paging and the existing barcode receive path. Charts use navy/orange/steel. Existing management actions and access checks remain attached to their original handlers.

## 8. Staff workspace

Staff uses the same OperationsShell and shared inventory/POS components with its existing permission-filtered navigation. Dashboard and inventory were captured with a real staff fixture. That fixture lacks POS access, so its correct denial screen was inspected; no permission was granted for visual testing. The actual shared POS was inspected through the owner fixture.

## 9. Super Admin

Technical operations styling covers overview, users/roles, security, monitoring, audit, maintenance, backup/recovery and configuration. A Monitoring navigation route reuses the existing MonitoringView and APIs; audit remains available separately. No role rules, maintenance behavior or security controls were rewritten. Existing integration health warnings are displayed as reported by the system.

## 10. POS

Official logo in the navy operations header, dense searchable catalog, contained product images, clear part/stock/price metadata and orange scanner/pay controls. Desktop retains catalog and sale summary; phone retains the existing expandable/sticky sale panel. No sale was submitted. Receipt and barcode-label branding use the official image; printable reports wait for logo decoding before opening print.

## 11. Responsive verification

Checked 375, 390, 430, 768, 1024, 1280 and 1440 pixels across 33 captured routes/states. Latest combined results contain no horizontal page overflow. Tables retain their own scroll regions; inventory presents structured phone cards. Customer filters, menus, cart drawers, chat and role navigation adapt to phones. Inputs use readable phone sizing and operations controls have practical coarse-pointer targets.

## 12. Accessibility

Latest captured states have zero axe WCAG 2 A/AA and WCAG 2.1 AA violations at 390 and 1440 pixels. Keyboard E2E verifies dialog focus containment, Escape, focus restoration and scroll lock. Visible focus, skip navigation, form labels, named icon controls, non-color status text, reduced-motion behavior and readable primary-action contrast are included. Readonly ratings expose a semantic label. This is automated and representative keyboard coverage, not a full assistive-technology certification.

## 13. Performance

Self-hosted compressed fonts replace the old external heading-font setup. Existing lazy route splitting remains. No new framework or runtime package was installed. Product images use containment and existing loading behavior. No measured Core Web Vitals improvement is claimed; real production traffic and devices need measurement.

## 14. Files changed

See `FILES.txt` for the complete manifest relative to baseline `fb2f82c`. Main areas are frontend tokens/configuration, shared brand/shell/components, customer and operations pages, safe E2E/source-contract tests, design documentation and four backend email-template/test files. Backend template changes add conservative navy/orange email branding for verification, reset, registration OTP and order emails. The logo URL is derived from the public origin without action tokens or URL credentials. Database schema, environment files, API contracts, RBAC and commerce/integration services were not changed for styling.

## 15. Local commits

See `COMMITS.txt` for the ordered implementation commits. Commits are split by brand foundation, shells, storefront, commerce, auth/email, operations, POS, administration and verification. No push or deployment was performed.

## 16. Frontend regression

- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend test`: 108/108 passed.
- `npm --prefix frontend run build`: passed with the repository-approved compile-check `VITE_API_URL=https://api.example.com/api`. No environment file was edited. Deployment must continue using the real configured public API URL.

## 17. Backend regression

- `npm --prefix backend run lint`: passed.
- `npm --prefix backend test -- --test-timeout=60000`: 343/343 passed; the historically intermittent email-change timeout did not recur in this run.
- `npm --prefix backend run audit:integrity`: passed against the configured database; read-only audit, no repairs or data cleanup performed.

## 18. Safe E2E

39 selected checks passed: desktop production smoke (8), branded experience (6), authentication/session restoration (4), mobile smoke and brand checks (14), desktop cart layout/inventory access (4), and mobile cart/customer workspace (3). The new `frontend/e2e/brand-experience.spec.js` blocks API mutations other than authentication. Existing dangerous or transactional suites were intentionally excluded because the local backend points at a shared remote database. Screenshots also block business mutations; checkout only obtains a read-only shipping quote.

## 19. Visual inspection and evidence

Bounded desktop/mobile passes covered Home, Shop, Product, empty and populated Cart, Checkout, Login, Register, verification, forgot/reset states, Profile, customer orders/chat; owner dashboard, inventory, product items, POS, orders, reports, banners, promotions, customers, returns/chat; staff dashboard/inventory/POS denial; Super Admin overview, monitoring, users, maintenance and audit. Narrow confirmations resolved identified contrast and primary-action issues. Independent finish review disposition: ship; no outstanding Blocking findings in the reviewed diff.

Local, ignored artifacts: `qa/rebrand/after/README.md` indexes 390px/1440px full-page and viewport screenshots; `summary.json` records 33 states, zero automated violations, zero page overflows and zero runtime page errors. Earlier pass folders retain the defect history. Populated cart is explicitly synthetic with mocked read-only responses; checkout uses a local buy-now session with a real product. No order, sale or inventory edit was made. In-app browser control was unavailable after bootstrap/troubleshooting, so project Playwright provided browser rendering and screenshots. Logs and screenshots are deliberately excluded from commits.

## 20. Remaining visual/content limitations

No identified material interface defect remains in the confirmed states. Existing merchant content includes an off-brand anime promotion banner, test-like catalog entries and missing product photography; these remain visible and limit storefront polish. Replace or approve that content through the normal owner workflow. Dense legacy subpanels and uncommon record/error combinations have not all been individually inspected. The pinned Inter typography and active sidebar accent intentionally remain despite generic detector suggestions. No blanket production-readiness claim is made from automated screenshots.

## 21. Manual UAT required before production acceptance

- Real Google/Facebook redirects, verified/unverified email, reset delivery, OTP/2FA, session/idle logout and linked-account changes; render branded emails in Gmail/Outlook/mobile mail.
- COD and PayMongo/GCash success, cancellation, failure and refunds using sandbox accounts/data; stock and price changes during purchase, shipping discounts and address rules.
- Owner/staff permission combinations, inventory receive/adjust/barcode hardware, POS payment/receipt printer, returns/refund decisions and confirmations using isolated test data.
- J&T booking, waybill/tracking and fulfillment transitions in an approved test environment.
- Notifications and chat delivered/read states between authorized test users; real phone keyboard, Safari, screen reader and touch behavior.
- Invoice/receipt/report PDF and thermal/barcode print output, logo loading and page breaks on actual target printers.
- Super Admin security/maintenance/backup recovery actions in an isolated environment. Do not exercise these against the shared production database.

Local preview: `http://localhost:5173/`. No production configuration, data or deployment was changed.
