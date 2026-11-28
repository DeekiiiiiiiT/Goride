---
name: Roam Dominion Admin Console
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
  secondary: '#585e6f'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff4'
  on-secondary-container: '#5c6274'
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
  secondary-fixed: '#dce2f6'
  secondary-fixed-dim: '#c0c6da'
  on-secondary-fixed: '#151b2a'
  on-secondary-fixed-variant: '#404757'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ed'
typography:
  display-lg:
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
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
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
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
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
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a high-precision, low-fatigue workspace crafted for operational clarity, database master records, and systems infrastructure administration. It balances the rigor of data-heavy enterprise tooling with an airy, calm, modern architectural presence.

Targeted at database managers, infrastructure leads, and workspace operations directors, the experience avoids both the sterile brutality of legacy enterprise software and the excessive playfulness of consumer apps. The aesthetic merges **Modern Corporate** efficiency with **Tactile Minimalist** clarity:
- **Calm & Unhurried:** Generous structural breathing room around high-density data matrices prevents visual fatigue during extended administrative shifts.
- **Architectural Division:** High-contrast structural anchoring via a deep navy navigation core paired with soft, sunlit canvas layers (`#FAF8FE`).
- **Precision Engineering:** Monospaced identifiers, crisp hairlines, and restrained chromatic signaling establish total confidence in data integrity and administrative actions.

## Colors

The palette leverages a structured light canvas anchored by a deep midnight navigation shell and purposeful functional signaling.

### Core Canvas & Surfaces
- **Canvas Background (`#FAF8FE`):** Soft, tinted off-white that eliminates screen glare while providing subtle warmth.
- **Surface Elevation 0 (`#FFFFFF`):** Base pure-white for content cards, data tables, and modal sheets.
- **Sub-Surface Panels (`#F3F4FB`):** Tinted tertiary surface for filter strips, metadata inspector wells, and contextual drawers.
- **Sidebar Core (`#0B1220` base, `#111A2E` elevated hover/active):** Architectural boundary establishing spatial stability and navigation focus.

### Chromatic Accents & State Roles
- **Primary Cobalt (`#0153DC`):** Key interaction point, primary actions, active selection boundaries, and focused states.
- **Primary Container (`#DBE1FF`):** Low-contrast selection fills, active tree nodes, and highlighted table cells.
- **Slate Secondary (`#475569` on `#F1F5F9`):** Neutral administrative tags, audit trails, and default status badges.
- **Success (`#006E31` on `#E6F4EA`):** Operational health, active replica clusters, and validated syncs.
- **Warning (`#8A5A00` on `#FFF4DC`):** Deprecation notices, quota thresholds, and sync lags.
- **Critical / Error (`#A83836` on `#FDECEC`):** Data locks, deletion actions, validation failures, and node down-states.

### Typography & Border Tokens
- **Text Dominant:** `#30323B` (rich mineral slate; provides softer contrast than pure `#000000`).
- **Text Muted / Secondary:** `#5D5F68` (supporting labels, timestamps, and column headers).
- **Hairline Border:** `#E6E7EE` (1px crisp dividing boundary).

## Typography

The typographic hierarchy prioritizes systematic scanning and legibility across high-density data matrices.
- **Inter** handles all proportional interface typography (headers, interactive controls, body copy, and form labels). Tabular numerals (`tnum`) must be forced on all numerical values, monetary units, and metric meters.
- **JetBrains Mono** is strictly reserved for deterministic data: primary database keys, UUIDs, SKUs, API endpoints, schema definitions, and timestamps/ISO dates.
- Display hierarchy is intentionally condensed; operational admin consoles avoid oversized hero treatments in favor of rapid vertical orientation and information density.

## Layout & Spacing

The layout is built for desktop-first workflows with a baseline canvas target of 1440px wide, scaling fluidly across wider multi-monitor workstation setups.

### Structural Framework
- **Master Navigation Core:** Fixed-width 260px persistent sidebar pinned to the left canvas edge (`#0B1220`). Collapses to an 72px icon rail on smaller laptop screens (under 1200px).
- **Primary Grid:** 12-column fluid grid across the remaining content viewport, bounded by a 32px (`2rem`) outer margin and 24px (`1.5rem`) gutters.
- **Inspector / Detail Dock:** Optional 360px contextual sliding drawer docked to the right edge for deep master record inspection without losing context in the parent matrix.

### Spacing Rhythm
A rigid 8px system (with 4px half-step sub-spacing) dictates all internal relationships:
- Compact elements (table rows, button groups, badge chips) leverage `space-xs` (4px) and `space-sm` (8px).
- Component interior padding relies on `space-md` (16px) or `space-lg` (24px).
- Major container sectioning across the master console consumes `space-xl` (32px).

## Elevation & Depth

