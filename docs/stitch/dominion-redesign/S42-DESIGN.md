---
name: Dominion Technical Parts Engine
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e5'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3ff'
  surface-container: '#ededf9'
  surface-container-high: '#e7e7f3'
  surface-container-highest: '#e1e1ed'
  on-surface: '#191b24'
  on-surface-variant: '#434655'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#f0f0fc'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#003ea9'
  on-primary: '#ffffff'
  primary-container: '#0153dc'
  on-primary-container: '#ced8ff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#40465e'
  on-tertiary: '#ffffff'
  tertiary-container: '#575e77'
  on-tertiary-container: '#d2d8f6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#bfc5e2'
  on-tertiary-fixed: '#141b30'
  on-tertiary-fixed-variant: '#3f465e'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ed'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: '0'
  mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: '0'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-panel: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style
This design system governs an enterprise-grade automotive and machinery parts database utility designed for operations managers, master technicians, and catalog architects. The interface communicates definitive technical precision, systematic rigor, and high-density legibility without visual fatigue.

The design movement combines **Modern High-Density Enterprise** with **Utilitarian Brutalist Structure**:
- Absolute reliance on crisp structural delineation, structural hairline borders, and flat layered planes.
- Complete rejection of decorative gradients, synthetic blurs, or skeuomorphic bevels.
- Clear structural hierarchy: dark infrastructure anchors (navigation rails) framing light operational surfaces designed for prolonged screen engagement.
- Plain language nomenclature precedes deep alphanumeric classification (e.g., standard automotive naming prioritized above raw OEM part strings, with strict technical tags immediately following).

## Colors

The color palette is engineered for instantaneous visual triage within dense tabular databases.

### Core Canvas & Structure
- **App Shell / Navigation Rail:** `#0f172a` (Slate Navy 900) - Provides an immutable framing anchor for navigational stability.
- **Canvas Backdrop:** `#faf8fe` (Cool Off-White) - Softened light plane that mitigates high-contrast eye fatigue.
- **Surface Level 0 (Cards, Tables, Panels):** `#ffffff` (Pure White).
- **Hairline Dividers & Outlines:** `#e2e8f0` (Slate 200).

### Brand & Interactive Accents
- **Dominion Primary Accent:** `#0153dc` (High-efficiency cobalt blue for primary actions, active navigational states, and focus rings).
- **Selection / Container Tint:** `#dbe1ff` (Low-saturation cobalt wash for row selections, multiselect chips, and active indicator backgrounds).
- **Text Primary:** `#30323b` (Deep graphite for primary values, part names, and headers).
- **Text Secondary / Muted:** `#797a84` (Slate neutral for meta captions, secondary specifications, and empty labels).

### Status System
- **Verified / Exact Match:** `#006e31` (Deep Forest Green)
- **Needs Checking / Warning:** `#d97706` (Amber 600)
- **Conflict / Incompatible:** `#a83836` (Crimson 700)
- **Unverified / Neutral Slate:** `#797a84`

### Five-Tier Match Classification Tokens
Applied strictly to technical badge indicators, compatibility chips, and edge accents:
1. **Tier 1 (Made for your car):** `#0153dc`
2. **Tier 2 (Same car, different badge):** `#0e7490`
3. **Tier 3 (Fits your engine):** `#b45309`
4. **Tier 4 (Other brands that replace it):** `#7c3aed`
5. **Tier 5 (Fits by size):** `#006e31`

## Typography

The type system is divided into two distinct functional disciplines:

1. **Human Interface (`Inter`):** Drives layout navigation, actions, common part descriptions, table headers, and functional prose. Renders warm, legible, and balanced across low-contrast surfaces.
2. **Deterministic Data (`JetBrains Mono`):** Applied exclusively to structured automotive metadata where variable glyph widths cause layout shifting or misreading:
   - Part Numbers (`17220-5R0-008`, `W712/75`)
   - Chassis & Platform Codes (`GP5`, `GK5`, `FK8`)
   - Engine Identification Strings (`LEB-H1`, `L15B7`, `2JZ-GTE`)
   - Production Years & Tolerances (`2013-2020`, `Ø 64.5mm`, `M14x1.5`)

All tabular numerals are strictly enforced via OpenType `tnum` features across both families to preserve vertical alignment down column stacks.

## Layout & Spacing

The system runs on a strict **8-pixel horizontal and vertical spatial cadence** (with a secondary 4px step for dense micro-components like table rows, data tags, and inline badges).

