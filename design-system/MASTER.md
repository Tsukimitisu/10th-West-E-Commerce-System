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

Self-hosted Barlow Condensed 600/700: hero, storefront sections, selected page titles. Inter 400–700: all navigation, product information, fields, buttons, data and settings. Hero 44px phone/68px desktop; page titles 32/40px; section 28/32px; card headings 16–18px; body 15–16px; supporting 13–14px. Limit 12px to timestamps/part metadata, never ordinary paragraph copy.

4px grid. Storefront section gaps 40/56px, gutters 16/24/32px, maximum content width 1440–1500px. Operations gaps 16/24px and compact toolbars; POS gaps 12/16px. Controls 8px radius, cards 10px, dialogs 14px. Borders define content groups; shadows only for overlays/dropdowns. Native inputs 44–48px. No blanket pill controls, decorative entrance motion or excessive nested cards.

## Composition

Home: one true wide banner, 500px desktop/470px phone, short headline and two actions. One controlled image overlay only. No logo billboard or cards inside the hero. Follow with motorcycle models, featured parts, best sellers, maintenance, accessories, why shop, support. Preserve real data and new/recent product discovery. Merchant banner management remains supported; inappropriate supplied imagery must not become the store's main visual identity.

Header: compact official logo, Home/Shop/Support, contextual search and account/cart. Mobile logo, search, cart, menu. Less-frequent customer actions remain in the drawer/account menu. Header height 73px including border.

Catalog: compact unboxed filter groups, search/results/sort and product grid. Product photo roughly 55–60% of the card, Inter name, stronger price, one stock line, legitimate ratings only. No badge pile. Product details use large gallery and information columns with separators below.

Auth: one centered cohesive light surface, max 460px, official logo above welcome heading, OAuth then email form. Off-white background with restrained navy framing. No split panel, giant decoration or independent layouts for recovery/verification/2FA.

Cart: items about 65%, summary 35%, clear part/fitment metadata. Checkout: five sequential numbered sections with separators, sticky summary, existing calculations unchanged. Shared OrderSummary provides consistent framing without owning business calculations.

Operations: deep navy sidebar, neutral white work panels, restrained Inter section headings, larger Barlow page title only. Owner dashboard uses a primary sales region plus an action queue, chart/inventory and order detail below. Metrics are not a rainbow of equal cards. Staff shares components and only authorized navigation. Super Admin uses restrained technical tables; no retail imagery. POS prioritizes search, scan, catalogue, dense cart and a large orange Pay action; no decoration.

## Shared architecture

Extend existing BrandLogo, BrandButton, PageHeader, SectionCard, MetricCard, ProductCard, StatusBadge, FilterBar/SearchField, PriceDisplay, Modal, Drawer, Pagination, Skeleton and EmptyState. AuthShell owns composition; OrderSummary owns framing, not totals. Keep existing context, handlers, service contracts, permission filtering and route lazy loading. Stored HTML uses RichText.

## Interaction, access and verification

Visible 3px focus with offset (orange ink on light surfaces, warm orange on dark shells), accessible labels, 44px practical touch targets, dialog focus trap/Escape/restoration. Native semantics first. 180–220ms state transitions, reduced-motion respected. No forced banner rotation. Intrinsic image dimensions, below-fold lazy loading, self-hosted fonts. No extra UI framework.

Bounded QA: one desktop/mobile collection pass, one batch of fixes, one confirmation pass; then fresh finish reviewer and documenter. Widths 375/390/430/768/1024/1280/1440. Preserve original read-only fixture rules: shared remote database must not receive checkout, sale, inventory, refund or maintenance mutations. Run lint/tests/build and safe E2E; report manual UAT limits honestly.
