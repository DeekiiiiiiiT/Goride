---
name: Fleet Operational Engine
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#47464c'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#78767d'
  outline-variant: '#c9c5cd'
  surface-tint: '#5e5c74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b192e'
  on-primary-container: '#84819a'
  inverse-primary: '#c8c3df'
  secondary: '#5d5d6d'
  on-secondary: '#ffffff'
  secondary-container: '#dfdef1'
  on-secondary-container: '#616172'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#341100'
  on-tertiary-container: '#d95f00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#e2e1f4'
  secondary-fixed-dim: '#c6c5d8'
  on-secondary-fixed: '#1a1a28'
  on-secondary-fixed-variant: '#454555'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb690'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#783200'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
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
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-plate:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-price:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.02em
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The design system embodies a calm, precise, and utilitarian philosophy built for mission-critical fleet management operations across Jamaica. The interface projects high-reliability infrastructure: quiet authority, immediate legibility, zero decorative clutter, and decisive visual hierarchy. It balances Swiss-style data density with modern ergonomics—enabling dispatchers, maintenance engineers, and procurement managers to inspect stock, dispatch work orders, verify vehicle telemetry, and track cross-brand parts compatibility without cognitive friction.

### Aesthetics
- **Style Movement**: Precision Utilitarianism / Technical Corporate Minimal.
- **Visual Weight**: Crisp structural dividers, ultra-clean surface layering, and stark high-contrast typography, accented by functional semantic states rather than decorative flourishes.
- **Tone**: Pragmatic, exact, unshakeable, and transparent.

## Colors

The palette relies on absolute neutrals layered over Slate washes, reserving vibrant hues strictly for semantic signaling, telemetry states, and part compatibility taxonomy.

### Base & Backgrounds
- **Primary Canvas Wash**: `#f8fafc` (Slate 50) provides a soft, glare-reducing baseline backdrop.
- **Surface Layer**: `#ffffff` (Pure White) for actionable cards, tables, panels, and modal containers.
- **Structural Lines / Borders**: `#e2e8f0` (Slate 200) or hairline `rgba(0, 0, 0, 0.08)` for sub-grid separation.
- **Muted Fills / Chips**: `#f1f5f9` (Slate 100) for inert metadata, search bars, pill backgrounds, and resting states.

### Ink & Typography
- **Text Primary**: `#0a0a0a` for maximum contrast, critical readability, and high legibility under varying terminal lighting.
- **Text Muted**: `#717182` for secondary metadata, column headers, units of measure, and inactive states.

### Semantic Telemetry
- **Success / In Stock / Verified**: `#059669` (Emerald 600)
- **Warning / Needs Checking / Low Stock**: `#d97706` (Amber 600)
- **Critical / Overdue / Fault**: `#d4183d` (Vivid Red)
- **Operational Accent**: `#f97316` (Orange 500) applied exclusively to tool identifiers, primary service badges, and wrench utility indicators.

### Fitment Hierarchy (4px Left-Bar Accent System)
Used on parts inventory and compatibility cards to categorize interchange tiers instantly:
1. **Tier 1 (Direct OEM / Made for your car)**: `#2563eb`
2. **Tier 2 (Platform Match / Same car, different badge)**: `#0e7490`
3. **Tier 3 (Powertrain Match / Fits your engine)**: `#b45309`
4. **Tier 4 (Cross-Manufacturer Alternate / Other brands that replace it)**: `#7c3aed`
5. **Tier 5 (Universal Specification / Fits by size)**: `#059669`

## Typography

The type system separates natural-language user tasks from technical data points. 

### Implementation Rules
- **Inter** handles narrative flow, table headers, instructional prompts, and navigation items. It is tracked tighter in headlines to maintain architectural composure.
- **JetBrains Mono** governs all quantitative, serialized, and localized Jamaican transport data:
  - **License Plates**: Displayed uppercase with extended tracking (e.g., `8742 HC`, `PC 9012`).
  - **Part Serial Numbers**: Clean monospaced strings (e.g., `OEM-28100-0C070`).
  - **Monetary Landed Values**: Rendered strictly using the monospace structure to align decimal points across data grids: `J$ 4,250 landed`.

