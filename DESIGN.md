---
name: 10th West Moto
description: Premium motorcycle parts retail and precise, compact store operations.
colors:
  obsidian: "#080a0e"
  racing-navy: "#111c3d"
  navy-secondary: "#192a5a"
  performance-orange: "#f36a21"
  hot-orange: "#ff8a1f"
  racing-red: "#d62232"
  orange-ink: "#a34110"
  surface: "#ffffff"
  surface-muted: "#f6f7f9"
  surface-subtle: "#eef0f4"
  text: "#242832"
  text-secondary: "#565e6b"
  text-muted: "#626b78"
  border: "#dde1e8"
  border-strong: "#b4bdcc"
  input-border: "#8b95a6"
  success: "#166044"
  warning: "#855016"
  danger: "#ac1c2b"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "42px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
  section:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.1
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  control: "8px"
  card: "10px"
  dialog: "14px"
  auth: "12px"
  compact: "6px"
  pill: "9999px"
spacing:
  base: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  control: "20px"
  lg: "24px"
  xl: "32px"
  section-mobile: "40px"
  section-desktop: "56px"
components:
  button-primary:
    backgroundColor: "{colors.performance-orange}"
    textColor: "{colors.obsidian}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.hot-orange}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.obsidian}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-dark:
    backgroundColor: "{colors.racing-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.racing-red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#35415b"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation:
    backgroundColor: "{colors.racing-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.compact}"
  status-badge:
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  data-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.card}"
---

# Design System: 10th West Moto

## Overview

**Creative North Star: "The Premium Motorcycle Parts Counter"**

A serious motorcycle retailer with merchandise and readable tasks at the center. Light neutral content dominates; obsidian and navy frame navigation and selected brand regions. Orange identifies the main interaction, while red remains selective. The complete official logo anchors the identity.

Retail gives photography and part identification room to work. Store operations use the same identity with denser Inter text, compact tools and neutral tables. This records the implemented premium world, not the discarded treatment. [design-system/MASTER.md](design-system/MASTER.md) remains the primary authority; [PRODUCT.md](PRODUCT.md) supplies durable product constraints. Runtime values come from `frontend/index.css`, `frontend/styles/*.css` and Tailwind aliases in `frontend/index.html`. The user's pinned composition is the visual reference; no generated composition was approved.

Authenticated Owner, Staff and Super Admin workspaces share the established identity with role-specific information hierarchy. Neutral data surfaces dominate, navy frames navigation, and orange identifies the next action. This operations extension preserves the storefront, authentication and customer-account directions above.

**Key Characteristics:**

- Complete unchanged official logo on its black plate.
- Light neutral majority, navy framing, orange interaction and selective red.
- Barlow Condensed retail headings; Inter product information, controls and business data.
- One management-controlled hero carousel and image-led merchandise cards.
- One centered authentication surface, customer top navigation and compact professional workspaces.

## Colors

Warm orange interaction stands against clear light content and deep automotive framing. Palette values in the frontmatter are extracted runtime tokens, not a replacement for MASTER.

### Primary

- **Performance Orange:** main purchase, search, scan and payment fills, with Obsidian text.
- **Hot Orange:** primary hover fill and restrained emphasis on dark regions.
- **Orange Ink:** readable links and keyboard focus on light surfaces.

### Secondary

- **Racing Red:** sale labels and destructive fills. **Danger Ink** supports explanatory error text and danger hover states. Red is not the general navigation or primary-action accent.
- **Success / Warning:** semantic state inks; subdued tonal backgrounds and explicit status wording convey meaning alongside color.

### Neutral

- **Obsidian:** storefront header and footer.
- **Racing Navy / Secondary Navy:** operations navigation and selected brand regions. Ordinary product copy uses Graphite rather than making all text navy.
- **White / Off White / Subtle Gray:** merchandise and forms, page canvas, and quiet secondary layers.
- **Graphite / Secondary Text / Muted Text:** primary UI copy and supporting information.
- **Light Border / Strong Border / Control Border:** content grouping and visible control boundaries.

**The Action Contrast Rule.** Pair orange action fills with dark text; use Orange Ink for orange text on light backgrounds.

**The Purposeful Accent Rule.** Orange identifies interaction; red identifies sale, danger or critical state. Status must also be named in text or an accessible label.

