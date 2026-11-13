---
name: Calm Financial Desk
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
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#00174b'
  on-tertiary-container: '#497cff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b4c5ff'
  on-tertiary-fixed: '#00174b'
  on-tertiary-fixed-variant: '#003ea8'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  display-mobile:
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
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  tabular-amount-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  tabular-amount-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0em
  tabular-amount-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-caps:
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
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
  space-2xl: 2.5rem
---

## Brand & Style

The design system establishes a focused, calm, and deliberate environment tailored for commercial fleet operators, corporate treasurers, and financial controllers. It eliminates visual noise, high-stimulus gamification, and unnecessary decoration in favor of clarity, architectural restraint, and immediate data legibility.

### Design Principles
- **Quiet Authority:** Premium institutional confidence expressed through deep near-black tones, crisp layout structures, and generous white space rather than bright brand splashes.
- **Cognitive Ease:** High-stakes financial and fleet operations demand reduced eye fatigue. Subtle slate surfaces, muted neutral hierarchies, and restrained accent states allow critical discrepancies to surface instantly.
- **Instrument Precision:** Numbers, operational metrics, and ledger positions behave like calibrated instruments—strictly aligned, predictable, and rendered with tabular geometry.
- **Plainspoken Transparency:** System statuses and automated reconciliations favor plain-language explanations, explicit dates, and unambiguous state signifiers over cryptic financial codes.

## Colors

The palette is engineered around an architectural, off-white foundation (`#f8fafc`) with stark, ultra-deep ink (`#030213` and `#0a0a0a`) for core figures and high-priority actions. Semantic roles use tinted, low-saturation pill backgrounds paired with deep, accessible foregrounds to communicate operational truth without visual alarm.

### Palette Architecture
- **Canvas & Structural Surfaces:**
  - Background Canvas: `#f8fafc`
  - Card & Container Surface: `#ffffff`
  - Hairline Dividers & Outlines: `rgba(0, 0, 0, 0.06)`
  - Elevated Container Border: `rgba(0, 0, 0, 0.08)`
- **Primary Ink & Neutrals:**
  - Primary Element / Action: `#030213`
  - High-Contrast Body Text: `#0a0a0a`
  - Muted Label / Secondary Text: `#64748b`
  - Sealed / Locked Surface: `#1e293b`
  - Neutral Pill Badge: `#475569` on `#f1f5f9`
- **Semantic & Operational Indicators:**
  - Matched / Settled (Green): `#059669` text on `#ecfdf5` background
  - Pending / Warning (Amber): `#b45309` text on `#fffbeb` background
  - Danger / Discrepancy (Red): `#d4183d` text on `#fff1f2` background
  - System Suggestion / Prompt (Blue): `#2563eb` text on `#eff6ff` background

## Typography

Typography relies entirely on Inter. To maintain absolute order across financial balances and transaction logs, all monetary values, account identifiers, vehicle plates, and timestamps must use tabular lining figures (`font-feature-settings: 'tnum' 1, 'cv05' 1`).

### Hierarchy & Editorial Rules
- **Monetary Displays:** Always format with the explicit currency prefix (`J$`) followed by comma-separated tabular digits (e.g., `J$1,248,500.00`).
- **Dates & Temporal Context:** Avoid pure numeric strings. Render dates in clean, unambiguous plain language (e.g., "14 Oct 2024", "Yesterday at 4:15 pm").
- **Explanatory Context:** Subtitles and row footnotes use `body-sm` in `#64748b` to explain balance updates or verification statuses without competing with headline totals.
- **Section Headers:** Small section labels and ledger categories utilize `label-caps` in uppercase styling with gentle letter-spacing for structural anchoring.

## Layout & Spacing

The layout model is governed by an adaptable 12-column desk grid that stabilizes large tabular arrays, transaction reconciliation splits, and vehicle cost roll-ups.

### Breakpoints & Adaptive Behavior
- **Desktop (1280px and above):** 12-column grid, max canvas width 1440px centered, 32px canvas margins, 20px gutters. Dual-pane inspection views (ledger list + selected balance breakdown) rest side-by-side.
- **Tablet (768px – 1279px):** 8-column layout, 24px margins, 16px gutters. Analytical sidebars stack beneath core transaction lists or tuck into contextual sliding drawers.
- **Mobile (below 768px):** Single-column stacked flow, 16px margins, 12px gutters. Complex table columns collapse into high-density card records.

### Spacing Discipline
- Maintain internal padding inside main financial cards at `space-xl` (28px / 1.75rem) on desktop, stepping down to `space-lg` (20px / 1.25rem) on mobile.
- Use `space-xs` (4px) and `space-sm` (8px) strictly for typographic grouping (e.g., pairing a tabular figure directly with its muted caption).

