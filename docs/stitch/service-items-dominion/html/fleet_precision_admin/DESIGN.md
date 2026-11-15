---
name: Fleet Precision Admin
colors:
  surface: '#faf9ff'
  surface-dim: '#d5d9ea'
  surface-bright: '#faf9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edfe'
  surface-container-high: '#e4e8f8'
  surface-container-highest: '#dee2f3'
  on-surface: '#161b27'
  on-surface-variant: '#434655'
  inverse-surface: '#2b303d'
  inverse-on-surface: '#edf0ff'
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
  tertiary: '#414755'
  on-tertiary: '#ffffff'
  tertiary-container: '#585f6d'
  on-tertiary-container: '#d3d9ea'
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
  tertiary-fixed: '#dce2f3'
  tertiary-fixed-dim: '#c0c6d7'
  on-tertiary-fixed: '#151c28'
  on-tertiary-fixed-variant: '#404754'
  background: '#faf9ff'
  on-background: '#161b27'
  surface-variant: '#dee2f3'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-sm:
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
  margin: 2rem
  gutter-mobile: 1rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
This design system governs an enterprise fleet maintenance workflow application focused on template composition, shop supplies orchestration, and conditional parts planning. The user base consists of maintenance coordinators, shop managers, and fleet technical directors managing high-throughput repair operations.

The aesthetic blends the technical clarity of Linear, the structural precision of Stripe Dashboard, and the quiet document-like composure of Notion:
- **Atmosphere:** Calm, utilitarian, daylight-bright, and uncluttered. Dense maintenance data is neutralized by ample visual breathing room.
- **Tone:** Methodical, reliable, and unobtrusive. The interface recedes to allow critical mechanical data (part counts, shop supplies, conditional allocations) to take priority.
- **Styling Architecture:** Modern corporate minimalism built on strict grid baselines, subtle low-contrast boundaries (`#e2e8f0`), distinct dark navigation framing against an airy canvas, and restrained single-point accent highlights. All typography uses standard sentence case to avoid aggressive visual alerts.

## Colors
The palette balances an ultra-clear, daylight work surface with high-legibility charcoal typography and an authoritative navy sidebar anchor.

### Core Functional Roles
- **Primary (`#0153dc`):** Interactive focal points, primary workflow buttons, active radio selections, keyboard focus rings, and active tab indicator underlines.
- **Secondary (`#0f172a`):** Grounded slate navy reserved exclusively for primary application shell navigation, deep drawers, and top-level structural chrome.
- **Tertiary Accent (`#e8eeff`):** Soft contextual tint used for interactive row selection highlights, "Usually needed" tags, and table grouping header backgrounds.
- **Neutral Foreground (`#1f2430`):** Charcoal baseline for primary headers and data values. Secondary helper strings resolve to slate neutral (`#6b7280`), while metadata guides sit at `#94a3b8`.
- **Canvas Base (`#f8f9fc`):** An airy, warm-tinted cool grey canvas that establishes separation from pure white (`#ffffff`) surfaces.

### Semantic Tones
- **Success (`#16a34a`, Background `#ecfdf5`):** Complete tasks, verified inventory balances, and confirmed template attachments.
- **Warning (`#d97706`, Background `#fffbeb`):** "May need" conditional allocations, shop supply threshold warnings, and pending inspections.
- **Danger (`#dc2626`, Background `#fef2f2`):** Missing required parts, safety exclusions, out-of-stock shop items, and destructive actions.

## Typography
Typography is set entirely in **Inter** across all UI tiers. Monospace formatting is strictly prohibited; SKU designations, part serials, torque specifications, and job template codes are rendered cleanly in proportional body styling with tabular numeric layout (`font-variant-numeric: tabular-nums`).

Rules:
- Apply sentence case across all headings, action triggers, column headers, and badges (e.g., "Add shop supply" not "ADD SHOP SUPPLY").
- Maintain high contrast between heading tiers using weight changes (`600` for titles, `400`–`500` for operational reading).
- Never track out lower-case strings artificially; maintain Inter's native metrics with subtle negative tracking applied strictly to headings `18px` and above.

## Layout & Spacing
The layout relies on a fixed-width fluid container architecture optimized for high-density administrative oversight. 

### Grid & Canvas Structure
- **Global Canvas:** Fixed 260px left sidebar anchor, with remaining viewport spanning a responsive, centered content stage capped at 1440px width.
- **Section Rhythm:** Major functional zones (e.g., template overview vs. conditional part tables) are decoupled by generous 32px (`space-xl`) vertical drops.
- **Container Insets:** All cards, side sheets, and modal views strictly enforce 24px (`space-lg`) internal structural padding. Compact utility rows and nested part lists reduce internal spacing to 12px (`space-md`) vertical padding.

