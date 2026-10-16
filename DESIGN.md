---
name: 10th West Moto
description: Premium motorcycle parts retail with precise, readable operations.
colors:
  obsidian: "#05070b"
  racing-navy: "#12204e"
  navy-secondary: "#1a2b61"
  performance-orange: "#ed621d"
  hot-orange: "#f47a20"
  racing-red: "#d52231"
  orange-ink: "#a83b0d"
  surface: "#ffffff"
  surface-muted: "#f5f6f8"
  surface-subtle: "#eef0f4"
  border: "#d8dee8"
  border-strong: "#b4bdcc"
  input-border: "#8b95a6"
  dark-border: "#27324d"
  text-secondary: "#515b6d"
  text-muted: "#626b7b"
  steel: "#687182"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "42px"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    letterSpacing: "0"
  section:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
  title:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  control: "8px"
  compact-card: "10px"
  card: "12px"
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
  spacious: "48px"
  section-desktop: "56px"
components:
  button-primary:
    backgroundColor: "{colors.performance-orange}"
    textColor: "{colors.obsidian}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.hot-orange}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.racing-navy}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-dark:
    backgroundColor: "rgba(255, 255, 255, 0.1)"
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
    textColor: "{colors.racing-navy}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation:
    backgroundColor: "{colors.racing-navy}"
    textColor: "{colors.surface}"
  status-badge:
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  data-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.racing-navy}"
    rounded: "{rounded.card}"
---

# Design System: 10th West Moto

## Overview

**Creative North Star: "The Premium Motorcycle Parts Counter"**

The interface pairs confident automotive headings with practical, readable shopping and store operations. Merchandise, part identity, fitment, stock and prices carry the visual weight. Black and navy frame the experience; white content surfaces keep inspection and decisions clear.

Retail allows more space for product imagery and discovery. Operations compress the same identity around legible data and fast actions. This document records the implemented system; [design-system/MASTER.md](design-system/MASTER.md) remains the primary project source of truth. [PRODUCT.md](PRODUCT.md) supplies the durable brand commitments. Frontmatter is normative for this document's extracted tokens; it does not supersede MASTER.

**Key Characteristics:**
- Complete official logo on a black plate.
- Navy and black structure, orange interaction, selective red.
- Barlow Condensed headings with Inter controls, prices and data.
- Flat white surfaces, quiet borders and restrained angular accents.
- Product-led retail and compact, readable operations.

## Colors

Deep racing neutrals anchor the palette; warm interaction colors stay purposeful against clear light content.

### Primary
- **Performance Orange:** primary purchase, search, scan and payment action fills.
- **Hot Orange:** primary hover fill and emphasis on dark brand regions.
- **Orange Ink:** links and focus indicators on light backgrounds.

### Secondary
- **Racing Red:** selective sale emphasis, destructive action fills and narrow brand detail; error text uses the contextual dark semantic ink of its component.

### Neutral
- **Obsidian:** storefront shell and footer.
- **Racing Navy:** operations navigation, strong text and brand panels.
- **Secondary Navy:** selected dark surfaces and merchandise framing.
- **White / Off White / Subtle Gray:** content, page canvas and table/header layering respectively.
- **Light Border / Strong Border / Control Border / Dark Border:** quiet panel separation, interactive boundaries and shell dividers.
- **Secondary Text / Muted Text / Steel:** supporting copy with contextual contrast. Dark-shell supplementary copy uses Strong Border; small light-surface operations copy uses Secondary Text.

**The Action Contrast Rule.** Orange action fills carry obsidian text. Use Orange Ink for orange text on light surfaces; a fill color is not automatically a readable text color.

**The Purposeful Accent Rule.** Orange identifies interaction; red identifies selective sale, destructive or brand detail. Status combines color with readable text or icons.

## Typography

**Display Font:** Barlow Condensed, sans-serif; self-hosted weights 600 and 700.

**Body Font:** Inter, sans-serif; self-hosted weights 400–700.

**Character:** Compressed headings recall automotive packaging. Inter gives forms, amounts and dense records a stable reading rhythm.

### Hierarchy
- **Display:** the implemented home heading starts at the frontmatter size, expands to (56px) at (640px), and reaches (64px) at (1024px). Its compact line height belongs to short brand headlines.
- **Headline:** operations titles use the frontmatter role and reduce to (30px) below (640px). Product titles use (32px), then (38px) on desktop; authentication titles use (32px). Contextual title sizes are deliberate rather than one universal heading size.
- **Section / Title:** shared section headers use the Section role; operations section headings and dialog titles use the Title role. Storefront section headings vary with the existing surface, typically (24–32px).
- **Body:** the Body role is the general reading baseline. Operations and supporting retail copy commonly use (14px); long rich text uses (1.75) line height.
- **Label:** the Label role defines shared field labels and default buttons. Table headers use Inter (12px, 600); phone fields use (16px).

**The Readable Data Rule.** Keep controls, prices, metric values and table data in Inter. Use tabular figures for financial and operational numbers; condensed type belongs to headings and brand lockups.

## Layout

Spacing follows a (4px) rhythm. Storefront content uses a centered maximum width of (1500px), with gutters increasing from (16px) to (24px) at (640px) and (32px) at (1024px). Product sections use (40px) vertical spacing, increasing to (56px). Retail product grids progress from two columns to three at (768px) and four at (1024px).

Operations use a (1600px) maximum content width and (16/20/24px) responsive padding. The desktop sidebar is (260px), collapses to (76px), and becomes a drawer below (1024px). Header height is at least (68px); the workspace occupies the dynamic viewport with its own scrolling content region.

