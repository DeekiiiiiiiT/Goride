---
name: Roam Dominion Admin Console
colors:
  surface: '#faf8fe'
  surface-dim: '#dbd9df'
  surface-bright: '#faf8fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f9'
  surface-container: '#efedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1b1b20'
  on-surface-variant: '#434655'
  inverse-surface: '#2f3035'
  inverse-on-surface: '#f2f0f6'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#003ea9'
  on-primary: '#ffffff'
  primary-container: '#0153dc'
  on-primary-container: '#ced8ff'
  inverse-primary: '#b4c5ff'
  secondary: '#515f78'
  on-secondary: '#ffffff'
  secondary-container: '#d2e0fe'
  on-secondary-container: '#55637d'
  tertiary: '#3a485c'
  on-tertiary: '#ffffff'
  tertiary-container: '#526074'
  on-tertiary-container: '#ccdbf3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#b9c7e4'
  on-secondary-fixed: '#0d1c32'
  on-secondary-fixed-variant: '#39475f'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#faf8fe'
  on-background: '#1b1b20'
  surface-variant: '#e3e2e7'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
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
    letterSpacing: '0'
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
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  mono-data-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  mono-data-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
  mono-data-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-dense: 1rem
  margin: 2rem
  margin-compact: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a focused, high-clarity operational environment for enterprise fleet and resource administration. Designed primarily for high-density, multi-window desktop usage at 1440px viewport widths, it pairs purposeful restraint with architectural precision. 

The aesthetic style merges **Modern Corporate** structure with **Soft Tonal Elevation**:
- A contrast-grounded dark navy primary navigation anchor provides clear spatial orientation.
- Crisp, clinical content canvases in soft lilac-tinted white (`#faf8fe`) alleviate long-session eye fatigue.
- Structured data views leverage tabular precision and disciplined typographic hierarchies.
- Surface transitions avoid heavy bevels or harsh dropped shadows, favoring gentle 1px architectural dividers and faint, cool-tinted ambient glows.
- Status signaling is assertive yet calm, relying on paired saturated markers against tinted contextual containers.

## Colors

The palette balances deep nautical authority against luminous surface tiers, maintaining strict contrast compliance for dense administrative workflows.

### Core Canvas & Structure
- **Primary Brand**: `#0153dc` — Interactive actions, active selection nodes, primary metric indicators.
- **Primary Container**: `#dbe1ff` — Subtle active states, multi-select highlights, secondary pills.
- **Sidebar Surface (Dark Navy)**: `#0a192f` — Global persistent rail and collapsed navigation background.
- **Sidebar Accent/Hover**: `#132644` — Interactive row hover and focused tree nodes within the navy rail.
- **Application Canvas**: `#faf8fe` — The root desktop canvas backdrop.
- **Surface Layer (Card/Table)**: `#ffffff` — Elevated functional workspaces and card modules.
- **Tint Panel Surface**: `#f3f4fb` — Sub-inspector drawers, secondary stat panels, embedded toolbars.
- **Border Default**: `#e6e7ee` — 1px architectural divider across all cards, table headers, and structural seams.

### Semantic Tones & Status Containers
- **Success Tone**: `#006e31` text & icons on `#e6f4ea` background.
- **Warning Tone**: `#8a5a00` text & icons on `#fff4dc` background.
- **Error Tone**: `#a83836` text & icons on `#fdecec` background.
- **Slate (Neutral Informational)**: `#475569` text & icons on `#f1f5f9` background.

## Typography

The type scale combines **Inter** for operational interfaces, executive reporting, and structured body copy, with **JetBrains Mono** reserved exclusively for data precision: SKU identifiers, serial tracks, raw part numbers, system timestamps, and API keys.

- **Inter**: Set font-feature-settings to `cv02`, `cv03`, `cv04`, `cv11` to reinforce distinct glyph forms (e.g., distinguishing lowercase `l` from uppercase `I` and numeral `1`).
- **JetBrains Mono**: Used with tabular figures enabled by default to ensure precise vertical column alignment across data tables and comparative audit logs.
- Hierarchy is achieved by disciplined shifts in weight (`400` to `600`) and subtle letter-spacing compression on larger scales rather than aggressive font-size leaps.

## Layout & Spacing

The viewport architecture is centered on a fixed 1440px desktop baseline with fluid response for expanded enterprise monitors.

### Layout Architecture
- **Navigation Rail / Sidebar**: Fixed 260px width anchored to the left viewport boundary (`#0a192f`). Collapses to a 72px icon rail for dense data analysis workflows.
- **Main Working Area**: Fluid remaining width with an application-level gutter of `1.5rem` (24px) and outer margin of `2rem` (32px).
- **Inspector Panel / Drawer**: Optional right-docked 380px panel using `#f3f4fb` with a 1px `#e6e7ee` left border.
- **Grid Layout**: 12-column system across the main viewport canvas with `1.5rem` gutters. For high-density data tables and sub-dashboards, toggle to `gutter-dense` (`1rem`).

