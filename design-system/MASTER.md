# 10TH WEST — Premium interface system

Primary authority for every frontend surface. This replaces the previous visual treatment. PRODUCT.md preserves domain truth; DESIGN.md records the built result at finish.

## Creative direction

A serious motorcycle parts counter, presented as premium retail. Riders browse on phones in daylight; shop teams work quickly on desktop and tablets. Light surfaces and clear product data dominate. Navy frames navigation and selected brand regions. Orange is the sole primary interaction accent. Red is reserved for danger, critical alerts and sale prices. Approximate page balance: 60% light neutrals, 25% dark framing, 10% orange, 5% semantic accents; never distribute every color equally within one panel.

The ui-ux-pro-max design-system workflow was run before implementation (variance 6, motion 2, density 5; operations 7, POS 8). Its crypto/glass/glow/monospace suggestions conflict with the explicit brief and are rejected. Research is archived, never a competing authority.

## Official identity

Only frontend/public/brand/10th-west-logo.png. Byte-for-byte source retained; 1230×1278. BrandLogo contains the whole image with its original black canvas, no crop/filter/recolor/stretch. No fake mark. A companion business name may accompany the image but never replaces it. Header mark 48–56px; auth mark 76–88px. Keep 6–8px clear space.

## Tokens: primitive → semantic → component

- Obsidian #080A0E: header/footer and darkest brand surface.
- Deep navy #111C3D: operations sidebar and meaningful brand regions.
- Brand navy #192A5A: selected dark surface.
- Orange #F36A21: primary actions with obsidian text.
- Warm orange #FF8A1F: hover and dark-surface accents.
- Racing red #D62232: danger and sales only.
- White #FFFFFF: merchandise, forms and data.
- Off-white #F6F7F9: page canvas.
- Graphite #242832: primary UI text.
- Steel #697180; secondary #565E6B: readable small copy.
- Border #DDE1E8; control border #8B95A6; dark border #28324A.
- Orange ink #A34110: text links/focus on white.
- Success ink #166044, warning ink #855016, danger ink #AC1C2B. Subdued status backgrounds; state always named, never color alone.

CSS variables in index.css are canonical runtime tokens. Tailwind aliases in index.html mirror them. No teal/purple decoration, competing gradients, rainbow metrics or colored panels for ordinary data.

## Type and geometry

Self-hosted Barlow Condensed 600/700: hero, storefront sections, selected page titles. Inter 400–700: all navigation, product information, fields, buttons, data and settings. Managed hero 42px phone/56px tablet/64px desktop; page titles 32/40px; section 28/32px; card headings 16–18px; body 15–16px; supporting 13–14px. Limit 12px to timestamps/part metadata, never ordinary paragraph copy.

4px grid. Storefront section gaps 40/56px, gutters 16/24/32px, maximum content width 1440–1500px. Operations gaps 16/24px and compact toolbars; POS gaps 12/16px. Controls 8px radius, cards 10px, dialogs 14px. Borders define content groups; shadows only for overlays/dropdowns. Native inputs 44–48px. No blanket pill controls, decorative entrance motion or excessive nested cards.

## Composition

Home: the public active, ordered banner carousel IS the hero (500px desktop, about 420px phone). Consume banners and published announcements; no separate marketing hero, promotional strip or hero search. Existing banner images, title/subtitle, button_text and link_url are authoritative. No invented CTA destinations. Manual previous/next, indicators, keyboard and swipe; no forced rotation. One branded fallback only when there is no eligible managed content. No banner scheduling fields or public autoplay settings exist today; Owner follow-up is documented separately. Follow with motorcycle models, featured parts, best sellers, maintenance, accessories, why shop and support.

Header: compact official logo, Home/Shop/Support, contextual search and account/cart. Mobile logo, search, cart, menu. Less-frequent customer actions remain in the drawer/account menu. Header height 73px including border.

Catalog: compact unboxed filter groups, search/results/sort and product grid. Product photo roughly 55–60% of the card, Inter name, stronger price, one stock line, legitimate ratings only. No badge pile. Product details use large gallery and information columns with separators below.

Customer account: retain the storefront header and use a top horizontal account navigation at every width. No customer sidebar or operations drawer. Phone tabs scroll independently and keep the active destination visible.

Auth: compact official-logo header with Back to Store, then one centered cohesive light surface, max 460px, official logo above welcome heading, OAuth then email form. Off-white background with restrained navy framing. No split panel, giant decoration or independent layouts for recovery/verification/2FA.

Cart: items about 65%, summary 35%, clear part/fitment metadata. Checkout: five sequential numbered sections with separators, sticky summary, existing calculations unchanged. Shared OrderSummary provides consistent framing without owning business calculations.

Operations: deep navy sidebar, neutral white work panels, restrained Inter section headings, larger Barlow page title only. Owner dashboard uses a primary sales region plus an action queue, chart/inventory and order detail below. Metrics are not a rainbow of equal cards. Staff shares components and only authorized navigation. Super Admin uses restrained technical tables; no retail imagery. POS prioritizes search, scan, catalogue, dense cart and a large orange Pay action; no decoration.

## Shared architecture