### Viewport Layout Architecture
- **Sidebar Rail:** Fixed desktop width of `260px` anchored flush left.
- **Top Utility Bar:** Fixed height of `56px` spanning the remaining viewport width, providing uninterrupted access to global search, active system path, and administrative status.
- **Operational Canvas:** Fluid container occupying `100%` of remaining viewport space, padded at `24px` (`margin`) with a minimum layout width constraint of `1280px`.
- **Data Tables & Split Views:** Strict flex/grid alignments using `gutter-dense` (8px) for tightly coupled parameter groups and `gutter` (16px) between master-detail workspaces.

## Elevation & Depth

Visual hierarchy is communicated through **structural borders and tonal stratification** rather than heavy drop shadows:

- **Level 0 (Backdrop):** `#faf8fe` — Base canvas.
- **Level 1 (Card & Row Surfaces):** Pure `#ffffff` framed with a uniform `1px solid #e2e8f0` border.
- **Level 2 (Dropdowns, Command Menus, Modals):** Pure `#ffffff` surface, framed with a `1px solid #cbd5e1` outline and an ambient, low-profile blur: `0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -1px rgba(15, 23, 42, 0.04)`.
- **State Selection Elevation:** Active or selected items do not float upwards; instead, they anchor via a subtle 1px border shift to `#0153dc` alongside a background wash of `#dbe1ff` at 30% to 50% opacity.

## Shapes

The geometric vocabulary prioritizes industrial clarity:
- **Base Components (Inputs, Buttons, Cells):** `8px` (`0.5rem`) corner radius.
- **Containers & Data Tables:** `12px` (`0.75rem`) corner radius.
- **Outer Shell Workspaces & Modals:** `16px` (`1rem`) corner radius.
- **Pills & Status Indicators:** `9999px` (Full curve) reserved strictly for active sidebar navigation indicators, match quality tiers, and status pill badges.

## Components

### Top Utility Bar
- **Dimensions & Fill:** Height `56px`, fill `#ffffff`, bottom border `1px solid #e2e8f0`.
- **Search Element:** Universal input displaying `Search entities, engines, routes…`. Left-aligned with search glyph; enclosed in `#faf8fe` fill with a `1px solid #e2e8f0` border, rounding `8px`, width `420px`. Focus shifts border to `#0153dc`.
- **User Block:** Right-aligned pill container. Displays mono-spaced avatar abbreviation `DT`, separated by subtle mid-dots: `DT · Deeki T · Owner`. Color `#30323b`, text label weight `500`.

### Navigation Rail (Sidebar)
- **Background:** `#0f172a`.
- **Nav Item Base:** Full-width container item, height `36px`, rounded `8px` within padding inset, typography `Inter` `14px`, text color `#94a3b8`.
- **Active Navigation Pill:** Background `#0153dc`, text `#ffffff` font weight `600`. Includes left-edge accent or full pill fill with high-contrast text.

### Match Classification Chips
Pill-shaped badges (`height: 22px`, `padding: 0 8px`, `font: JetBrains Mono 11px font-weight: 500`) rendered with a 10% tinted background and a 1px solid border matching the match token:
- **Tier 1 (Made for your car):** Border/Text `#0153dc`, Fill `rgba(1, 83, 220, 0.08)`
- **Tier 2 (Same car, diff badge):** Border/Text `#0e7490`, Fill `rgba(14, 116, 144, 0.08)`
- **Tier 3 (Fits your engine):** Border/Text `#b45309`, Fill `rgba(180, 83, 9, 0.08)`
- **Tier 4 (Cross-brand alternate):** Border/Text `#7c3aed`, Fill `rgba(124, 58, 237, 0.08)`
- **Tier 5 (Dimension match):** Border/Text `#006e31`, Fill `rgba(0, 110, 49, 0.08)`

### Buttons
- **Primary:** Solid `#0153dc` background, `#ffffff` text, `8px` radius. Active hover: `#0146ba`. Height: `36px`.
- **Secondary / Ghost:** `#ffffff` surface, `1px solid #e2e8f0` border, `#30323b` text. Hover: `#f8fafc`.
- **Danger Action:** Solid `#a83836` background, `#ffffff` text.

### Data Inputs & Filter Bar
- **Inputs:** `#ffffff` surface, `1px solid #e2e8f0` border, `8px` corner radius, `36px` height. Typography: `Inter 14px`.
- **Filter Tags:** Removable parameters combining an `Inter` key label with a `JetBrains Mono` value string (e.g., `Chassis: [GK5]`).

### Data Tables & Spec Sheets
- **Header:** Height `36px`, background `#faf8fe`, text `label-xs` uppercase `#797a84`, bottom border `1px solid #e2e8f0`.
- **Row:** Height `44px`, background `#ffffff`, hover background `#f8fafc`. Bottom border `1px solid #e2e8f0`.
- **Selected Row:** Background `#dbe1ff` at 35% opacity, left cell border `#0153dc` (3px solid).