### Spacing Rhythm
- **Micro Spacing (`0.25rem` – `0.5rem`)**: Tight grouping between icons and labels, button inner vertical padding, and inline badges.
- **Component Padding (`1rem` – `1.5rem`)**: Standard interior card padding, modular table row heights, and modal headers.
- **Structural Separation (`1.5rem` – `2rem`)**: Distance separating discrete analytical cards, metrics bars, and table blocks.

## Elevation & Depth

Visual depth avoids heavy, generic drop shadows. Instead, it relies on crisp 1px borders, subtle tint differentials, and soft ambient glows tinted with the primary hue:

- **Surface Level 0 (Canvas)**: Background canvas at `#faf8fe`. Zero shadow, flat foundation.
- **Surface Level 1 (Panels & Trays)**: Embedded toolbars, summary bands, and secondary drawers at `#f3f4fb` framed by a 1px solid `#e6e7ee` border.
- **Surface Level 2 (Cards & Data Grids)**: Primary workspaces at `#ffffff` with a 1px solid `#e6e7ee` border and a brand-tinted soft ambient shadow: `0 4px 16px rgba(1, 83, 220, 0.04)`.
- **Surface Level 3 (Dropdowns & Popovers)**: `#ffffff` surface, 1px solid `#e6e7ee` border, and an elevated shadow: `0 8px 24px rgba(1, 83, 220, 0.08)`.
- **Surface Level 4 (Modals & Dialogs)**: `#ffffff` surface, 1px solid `#e6e7ee` border, accompanied by `0 16px 36px rgba(10, 25, 47, 0.16)` and a muted dark navy backdrop scrim: `rgba(10, 25, 47, 0.45)`.

## Shapes

The design system standardizes on a balanced geometric profile where standard components use 8px (`0.5rem`) corner rounding, while core card surfaces and containment panels adopt 16px (`1rem`):

- **Workspace Cards & Drawers**: 16px (`1rem` / `rounded-lg`) corner radius for all primary containers, analytical cards, and modal canvases.
- **Controls & Form Elements**: 8px (`0.5rem`) corner radius for input fields, primary buttons, dropdown triggers, and interactive elements.
- **Chips, Badges & Micro-Pills**: Continuous pill-shaped corners (`9999px`) for quick-scan categorical indicators and semantic status tags.
- **Table Cells & Segmented Controls**: Interior segment items use 6px corner radius nestled inside an 8px perimeter shell.

## Components

All iconography across components standardizes on **Material Symbols Outlined** at 20px default sizing (16px inside compact pills/inputs, 24px inside global navigation).

### Buttons
- **Primary**: Solid `#0153dc` fill, `#ffffff` text, 8px radius, height 40px (compact 32px), `space-md` horizontal padding. Hover state: darken to `#0045be`. Focus: `0 0 0 3px #dbe1ff`.
- **Secondary / Outlined**: `#ffffff` surface, 1px `#e6e7ee` border, `#0153dc` text. Hover: `#f3f4fb` background, border `#0153dc`.
- **Ghost**: Transparent fill, `#475569` text. Hover: `#f1f5f9` fill, `#0a192f` text.

### Data Display Cards
- Background `#ffffff`, 16px radius, 1px solid `#e6e7ee` border, shadow `0 4px 16px rgba(1, 83, 220, 0.04)`.
- Header: Flex container with 18px Inter Semi-Bold (`#0a192f`), contextual action slots, separated by an optional 1px `#e6e7ee` bottom border or 16px padding clearance.

### Input Fields & Controls
- **Text Inputs**: Height 40px, background `#ffffff`, 1px solid `#e6e7ee` border, 8px radius, padding `0.5rem 0.75rem`. Text: Inter 14px (`#0a192f`), placeholder `#475569`. Focus state: border `#0153dc`, ring `0 0 0 3px #dbe1ff`.
- **Checkboxes & Radios**: 18px bounding box, 4px corner radius for checkboxes, circle for radios. Unchecked: 1.5px border `#e6e7ee`. Checked: solid `#0153dc` fill with white checkmark/dot.
- **Segmented Filter Bars**: Outer container `#f3f4fb` with 1px `#e6e7ee` border, inner active tab `#ffffff` with 6px radius and soft shadow `0 2px 4px rgba(1, 83, 220, 0.06)`.

### Status Badges & Chips
- Pill geometry (`9999px` radius) with 4px vertical, 10px horizontal padding.
- Uses JetBrains Mono 11px or Inter 12px Medium.
- **Success**: `#e6f4ea` background with `#006e31` text and dot indicator.
- **Warning**: `#fff4dc` background with `#8a5a00` text and dot indicator.
- **Error**: `#fdecec` background with `#a83836` text and dot indicator.
- **Slate / Neutral**: `#f1f5f9` background with `#475569` text.

### Data Tables & Data Lists
- Table header: Height 40px, `#f3f4fb` background, uppercase Inter 11px label (`#475569`), bottom border 1px solid `#e6e7ee`.
- Table rows: Height 48px standard, background `#ffffff`, hover background `#faf8fe`, row border 1px solid `#e6e7ee`.
- Numeric, chronological, serial, and ID columns styled with `JetBrains Mono` 12px (`#0a192f`).