Extend existing BrandLogo, BrandButton, PageHeader, SectionCard, MetricCard, ProductCard, StatusBadge, FilterBar/SearchField, PriceDisplay, Modal, Drawer, Pagination, Skeleton and EmptyState. AuthShell owns composition; OrderSummary owns framing, not totals. Keep existing context, handlers, service contracts, permission filtering and route lazy loading. Stored HTML uses RichText.

## Interaction, access and verification

Visible 3px focus with offset (orange ink on light surfaces, warm orange on dark shells), accessible labels, 44px practical touch targets, dialog focus trap/Escape/restoration. Native semantics first. 180–220ms state transitions, reduced-motion respected. No forced banner rotation. Intrinsic image dimensions, below-fold lazy loading, self-hosted fonts. No extra UI framework.

Bounded QA: one desktop/mobile collection pass, one batch of fixes, one confirmation pass; then fresh finish reviewer and documenter. Widths 375/390/430/768/1024/1280/1440. Preserve original read-only fixture rules: shared remote database must not receive checkout, sale, inventory, refund or maintenance mutations. Run lint/tests/build and safe E2E; report manual UAT limits honestly.


## Authenticated role workspaces — October 2026 pass

The storefront/auth system above remains unchanged. Operations use a 70/20/8/2 neutral/navy/orange/red balance. These are Operate surfaces used at a bright shop counter: readable data, familiar controls and short paths take precedence over retail expression. The ui-ux-pro-max operations workflow (variance 4, motion 2, density 8) informed compact modular layouts; its blue accent, landing-page conversion structure and scroll reveal are rejected in favor of the established brand and task context. Research is archived in research/operations-workflow.md.

Shared shell: 248px navy sidebar, 76px collapsed, focus-managed drawer below 1024px. Compact official logo and role label. White 64px top bar carries page context, live-update connection, existing notifications and a native account disclosure with outside-click/Escape handling. Keyboard skip link focuses the scrollable main region. Group navigation by the role's work; permission filtering is unchanged. Product Items remains available to Super Admin because it is an existing supported capability.

Owner: asymmetric business overview with primary sales, supporting order/fulfillment/stock metrics, exception queue, revenue trend, stock warnings, recent orders and best sellers. Inter data, Barlow page titles capped at 32px. Inventory has compact summaries, model/stock/search/sort/scan controls and monospace part/box identifiers; phones use structured cards. Orders share labeled payment/status/date controls and phone cards. Management summaries use one flat divided strip, avoiding repeated decorative icons. Content preview uses RichText and exposes local unsaved state.

Staff: task-first landing, order worklist and picking/replenishment locations. Primary shortcut defaults to order processing unless the user chooses another priority. Scan opens the existing receive/scan flow through route state. No sales analytics or redundant permission-card dashboard. Only currently permitted tools appear. POS retains its standalone navy sales frame, compact image tiles, line details, prominent total and orange Pay action.

Staff refinement: [pages/staff.md](pages/staff.md) specifies the Staff-only obsidian sidebar/phone topbar, permission-aware tools, in-shell account/security and notifications, and centered sign-out with nested-dialog focus/scroll handling. Staff opt-in selectors extend the shared components; Customer, Owner and System treatments remain governed by their existing rules.

Super Admin: technical service-readiness matrix, runtime/session-store information, security signals and latest system events. Readiness is configuration-level, never transaction success. Unknown/unreported state stays explicit. Monitoring combines current readiness with error/activity/transaction logs; Audit uses a paged dense table, labeled actor/action/entity/result/date filters and mobile record cards. Every original log category remains available. Missing audit entity/result fields are not inferred. No edit/delete operations. Native 2FA radios, focus-managed user dialogs, and explicit confirmation before either path that changes roles. Maintenance is read-only and shows unexposed scheduler/history as unavailable. Backup metadata is not a recoverable backup or guaranteed PITR capability.

Component aliases under .operations-shell: --ops-control-height 44px, --ops-panel-radius 8px, --ops-section-gap 20px. Extend OperationsSidebar, OperationsTopbar, DataToolbar/FilterSelect/MobileDataCard, ServiceHealth and existing PageHeader/MetricCard/SectionCard/StatusBadge/Modal/Pagination. No extra framework or package. Contextual focus and reduced-motion rules remain inherited.

Operations portals inherit OperationsDialogContext from the shell. Default-tone Modal content re-establishes workspace variables and normalization outside the DOM shell; navy drawers and customer contexts retain their original treatment.


## Customer correction pass - October 2026

Preserve the identity and all operational workspaces. Customer color balance is 65-70% neutrals, 20-25% navy framing, 8-10% orange and minimal semantic red. Reviews use white, graphite, neutral borders, subdued verified-purchase labels and warm stars. Informational payment/profile panels are neutral, not bright blue.

Guest shopping uses the existing cookie-backed server cart and its authenticated merge transaction. Browser storage is a recovery snapshot only; refresh reads authoritative prices, stock and availability. Preserve checkout selection on customer sign-in and return to the intended safe customer route. Errors must not masquerade as an empty successful cart.

Customer Shop excludes year filter controls, state, chips and obsolete year query parameters; product compatibility years remain intact. Header search remains the single Home search. Carousel media is contained and never distorted. Controls have 44px targets, explicit labels and visible focus. No autoplay timer exists to interrupt focus or reduced-motion preferences.
