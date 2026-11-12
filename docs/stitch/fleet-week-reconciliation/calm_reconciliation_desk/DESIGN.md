---
name: Calm Reconciliation Desk
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#47464c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#78767d'
  outline-variant: '#c9c5cd'
  surface-tint: '#5e5c74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b192e'
  on-primary-container: '#84819a'
  inverse-primary: '#c8c3df'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002114'
  on-tertiary-container: '#069669'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  currency-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  currency-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  currency-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-trust, calm, and methodical environment tailored for finance operations, audit trails, and weekly fleet settlement reconciliation. Drawing inspiration from institutional modernism and Swiss grid rigor, it strips away visual clutter in favor of scannable data layouts, precise status communication, and quiet clarity.

The emotional signature is unhurried competence: reducing anxiety during multi-million-dollar reconciliations through confident typographic pacing, generous white space, and low-saturation structures. Interaction models are tactile yet disciplined, employing subtle hairline delineation and ambient elevation rather than heavy borders or aggressive transitions.

## Colors

The palette leverages high-contrast structural anchors combined with soft, muted surfaces to maintain focus during long accounting sessions.

- **Foundations**: The canvas rests on `#f8fafc` (slate-50), while interactive panels, metric cards, and table rows use `#ffffff` to establish depth.
- **Primary & Actions**: `#030213` acts as the command tone for critical primary calls to action, stepper indicators, and high-priority headers. 
- **Status Matrix**:
  - *Complete / Reconciled*: `#059669` text on `#ecfdf5` background.
  - *Action Needed / Pending*: `#b45309` text on `#fffbeb` background.
  - *Failed / Blocking Closing*: `#d4183d` text on `#fff1f2` background.
  - *Informational / Syncing*: `#2563eb` text on `#eff6ff` background.
  - *Neutral / No Activity*: `#475569` text on `#f1f5f9` background.
  - *Settled / Closed Seal*: Solid `#1e293b` container with crisp `#ffffff` text.
- **Hairlines**: Division rules and card borders leverage `rgba(0, 0, 0, 0.06)` on light surfaces to preserve edge definition without visual weight.

## Typography

Inter serves as the singular typographic workhorse across the entire system. Its neutral architecture allows balance sheets and transaction streams to speak without distraction.

All currency amounts, balances, invoice identifiers, and date timestamps must utilize OpenType tabular lining figures (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "cv05" 1`) to ensure perfect vertical column alignment across ledgers and reconciliation matrices. Currency amounts format standard prefixes cleanly (e.g., `J$128,450.00`) with bold weights reserved for net variance totals and final balances.

## Layout & Spacing

The layout is built around a responsive 12-column desk framework optimized for wide monitors (1440px+ containers) while cleanly adapting down through tablet splits and mobile stacks.

- **Desktop (1024px+)**: 12-column grid, 24px (`1.5rem`) gutters, 40px (`2.5rem`) outer canvas margins. Multi-pane workbench configuration allowing side-by-side ledger comparisons, filter panels, and run-rate summaries.
- **Tablet (768px - 1023px)**: 8-column layout, 20px gutters, 24px margins. Contextual sidebars collapse into slide-out inspection drawers.
- **Mobile (<768px)**: 4-column layout, 16px (`1rem`) gutters and margins. Grid rows collapse into vertical audit cards, and multi-step closing rails convert into horizontally scrollable breadcrumbs.

Component spacing strictly follows an 8px modular baseline, using `space-xs` (4px) and `space-sm` (8px) for internal element grouping, and `space-lg` (20px) to `space-xl` (32px) for card body padding and workbench section separations.

## Elevation & Depth

Visual hierarchy uses a crisp ambient-layering approach: bright white containers elevate subtly off the `#f8fafc` canvas, delineated primarily by hairlines rather than deep drop shadows.

- **Baseline Cards & Modules**: Layered with a dual-stage soft shadow: `0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)` combined with a perimeter hairline of `1px solid rgba(0, 0, 0, 0.06)`.
- **Interactive Hover & Drag**: For reconcilable line items in focus, the ambient blur tightens slightly: `0 2px 4px rgba(0, 0, 0, 0.03), 0 12px 32px rgba(15, 23, 42, 0.08)`.
- **Modals, Drawers & Popovers**: Floating verification surfaces utilize `0 20px 48px -8px rgba(15, 23, 42, 0.14)` bounded by `1px solid rgba(0, 0, 0, 0.08)`.
- **Data Table Grids**: Fully flat, relying solely on `1px solid rgba(0, 0, 0, 0.06)` internal row dividers with `#ffffff` row background and subtle `#f8fafc` hovering states.

## Shapes

The design system maintains a balanced hierarchy of radius values to create clear distinctions between structural surfaces, functional inputs, and metadata tags:

- **Primary Cards & Containers**: Fixed at `20px` (`rounded-xl` variant override) to present soft, modern desk surfaces that frame data calmly.
- **Controls & Form Fields**: Set strictly to `12px` (`0.75rem`) across all inputs, dropdowns, primary actions, and button groups, ensuring a disciplined, comfortable grip.
- **Status Tags, Badges & Step Pills**: Fully rounded pill shapes (`border-radius: 9999px`) to immediately visually differentiate dynamic status metadata and stage markers from actionable square-cornered UI elements.

## Components

### Buttons
- **Primary**: Background `#030213`, text `#ffffff`, border radius `12px`, height `44px` (desk default) or `36px` (compact). Hover shifts background to `#1e293b`.
- **Secondary / Outlined**: Background `#ffffff`, border `1px solid rgba(0,0,0,0.12)`, text `#030213`. Hover state shifts surface to `#f8fafc`.
- **Destructive**: Background `#fff1f2`, text `#d4183d`, border `1px solid rgba(212,24,61,0.2)`.

### Cards & Ledger Modules
- Pure white background (`#ffffff`), `20px` border radius, `1px solid rgba(0,0,0,0.06)` hairline border, ambient dual shadow (`0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(15,23,42,0.06)`), and `space-xl` (`32px`) internal padding.

### Status Chips & Badges
- Pill-shaped (`rounded-full`), height `24px`, padding `0 10px`, `11px` uppercase or `12px` title-case Inter medium typography.
- Built-in dot indicator (`6px` circular status color dot) paired with clear contextual wording (e.g., `Complete`, `Review Needed`, `Sync Failed`).

### Form Fields & Inputs
- Height `44px`, radius `12px`, background `#ffffff`, border `1px solid rgba(0,0,0,0.12)`, font size `14px`.
- Focus ring: `3px solid rgba(3,2,19,0.08)`, border color `#030213`.
- Currency entry fields display a stationary, muted `J$` prefix in `14px Inter medium` tabular font.

### Checkboxes & Selection Rows
- `18px x 18px` with `4px` corner radius. Checked background is `#030213` with a pure white check icon. Selected table rows receive a faint `#f8fafc` tint and a persistent left accent hairline.

### Reconciliation Step Tracker
- Horizontal progress bar with a `#030213` fill for active/completed segments, connected by pill-shaped phase nodes with numeric markers or success checks.