### Breakpoint Scaling
- **Desktop (≥ 1024px):** Standard 12-column template layout with persistent side navigation.
- **Tablet (768px – 1023px):** 8-column layout. Sidebar collapses to an icon rail or full-width sheet; card padding steps down to 20px.
- **Mobile (< 768px):** Single-column stacked stream. Gaps normalize to 16px (`gutter-mobile`), outer gutters to 16px (`margin-mobile`), and nested multi-column inputs wrap to full width.

## Elevation & Depth
Elevation mimics precision physical index cards resting on a matte drafting desk. Avoid heavy drop-shadows or stark dark borders.

### Surface Hierarchy & Shadow Structure
1. **Base Layer (Level 0):** Canvas `#f8f9fc`. Un-elevated, structural ground.
2. **Resting Cards & Table Containers (Level 1):** Solid `#ffffff` background with a subtle dual-layer shadow:
   `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 10px 25px -5px rgba(15, 23, 42, 0.06);`
   Border: 1px solid `#e2e8f0`.
3. **Hover & Interactive Tiers (Level 2):** Applied to active list cards, draggable maintenance items, or table row focus:
   `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 14px 28px -6px rgba(15, 23, 42, 0.08);`
   Border: 1px solid `#cbd5e1`.
4. **Drawers, Slide-outs & Dropdowns (Level 3):**
   `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.05);`
5. **Modal Overlays (Level 4):** Semi-opaque backdrop (`rgba(15, 23, 42, 0.45)` with 4px backdrop blur) supporting a central dialog at Level 3 elevation.

## Shapes
Geometry uses clean, rounded forms calibrated by component scale:

- **Large Structural Containers (16px / `rounded-xl`):** All cards, sliding slide-over drawers, and modal dialogs.
- **Interactive Controls (10px / Custom Form Scale):** Standard form inputs, selects, segmented controllers, and primary/secondary buttons.
- **Micro Tags & Status Badges (9999px / Full Pill):** Part condition tags ("May need", "Usually needed"), inventory status badges, and table filters.
- **Icon Tile Backdrops (8px):** Square or rounded tiles housing Material Symbols Rounded iconography with a 40px outer dimension.

## Components

### Buttons
- **Primary:** Background `#0153dc`, text `#ffffff`, height 40px, corner radius 10px, padding 0 16px. Hover: `#0146b8`. Active: `#013b9c`. Focus: 2px ring `#0153dc` with 2px offset.
- **Secondary / Outline:** Background `#ffffff`, border 1px solid `#e2e8f0`, text `#1f2430`. Hover: `#f8f9fc` with border `#cbd5e1`.
- **Ghost / Utility:** Transparent background, text `#6b7280`. Hover: `#f1f5f9` with text `#1f2430`.
- **Pill Reorder Controls:** Up/down micro arrow buttons styled as rounded pills (height 28px) with accessible keyboard tab indices and visual outline states.

### Badges & Chips
- Fully rounded 9999px pill containers with 12px horizontal padding and 4px vertical padding.
- **"May need" Pill:** Background `#fffbeb`, text `#d97706`, border 1px solid `#fef3c7`.
- **"Usually needed" Pill:** Background `#e8eeff`, text `#0153dc`, border 1px solid `#d0deff`.
- **System Tags:** Background `#f1f5f9`, text `#475569`, border 1px solid `#e2e8f0`.

### Form Fields & Inputs
- **Text & Select Inputs:** Height 40px, corner radius 10px, 1px solid `#e2e8f0`, background `#ffffff`, text `#1f2430`.
- **Placeholder:** `#94a3b8`.
- **Focus State:** 1px solid `#0153dc` with a 3px outer glow ring of `rgba(1, 83, 220, 0.15)`.
- **Helper Labels:** 13px Inter (`label-md`), color `#6b7280`, placed 6px above the field.

### Maintenance Data Cards
- Pure white container with 24px internal padding, 16px radius, and standard Level 1 elevation.
- Dividers between template sections use hairline 1px borders (`#f1f5f9`).
- Card headers feature an integrated toolbar housing quick-search inputs, filter chips, and template revision indicators.

### Checkboxes & Radios
- Size: 18x18px, border radius 5px for checkboxes, 9999px for radio items.
- Border: 1.5px solid `#cbd5e1`. Checked state: background `#0153dc` with white check or radio glyph.
- Selected table rows trigger an entire row tint of `#e8eeff` with an active left edge border of 3px in `#0153dc`.

### Iconography & System Tiles
- Use **Material Symbols Rounded** with optical size 20, weight 400.
- When placed in lists or headers, display icons inside soft-tinted 36x36px or 40x40px rounded squares (`#f1f5f9` or `#e8eeff`) to anchor visual scanning.