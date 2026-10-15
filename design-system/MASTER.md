# 10th West Moto — Design System (MASTER)

Source of truth for every frontend surface. Page files in `design-system/pages/` may
override a rule only when a page genuinely needs it; otherwise this file wins.

## 1. Direction

10th West Moto is a working motorcycle-parts retailer: a storefront, a POS counter, and
a back office that share one inventory. The interface should feel like dependable shop
equipment — precise, legible, fast — not a SaaS template.

| Surface | Mode | Variance | Motion | Density |
|---|---|---|---|---|
| Storefront (home, shop, product, cart, checkout) | Persuade → Operate at checkout | 5 | 3 | 4 |
| Account (orders, wishlist, profile, messages) | Operate | 4 | 2 | 5 |
| Owner / Staff / Super Admin workspaces | Operate | 3 | 2 | 7 |
| POS and Inventory | Operate (speed first) | 2 | 1 | 8 |

Generated baseline: `ui-ux-pro-max --design-system "motorcycle parts automotive e-commerce
retail inventory POS operations dashboard professional high-trust" --variance 5 --motion 3
--density 7`. Its teal palette and Rubik/Nunito pairing were **overridden** by the brief's
"preserve the existing brand" rule; its checklist (SVG icons, 150–300 ms states, 4.5:1
contrast, visible focus, reduced motion, 375/768/1024/1440 checks) is adopted as-is.

## 2. Color tokens (`frontend/index.css :root`)

Primitive → semantic. Components use the semantic names (or the matching Tailwind
slate/orange/red utilities listed) — never new hex values.

| Token | Value | Tailwind equivalent | Use |
|---|---|---|---|
| `--brand-950` | `#080d19` | `bg-[#080d19]` | Storefront navbar, footer, dark bands |
| `--brand-900` | `#0b1020` | `bg-[#0b1020]` | Hero, dark sections |
| `--ops-sidebar` | `#020617` | `bg-slate-950` | Operations sidebar |
| `--accent` | `#ea580c` | `orange-600` | Primary action, active nav, focus ring hue |
| `--accent-hover` | `#c2410c` | `orange-700` | Primary hover / pressed |
| `--accent-soft` | `#fff7ed` | `orange-50` | Selected rows, active filters, unread |
| `--accent-red` | `#e53935` | `red-600` | Brand mark, sale price, destructive |
| `--surface` | `#ffffff` | `white` | Cards, tables, dialogs |
| `--surface-muted` | `#f8fafc` | `slate-50` | Page background |
| `--surface-subtle` | `#f1f5f9` | `slate-100` | Table header, inset panels |
| `--border` | `#e2e8f0` | `slate-200` | Default dividers / card borders |
| `--border-strong` | `#cbd5e1` | `slate-300` | Inputs, secondary buttons |
| `--text` | `#0f172a` | `slate-900/950` | Primary text |
| `--text-secondary` | `#475569` | `slate-600` | Descriptions, table cells |
| `--text-muted` | `#64748b` | `slate-500` | Helper / meta (≥ 4.5:1 on white) |
| `--success` | `#047857` | `emerald-700` on `emerald-50` | Paid, delivered, in stock |
| `--warning` | `#b45309` | `amber-700/800` on `amber-50` | Pending, low stock |
| `--danger` | `#dc2626` | `red-700` on `red-50` | Failed, cancelled, out of stock |
| `--info` | `#1d4ed8` | `blue-700` on `blue-50` | Processing, shipped, informational |

Rules
- Red/orange is reserved for the **one** primary action per context, the active nav item,
  sale prices, and status accents. Never fill large surfaces with it.
- The red→orange gradient exists only inside the BrandMark tile. No gradient text, no
  gradient buttons, no coloured glows.
- Status is never color-only: every badge carries a text label, and an icon where the row
  is scanned quickly (orders, stock).

## 3. Typography

- Body / UI / data: **Inter** 400–700. Tabular figures (`tabular-nums`) for prices,
  quantities, totals, dates in tables.
- Display: **Poppins** 600–800 for page titles, section headings, prices on product pages.
  Never for labels, buttons, or table data.

