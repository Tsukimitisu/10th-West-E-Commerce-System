# Owner workspace extension

Owner-only extension, 17 October 2026. Read with [MASTER.md](../MASTER.md), [DESIGN.md](../../DESIGN.md) and the original [PRODUCT.md](../../PRODUCT.md). This records the built extension of the final brand source of truth. Customer and Staff are frozen; System work is deferred. The additive carousel capability is an explicitly scoped extension to the earlier presentation-only work, not a replacement of its historical product context.

## Overview

**Mode: Operate.** A serious motorcycle-retail business control center: review the business, identify exceptions, then open the supported tool. The first viewport pairs a compact contextual topbar and role sidebar with useful business data and tasks. Dense records, neutral borders and restrained orange keep the workspace practical at the shop counter.

Preserve the complete official logo through BrandLogo/BrandMark, the established palette and self-hosted fonts. The built incumbent supplies the composition; no generated concept is required. Existing inventory, orders, POS and reporting workflows remain in place.

## Colors

Reuse runtime tokens from `frontend/index.css`. Owner assignments in `frontend/styles/owner.css` are scoped component treatments, not a new global palette.

- Obsidian frames the sidebar, mobile drawer and phone topbar. The desktop topbar is white with a narrow Obsidian edge.
- Light surfaces and the muted neutral canvas carry business records, forms and summaries; graphite and existing secondary text carry their content.
- Selected navigation uses the observed subdued dark row (`#181d28`), thin orange inset edge and orange icon with white text. Hover uses existing navy; labels and inactive icons use muted light neutrals.
- Primary actions use Performance Orange with Obsidian text and Hot Orange hover. Status stays named and subdued; red remains danger or critical state.

**The Owner Scope Rule.** Apply Owner treatment through its workspace, sidebar and dialog opt-ins. Preserve other roles' existing assignments.

## Typography

Barlow Condensed carries selected page/dialog headings; Inter carries navigation, controls, names, data, prices, notifications and security forms. Preserve the compact operations heading scale and tabular financial values. The dashboard's sales figure has priority over supporting counts.

Account/editor inputs use readable (16px) text; labels and helper copy use (13px). The local carousel preview uses a short Barlow heading (30px/1.05) and supporting Inter copy. Small part identifiers and metadata stay secondary rather than becoming the ordinary reading size.

## Layout

OperationsShell retains the (248px) desktop sidebar, (76px) collapsed state, navigation drawer below (1024px), (64px) contextual topbar and (1600px) maximum workspace body with (16/20/24px) responsive padding. Main content scrolls independently; chat retains its inner scrolling. Below (768px), the topbar uses Obsidian with light controls, current view, compact official logo, notifications and account access.

Owner groups actual destinations under Overview, Sales, Catalog, Marketing, Insights, Communication and Account. Preserve authorized existing tools and omit unsupported or empty destinations. Hero Carousel is the canonical label and `/admin/hero-carousel` the canonical management route; the old `/admin/banners` route redirects there. Account and notifications stay inside the Owner shell.

Retain the asymmetric dashboard: dominant sales figure beside the exception queue, followed by sales trend, stock attention and recent orders. Existing inventory/orders use their shared toolbars, desktop tables and structured phone records; keep wide tables inside their scroll regions. POS retains its existing standalone sales frame.

Account and carousel-editor layouts stack on smaller screens. At (1100px), each becomes a two-column layout with a (20px) gap; account fields stay within (520px). Editor field pairs use two columns from (640px). Slide management uses phone cards, switching to its table at (768px). Review rows also form product/content/action columns at (768px), wrapping long content on phones.

## Elevation & Depth

White surfaces, neutral borders and fine dividers separate business content. Keep ordinary summaries and records flat. Shared shadows belong to floating UI and dialogs. The carousel preview alone uses the existing image-readability overlay on a navy fallback; this local media treatment does not authorize decorative workspace gradients.

## Shapes