Visual order is articulated via structural hairlines, tinted container tiers, and soft ambient light dispersion rather than aggressive drop shadows.

### Elevation Hierarchy
- **Level 0 (App Canvas):** `#FAF8FE`. Base non-interactive layout ground.
- **Level 1 (Structural Cards & Data Grid):** Pure `#FFFFFF` surface bounded by a crisp 1px hairline border (`#E6E7EE`) and elevated with an ultra-soft blue-tinted shadow:
  `box-shadow: 0 4px 16px 0 rgba(1, 83, 220, 0.04);`
- **Level 2 (Dropdowns, Menus, & Floating Command Bars):** Elevated `#FFFFFF` surfaces with subtle border hairlines and multi-layered diffused depth:
  `box-shadow: 0 10px 30px -4px rgba(11, 18, 32, 0.08), 0 4px 12px -2px rgba(1, 83, 220, 0.04);`
- **Level 3 (Modals & Destructive Confirmation Shields):** Deep overlay backdrops using `#0B1220` with 40% alpha and a 4px backdrop blur to direct total cognitive focus to the critical action.
- **Inset Tier (Context Panels & Code Blocks):** Subtle `#F3F4FB` inset background with a 1px border of `#E6E7EE` and zero shadow, communicating containment.

## Shapes

The design uses a clean geometry that balances tactile comfort with structural precision:
- **Standard Cards & Primary Panes:** 16px corner radius (`rounded-lg`), delivering a soft, modern perimeter that separates high-density data modules.
- **Sub-Panels & Tint Wells:** 12px corner radius (`rounded-md`), framing inline inspectors, nested telemetry blocks, and segmented filter strips.
- **Inputs, Buttons, and Selectors:** 8px corner radius (`rounded-sm`), ensuring interactive targets remain distinct and crisp.
- **Status Chips, Avatar Badges, & Counter Pills:** 9999px fully rounded pill radius, distinguishing metadata badges from rectangular data cells and buttons.

## Components

### Buttons
- **Primary:** Solid `#0153DC` background, `#FFFFFF` text, 8px radius, medium weight (`Inter`, 500/600). Hover shifts to `#0047C0`; active state drops by 1px scale. Focus ring: 3px `#DBE1FF` outer glow.
- **Secondary / Subtle:** `#FFFFFF` background with 1px `#E6E7EE` border and `#30323B` text. Hover applies `#F3F4FB` surface tint.
- **Destructive:** `#FDECEC` background, `#A83836` label, borderless or 1px `#A83836` at 20% opacity. Hover transitions to solid `#A83836` with `#FFFFFF` text.
- **Icon Sizing:** Material Symbols Outlined, 18px aligned alongside text, 20px for standalone actions.

### Master Record Data Tables
- **Container:** `#FFFFFF` surface, 16px radius, outer 1px hairline border `#E6E7EE`.
- **Header Row:** `#F3F4FB` background, height 40px, uppercase `label-sm` (`#5D5F68`), bottom border 1px `#E6E7EE`.
- **Body Rows:** Height 48px standard (or 36px dense toggle). Alternating hover state: `#FAF8FE`. Selected state: `#DBE1FF` at 35% opacity with an active 2px `#0153DC` left accent bar.
- **Cells:** Standard copy uses `body-sm` (`#30323B`). Identifiers, SKUs, and dates use `code-sm` (`JetBrains Mono`, `#5D5F68`).

### Status Badges & Chips
- Fully rounded pills (height 24px, padding 0 10px).
- **Success:** `#E6F4EA` fill, `#006E31` text, optional 6px circular dot indicator.
- **Warning:** `#FFF4DC` fill, `#8A5A00` text.
- **Error:** `#FDECEC` fill, `#A83836` text.
- **Neutral / Slate:** `#F1F5F9` fill, `#475569` text.

### Inputs & Search Bars
- **Surface:** `#FFFFFF`, 8px radius, height 40px, border 1px `#E6E7EE`.
- **Placeholder:** `#5D5F68` at 60% opacity.
- **Focus:** 1px `#0153DC` border accompanied by a 3px halo in `#DBE1FF`.
- **Search Prepend:** Material Symbols Outlined `search` icon in `#5D5F68` at 18px.

### Checkboxes & Radios
- Size: 18x18px.
- Unchecked: `#FFFFFF` surface with 1.5px `#E6E7EE` border.
- Checked: Solid `#0153DC` background with white check icon. Hover states trigger an invisible 6px `#DBE1FF` circular ambient wash.

### Cards & Tint Panels
- **Standard Card:** `#FFFFFF` fill, 16px corner radius, 1px `#E6E7EE` border, soft blue shadow (`rgba(1, 83, 220, 0.04)`).
- **Contextual Tint Panel:** `#F3F4FB` fill, 12px radius, hairline border, containing related contextual forms or read-only technical statistics.