| Role | Classes |
|---|---|
| Page title (ops) | `font-display text-2xl sm:text-[28px] font-bold tracking-tight text-slate-950` |
| Page title (storefront) | `font-display text-3xl sm:text-4xl font-extrabold tracking-tight` |
| Section heading | `font-display text-lg sm:text-xl font-bold text-slate-950` |
| Card heading | `text-base font-semibold text-slate-950` |
| Body | `text-sm sm:text-base leading-6 text-slate-600` (max 70ch) |
| Label | `text-sm font-medium text-slate-700` |
| Helper | `text-xs leading-5 text-slate-500` |
| Caption / meta | `text-xs text-slate-500` (11px is the floor; never 9–10px for meaning) |

Eyebrows (uppercase tracked kicker above a heading) are retired in operations pages and
limited to at most one per three storefront sections. Tracking floor −0.03em.

## 4. Spacing, radius, elevation

- Spacing: 4px base (`1`=4px). Ops pages use `space-y-4/5`, card padding `p-4 sm:p-5`,
  storefront sections `py-10 sm:py-14`.
- Radius (`--radius-*`): controls `6–8px` (`rounded-md`/`rounded-lg`), cards `12px`
  (`rounded-xl`), dialogs `16px` (`rounded-2xl`). Pills only for badges and counts.
- Elevation: declare it once — a 1px `slate-200` border **or** a shadow, not a ghost card.
  `shadow-sm` for resting cards, `--shadow-overlay` for menus/dialogs. No coloured halos.

## 5. Interaction states

| State | Treatment |
|---|---|
| Hover | Background shift one step (`slate-50`/`orange-700`), 150–200 ms, guarded by `@media (hover:hover)` for lift effects |
| Focus | `outline: 3px solid rgb(234 88 12 / .55)` + 2px offset via `:focus-visible` (global) |
| Active | `translate-y-px` on buttons |
| Disabled | `opacity-50`, `cursor-not-allowed`, no hover change |
| Loading | Inline spinner inside the triggering button + "…" label; skeletons for data regions |
| Error | Inline next to the field (`role="alert"`), page-level `ErrorState` with retry |

Touch targets ≥ 44px on touch layouts (`min-h-11`), 36–40px allowed for dense desktop
table actions.

## 6. Shared components (`frontend/components`)

| Need | Use |
|---|---|
| Primary/secondary button | `ui/BrandButton` (`primary`, `secondary`, `dark`, `danger`) |
| Page title + actions | `operations/PageHeader` |
| Grouped panel | `operations/SectionCard` |
| KPI | `operations/MetricCard` (only where the number drives a decision) |
| Search + filters | `operations/FilterBar`, `SearchField` |
| Row actions | `operations/ActionDropdown` |
| Status | `ui/StatusBadge` (tone + text, optional icon) |
| Empty / error | `ui/EmptyState` (`tone="error"` for failures, with retry action) |
| Skeleton | `ui/LoadingSkeleton` |
| Dialog | `owner/Modal` (focus-managed, Esc to close, bottom sheet on phones) |
| Rich text display | `ui/RichText` (allow-listed render of stored HTML) |

Do not add near-duplicates; extend these.

## 7. Layout rules

- Ops pages: `PageHeader` → (notice) → filters → primary data → secondary data.
  Tables for tabular data on `md+`; structured cards on phones that keep **stock,
  location, price and status visible**.
- Storefront: hero fits the first viewport with search, one primary CTA, one secondary.
- Chat: list + pane on `lg+`, one pane at a time on phones; footer hidden on `/messages`.
- POS: catalog takes the screen on phones; the sale collapses to a sticky summary bar
  with total and Pay always reachable.

## 8. Motion

150–250 ms ease-out on state changes only; no page-load choreography in operations.
Everything honours `prefers-reduced-motion` (global rule in `index.css`).

## 9. Anti-patterns (reject in review)

Gradient text or buttons · coloured glow shadows · nested cards · eyebrow on every
section · 24px+ radii on business UI · emoji as icons · color-only status · `transition:
all` · `outline: none` without replacement · placeholder-as-label · spinners in the middle
of tables when a skeleton fits · five equal-weight actions in one header.