Inherit the operations panel vocabulary and shared controls. Owner fields, feedback and picker lists use the observed (6px) corners; the carousel preview uses (8px). Slide thumbnails and product picker images remain supporting identifiers.

The Owner confirmation panel is centered at every width, with (384px) maximum width, (20px) viewport padding, (12px) corners and maximum height `calc(100dvh - 40px)`. It does not adopt ordinary phone dialogs' bottom alignment.

## Components

### Shared shell and dialogs

Extend OperationsShell, OperationsSidebar, OperationsTopbar, AdminLayout, PageHeader, SectionCard, MetricCard, BrandButton, StatusBadge, DataToolbar, EmptyState and Modal. Owner presentation uses `.operations-shell[data-workspace="owner"]`, `.owner-sidebar`, the Owner drawer tone and `owner-confirmation` presentation. OperationsDialogContext supplies `'owner'`; portaled default dialog content receives Owner normalization explicitly outside the shell DOM.

The topbar retains the actual live-update state, existing notifications and native account disclosure with outside interaction/Escape handling. Account links use `/admin/account` and `/admin/account#security`, rather than the Customer profile page. Preserve practical (44px) action targets and accessible names.

### Hero Carousel management

One `/admin/hero-carousel` page manages hero slides and text announcements in separate tabs. It extends the existing Customer hero with management controls; it does not redesign the Customer surface or add autoplay settings.

Slides support a required title, supporting text, optional image, optional alt text, CTA label, destination, active state, numeric display order and optional start/end times. Lower numeric orders appear first; equal orders use ID ascending. Dates are entered in the device's local time and stored with timezone information; blank limits are unbounded and end must follow start. Active, Scheduled, Expired and Inactive statuses remain explicit. An unavailable linked target is identified in management and hidden from Home.

The existing Cloudinary uploader accepts JPG, PNG, WebP or GIF up to (5MB); an existing supported image URL is also available. No image produces a valid text-only slide. The preview is explicitly approximate: actual Customer crops adapt to the viewport. Do not promote preview placeholder copy into storefront content.

Destination choices use real backend data:

- Product search lists active storefront products with image, name, part number, model and price. Search matches product, part number or the normalized model name. Online prices come from the existing catalog-pricing helpers, not a new stored price or separate pricing rule. The list shows up to 25 matches and asks for refinement when more exist.
- Categories and active motorcycle models use actual records, generating existing Shop filters.
- Promotions use existing global coupon campaigns and their terms. `/shop?promotion=id` opens campaign context; it does not automatically discount products or checkout. Existing checkout validation remains authoritative.
- Storefront choices use the existing public page allowlist. External links accept safe HTTP(S) URLs and open separately. Information-only slides have no CTA destination.

Public slide responses include only active slides within their current date window and currently available linked targets. Product targets must remain active storefront listings; promotion targets must be enabled, within their own dates and usage limits. Only the explicit public projection leaves the server. Public coupon terms require a currently available campaign linked by a current active slide, rather than exposing arbitrary coupon records.

Text announcements use title, text, Published and Publish from controls, with the existing shared enablement setting. They join the same manual carousel after image/banner slides, with no invented image, target or priority fields. The public server path enforces publication status and current publication date in both PostgreSQL and REST fallback reads and uses a safe public projection. Draft and future publication content must not rely only on client filtering.

**Migration boundary:** [202610170001_hero_carousel_metadata.cjs](../../backend/migrations/202610170001_hero_carousel_metadata.cjs) is prepared, additive and **not applied to the shared remote database**. Its five metadata columns are `destination_type`, `destination_id`, `starts_at`, `ends_at` and `alt_text`. It also adds compatibility `button_text` only where absent; rollback retains that older compatibility field. Existing rows and legacy URLs are preserved through the `legacy` default. Public banner runtime reads remain pre-migration compatible; management slide saves require deployment of this migration and report unavailable metadata until then. Earlier documentation claiming no scheduling fields is historical and superseded by this extension.

