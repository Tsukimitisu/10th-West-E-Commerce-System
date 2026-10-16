# 10TH WEST — Visual identity and interface system

Source of truth for storefront, authentication, owner, staff, POS and system administration. Intentional replacement of the previous identity, based on the official logo. Product truth: `PRODUCT.md`.

## Direction and research

Premium motorcycle parts counter: precise part identification, product-first merchandising and practical operations. Barlow Condensed headings draw from automotive packaging; Inter keeps forms, checkout and data readable. Real merchandise supplies imagery. Navy/black framing and a restrained angular orange/red signature unite all surfaces.

ui-ux-pro-max was run for motorcycle e-commerce, automotive retail, inventory, POS and operations: variance 6, motion 3, storefront density 5. The generic red CTA and Rubik/Nunito results are intentionally superseded by the explicit logo-based brief. Operations density 7; inventory/POS 8. Generated research is archived in `research/`, not a competing master.

## Official logo

`frontend/public/brand/10th-west-logo.png` is the only mark. Use `ui/BrandLogo.jsx`; existing `BrandMark` delegates to it. Preserve the complete image, color and aspect ratio with contain. No crop, filters, fake initials or stretched lockup. The supplied logo includes a black canvas: use a black plate with 8px clear space. Navigation pairs a compact complete image with a readable companion name. Auth/footer may use a larger image. Never substitute text for the image.

## Palette: primitive → semantic → component

- Obsidian `#05070B`: shell and footer.
- Racing navy `#12204E`: operations navigation and strong headers.
- Secondary navy `#1A2B61`: selected dark surfaces.
- Racing red `#D52231`: sales, destructive actions and narrow signature detail.
- Performance orange `#ED621D`: primary interaction fill with obsidian text.
- Hot orange `#F47A20`: hover fill and highlights on dark surfaces.
- White `#FFFFFF`: cards, forms and tables.
- Off white `#F5F6F8`: workspace/catalog canvas.
- Steel `#687182`: supplementary text; `#515B6D` for small secondary text.
- Light border `#D8DEE8`; control border `#8B95A6`; dark border `#27324D`.
- Accessible orange ink `#A83B0D`: links on light backgrounds.
- Success `#166534`, warning `#92400E`, danger ink `#B91C2C`, information navy. Status includes text/icon.

Pixel samples and source SHA-256 are recorded in `brand-palette.json`: deep navy, red, orange, white and black are normalized to flat, accessible interface colors. The logo remains unchanged. Primitives live in `frontend/index.css`; semantic aliases include `--accent`, `--surface`, `--text`, `--border`; component aliases include `--button-bg`, `--button-text`, `--sidebar-bg`, `--input-border`.

## Typography and geometry

Self-host Barlow Condensed 600/700 and Inter 400–700, font-display swap. Hero 42px phone / 56px tablet / 64px desktop; operations page title 30px phone / 34px desktop, product title 32/38; section 26–32; card heading 18–20. Body 14–16; labels 13–14. Controls, prices and table data use Inter. Phone inputs use 16px; numbers use tabular figures. Condensed typography is reserved for headings and brand lockups.

4px spacing grid. Storefront gutters 16/24/32px, section gaps 40/56px. Operations gutters 16/20/24px and 44px controls. POS 12/20px gutters. Control radius 8px; cards and modals 10–12px. 1px borders, minimal elevation. One angular separator per major brand region; never cut text, buttons or the logo.

## Shared primitives

- BrandLogo / BrandMark: the complete official mark.
- BrandButton / Button: primary, secondary, dark, danger, ghost.
- IconButton: named action, 44px target.
- FormControls: Input, SearchInput, Select, Checkbox, Radio, Textarea; native semantics, labels, helpers/errors.
- operations/PageHeader and SectionHeader; SectionCard and MetricCard.
- operations/FilterBar and SearchField; DataToolbar alias.
- Card: flat bordered surface. Existing ProductCard: intact product image, genuine ratings only, part number/model, stock, price, orange purchase action.
- StatusBadge, StockBadge, PriceDisplay / Price.
- DataTable: sticky header, contained horizontal scrolling; inventory retains phone cards.
- Pagination and Tabs: labeled navigation/selection.
- owner/Modal: focus-managed. Drawer/BottomSheet share its focus and restoration behavior.
- ConfirmationDialog: Modal with distinct cancel/danger actions.
- Toast: live region. LoadingSkeleton / Skeleton, EmptyState / ErrorState.
- RichText: safe descriptions and policies; never raw HTML.

Reuse primitives where needed; retain field-specific native controls when replacement risks handlers. Shared form/surface styles normalize legacy controls. No additional UI framework or state library.

## Surface rules

Storefront: black header, official logo, Home / Shop / Support, contextual search, account/cart. Mobile logo, cart/menu and search; focus-managed navigation drawer. Dark footer stays out of immersive chat and operations.

Home: Parts Built for the Ride, prominent search, Shop Parts, motorcycle-model entry. Branded product panel uses actual catalog imagery; configured banners remain supported. Models, featured items, new arrivals, genuine best sellers, maintenance/accessories and shop support use real data.

Shop: light catalog, 280px desktop filters, phone filter drawer, count/sort/view controls and removable chips. Product imagery dominates. Preserve search safeguards, including symbols-only empty results.

Product: gallery then purchase information, prominent part number/model, supported variants, stock, quantity, wishlist/reviews and safe rich text. Cart/checkout: content left, summary right on desktop; stack on phone; orange actions and numbered checkout steps.

Auth: centered light form with complete official logo on black plate and a navy brand panel on desktop. Form first on mobile. Reset, verification, OAuth and 2FA share the identity. Provider icons retain original colors.

Operations: navy sidebar, official logo and role label; orange selection, off-white workspace and white data. Owner and staff share geometry while retaining permission filtering. Four useful dashboard metrics, real charts, clear stock/orders. Super admin is the quieter technical version. Chart sequence navy, orange, steel, selective red; no rainbow.

POS: navy header, orange scan/pay, compact white catalog and sale pane. Phone catalog fills available height; sale collapses to sticky summary. No decorative motion.

Print/email: conservative inline email CSS, existing public logo URL where supported, compact complete mark. Preserve every financial value and receipt/report field.

## Accessibility and motion

3px visible solid focus ring, 3px offset. Orange ink for light-background text, obsidian on orange buttons. Name icon actions, label fields, announce async status. Dialogs trap focus, close with Escape, restore opener. Danger uses confirmation. No auth secrets in customer lists. 200ms state transitions; reduced-motion disables animation/smooth scrolling. Manual banner controls avoid forced rotation. Retain route lazy loading, below-fold lazy images and intrinsic image dimensions.

## Responsive and verification

Test 375, 390, 430, 768, 1024, 1280, 1440px. No page overflow; tables scroll in their own region. Phone fields 16px, safe-area padding, inventory phone cards, chat one pane at a time.

Bounded QA: build fully, capture desktop/mobile in one batch, collect defects, fix once, confirm once. Screenshots in ignored `qa/rebrand/`. Frontend lint/test/build, backend lint/test (60s test timeout), read-only integrity audit and safe E2E. No checkout, payment, inventory, maintenance or order mutation against shared data. Report inaccessible routes, pre-existing failures and manual UAT honestly.