## Layout & Spacing

A 12-column responsive layout optimized for high density and persistent multi-pane visibility on widescreen monitors (1440px+), collapsing gracefully to single-pane task lists on mobile diagnostics screens.

### Spatial Rhythms
- **Canvas Base Grid**: Strict 4px/8px incremental rhythm.
- **Horizontal Framing**: 32px (`2rem`) page margin on standard desktop consoles; 16px (`1rem`) margin on tablet and mobile viewports.
- **Component Padding Density**: Cards default to `space-lg` (16px) internal padding. Compact table rows and lists default to `space-sm` (8px) vertical rhythm to maximize visible rows per screen.

## Elevation & Depth

Depth is established via structural layering, low-contrast ghost outlines, and razor-sharp tonal isolation rather than diffuse shadows.

### Elevation Levels
- **Layer 0 (Canvas Base)**: Flat `#f8fafc` page background.
- **Layer 1 (Card & Module Surface)**: Solid `#ffffff` backed by a 1px hairline border (`#e2e8f0`). No drop shadow in standard rest state.
- **Layer 2 (Interactive Floating / Hover / Popovers)**: `#ffffff` surface with a 1px border (`#cbd5e1`) and a minimal ambient drop: `0px 1px 3px rgba(0, 0, 0, 0.04), 0px 4px 12px rgba(0, 0, 0, 0.03)`.
- **Layer 3 (Modals & Command Palettes)**: Centered `#ffffff` overlays framed by `0px 8px 30px rgba(0, 0, 0, 0.08)` and paired with a 20% darkened backdrop wash (`rgba(3, 2, 19, 0.2)`).

## Shapes

The design uses a standardized 12px (`0.75rem`) border radius on all cards, modal containers, and functional interaction blocks. This softens high-density enterprise grids without compromising spatial efficiency.

### Corner Radii Guidelines
- **Cards, Filter Sheets, Panels**: Standardized at `12px`.
- **Buttons, Text Inputs, Segmented Toggles**: Standardized at `8px` (`0.5rem`) for compact structural tension.
- **Chips, Status Badges, System Pills**: Fully rounded (`9999px`) pill shape.

## Components

### Double Header Layout
- **Top Utility Header (`#030213`)**: Fixed 48px height. Houses the branding title, search shortcut (`⌘K`), localized network switch (e.g., `Kingston Hub #01`), and the user initials avatar (`JD`) set in JetBrains Mono inside a Slate 800 circle.
- **Secondary Sub-Nav (`#ffffff`)**: 44px height, hairline bottom border (`#e2e8f0`). Contains tab routes (Inventory, Vehicles, Diagnostics, Work Orders). Active tab features an uninterrupted 2px bottom underline in `#030213` with bold text.

### Buttons & Controls
- **Primary Action**: Solid `#030213` fill, `#ffffff` text, 8px radius, subtle scale-down on active press.
- **Secondary / Ghost**: Transparent fill, 1px `#e2e8f0` border, `#0a0a0a` text; turns to `#f1f5f9` fill on hover.
- **Segmented Control**: `#f1f5f9` enclosure containing 8px tab segments. Active selection floats with a pure `#ffffff` card-tile style and hairline border.

### Fitment Cards
- Base container: `#ffffff`, 12px radius, 1px border `#e2e8f0`, overflow hidden.
- Left-edge strip: 4px solid vertical bar corresponding to Fitment Tiers 1 through 5.
- Meta block: Serial numbers in `JetBrains Mono` at 13px, price right-aligned as `J$ 4,250 landed`, with vehicle compatibility status pill placed alongside.

### Inputs & Tables
- **Inputs**: `#ffffff` background, 1px `#e2e8f0` border, 8px radius, 36px total height. Focus rings deploy an explicit 1px outline of `#030213` with zero soft halo.
- **Data Tables**: Zero vertical borders. Horizontal cell dividers set to 1px `#f1f5f9`. Header cells set to `#717182` at 11px uppercase Inter. Tabular data digits set to `JetBrains Mono`.