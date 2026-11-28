---
name: Fleet Command & Control
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
  secondary: '#575d77'
  on-secondary: '#ffffff'
  secondary-container: '#dbe1ff'
  on-secondary-container: '#5d637d'
  tertiary: '#3f475c'
  on-tertiary: '#ffffff'
  tertiary-container: '#575e75'
  on-tertiary-container: '#d1d8f3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#bfc5e2'
  on-secondary-fixed: '#141b30'
  on-secondary-fixed-variant: '#3f465e'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ed'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
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
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-ui:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  gutter-lg: 2rem
  margin: 2rem
  margin-mobile: 1rem
  margin-tablet: 1.5rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system drives an enterprise fleet telematics and master data console. The visual language blends Modern Corporate ergonomics with high-density precision engineering. Designed for logistics dispatchers, fleet operations directors, and data stewards who monitor mission-critical transport operations across thousands of assets, the interface prioritizes visual calm, scannable hierarchies, and high operational clarity.

The core identity establishes a high-contrast division between global system navigation (an authoritative, dark navy environment) and focused data manipulation surfaces (a warm, low-eyestrain luminous workspace). The aesthetic avoids decorative visual clutter, employing subtle tactile boundaries, clear status differentiation, and monospaced numeric structures that preserve ledger alignment across high-throughput data tables.

## Colors

The foundation is built on an active contrast model:

- **Primary Interactive**: `#0153dc` (Royal Blue) delivers immediate visual priority for primary actions, selected states, and navigational highlights. Its container companion `#dbe1ff` provides low-friction selection states and active button badges.
- **Surface & Canvas**: The root app background utilizes `#faf8fe` to reduce ocular fatigue across multi-monitor control centers. Data surfaces, floating cards, and modals sit on clean `#ffffff`. Secondary tint panels and table header tiers use `#f3f4fb`.
- **Global Control Shell (Sidebar)**: Built in deep `#0f172a` (Dark Navy). Selected navigation items rest on `#1e293b` with high-contrast text (`#cbd5e1` to `#ffffff`), maintaining a steadfast sense of spatial context.
- **Typography & Boundaries**: Primary body text is anchored by `#30323b`, secondary metadata and column labels leverage `#5d5f68`. Interactive field borders utilize `#c5c6d0`, while structural dividers and card perimeter strokes use hairline `#e6e7ee`.
- **Status Diagnostics**: Strict paired palettes deliver WCAG AAA conformant feedback across dense tabular data:
  - *Success / Active Operational*: `#006e31` text on `#e6f4ea` background
  - *Warning / Maintenance Flag*: `#8a5a00` text on `#fff4dc` background
  - *Critical / Fleet Telematics Fault*: `#a83836` text on `#fdecec` background
  - *Neutral / Inactive / Slate*: `#475569` text on `#f1f5f9` background

## Typography

The typography strategy leverages dual-type specialization:

1. **Inter** handles all semantic structural text, interactive system labels, table column headers, and administrative prose. Its neutral proportioning and clear geometric apertures guarantee high legibility under heavy data density.
2. **JetBrains Mono** serves as the authoritative engine for all telemetry: Vehicle Identification Numbers (VIN), license plates, timestamps, GPS coordinates, odometer readings, status codes, and financial currencies. This eliminates horizontal jitter in live-updating tables and facilitates rapid columnar scanning.

All sizes smaller than 12px require explicit letter-spacing tracking (`0.02em`) to ensure legibility on low-DPI enterprise displays.

## Layout & Spacing

The architecture operates on an asymmetric docked-canvas model. The fixed navigation sidebar commands a permanent 260px column (collapsible to 72px icon-rail on smaller desktop monitors).

- **Grid System**: The active content stage utilizes a 12-column fluid grid system bounded by `2rem` (32px) outer margins on full desktop, stepping down to `1.5rem` on tablet viewports.
- **Gutter Rhythm**: Default column gutters are locked at `1.5rem` (24px). Compact sub-dashboards and filter trays compress gutters to `1rem` (16px) to maximize horizontal data real estate.
- **Vertical Rhythm**: Built upon a strict 4px base increment. Primary card padding is normalized to `1.5rem` (24px), while table cells follow a tight `0.5rem` (8px) vertical by `1rem` (16px) horizontal spacing matrix for high-density listing.

## Elevation & Depth

Visual hierarchy rejects exaggerated drop shadows in favor of crisp architectural delineation:

- **Flat / Base Level**: Default background `#faf8fe` provides structural floor depth.
- **Card & Data Panels**: White surfaces (`#ffffff`) are bounded by a crisp 1px stroke of `#e6e7ee`, elevated with a brand-tinted ambient shadow: `0 4px 16px rgba(1, 83, 220, 0.04)`. This infuses warmth while preserving absolute border clarity.
- **Floating Controls & Popovers**: Context menus, tooltips, and flyout selectors leverage an intensified dual-layer shadow: `0 2px 4px rgba(15, 23, 42, 0.04), 0 12px 24px -4px rgba(15, 23, 42, 0.08)` bordered with `#e6e7ee`.
- **System Modal Overlay**: Centered orchestrations engage a full viewport scrim with `40%` dimming (`rgba(15, 23, 42, 0.40)`) paired with a `backdrop-filter: blur(4px)` to obscure background motion and focus administrative authorization.

## Shapes

The design system maintains a calculated hybrid geometric language:
- Standard UI containers, cards, and input controls carry an ergonomic `0.5rem` (8px) radius, conveying structural reliability without severe corners.
- Large floating containers and the primary in-app master dialog feature a distinct, welcoming `1.25rem` (20px) radius to demarcate contextual interruption.
- Segmented tab switchers, status pills, and numeric vehicle badges employ full pill rounding (`9999px`) to create an unmistakable contrast between operational indicators and structural interface boxes.

## Components

### Buttons
- **Primary**: Solid `#0153dc` with `#ffffff` text. Height: 40px, padding: `0 16px`, radius: 8px. Hover: `#0046b8`. Active: `#003b9b`. Focus-visible: 2px offset ring in `#0153dc`.
- **Secondary / Container**: Solid `#dbe1ff` with `#0153dc` text. Height: 40px, padding: `0 16px`, radius: 8px. Hover: `#cdd6ff`.
- **Subtle / Ghost**: Transparent background with `#30323b` text. Hover: `#f3f4fb`.

### Navigation Tabs (Pill Style)
- Container: Surface `#f3f4fb` with 4px inner padding, radius: 9999px.
- Active Item: Elevated `#ffffff` pill, radius: 9999px, text `#0153dc` (Inter SemiBold 13px), subtle shadow `0 2px 6px rgba(0,0,0,0.06)`.
- Inactive Item: Text `#5d5f68`, radius: 9999px, transparent background. Hover: text `#30323b`.

### Master Dialog & Centered Modals
- Container Width: Fixed `720px` max-width centered viewport.
- Geometry: Background `#ffffff`, radius: `20px`, padding: `32px` (2rem).
- Outline & Shadow: Hairline 1px border in `#e6e7ee`, ambient shadow `0 20px 48px -12px rgba(15, 23, 42, 0.18)`.
- Backdrop: Color `rgba(15, 23, 42, 0.40)` with `blur(4px)`.

### Form Inputs & Selectors
- Standard Input: 40px height, 8px radius, border 1px solid `#c5c6d0`, background `#ffffff`, text `#30323b` (Inter Regular 14px).
- Placeholder: Text `#5d5f68`.
- Focus State: Border 1.5px solid `#0153dc`, subtle glow ring `0 0 0 3px rgba(1, 83, 220, 0.12)`.
- Monospace Fields (VIN, Plates): Styled using `JetBrains Mono` 13px with tracking `0.02em`.

### Data Cards & Tables
- Master Card: `#ffffff` background, 1px `#e6e7ee` border, shadow `0 4px 16px rgba(1,83,220,0.04)`.
- Table Header: Background `#f3f4fb`, 36px height, text `#5d5f68` (Inter SemiBold 12px uppercase).
- Row Item: 48px height, alternating hover background `#faf8fe`, bottom border 1px solid `#f3f4fb`. Monospaced tabular figures right-aligned for financial/metric scanning.

### Status Chips & Badges
- Pill shape (9999px radius), padding: `2px 10px`, font: `JetBrains Mono` 11px Medium.
- *Active/Healthy*: Text `#006e31`, background `#e6f4ea`.
- *Warning/Service*: Text `#8a5a00`, background `#fff4dc`.
- *Critical/Fault*: Text `#a83836`, background `#fdecec`.
- *Idle/Unassigned*: Text `#475569`, background `#f1f5f9`.

### Dark Shell Sidebar
- Width: 260px fixed. Background `#0f172a`.
- Nav Items: 40px height, 8px radius, margin: `2px 12px`, padding: `0 12px`, text `#94a3b8`.
- Active Nav State: Background `#1e293b`, text `#ffffff`, left-aligned 3px `#0153dc` accent indicator.