## Typography

**Display Font:** self-hosted Barlow Condensed, weights 600 and 700, sans-serif fallback.

**Body Font:** self-hosted Inter, weights 400-700, sans-serif fallback. The global stylesheet adds system UI fallbacks.

**Character:** condensed brand headings carry the automotive voice; Inter keeps product identities, financial amounts and operational tasks easy to scan. Typography is contextual, not one display face applied to every heading.

### Hierarchy

- **Display:** the managed home hero begins at the frontmatter size, becomes (56px) at (640px), then (64px) at (1024px), with (1.05) line height. This scale is for short retail headlines; lengthy managed copy is shortened in the hero and remains available through a full-details dialog.
- **Headline:** authentication uses the frontmatter role. Owner/staff PageHeader uses Barlow (30px/1.15), growing to (32px) at (1024px). Cart and checkout page titles use Barlow (32px/1.15), growing to (40px) at (640px).
- **Section:** home sections use the frontmatter role, growing to (32px) at (640px); the shared SectionHeader uses Barlow (30px/1.15). Auth secondary headings use Barlow (24px/1.2).
- **Title:** operations sections use the Inter title role. PDP titles deliberately use Inter (30px/1.12), becoming (36px) at (1024px); Super Admin titles use Inter (28px), or (26px) below (640px). PDP secondary headings use Inter (20px), and OrderSummary uses Inter (20px/1.3).
- **Body:** the frontmatter role describes the global baseline. Operations and much supporting retail copy use (14px). Product names use Inter (15px/1.45), becoming (16px) at (640px); product prices use (19px, 700). Operations table cells and headers use (13px). RichText uses (1.75) line height.
- **Label:** the frontmatter role describes default BrandButton and field labels. Mobile fields become (16px) below (640px). Compact part metadata and status badges may use (12px); that size is not the ordinary paragraph baseline.

**The Readable Data Rule.** Keep product names, prices, controls, metric values and table data in Inter. Use tabular figures for financial and operational numbers. Preserve the deliberate Inter headings in PDP and Super Admin.

## Layout

Spacing uses a (4px) rhythm. Main home sections use a centered (1500px) maximum width with (16/24/32px) responsive gutters. The header uses a (1600px) maximum width; several commerce detail pages use the existing (1280px) container. Section spacing grows from (40px) to (56px) at (640px). Retail grids commonly progress from two columns to three at (768px) and four at (1024px).

The public header is (72px) plus its border. Desktop navigation is compact; mobile keeps the logo, search, cart and menu. Home begins with one managed hero carousel, using a (420px) minimum height on phones and (500px) at (1024px). Merchant images fill the region without stretching, with a controlled navy/obsidian overlay protecting left-aligned copy. Image-free announcements use the same navy surface. No separate marketing hero, repeated promotional strip or Home search competes with this region. A single branded Shop Parts fallback appears only when no eligible managed content exists. PDP places a large gallery beside purchasing information at (768px), with information tabs and separators below. Cart uses approximately a (65/35) items-to-summary split on wide screens. Checkout uses five numbered sections with separators; OrderSummary is sticky at (96px) and remains presentation only.

Authentication uses one centered white surface with a (460px) maximum width at every breakpoint. An off-white canvas and compact dark customer header frame it. Phone padding is (28px 24px), becoming (32px) at (768px). The complete logo sits above the welcome heading, followed by provider controls and the email form where available. Recovery, verification and 2FA retain this same composition. A compact dark customer header carries the official logo and Back to Store action at every width. There is no split panel.

Operations use a (1600px) maximum content width and (16/20/24px) responsive padding inside a dynamic-viewport shell. The desktop sidebar is (248px), collapses to (76px), and becomes a focus-managed drawer below (1024px). Its white top bar is (64px). The content area owns vertical scrolling, and a keyboard skip link focuses that region. Shared section gaps are (20px). Phone toolbars wrap search, filters and actions into full-width rows; summary strips become two columns below (768px).

Owner gives sales a dominant Inter figure beside the action queue, followed by revenue, stock and orders. Staff prioritizes order processing, a worklist and stock picking locations, with only permitted shortcuts. Super Admin uses Inter titles and a technical hierarchy of readiness, runtime, security signals and events. Role navigation groups existing authorized destinations; Product Items remains available to Super Admin. These role compositions are scoped to authenticated workspaces.

