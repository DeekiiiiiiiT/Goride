---
name: Calm Modern Workspace
colors:
  surface: '#0c1321'
  surface-dim: '#0c1321'
  surface-bright: '#323949'
  surface-container-lowest: '#070e1c'
  surface-container-low: '#151b2a'
  surface-container: '#19202e'
  surface-container-high: '#232a39'
  surface-container-highest: '#2e3544'
  on-surface: '#dce2f6'
  on-surface-variant: '#c3c6d4'
  inverse-surface: '#dce2f6'
  inverse-on-surface: '#2a3040'
  outline: '#8d909e'
  outline-variant: '#424752'
  surface-tint: '#aec6ff'
  primary: '#aec6ff'
  on-primary: '#002e6b'
  primary-container: '#5d8ef1'
  on-primary-container: '#00275e'
  inverse-primary: '#1e5bba'
  secondary: '#b6c4ff'
  on-secondary: '#05297a'
  secondary-container: '#264191'
  on-secondary-container: '#9db2ff'
  tertiary: '#4de082'
  on-tertiary: '#003919'
  tertiary-container: '#00a755'
  on-tertiary-container: '#003115'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#aec6ff'
  on-primary-fixed: '#001a43'
  on-primary-fixed-variant: '#004397'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#b6c4ff'
  on-secondary-fixed: '#00164e'
  on-secondary-fixed-variant: '#264191'
  tertiary-fixed: '#6dfe9c'
  tertiary-fixed-dim: '#4de082'
  on-tertiary-fixed: '#00210c'
  on-tertiary-fixed-variant: '#005227'
  background: '#0c1321'
  on-background: '#dce2f6'
  surface-variant: '#2e3544'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
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
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an understated, distraction-free digital workplace engineered for high-density automotive technical data, inventory metrics, and fleet monitoring. Rooted in modern functionalism with a dark, low-fatigue visual foundation, it balances deep navy canvases with crisp information architecture.

The interface projects deliberate calm, precision engineering, and computational speed. Interactions avoid decorative noise, relying on structured tabular grids, low-contrast bounding boundaries, and surgical accent colors to guide focus during sustained analytical workflows.

## Colors

The palette operates in strict dark mode, eliminating visual glare while maintaining WCAG AAA contrast ratios for body copy and technical tags.

### Core Canvas & Surfaces
- **Canvas Base (`#0b1220`)**: Root window and overall workspace backing.
- **Surface Container (`#111a2e`)**: Cards, flyouts, contextual drawers, and side panels.
- **Surface Dim / Hairline (`#1e293b`)**: Sub-dividers, table row separators, and structural layout guides.
- **Outline / Border (`#334155`)**: Interactive component strokes, input resting outlines, and card containment lines.

### Accent & Feedback Systems
- **Primary (`#5b8def`)**: Interactive focus, link text, active selections, and core button states. Paired with **Primary Container (`#1e3a8a`)** for selected tabs, active row highlights, and deep focus fills.
- **Success (`#4ade80`)**: Operational states and positive metrics, resting against background fill `#064e3b`.
- **Warning (`#fbbf24`)**: Inspections pending or service alerts, resting against background fill `#451a03`.
- **Error (`#f87171`)**: Critical mechanical failures, fault codes, or rejected statuses, resting against background fill `#450a0a`.

### Typography Colors
- **Text Primary (`#e2e8f0`)**: Headers, primary data cells, active titles, and form labels.
- **Text Secondary / Muted (`#94a3b8`)**: Microcopy, table column headers, helper labels, and inactive iconography.

## Typography

The type hierarchy employs **Inter** for all contextual narrative and form controls, combined with **JetBrains Mono** for alphanumeric technical data.

- **Automotive Reference Tokens**: VINs, engine serials (e.g., `1KR-FE`), chassis designations (e.g., `M900A`), and ECU fault flags must strictly use `code-md` or `code-sm`. Enable OpenType tabular numbers (`tnum`) across all numeric displays to preserve strict vertical column scanning in data tables.
- **Tracking & Proportion**: Set all upper-case micro-labels (`label-sm`) with a tracking value of `+0.04em`. Body copy retains neutral tracking with standard OpenType kerning.

## Layout & Spacing

This system utilizes an adaptable 12-column fluid grid system pinned to an 8px base rhythm (with 4px sub-increments for compact data density).

