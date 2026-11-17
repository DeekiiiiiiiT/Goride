---
name: Toll Desk Precision
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd9e0'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2fa'
  surface-container: '#f0ecf4'
  surface-container-high: '#eae7ee'
  surface-container-highest: '#e4e1e9'
  on-surface: '#1b1b20'
  on-surface-variant: '#47464c'
  inverse-surface: '#303035'
  inverse-on-surface: '#f3eff7'
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
  secondary-container: '#346cef'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002114'
  on-tertiary-container: '#079669'
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
  on-secondary-fixed-variant: '#003ea7'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#fcf8ff'
  on-background: '#1b1b20'
  surface-variant: '#e4e1e9'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-default:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-muted:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  currency-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  currency-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
  label-badge:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-meta:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system targets high-throughput fleet operators, logistics financial controllers, and enterprise transit accountants reconciling weekly highway tolls. The emotional tone is authoritative, frictionless, and serene—transforming dense transactional volume into an unhurried, systematic flow.

The visual style blends **Corporate Modern** with **Technical Precision**:
- High-density data structures framed by expansive visual calm.
- Crisp hairline boundaries paired with ultra-diffuse ambient elevations.
- Controlled use of saturated semantic tones strictly for transactional state indicators, maintaining a quiet monochromatic workspace.

## Colors

The palette establishes strict hierarchical clarity across financial line items, ensuring immediate recognition of audited states without visual fatigue.

### Core Canvas & Structure
- **Page Wash:** `#f8fafc` (Canvas baseline)
- **Card Surface:** `#ffffff`
- **Subtle Hairline Borders:** `rgba(0, 0, 0, 0.06)`, `#e2e8f0` (default dividing lines), `#cbd5e1` (interactive inputs & structural rules)
- **Text Primary:** `#0b1c30` (Headers, line-item amounts, high-emphasis text)
- **Text Muted:** `#47464c` (Supporting labels, timestamps, trip subheadings)

### Semantic Transaction Tokens
- **Matched / Paid Back (Success):** `#069669` foreground on `#ecfdf5` background.
- **Needs Decision / Pending (Warning):** `#b45309` foreground on `#fffbeb` background.
- **Blocked / Overdue / Unlinked (Danger):** `#ba1a1a` foreground on `#fff1f2` background.
- **Neutral Audit / Archived (Info):** `#475569` foreground on `#f1f5f9` background.
- **Suggested / Active Dispute / Focus (Highlight):** `#0051d5` foreground on `#eff4ff` background.

## Typography

Typography relies entirely on **Inter** with deliberate typographic features for banking rigor:
- **Tabular Figures (`tnum`):** All financial summaries, vehicle license tags, timestamps, and currency units (`J$`) must render with open-type tabular numbers (`font-variant-numeric: tabular-nums`) to preserve column alignment across reconciliation tables.
- **Card Titles:** Strictly 22px semibold (`headline-lg`) paired with 15px muted subtitles (`body-muted`) to cleanly demarcate individual trip modules.
- **Currency formatting:** Prefix currency with `J$` (e.g., `J$ 4,850.00`), using semibold weights (`currency-lg` or `currency-md`) to ensure critical figures emerge instantly during rapid review.

## Layout & Spacing

The workstation follows a structured **3-Pane Desk Architecture**:
1. **Left Step Rail (280px fixed):** Vertical reconciliation stages, week-selector anchors, and batch audit status.
2. **Center Workstream (Fluid):** Primary reconciliation queue with an inline aggregate KPI stats bar followed by individual toll exception cards.
3. **Right Financial Drawer / Summary (340px fixed):** Real-time balance debits, unmatched float sums, and batch commit triggers.

### Breakpoints & Adaptations
- **Desktop (≥ 1280px):** Full three-pane layout visible. Fixed rail gutters of `1.25rem` (`gutter`), outer canvas margin of `2rem` (`margin`).
- **Tablet (768px – 1279px):** Left step rail collapses into a compact 64px icon bar or sliding panel; right summary collapses into a sticky bottom summary sheet.
- **Mobile (< 768px):** Single-column stacked stream. Margin drops to `1rem`, stats bar scrolls horizontally, action bars dock persistently to the bottom viewport edge.

## Elevation & Depth

This system avoids heavy shadows, instead relying on layered white-on-wash surfaces with micro-borders:

- **Base Cards & Modules:** `#ffffff` surface, bounded by a `1px` continuous hairline border `rgba(0, 0, 0, 0.06)`. Dual elevation combining a crisp micro-shadow for edge clarity and an ambient drop for physical presence:
  `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);`
- **Elevated Modals & Flyouts:** Surface `#ffffff`, border `1px solid rgba(0, 0, 0, 0.08)`, elevated via `0 20px 32px -4px rgba(15, 23, 42, 0.12), 0 8px 16px -4px rgba(15, 23, 42, 0.04)`.
- **Toasts & Temporary Banners:** Suspended pill or rectangular toast positioned top-center or bottom-left, using `#030213` primary background with `0 12px 28px rgba(3, 2, 19, 0.2)`.

## Shapes

The design uses balanced, rounded geometries (`roundedness: 2`, `8px` baseline) to maintain a modern, approachable feel while upholding enterprise stability.

- **Primary Cards & Modals:** `8px` (`rounded-md`) to `16px` (`rounded-lg`).
- **Form Controls & Action Buttons:** `8px` corner radius.
- **Tags, Status Badges & Progress Pills:** Full-radius pill curves (`9999px`) to contrast against rectangular data cards.

## Components

### 1. Progress Step Pills & Connector Rail
- Composed of pill-shaped numeric or icon nodes linked via a persistent `2px` vertical or horizontal track (`#e2e8f0`).
- Completed nodes show `#069669` fill with white check icons.
- Active node shows `#0051d5` halo ring with a filled `#eff4ff` core.
- Pending nodes show `#ffffff` background with `#cbd5e1` borders.

### 2. Toll Detail & Trip Comparison Cards
- Constructed with `#ffffff` container and `rgba(0,0,0,0.06)` border.
- Features side-by-side comparison pills displaying:
  - Telematics GPS route stamp vs. Toll Plaza invoice time stamp.
  - Expected charge vs. Billed invoice in `tnum` figures (`J$`).
- Action group pinned right: Secondary text button ("Dispute"), Primary compact button ("Match & Commit").

### 3. Action Buttons
- **Primary:** Background `#030213`, text `#ffffff`, border `none`. Hover: `#1a192f`.
- **Secondary:** Background `#ffffff`, text `#0b1c30`, border `1px solid #cbd5e1`. Hover: `#f8fafc`.
- **Highlight / Resolution:** Background `#0051d5`, text `#ffffff`. Hover: `#0041ab`.

### 4. Status Badges & Chips
- Padding: `2px 8px`. Font size: `12px` font weight `500`.
- Pill-shaped (`rounded-full`) using matching background and high-contrast foreground defined in Section 2 semantic colors.

### 5. Input Fields & Search Bars
- Background `#ffffff`, border `1px solid #cbd5e1`, inner text `#0b1c30`.
- Focus state: border `#0051d5`, outline ring `2px rgba(0, 81, 213, 0.15)`.

### 6. Confirmation Modals & Undo Toasts
- **Confirmation Dialog:** Focused center modal, 440px max width, containing explicit reconciliation delta metrics and dual primary/dismiss buttons.
- **Undo Toast:** High-contrast floating pill (`#030213` surface, `#ffffff` text) equipped with a dynamic 5-second reverse-progress ring and an inline "Undo" text action (`#eff4ff`).