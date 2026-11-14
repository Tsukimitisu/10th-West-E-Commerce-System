# Staff workspace refinement

Staff-only extension, 17 October 2026. Read with [MASTER.md](../MASTER.md), [DESIGN.md](../../DESIGN.md) and [PRODUCT.md](../../PRODUCT.md). This records the existing brand applied to shop work. It does not replace the global design system or change Customer, Owner or System workspace guidance.

## Overview

The Staff workspace is a readable parts counter: start with the day's work, identify the part and its location, then open the permitted tool. Keep commercial analytics out of the Staff landing page. Dashboard, inventory, orders, chat, notifications and account settings share the operations shell. POS retains its existing standalone sales frame and permission gate.

The official logo remains `frontend/public/brand/10th-west-logo.png`, rendered through the existing BrandLogo without alteration. Use existing product assets and ordinary iconography; this refinement adds no imagery.

## Colors

Reuse runtime primitives from `frontend/index.css` through the operations aliases. Staff-specific assignments live in `frontend/styles/staff.css`; they are local semantic/component choices, not a second global palette.

- Obsidian `#080A0E`: Staff sidebar, drawer and phone topbar; avatar and narrow desktop topbar edge.
- Deep navy `#111C3D`: structural ink and navigation hover, with graphite `#242832` for ordinary UI text.
- Orange `#F36A21`: primary actions with obsidian text. Hover uses warm orange `#FF8A1F`.
- White `#FFFFFF`: data panels, forms and desktop topbar. Muted `#F6F7F9`: workspace canvas and quiet feedback surfaces.
- Secondary `#565E6B`: supporting copy. Border `#DDE1E8`: panel boundaries and dividers; inputs retain the stronger shared border.
- Selected navigation uses a subdued `#181D28` surface, an orange inset edge and orange icon with white text. Dark navigation labels remain muted light neutrals.
- Semantic states stay muted and named: success, low stock, out of stock, pending, processing and errors. Red is reserved for danger/critical state, never routine task decoration. Unread notifications use a pale warm surface plus explicit “Unread” text.

## Typography

Use the existing self-hosted Barlow Condensed for selected page and dialog headings. Inter carries navigation, names, fields, prices, quantities, tables, notification content and settings. Page titles inherit the compact operations scale; no promotional display type in data panels.

Preserve existing compact part-number identifiers and tabular quantity formatting where already implemented. Account inputs use 16px text, labels 13px and helper text 13px. Notification titles are 14px, messages 13px with generous line height and timestamps 12px. Small metadata must not become the main reading size.

## Layout

The shared OperationsShell keeps a 248px desktop sidebar, 76px collapsed state and focus-managed navigation drawer below 1024px. Workspace body is bounded at 1600px with 16/20/24px responsive padding. Main content scrolls independently; chat owns its inner scrolling and uses smaller surrounding gutters.

Staff's desktop topbar stays white. Below 768px it becomes obsidian with light controls, compact official logo, current view, notification trigger and account avatar. Navigation groups are Workspace, Fulfillment, Parts counter, Communication, Account and any permitted Tools. Do not render empty groups or unauthorized destinations. Account and Notifications are Staff self-service destinations; their presence does not grant other capabilities.

The dashboard's wide layout places the order worklist and priority queue beside the narrower Find & replenish region. Below 1024px these stack. Summary strips form four columns on wider screens and two columns on phones. Quick actions wrap naturally with practical touch targets. Inventory retains the existing desktop table and structured phone cards, with compact phone summary padding and stronger quantity hierarchy.

Account settings stack on smaller screens. At 1100px and wider, account details and security form two columns with a 20px gap; fields stay within a 520px form measure. Notification rows wrap long content and actions rather than widening the page.

## Elevation & Depth

Panels use white surfaces, neutral borders and dividers. Shared shadows remain for overlays and disclosures. Do not turn summary metrics or task rows into floating promotional cards. Sign-out overlays the current workspace or open navigation drawer with the existing dim backdrop.

## Shapes

Inherit the operations 8px panel/control vocabulary and existing shared components. Staff account fields and feedback have the observed 6px corners. The centered Staff sign-out panel is 12px with maximum width 384px, 20px viewport padding and maximum height `calc(100dvh - 40px)`. Keep its geometry independent of the phone bottom-sheet behavior of ordinary dialogs.

## Components

### Shared shell and scoped extension

Extend OperationsShell, OperationsSidebar, OperationsTopbar, AdminLayout, PageHeader, SectionCard, MetricCard, BrandButton, StatusBadge, EmptyState and Modal. Shared implementations opt into Staff presentation through `.staff-sidebar`, `.operations-shell[data-workspace="staff"]`, the Staff drawer tone and `staff-confirmation` presentation. Avoid global selector changes that restyle other roles.

OperationsDialogContext carries the string `'staff'` for Staff. Default-tone portaled modal bodies gain `.staff-dialog-content` alongside existing operations normalization; Staff drawer bodies retain their obsidian navigation treatment. A body portal must receive its workspace treatment explicitly because it sits outside the shell DOM.

### Dashboard

Lead with “Today's work” and a short task description. Put Process orders first, then Inventory scan, permitted Open POS and Chat. Each shortcut requires its existing permission; no POS shortcut without `pos.access`.

Show orders to process, dispatch readiness, stock alerts and return requests only where permitted. The worklist includes active orders assigned to this Staff member or unassigned, with customer, delivery/pickup, date and named status. Find & replenish shows real low-stock part names, part numbers, box locations and quantities; missing locations stay explicit. The priority queue links to permitted operational work. Counts describe loaded operational records, not business-wide analytics.

