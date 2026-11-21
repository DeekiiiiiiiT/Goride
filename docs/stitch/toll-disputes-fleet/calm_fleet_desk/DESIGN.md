---
name: Calm Fleet Desk
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
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d3e3ff'
  on-secondary-container: '#56657d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#001551'
  on-tertiary-container: '#547aff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#d3e3ff'
  secondary-fixed-dim: '#b7c7e2'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485e'
  tertiary-fixed: '#dce1ff'
  tertiary-fixed-dim: '#b7c4ff'
  on-tertiary-fixed: '#001551'
  on-tertiary-fixed-variant: '#0039b5'
  background: '#fcf8ff'
  on-background: '#1b1b20'
  surface-variant: '#e4e1e9'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
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
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  currency-display:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  currency-table:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
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
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The design system establishes a quiet, trustworthy, and modern business banking environment tailored for high-volume commercial fleet management and corporate balance controls. The aesthetic emphasizes clarity, serene confidence, and low-friction cognitive processing, removing visual noise so operators can monitor cash flow, disbursements, and settlement status without fatigue.

Drawing from modern minimalism fused with precise Swiss editorial typography, the interface relies on vast atmospheric negative space, crisp hairline micro-structures, pristine optical white surfaces, and an authoritative near-black grounding tone. Every element communicates stability, financial integrity, and purposeful restraint.

## Colors
The palette balances an ultra-deep obsidian `#030213` and dark navy `#0b1c30` against a cool, airy canvas backdrop of `#f8fafc`. Surface containers utilize pure `#ffffff` to generate effortless natural contrast.

### Core Tones
- **Primary Canvas**: `#f8fafc` — Calming architectural gray-white floor.
- **Surface Crisp**: `#ffffff` — Elevated interactive workspaces and card containers.
- **Brand Dominant**: `#030213` — Primary actions, high-impact indicators, and the core identity mark.
- **Text Primary**: `#0b1c30` — Deep navy-slate providing readable high-contrast copy.
- **Text Muted**: `#47464c` — Soft stone-graphite for non-critical secondary details and table descriptors.

### Semantic Status Pairs
Status tags and stateful notices combine a tint background with high-legibility foreground pigments:
- **Pending / Action Needed**: `#b45309` on `#fffbeb`
- **Platform In-Flight**: `#1d4ed8` on `#eff6ff`
- **Overdue / Urgent Attention**: `#ba1a1a` on `#fff1f2`
- **Settled / Disbursed / Paid**: `#069669` on `#ecfdf5`
- **Informational / Neutral Metadata**: `#475569` on `#f1f5f9`

## Typography
This design system standardizes exclusively on **Inter** across all UI tiers. The typographic voice is clinical, disciplined, and strictly formatted.

### Tabular Numerical Treatment
- All monetary metrics, balance summaries, ledgers, and account identifiers **must** enable `font-variant-numeric: tabular-nums` (OpenType `tnum`).
- All currency tokens must feature the unified `J$XX.XX` presentation format with fixed width digits ensuring impeccable column scans in high-density tables.
- Decimal components may visually shift to 80% opacity or a reduced font weight (`400`) within major display cards to emphasize whole dollar movements.

## Layout & Spacing
The layout adheres to a 12-column fluid grid system with a maximum centered container constraint of `1440px` on desktop viewports. 

### Structural Breakpoints
- **Mobile (`< 768px`)**: Single-column vertical stacking with `1rem` outer margins. Dense tabular ledgers switch into micro card views.
- **Tablet (`768px - 1024px`)**: 6-column fluid arrangement with `1.5rem` outer margins and `1.25rem` gutters.
- **Desktop (`> 1024px`)**: Full 12-column fluid arrangement using `1.5rem` gutters and `2rem` page padding.

### Navigation Header Architecture
- **Top Utility Row**: Fixed `64px` height pure white `#ffffff` bar hosting the solid `#030213` brand tile with inverted white branding text, global utility quick-actions, workspace selector, and security profile pill.
- **Sub-Nav Bar**: Integrated dark navy (`#0b1c30`) sub-bar positioned directly beneath at `48px` height, containing streamlined horizontal fleet modules (e.g., Accounts, Cards, Operations, Transfers, Settlements) with soft slate dividers and subtle white hover indicators.

## Elevation & Depth
Elevation in this design system avoids heavy drop shadows and aggressive gradients, choosing an ultra-soft desk aesthetic built on deliberate physical layering.