The Customer carousel retains explicit previous/next controls, indicators, keyboard navigation and swipe. There is no timer or focus movement. Missing destinations remain non-actionable; long text retains the existing full-details dialog.

### Account & security

`/admin/account` reuses the extracted existing Staff profile, password and 2FA logic through OperationsAccountView with an Owner variant. Default Staff DOM and behavior remain unchanged. Preserve name/email/phone updates, provider-managed email rules, verification feedback, password change or local-password setup, confirmation checks, authenticator setup/verification/disable and recovery-code handling. Loading, unavailable service, success and error states stay explicit. Obsolete asynchronous account responses must not restore a signed-out session.

Owner adds a profile-photo form using the existing avatar/profile APIs, connected-provider/account-status information and active-session list/revocation using existing APIs. Profile photos accept JPG, PNG or WebP up to (2MB), with local preview. Missing provider/device/last-active details stay explicit. Session revocation requires its existing centered confirmation; revoking the current device can end that session. These controls do not create new identity or session APIs.

### Reviews, notifications and retained tools

Owner review moderation uses shared search/status controls, named status badges, actual product and reviewer information, subdued verified-purchase labels and existing approve/reject actions. Rows place product identity, review text and actions in a clear sequence. Preserve the existing moderation workflow and Customer review appearance.

Owner notifications reuse WorkspaceNotifications with the Owner variant and existing APIs/socket refresh. Rows expose title, message, timestamp, unread state, mark-read/all-read, loading, error/retry and empty states. Existing chat, customer records, returns, content, promotions, staff management, inventory, orders, POS and reports retain supported behavior. Stored HTML still renders through RichText; previews use richTextToPlainText.

### Sign-out and nested focus

Owner sign-out uses ConfirmationDialog with `presentation="owner-confirmation"` in a body portal. Keep Cancel and orange Sign out visible in the centered panel on phones, tablets and desktop, including over an open mobile navigation drawer. Entry animation is disabled.

Trap Tab/Shift+Tab in the active dialog. Escape/Cancel close the confirmation and restore focus to its connected opener without dismissing the underlying drawer. Counted body-scroll locking releases the prior overflow only after the final scoped dialog closes, regardless of cleanup order. Confirmation ends the protected session through the existing logout path.

Owner dark navigation/drawer focus uses the observed warm-orange (2px) outline and (2px) offset; light content inherits shared focus. Preserve reduced-motion behavior, native form semantics and practical touch targets.

## Do's and Don'ts

- Do preserve the final brand, complete official logo, runtime tokens and shared components.
- Do use useful business data and existing supported tasks in the first viewport.
- Do keep Owner opt-ins local and preserve frozen Customer/Staff and deferred System boundaries.
- Do distinguish prepared migration work from deployed database capability.
- Do keep public slide/announcement/coupon eligibility on the server and checkout validation authoritative.
- Do preserve focus, portal context and nested scroll locking.
- Don't fabricate analytics, discounts, destinations, service readiness or transaction outcomes.
- Don't add decorative metric colors, a competing global palette, display typography in data or autoplay settings.
- Don't treat fixture product content, preview cropping or retained legacy utility names as new design rules.

Evidence: [qa/owner-phase/pass-2](../../qa/owner-phase/pass-2/) contains individual desktop (1440px) and phone (390px) captures for Owner dashboard, inventory, orders, reports, promotions, carousel/list/editor/destination selection, reviews, customers, returns, content, account/security, notifications, chat, POS and sign-out, plus drawer and Customer carousel integration captures. Layout records also cover (430/768/1024/1280px). This is bounded automated/visual evidence, not manual acceptance or proof of real transactions. Shared-database migration deployment, physical barcode scanning, real payments/checkouts, inventory mutations and live password/2FA changes were not established by this evidence. Preserve the shared remote database's read-only QA boundary.