### Inventory

Retain Stock Levels, authorized Receive Items and existing history, stock/model/search/sort controls, pagination, desktop table and phone cards. Keep part names, identifiers, available stock, box and price easy to compare.

For Staff, catalog creation, item editing and motorcycle-model management require `products.manage`; receiving and stock adjustments require `inventory.adjust`. Restricted row actions remain disabled with explanatory titles where implemented, while catalog header actions are omitted. Permissions load conservatively before enabling mutation controls. Owner behavior is inherited unchanged.

Inventory scan routes into the existing receive flow through `inventoryTab: 'receive'` route state. Staff without adjustment permission returns to Stock Levels and receives the read-only barcode lookup. Barcode Scan likewise chooses receive versus lookup according to permission. Lookup populates the search and resets pagination; it does not imply a stock mutation. Camera/hardware scanning support is an existing capability, not hardware QA evidence for this pass.

### Orders

Retain the shared order table, phone cards, search, labeled fulfillment/payment/date filters, details and existing fulfillment flow. Staff's summary begins with Loaded orders rather than revenue. Named payment and fulfillment states remain readable without relying on color.

Staff status transitions require `orders.update`; cancellation requires `orders.cancel`. Filter available transitions and guard submission with the same distinction. Keep read-only viewing available with `orders.view`; do not expose Owner refund controls to Staff. These restrictions are role-specific and preserve existing Owner workflows and backend authority.

### Account & security

`/staff/account` stays inside the operations shell. `/staff/account#security` scrolls to the security section. Sidebar and topbar account links use these destinations instead of the customer profile page.

Account details reuse the existing profile API for name, email and phone. Show the Staff role as information, not an editable privilege. Preserve Google-managed email restrictions and email-verification messaging. Password forms use existing change-password or local-password setup APIs, check confirmation and reject an unchanged password locally. 2FA uses existing availability/setup/verification/disable APIs; enabling follows authenticator verification and recovery-code handling, and unavailable service state is explicit.

Expose progress, disabled actions and inline success/error feedback. Account mutation completions must still belong to the mounted Staff user and current authentication generation. A delayed profile save after logout must not repopulate authentication. Obsolete authentication initialization must not replace a newer Staff session or discard its intended direct link.

### Chat and notifications

Chat retains existing conversation behavior, search, filters, pin/archive controls and reply composer within a light workspace. Desktop uses list and conversation panes; phones keep the existing focused conversation/back navigation. No messaging workflow or service changes are implied.

`/staff/notifications` is a compact Staff center using existing notification APIs and socket refresh. Rows show title, message, timestamp and unread state, with mark-read/all-read actions, loading, retry/error and empty states. Destination actions for orders, inventory and chat appear only with the corresponding view permission. Notification delivery does not grant access to the referenced tool.

### Sign-out, focus and nested dialogs

Staff sign-out uses the shared ConfirmationDialog and Modal with `presentation="staff-confirmation"`, rendered into `document.body`. Center the panel horizontally and vertically at phone, tablet and desktop widths, including when opened from the navigation drawer. Keep Cancel and orange Sign out visible; the phone layout is not a bottom sheet. Disable decorative panel entry animation for this presentation.

Trap Tab/Shift+Tab within the active dialog. Escape and Cancel close it and restore focus to the connected originating control; nested confirmation keys must not dismiss the underlying drawer. Staff uses a counted body-scroll lock so either nested-dialog cleanup order restores the previous overflow only after the last Staff dialog closes. Confirmed logout ends the protected session using the existing logout path.

Staff dark navigation and drawer focus uses a visible 2px warm-orange outline with 2px offset; light content inherits shared focus styling. Maintain 44px practical action targets, accessible names, native form semantics and reduced-motion behavior.

## Do's and Don'ts

- Do keep the official logo unchanged and reuse shared components and runtime tokens.
- Do prioritize orders, part identification, stock location and permitted communication over sales analytics.
- Do separate view permission from catalog, stock, fulfillment and cancellation permissions.
- Do preserve pending, unavailable and missing-data states explicitly.
- Do preserve direct links and reject obsolete asynchronous authentication/account results.
- Don't broaden Staff access because a shortcut, notification or shared component exists.
- Don't apply the Staff obsidian shell or confirmation presentation to Customer, Owner or System contexts.
- Don't add new imagery, competing accent colors or decorative metric treatments.

## Verification evidence and limits

The confirmation collection is [qa/staff-phase/pass-2](../../qa/staff-phase/pass-2/), with individual desktop/phone screenshots for dashboard, inventory, orders, chat, notifications, account, sign-out, POS denial and the existing cashier POS frame, plus the phone drawer. Use those individual captures for review; no new compositions were created for this specification.

The collection's [report.json](../../qa/staff-phase/pass-2/report.json) records layout checks at 390, 430, 768, 1024, 1280 and 1440px and accessibility samples at 390/1440px. Fixture scenarios in `frontend/e2e/staff-phase.spec.js` cover Staff login/routes, permission restrictions, account workflows, stale-save protection, staggered session restoration, drawer behavior and centered sign-out/focus at those six widths. These are automated fixture evidence, not manual acceptance or proof of live transaction/authenticator operation.

The final finish reviewer disposition for this Staff refinement is **ship**, with both blockers resolved: delayed account saves cannot restore signed-out authentication, and obsolete Staff authentication initialization no longer loses direct links. Final lint/test/build totals belong in the delivery report after the final verification run, not in this page specification.

Hardware barcode scanning, real sales/checkouts, inventory mutations, live password/2FA changes and manual UAT were not established by this evidence. Preserve the shared remote database's read-only QA boundary.
