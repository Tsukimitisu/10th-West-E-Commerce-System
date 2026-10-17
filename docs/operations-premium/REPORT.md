# 10th West premium operational workspaces

17 October 2026. Scope: authenticated Owner, Staff and Super Admin only. Baseline `b18d15a`. Local implementation; no push or deployment. No backend, API contract, schema, permission, stock, payment or shipping logic changes.

## Owner

Dashboard, Inventory, Orders, Reports, Promotions, Banners, Customers, Returns, Content and Storefront Listings were refined, alongside shared navigation. The business overview keeps asymmetric sales/attention/trend/stock regions, greets the signed-in owner and labels the existing reporting scope explicitly. Reported order count and all-order operational queues retain their existing different data populations.

Commerce, Catalog, Sales, Content, Communication and Settings groups organize existing destinations. Dense flat summaries replace decorative icon-card repetition. Inventory adds a local motorcycle-model filter, wraps part identifiers, preserves all eleven columns and separates stock status from actions. Phone inventory has structured records and a prominent scan control. Orders adds payment/date/status intersections and phone cards with existing detail/status workflows. Cash and COD labels remain distinct. Reports preserves date controls, report categories and PDF/CSV exports. Content adds sanitized RichText preview and local unsaved-state feedback; formatting/sanitization handlers are preserved.

## Staff

The landing screen is a current work queue rather than a copy of Owner analytics: permitted order processing, scan, POS and chat shortcuts, active assigned/unassigned orders, ready-for-dispatch counts and stock picking locations. Order processing is the default first shortcut; the optional priority question received no answer during implementation.

Inventory, Orders and POS share practical parts-counter components. Scan opens the existing receiving/scanning view through route state. Phone orders/inventory use readable cards and large controls. All permission filters remain unchanged. The real Staff fixture lacks POS access; the correct denial was captured. The shared POS was rendered as Owner and verified through the authorized Cashier account, without granting access or making a sale.

## POS

The standalone navy register frame remains distinct. Tiles use compact photography and clear identifiers; current sale includes part metadata, quantity, price, line subtotal and remove. The total is stronger and Pay remains orange. Phone catalog and expandable pinned sale controls are retained. Payment, quote, scanning, stock limits, promotion, void and receipt handlers were not changed.

## Super Admin

Overview, Monitoring, Audit, Users, Security, Maintenance, Backup and Configuration use the restrained technical family. Retail sales cards were removed from the system overview presentation; service configuration readiness, runtime/session storage, security signals, account summaries and recent system events take priority. Two unnecessary commerce requests were removed. Missing session counts, scheduler execution/history and readiness data remain explicit.

Monitoring shows real readiness plus error/activity/transaction records. Audit has timestamp/actor/action/entity/entity ID/source/result/details, client filters, twenty-row pages, full detail disclosure and a control to load additional activity pages from the existing endpoint. A reproduced pre-existing frontend envelope mismatch was corrected: activity API returns `{ logs, total, page, totalPages }`, not an array. The backend is unchanged; all original log categories remain accessible. Filtering is explicitly scoped to loaded records, and unknown result/entity fields are not inferred.

User roles are neutral identities rather than severity colors. Shared focus-managed account dialogs replace bespoke overlays; both role-change paths require confirmation. Security uses native keyboard-accessible password checkboxes and 2FA radios with existing values, plus reported OAuth readiness. Maintenance execution remains read-only; backup metadata is explicitly distinguished from recoverable backups, with no fake Restore control or guaranteed PITR claim.

## Shared components and design system

Extracted OperationsSidebar and OperationsTopbar; standardized DataToolbar, FilterSelect, MobileDataCard and ServiceHealth, extending existing PageHeader, MetricCard, SectionCard, Modal, StatusBadge and Pagination. Sidebar248px/collapsed76px; topbar64px. The account disclosure supports outside-click/Escape. Keyboard skip navigation targets the scrollable workspace. Existing notifications remain in the topbar.

OperationsDialogContext crosses React portals so default-tone operational dialogs retain their light surfaces, semantic contrast and controls. Customer dialogs remain on the default styling path; navy navigation drawers retain their tone. This is the only shared customer-capable primitive adjusted, with an operations-only opt-in.