The narrow Owner extension is recorded in [design-system/pages/owner.md](design-system/pages/owner.md): Obsidian sidebar/drawer and phone topbar, light business surfaces, grouped supported tools, in-shell account/security and notifications. It extends the incumbent system; Customer and Staff remain frozen and System work is deferred.

POS fills the dynamic viewport with search, scan, image-led product tiles and a dense cart. Its navy header is (72px), reducing to (64px) below (640px); the large orange payment action remains prominent. General operations tables retain (680px) minimum width, or (620px) on phones, inside horizontal scroll regions. The inventory stock table intentionally retains (1080px) for its columns. Keep that overflow inside the table container, never at page level.

## Elevation & Depth

White surfaces, muted canvases and fine borders establish hierarchy. Product cards, ordinary brand cards, metrics and POS tiles have no resting shadow. Product hover changes the border without lifting. Floating menus and dialogs carry soft neutral depth. Managed image slides use one controlled readability overlay; this is not a general license for gradients or glass panels.

### Shadow Vocabulary

- **Elevated:** `--shadow-elevated`, used for floating workspace UI.
- **Overlay:** `--shadow-overlay`, retained for supported overlays; shared Modal currently uses Tailwind's neutral `shadow-2xl`.
- **Card:** `--shadow-card` remains a compatibility token; it does not prescribe a shadow on the flat card system.

Exact shadows and motion values live in the sidecar. BrandButton changes color over (200ms), product cards change their border over (180ms), operations rows over (150ms), and dialog entry uses (200ms). Reduced-motion preferences reduce animations/transitions and disable smooth scrolling.

**The Flat Workspace Rule.** Separate business data with tone and borders; reserve visible depth for floating UI rather than ordinary panels or metrics.

## Shapes

Controls use Control corners, ordinary brand cards use Card corners, and dialogs use Dialog corners. Product cards and POS tiles use (8px); product action buttons and navigation rows use Compact corners. The centered auth surface has its own Auth radius. Authenticated operations sections use a scoped panel radius of (8px), with square internal summary segments and fine dividers. Small status badges are pills, without turning ordinary buttons into pills.

The complete logo is contained in a black rectangular plate with (4px) corners. Angular accents remain restrained and do not compete with merchant banner imagery. Do not clip text, controls, product imagery or the logo into decorative shapes. Fine (1px) borders define light content groups.

## Components

### Buttons

Reuse BrandButton's primary, secondary, dark, danger and ghost variants. Primary uses orange with dark text and a warm hover. Secondary is white with a visible border and dark text. Dark is a solid navy surface with white text, changing to Secondary Navy on hover. Danger is Racing Red with white text and Danger Ink hover. Ghost uses strong neutral text and a subtle gray hover.

Default size is at least (44px) high with (10px 20px) padding; large is at least (48px), with (12px 24px). Disabled actions reduce opacity and stop pointer interaction. The shared component uses color transitions, without an invented press translation. Product-card actions use their separate compact full-width treatment. Preserve clear labels and visible focus.

### Chips

StatusBadge uses compact semibold Inter, a thin tonal border, pill corners and an optional dot or SVG icon. Reuse its success, warning, danger, info, brand and neutral mappings. Keep explicit status wording. Product cards use one stock line rather than stacking badges.

### Cards / Containers

Reuse BrandPrimitives Card, SectionCard and MetricCard. Light surfaces and borders define groups; content determines padding. Shared operations sections pair a compact header with (16/20px) padding. Metrics stay neutral and flat; primary sales receive visual priority rather than making every metric equally prominent.

Operations management summaries use one flat divided strip. Avoid repeated decorative metric icons. Inventory uses monospace part and box identifiers; structured phone records pair a clear name/reference with status, supporting fields and practical actions. Reuse MobileDataCard rather than compressing desktop columns into unreadable phone tables.

ProductCard uses a square contained photograph, two-line Inter name, optional part number, one stock line, a strong price and one purchase action. Product photo space should carry the card's visual weight. Its list layout changes at (640px). Sale and rating treatments only appear when supported by real data. Use the established product-image fallback for unavailable images; never disguise content defects as a photography direction.