Authentication presents the form alone on smaller screens, adding a navy brand panel from (1024px). Dialogs and drawers manage their own scroll regions; tables scroll inside a bounded container. Operations tables retain a minimum width of (680px), reduced to (620px) on phone layouts, so columns remain readable.

Wide tables scroll within their own region. Keep the page width within the viewport and preserve usable phone fields and (44px) action targets.

## Elevation & Depth

The system is predominantly flat. White surfaces, muted canvases and fine borders establish grouping. Operations sections, metrics and POS tiles have no resting shadow. Generic surface cards retain a small ambient shadow; product cards use a restrained hover shadow without lifting. Elevated menus and overlays receive soft shadows, never a colored halo.

### Shadow Vocabulary
- **Card:** `--shadow-card`; small ambient separation for generic surface cards.
- **Elevated:** `--shadow-elevated`; floating UI and supported interactive surfaces.
- **Overlay:** `--shadow-overlay`; available overlay token. The shared Modal currently carries Tailwind's larger neutral dialog shadow rather than this alias.

Exact shadow values and motion live in the sidecar. State transitions commonly last (200ms). Reduced-motion preferences disable animation and smooth scrolling.

**The Flat Workspace Rule.** Separate business data with tone and borders; reserve visible depth for hover and floating UI.

## Shapes

Controls use the Control radius; panels and dialogs use the Card radius. Compact merchandise panels, model entries, metrics and POS tiles use Compact Card. Status badges are pills. The official logo plate is a small-cornered black rectangle with the complete image contained inside; its responsive size changes without cropping or stretching the asset.

Narrow skewed orange separators, with selective red accompaniment, provide the automotive signature on major brand regions. They decorate the frame rather than cutting text, controls or the logo. Fine (1px) borders keep light panels distinct.

## Components

### Buttons

Confident, readable actions with a modest corner and no resting shadow.

- **Primary:** Performance Orange with Obsidian text; Hot Orange on hover.
- **Secondary:** white, navy text and Strong Border; muted background on hover.
- **Dark:** translucent white surface and border with white text, for dark frames.
- **Danger:** Racing Red and white, deepening to the implemented dark red hover.
- **Ghost:** transparent with strong neutral text and a subtle gray hover surface.
- **Sizing and state:** default minimum height (44px); large (48px). Small/default/large horizontal padding is (16/20/24px). Active press moves down (1px); disabled actions reduce opacity and stop pointer interaction. Visible keyboard focus uses the shared ring.

### Chips

Compact status indicators use a pill shape, thin tonal border, (12px) semibold Inter, and optional dot or SVG icon. Use the shared StatusBadge/StockBadge tone mapping; keep text such as In stock, Low stock or Out of stock visible. Labels and icons carry meaning alongside color.

### Cards / Containers

Light, bordered content surfaces keep merchandise and data easy to inspect. Reuse Card, SectionCard and MetricCard rather than introducing new wrappers. Generic Card has no prescribed padding; its consumer supplies the relevant spacing. Product images use contain against white, preserving the complete item. Metrics stay flat and use Inter tabular values.

### Inputs / Fields

White fields have a Control radius, visible Control Border, (44px) minimum height and (10px 12px) internal padding. Labels sit above; hints and errors sit below. Search fields reserve space for a real SVG search icon. The global keyboard ring is (3px) Orange Ink with a (3px) offset; focused shared fields also change their border. Invalid fields add danger ink and explanatory text. Preserve native select, checkbox and radio semantics.

### Navigation

The public header and footer are Obsidian; operations use Racing Navy. Selected operations destinations use Secondary Navy and an inset orange left marker. Text and SVG icons remain readable on dark surfaces; mobile menus use the shared focus-managed drawer. Shared content tabs use an orange underline and Orange Ink selected text. Do not apply the dark navigation treatment to the data canvas.

### Official Logo

BrandLogo is the only logo renderer; BrandMark delegates to it. Use the complete supplied `frontend/public/brand/10th-west-logo.png`, unchanged, on its black plate. The companion name may hide in compact layouts while the complete image remains. Preserve the clear-space requirement in MASTER; contextual plate sizing is not a license to alter the asset.

### Tables and Dialogs

DataTable provides a white bordered scrolling region, Card radius, sticky subdued headers, (12px 16px) cells and tabular figures. Hover rows change tone quietly. Modal owns focus trapping, Escape dismissal, scroll locking and opener restoration. It becomes a bottom-aligned panel on phone layouts; drawer and sheet variants reuse the same behavior. Keep cancel and destructive confirmation actions distinct.

## Do's and Don'ts

### Do:
- **Do** reuse the official complete logo, shared components and established semantic tokens.
- **Do** pair orange action fills with dark text and use Orange Ink for light-background links.
- **Do** keep real merchandise, part identity, fitment, stock and prices easy to inspect.
- **Do** use Inter and tabular numbers for prices, controls and business data.
- **Do** preserve visible focus, labeled actions, non-color status and reduced-motion behavior.
- **Do** retain compact operations, contained table scrolling and usable phone controls.

### Don't:
- **Don't** crop, recolor, filter, stretch or replace the official logo with initials or text.
- **Don't** introduce gaming imagery, neon, skulls, flames, simulated metal or decorative bevels.
- **Don't** invent ratings, fitment, stock, prices or unsupported marketing claims.
- **Don't** turn red into the default primary-action color or use orange fill colors as small text on white.
- **Don't** add rainbow charts, heavy panel shadows or decorative motion to operations.
- **Don't** treat legacy utility exceptions, incidental micro-labels or content defects as new visual rules.
