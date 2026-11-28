---
name: Dominion Admin Engine
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
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#005323'
  on-tertiary: '#ffffff'
  tertiary-container: '#006e31'
  on-tertiary-container: '#91eea1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#9af7aa'
  tertiary-fixed-dim: '#7fda90'
  on-tertiary-fixed: '#00210a'
  on-tertiary-fixed-variant: '#005323'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ed'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The design system establishes a high-density, analytical console tailored for technical operators and fleet research specialists managing vehicle metadata. The aesthetic balances high-focus utility with calm ergonomics: clarity over ornamentation, strict visual hierarchy, and instant scannability. 

The environment adopts a **Modern Technical Workspace** approach: crisp contrast, micro-elevation, and structured mechanical telemetry. The application anchors its navigation with an authoritative deep navy utility spine on the left, contrasting against an expansive, airy workspace canvas (#FAF8FE) engineered to minimize visual fatigue across long operational sessions. Information architecture relies on rigid tabular alignment, clear status badging, and explicit monospaced telemetry tokens for serials, VINs, and part references.

## Colors
The palette balances active operational blue against clean analytical paper tones and semantic status tiers.

- **Primary Canvas & Surfaces**: Base canvas background is `#FAF8FE`. Base panels and active cards use pure white `#FFFFFF` paired with hairline borders `#E6E7EE`. Secondary tinted groupings and contextual side-drawers use `#F3F4FB`.
- **Primary Brand Interactive**: `#0153dc` serves as the primary focal color for primary action buttons, active navigation markers, and focused input indicators. Pair with `#DBE1FF` for low-prominence container fills and highlighted states.
- **Typography & Content Hierarchy**: Primary body text and headers run on neutral `#30323B`. Supporting metadata, section captions, and hints resolve to `#5D5F68`. Default boundary lines and unselected input strokes rest at `#C5C6D0`.
- **Sidebar Surface**: The left persistent administrative rail utilizes a dedicated deep navy surface `#0B132B` (with `#1C2541` hover states and `#3A506B` divider tiers) to compartmentalize navigation from workbench data.
- **Semantic Status Spectrum**:
  - *Success*: Text/Icon `#006E31` on `#E6F4EA` container.
  - *Warning / Attention*: Text/Icon `#8A5A00` on `#FFF4DC` container.
  - *Critical / Error*: Text/Icon `#A83836` on `#FDECEC` container.
  - *Neutral / Inactive*: Text/Icon `#475569` on `#F1F5F9` container.

## Typography
The system enforces a dual-font structure:

1. **Inter** powers primary operational layouts, headers, form controls, and narrative metadata.
   - **Page Titles**: 26px semibold (-0.015em tracking) creates immediate contextual grounding without overwhelming the working area.
   - **Section Headers & Subsections**: 18px semibold.
   - **Standard Body & Table Cells**: 15px regular with balanced 22px line-height for uninterrupted table scanning.
   - **Micro-Copy, Captions, Form Hints**: 13px regular in muted `#5D5F68`.

2. **JetBrains Mono** is reserved exclusively for structured mechanical telemetry, preventing misread characters. Use it across:
   - Part numbers and frame codes.
   - Engine displacements, VINs, and serial IDs.
   - Timestamps, changelog hashes, and ISO operational dates.

## Layout & Spacing
Designed desktop-first targeting 1440px displays with an anchored primary shell:
- **Navigation Shelf**: Fixed 260px wide dark navy rail pinned flush left.
- **Operational Header**: Pinned 64px tall topbar spanning from the inner edge of the sidebar across the remaining viewport.
- **Main Stage**: Max content width of 1120px centered horizontally within the remaining viewport canvas, framed by minimum 32px (`space-xl`) outer margins.
- **Data Grids & Table Layouts**: Built upon an 8px structural base unit. Internal card padding is consistently 24px (`space-lg`), with a 16px (`gutter`) separation between structural grid cards and dashboard metrics.
- **Adaptive Breakpoints**:
  - Below 1280px: The main workspace container fluidly collapses lateral margins to 16px (`space-md`), retaining the 1120px cap.
  - Below 1024px: The sidebar collapses into an icon-only 64px utility bar, yielding full canvas real estate to active data inspection sheets.

## Elevation & Depth
Elevation is maintained using low-contrast hairline borders combined with a primary ambient tint shadow. Heavy dark dropshadows are forbidden to maintain high optical clarity.

- **Level 0 (Canvas Base)**: `#FAF8FE` flat surface.
- **Level 1 (Cards, Tables & Data Modules)**: White `#FFFFFF` with a crisp 1px solid `#E6E7EE` border and ambient soft drop: `0 4px 16px rgba(1, 83, 220, 0.04)`.
- **Level 2 (Context Panels & Tint Pods)**: Recessed `#F3F4FB` without shadow, defined by a 12px structural corner radius for nested grouping inside Level 1 cards.
- **Level 3 (Overlays, Flyouts & Modals)**: White `#FFFFFF` surface, 1px `#C5C6D0` border, elevated by `0 12px 32px rgba(48, 50, 59, 0.08)`.

## Shapes
Geometry is disciplined, using intentional radiuses based on hierarchy:
- **Base Cards & Structural Containers**: 16px border-radius (`rounded-xl` equivalent).
- **Nested Data Tint Panels**: 12px border-radius (`rounded-lg` equivalent).
- **Interactive Controls (Buttons, Text Inputs, Search Bars)**: 10px corner radius.
- **Status Badges, Trust Chips, & Category Tags**: Full pill styling (`rounded-full` / 9999px) to immediately signal non-editable, categorical metadata.

## Components

### Global Topbar & Left Sidebar
- **Sidebar**: Dark Navy `#0B132B`. Brand header: `Dominion · Roam Admin Console`. Section headers (11px JetBrains Mono uppercase, letter spacing 0.08em, text color `#5D5F68`): `MASTER DATA`, `ENGINES`, `DISTRIBUTION`, `PLATFORM`, `BACK OFFICE`. Navigation items feature Material Symbols Outlined (20px) with 12px horizontal padding and 8px item gap.
- **Topbar**: `#FFFFFF` surface with hairline bottom border `#E6E7EE`. Left side houses a universal search input with an integrated `⌘K` keyboard shortcut badge. Right cluster features a theme toggle icon button and the operator badge: `Deeki T · Owner`.

### Buttons
All standard buttons are strictly 44px in height with a 10px corner radius, standard 18px horizontal padding, and Inter 14px semibold typography.
- **Primary**: Solid `#0153DC` fill, `#FFFFFF` text, no border. Hover: `#0047C2`.
- **Secondary**: `#FFFFFF` fill, `#30323B` text, 1px `#C5C6D0` border. Hover: `#F3F4FB`.
- **Danger**: `#FFFFFF` fill, `#A83836` text, 1px `#A83836` border. Hover: `#FDECEC`.

### Trust Verification Pills
Used to communicate operator verification status across telemetry tables:
- **Confirmed**: Green `#006E31` on `#E6F4EA` with a leading `check` icon.
- **Confirmed · You Checked It**: `#FFFFFF` fill, 1px `#006E31` border, `#006E31` text, leading `person_check` icon.
- **Needs Checking**: Amber `#8A5A00` text on `#FFF4DC` container with a leading `pending` icon.
- **Browser Check**: Blue `#0153DC` text on `#DBE1FF` container with a leading `open_in_browser` icon.
- **Not Started Yet**: Slate `#475569` text on `#F1F5F9` container with a leading `horizontal_rule` icon.

### Result Status Pills
Used for engine ingest and validation outcomes:
- **Saved**: Text `#006E31`, fill `#E6F4EA`.
- **Already on File**: Text `#475569`, fill `#F1F5F9`.
- **Needs You**: Text `#8A5A00`, fill `#FFF4DC`.
- **Not a Roam Part Type**: Transparent fill, 1px border `#C5C6D0`, text `#5D5F68`.

### Form Fields & Inputs
- **Inputs**: 44px height, `#FFFFFF` fill, 1px `#C5C6D0` border, 10px corner radius. Placeholder text `#5D5F68`. On focus: 1.5px `#0153DC` stroke with an ambient 2px `#DBE1FF` outer ring.
- **Monospaced Input Variants**: Same dimension specs but rendering JetBrains Mono 13px for engine part code overrides.

### Selection Controls
- **Checkboxes & Radios**: 18px standard touch box with 4px radius for checkboxes and full circle for radios. Active checkmark/radio dot colored `#FFFFFF` against `#0153DC` fill. Inactive state: 1.5px `#C5C6D0` border on `#FFFFFF` ground.