### Inputs / Fields

Brand fields use white, a visible Control Border, Control corners and (46px) minimum height. Operations SearchField is (44px); auth inputs are at least (46px), with (48px) submit buttons. Labels are above and hints/errors below; native select, checkbox and radio semantics remain. Search fields reserve space for a real SVG icon.

The global keyboard outline is (3px) with a (3px) offset: Orange Ink on light surfaces and Hot Orange on dark headers, footers, sidebars, POS headers, navy drawers and mobile search. Dark containers override the inherited focus token, preserving visible focus against their framing. Shared focus styles also change the field border; some retained controls use a local orange ring. Invalid fields show danger treatment and explanatory text. Practical touch targets are (44px), including coarse-pointer operations overrides.

### Navigation

The public shell is Obsidian; its active destination has a restrained orange underline. The footer is dark with grouped columns and an orange top edge. Operations use Racing Navy and (6px) navigation corners; active rows have a translucent white fill, narrow orange inset marker and warm orange SVG icon. Preserve permission-filtered destinations. Customer account navigation is a top horizontal row at every width, using (48px) targets, a neutral baseline and an Orange Ink active underline. On phones the row scrolls independently and brings the active destination into view. Customers have no account sidebar or operations drawer; the storefront mobile menu retains its existing drawer behavior.

OperationsSidebar groups destinations under restrained uppercase role/task labels. OperationsTopbar keeps page context, the actual live-update connection, existing notifications and account access compact. Its account menu uses native details/summary disclosure, closes on outside interaction or Escape, and restores summary focus on Escape. Icon controls and account actions use (44px) targets. Phone top bars retain the current page, compact official logo, navigation trigger and account control.

Owner opts into Obsidian navigation with a subdued selected row, thin orange inset marker and orange icon. The desktop topbar stays white with a narrow Obsidian edge; below (768px) it becomes Obsidian. Owner account and security links stay at `/admin/account` and `/admin/account#security` inside the operations shell. These assignments are local to the Owner extension rather than new global tokens.

### Managed Hero Carousel

Active public banners retain management ordering, optional image, headline, supporting text and valid CTA destination. Numeric display order is ascending, with ID ascending as the tie-breaker. Only active slides within their optional start/end window and with currently available linked targets are public. Published announcements join the same carousel after banners; the server excludes future publication dates and returns a safe public projection. Announcement records have no image, destination or priority fields. Missing links stay non-actionable.

The earlier no-schedule-fields statement is superseded by the Owner extension. The additive migration `backend/migrations/202610170001_hero_carousel_metadata.cjs` is prepared and has **not been applied to the shared remote database**. It adds five metadata columns (`destination_type`, `destination_id`, `starts_at`, `ends_at`, `alt_text`) plus `button_text` when missing for compatibility. Public runtime reads remain compatible with the pre-migration banner schema; management slide saves require migration deployment. Owner manages slides and text announcements at `/admin/hero-carousel`; `/admin/banners` redirects there. There are no autoplay settings.

The editor uses existing listed-product search, real category/model choices, existing global coupon promotions, allowlisted storefront pages, HTTP(S) external links or information-only slides. Promotion links open `/shop?promotion=id` with campaign context and terms; they do not automatically apply a discount. Public coupon terms are exposed only for a currently available campaign linked by a current active slide. Checkout retains eligibility validation. Image upload reuses the existing Cloudinary path; image-free slides, optional alt text and an approximate responsive preview are supported.

Previous/next, slide indicators and arrow-key navigation are explicit, with horizontal swipe on touch screens. Controls use (44px) targets, Hot Orange focus and a polite current-slide count. The carousel is manual, with no timer or focus movement. Long titles and descriptions are bounded to preserve the hero height; Read full details opens the complete plain-text content in the existing focus-managed dialog. Merchant image quality remains a content concern, not a reason to substitute a different hardcoded hero.

### Customer Reviews and Notifications

Buyer reviews use light neutral surfaces, graphite/navy text, subtle borders and muted dates. Stars use a restrained readable warm ochre; verified-buyer labels remain small and neutral. Review submission, reactions and media retain their original behavior. Customer notifications use compact light rows and Orange Ink interaction, with explicit unread state. Neither surface borrows the operations sidebar or introduces a separate dashboard palette.