### Surface Elevation System
- **Ground Floor**: Flat canvas `#f8fafc` without shadow or border.
- **Standard Card Container**: Pure `#ffffff` surface fortified with a hairline perimeter border: `1px solid rgba(0, 0, 0, 0.06)`. Supported by a compound ambient shadow:
  - Micro contact rim: `0 1px 2px rgba(0, 0, 0, 0.04)`
  - Atmospheric floor dispersion: `0 8px 24px rgba(15, 23, 42, 0.06)`
- **Hovered Surface Elevation**: The ambient dispersion subtly expands to `0 12px 32px rgba(15, 23, 42, 0.09)` with border shift to `rgba(0, 0, 0, 0.09)`.
- **Modals & Drawers**: Pure `#ffffff` framed with `1px solid rgba(0, 0, 0, 0.08)` and elevated by deep foundation projection: `0 24px 48px -12px rgba(3, 2, 19, 0.18)`.

## Shapes
The shape language features geometric precision softened at interaction touchpoints to project tactile comfort and corporate polish.

- **Cards & Panes**: Fixed `16px` border-radius (`rounded-lg` level 2 extension) creating a soft, welcoming boundary around analytical data grids.
- **Form Controls & Action Buttons**: Strictly `12px` border-radius (`0.75rem`) providing a confident, balanced grip.
- **Status Badges & Pill Chips**: Full capsule roundness (`9999px`) to immediately isolate discrete categorization items from rigid layout blocks.
- **Brand Identity Tile**: `8px` subtle rounding for crisp architectural solidity inside the white top bar.

## Components

### Buttons
- **Primary**: Solid `#030213` fill, white `#ffffff` label (`label-lg`), `12px` radius. Height: `44px` desktop / `48px` mobile. Hover: background transitions to `#1e1c38`. Focus: `2px` ring `#030213` with `2px` white offset.
- **Secondary / Subtle**: Background `#ffffff`, border `1px solid rgba(0, 0, 0, 0.12)`, text `#0b1c30`. Hover: background `#f8fafc`.
- **Tertiary / Ghost**: Transparent fill, text `#47464c`, hover fill `rgba(3, 2, 19, 0.04)`, text `#0b1c30`.

### Chips & Status Badges
- Height: `26px`, padding `0 10px`, typography: `label-sm`, roundedness: full pill (`9999px`).
- States:
  - **Pending / Unsent**: Background `#fffbeb`, text `#b45309`, border `1px solid rgba(180, 83, 9, 0.15)`.
  - **In-Platform Processing**: Background `#eff6ff`, text `#1d4ed8`, border `1px solid rgba(29, 78, 216, 0.15)`.
  - **Late / Action Required**: Background `#fff1f2`, text `#ba1a1a`, border `1px solid rgba(186, 26, 26, 0.15)`.
  - **Refunded / Settled**: Background `#ecfdf5`, text `#069669`, border `1px solid rgba(6, 150, 105, 0.15)`.
  - **Neutral Info**: Background `#f1f5f9`, text `#475569`, border `1px solid rgba(71, 85, 105, 0.15)`.

### Form Fields & Inputs
- Height: `44px`, background `#ffffff`, radius `12px`, border `1px solid rgba(0, 0, 0, 0.12)`.
- Internal padding: `0 14px`, text: `body-md` (`#0b1c30`), placeholder: `#47464c` at 60% opacity.
- Focus state: border `1.5px solid #030213` with faint ambient glow `0 0 0 3px rgba(3, 2, 19, 0.05)`.

### Checkboxes & Radios
- Size: `18px x 18px`. Radii: `4px` (checkbox), `9999px` (radio).
- Default: Border `1.5px solid rgba(0, 0, 0, 0.22)`, background `#ffffff`.
- Checked: Fill `#030213`, checkmark / center dot rendered in crisp `#ffffff`.

### Data Cards
- Background: `#ffffff`, radius: `16px`, border: `1px solid rgba(0, 0, 0, 0.06)`.
- Shadows: `0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)`.
- Header rule: subtle hairline divider `1px solid rgba(0, 0, 0, 0.05)` separating card header from tabular contents.

### Ledgers & Data Tables
- Header row: Typography `label-md`, background `#f8fafc`, text `#47464c`, `40px` row height.
- Body row: Typography `body-md`, background `#ffffff`, border-bottom `1px solid rgba(0, 0, 0, 0.04)`, `52px` row height. Hover: background `#fbfcfd`.
- Monetary amounts: Styled using tabular digits (`currency-table`) aligned right for absolute numeric alignment.