MASTER.md remains authoritative. ui-ux-pro-max research was run before code (variance4/motion2/density8) and archived; generic blue-CTA/landing/reveal suggestions were rejected against the explicit existing brand. Impeccable Operate, token architecture, responsive guidelines, current [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) and React performance rules informed implementation. The official logo and Barlow Condensed/Inter binaries are unchanged. No new package/framework was added.

## Responsive, accessibility and performance

The two bounded passes cover390/430/768/1024/1280/1440, with screenshots at390/1440. Twenty-five route states passed document-overflow and automated WCAG2A/AA/2.1AA checks in the confirmation pass; the final selected set includes four additional detail states, for 29 states and 174 width checks with zero page overflow, zero axe violations and zero runtime page errors. Targeted reviewer corrections additionally cover Owner/Staff cash/COD detail dialogs and stock/action separation. Keyboard drawer trapping, Escape restoration, account disclosure, filter intersection and role confirmation are checked by safe E2E. Automated axe cannot certify every accessibility requirement; real device and screen-reader UAT remains.

Density comes from compact summaries, table layout and short toolbars; no decorative motion. Existing reduced-motion and contextual focus remain. Audit renders twenty loaded records at a time and derives filtering via useMemo. Independent requests remain parallel within each screen. Existing self-hosted fonts, route architecture and state management are retained.

## Verification

- Frontend lint: passed. Node tests: 108/108 passed. Production Vite build: passed (11.62s), using the documented local compile value `VITE_API_URL=https://api.example.com/api`; deployment still requires its real configured public API URL.
- Backend lint: passed. Node tests: 343/343 passed with the 60s per-test ceiling. Read-only integrity audit:passed. No backend source changed.
- Safe E2E: 16/16 new desktop/mobile operational project cases passed on the final sequential run; 6/6 selected existing role/session/POS/permission cases passed. Total 22 distinct project/test cases. Earlier fixture 503/429 and selectors matching hidden native options were resolved/retried as documented; assertions were retained and scoped to visible record content.
- Selected final evidence: 29 states, 174 width measurements, 58 viewport screenshots plus their full capture versions, zero page overflow, zero axe violations, zero runtime page errors. These checks do not replace manual accessibility certification.
- Independent code/visual review:all 3 material findings resolved; disposition **ship**, remaining **clear**.
- Changed paths: 42; see FILES.txt. Seven isolated local commits, including the final documentation commit; implementation hashes in COMMITS.txt. Nothing pushed or deployed. Frontend/backend test logs, capture reports and screenshots stay local and ignored; screenshot index: qa/operations-premium/after/README.md.

## Review and known limits

Independent fresh finish review and code review identified a cash/COD detail reference error introduced during this pass, a desktop inventory status/action collision, and an existing dialog portal-theme defect exposed by the new detail check. These were handled as targeted corrections, without reopening a general polish loop. Final scoring in REVIEW.md resolves all three material findings: disposition **ship**, remaining **clear**.

The in-app Browser connection was unavailable; local project Playwright performed render/interaction checks. Initial remote login503 and later429 were environmental verification failures; the local backend was restarted with the supported test-only rate-limit namespace, then remaining checks ran sequentially. Maintenance workers were disabled in that local QA process. No production configuration was changed.

Merchant data remains imperfect: sparse motorcycle-model metadata, test-like part names/images, missing picking locations and historical order states. Unknown fields remain visible. Less common edit/error/permission combinations were not exhaustively inspected. Staff POS denial reflects the fixture, not a failed redesign.

## Manual UAT

Use an isolated sandbox: actual barcode/camera hardware; inventory create/edit/receive/adjustment; stock and permission edge cases; staff fulfillment and J&T/manual tracking; POS cash/GCash payment, void and physical receipt printing; promotions and banner publishing; content save and email/print output; customer contact and returns/refund decisions; role changes and security policy/session enforcement; provider backup/restore and maintenance. No checkout, order/stock mutation, refund, maintenance execution or account change was submitted to the shared production database during this pass.