### Official Logo

BrandLogo renders `frontend/public/brand/10th-west-logo.png` complete and unchanged. BrandMark delegates to it. The image uses contain without cropping, filtering, recoloring or stretching. The header plate is (52x54px), compact mobile (48x50px), auth (80x84px); contextual plate sizing does not authorize changing the asset. The companion name can hide when space is tight while the actual logo remains.

### Tables, Dialogs and Order Summary

DataTable uses a white bordered scroll container, subdued sticky headers, tabular figures and (12px 16px) cells; inventory has a denser (10px 8px) cell override. Existing scoped operations styles normalize older utility classes. Extend shared components rather than copying those legacy classes into new screens.

Modal owns focus trapping, Escape dismissal, scroll locking and opener restoration. Drawer/sheet variants reuse that behavior; phone dialogs are bottom-aligned with bounded height. OrderSummary provides consistent light framing and a sticky desktop position, while callers retain prices, shipping and payment state. Stored descriptions and policy HTML always render through RichText; previews use richTextToPlainText.

Default-tone dialogs opened inside OperationsShell inherit the light operations presentation through OperationsDialogContext, including when portaled outside the shell. The context scopes legacy color normalization and control sizing to those dialog contents. Navy navigation drawers and customer dialogs keep their existing presentation.

Owner sign-out uses its scoped centered confirmation at every width, with (384px) maximum width, (20px) viewport padding and (12px) corners. Its portal preserves focus trapping, Escape dismissal, opener restoration and counted scroll locking when opened over the mobile drawer. This is an explicit exception to ordinary phone dialogs' bottom alignment; its entry animation is disabled.

### Operations Data Controls and Technical State

DataToolbar groups search, explicitly labeled FilterSelect controls and related actions. Operations fields and practical touch controls are at least (44px) high. Inventory keeps stock/model/search/sort/scan controls together; orders expose payment, status and date filters. Desktop audit records use a dense (1000px) minimum table within its scroll region, with mobile cards below (768px). Actor, action, entity, result and date filters retain every available log category. Full event details use native disclosure; older activity loads through the existing paged response envelope. Absent entity/result fields remain explicitly unrecorded.

ServiceHealth pairs service name and provider detail with Ready, Needs attention or Unknown wording. Configuration readiness does not certify a completed transaction; unreported integrations stay Unknown. Maintenance shows unavailable scheduler/history explicitly, and backup metadata does not imply a recoverable backup or guaranteed point-in-time recovery. User dialogs retain native security controls and explicit role-change confirmation. Content previews use RichText and show local unsaved state.

## Do's and Don'ts

### Do:

- **Do** follow MASTER and the runtime semantic tokens when extending this recorded system.
- **Do** preserve the complete official logo and use shared components.
- **Do** keep light content dominant, navy framing restrained and orange actions readable with dark text.
- **Do** preserve the single managed home carousel, customer top navigation and the single centered auth surface with Back to Store.
- **Do** use context-specific Inter and Barlow headings, Inter data and tabular financial figures.
- **Do** keep tables scrolling inside their containers, visible focus, labeled status and reduced-motion behavior.
- **Do** show real prices, stock, fitment and ratings, with honest image fallbacks.
- **Do** extend the shared operations shell, toolbar, mobile record, readiness and dialog components for authenticated role workspaces.
- **Do** preserve role-specific hierarchy, explicit unknown states and contextual dialog styling across portals.

### Don't:

- **Don't** crop, recolor, filter, stretch or replace the official logo.
- **Don't** reintroduce split authentication, a product-card hero or a logo billboard.
- **Don't** turn red into the main interaction color or use orange fill colors as small text on white.
- **Don't** introduce gaming styling, neon, glow, decorative glass, rainbow dashboards or heavy panel shadows.
- **Don't** replace readable product names or technical headings with condensed display typography.
- **Don't** invent ratings, fitment, stock, prices or unsupported marketing claims.
- **Don't** promote test-like product records, missing or unrelated merchant photos, incidental old link/red classes, or tiny legacy labels into design-system rules.
- **Don't** infer audit outcomes, transaction success or recovery capability from missing fields or configuration readiness.