## Elevation & Depth

Depth is established primarily through crisp boundary control, ambient light separation, and tinted surface tiers rather than heavy drop shadows. The UI remains grounded and flat, preventing the cognitive weight common in multi-layered dashboards.

### Elevation Hierarchy
- **Base Canvas (Level 0):** `#f8fafc`. The non-interactive background workspace.
- **Flat Card / Ledger Pane (Level 1):** Solid `#ffffff` surface bounded by a continuous hairline border of `1px solid rgba(0, 0, 0, 0.06)` and supported by a whisper-soft ambient shadow: `box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 1px 2px -1px rgba(0, 0, 0, 0.03)`.
- **Raised Interactive Card / Active Hover (Level 2):** `#ffffff` surface with `1px solid rgba(0, 0, 0, 0.09)` and elevated shadow: `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.03)`.
- **Floating Overlays & Menus (Level 3):** `#ffffff` with hairline border `rgba(0, 0, 0, 0.08)` and deeper isolation shadow: `box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.02)`.
- **Sealed / Locked Containers:** Solid `#1e293b` fill, zero shadow, no border, text inverted to pure white and muted slate. Represents frozen periods, finalized disbursements, or locked books.

## Shapes

The geometric architecture pairs spacious, friendly radii on large structural boundaries with crisp, ergonomic radii on clickable controls.

### Specific Radius Rules
- **Financial Cards & Desk Panels:** Standardized to exactly `20px` corner radius. This softens the presentation of dense numerical data and frames financial clusters cleanly.
- **Interactive Controls (Buttons, Inputs, Select Menus):** Explicitly set to `12px` corner radius, creating an ergonomic, balanced interaction target that fits within card modules.
- **Status Chips, Category Badges & Pills:** Fully rounded (`9999px`), creating immediate visual distinction between actionable square-cornered forms and passive, pill-shaped metadata.
- **Embedded Inner Wells & Sub-containers:** Set to `10px` to maintain concentric alignment when nested within a `20px` parent container.

## Components

### Buttons
- **Primary Action:** Solid `#030213` fill, `#ffffff` text, 12px corner radius. Padding: `10px 18px`. Hover: `#1e293b`. Focus: `2px` ring in `#2563eb` offset by `2px`.
- **Secondary / Desk Utility:** White background, hairline border `rgba(0,0,0,0.08)`, `#0a0a0a` text. Hover: `#f8fafc` background with `rgba(0,0,0,0.12)` border.
- **Destructive:** `#fff1f2` background with `#d4183d` text. Hover: `#ffe4e6`.

### Inputs & Form Fields
- **Container:** Height 44px, 12px corner radius, background `#ffffff`, border `1px solid rgba(0, 0, 0, 0.08)`.
- **Text & Placeholder:** Input value in `#0a0a0a` (`body-md`), placeholder in `#64748b`.
- **Focus State:** Hairline border shifts to `#2563eb` with a subtle `3px` focus ring tinted to `rgba(37, 99, 235, 0.12)`.
- **Currency Input Prefix:** Fixed left adornment displaying `J$` in muted tabular font (`#64748b`) with right-aligned tabular numerals.

### Status Chips & Badges
- **Shape:** Height 24px, padding `2px 10px`, fully rounded (`9999px`). Font: `label-md` (weight 500).
- **Matched / Verified:** `#059669` text on `#ecfdf5` background.
- **Amber / Pending Review:** `#b45309` text on `#fffbeb` background.
- **Discrepancy / Attention:** `#d4183d` text on `#fff1f2` background.
- **Recommendation / Auto-Matched:** `#2563eb` text on `#eff6ff` background.
- **Neutral Audit / Meta:** `#475569` text on `#f1f5f9` background.

### Cards & Ledger Blocks
- **Standard Account Card:** White background, 20px radius, hairline border `rgba(0,0,0,0.06)`, ambient elevation. Padding: `24px`.
- **Sealed Ledger Block:** `#1e293b` solid background, 20px radius, white primary typography, slate secondary typography. Used for verified, immutable balance roll-ups.

### Table & List Rows
- **Layout:** High-density, single-line horizontal alignment. Height 52px. Border bottom `1px solid rgba(0, 0, 0, 0.04)`.
- **Typography:** Description in `body-md` (`#0a0a0a`), metadata and timestamp in `body-sm` (`#64748b`), amounts aligned right in `tabular-amount-md`.
- **Hover State:** Entire row transitions gently to `#f8fafc`.

### Checkboxes & Radios
- **Geometry:** 18px × 18px. Checkboxes feature 4px corner radius; radios are circular.
- **States:** Default border `1.5px solid #64748b` on white. Selected state fills `#030213` with crisp white icon checkmark.