### Viewport Parameters
- **Desktop (1280px+)**: 12 columns, 24px margins, 16px gutters. Outer panels adhere to fixed 280px navigation sidebars with dynamic fluid workbench spans.
- **Tablet (768px - 1279px)**: 8 columns, 20px margins, 16px gutters. Context panels fold into docked bottom sheets or sliding overlays.
- **Mobile (Below 768px)**: 4 columns, 16px margins, 12px gutters. Multi-column metric groups collapse into vertically stacked list cards.

Spacing tokens (`space-*`) dictate internal element flow. Maintain `space-sm` (8px) within related groupings (e.g., input labels to inputs) and `space-md` to `space-lg` (16px–24px) between distinct modules.

## Elevation & Depth

Visual hierarchy is achieved through tonal stacking and low-contrast perimeter hairlines rather than heavy drop shadows.

- **Ground Level (Base)**: `#0b1220` (Canvas).
- **Surface Level 1 (Panels & Cards)**: `#111a2e`, framed by a 1px solid hairline of `#334155`. No ambient shadow is applied during resting state to prevent blur artifacts across dark OLED displays.
- **Surface Level 2 (Floating Overlays & Modals)**: `#111a2e` with an elevated 1px stroke of `#5b8def` at 30% alpha, reinforced by a directional drop shadow: `0 12px 32px -4px rgba(0, 0, 0, 0.65)`.
- **Internal Recesses (Inputs & Wells)**: Inset backgrounds drop directly to `#0b1220` with a 1px `#1e293b` perimeter, creating inverted dimensional anchoring.

## Shapes

The geometry follows strict dual-radius conventions:
- **Macro Elements (Cards, Modals, Primary Containers)**: 16px corner radius (`rounded-xl` in implementation scale).
- **Micro Elements (Buttons, Form Controls, Badges, Chips)**: 8px corner radius (`rounded-md` in implementation scale).
- **Dividers & Tab Indicators**: 0px straight cuts for hair-thin structural demarcation.

## Components

### Buttons
- **Primary**: Background `#5b8def`, text `#0b1220` (600 weight), 8px border radius, 0px border. Hover shifts background to `#7da8f7`. Active scales to 0.98.
- **Secondary / Ghost**: Background transparent, border 1px solid `#334155`, text `#e2e8f0`. Hover applies background `#1e293b` and border `#5b8def`.
- **Destructive**: Background `#450a0a`, border 1px solid `#f87171` (30% alpha), text `#f87171`.

### Data Cards
- Container background `#111a2e`, 16px corner radius, 1px perimeter border of `#334155`.
- Inner content padding uses `space-lg` (24px). Headers separate from body content via a 1px solid horizontal rule rendered in `#1e293b`.

### Badges & Technical Chips
- Corner radius locked to 8px; horizontal padding 8px, vertical padding 2px.
- **Vehicle Identifier Badges**: Background `#1e293b`, text `#e2e8f0`, border 1px solid `#334155`, rendered strictly in JetBrains Mono (`code-sm`).
- **Success Badge**: Background `#064e3b`, text `#4ade80`, 1px border `#4ade80` at 20% alpha.
- **Warning Badge**: Background `#451a03`, text `#fbbf24`, 1px border `#fbbf24` at 20% alpha.
- **Error Badge**: Background `#450a0a`, text `#f87171`, 1px border `#f87171` at 20% alpha.

### Input Fields
- Background `#0b1220`, border 1px solid `#334155`, radius 8px, height 40px, padding horizontal 12px.
- Text color `#e2e8f0`, placeholder color `#94a3b8` at 60% opacity.
- Focus state: border color `#5b8def` with an outer 2px focus ring of `#5b8def` at 20% opacity.

### Checkboxes & Radios
- Size 16px × 16px. Background `#0b1220`, border 1px solid `#334155`. Radius 4px for checkboxes, 50% for radios.
- Checked state: background `#5b8def`, check icon `#0b1220`.

### Data Grid Lists
- Header rows utilize `#0b1220` background with `#94a3b8` text in `label-sm` tracking.
- Row heights default to 44px. Separator lines use 1px solid `#1e293b`.
- Row hover: `#1e3a8a` at 20% alpha. Selected row: `#1e3a8a` fill at 40% alpha with a 2px left border accent in `#5b8def`.