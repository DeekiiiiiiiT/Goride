---
name: Dominion Roam Console
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
  secondary: '#5c5e67'
  on-secondary: '#ffffff'
  secondary-container: '#dedfea'
  on-secondary-container: '#60626b'
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
  secondary-fixed: '#e1e2ec'
  secondary-fixed-dim: '#c5c6d0'
  on-secondary-fixed: '#191b23'
  on-secondary-fixed-variant: '#44464f'
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
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
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
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
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
  margin: 2rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The brand personality is authoritative, calm, and deeply analytical. Designed specifically for intensive research operations, data reconciliation, and administrative control, it prioritizes legibility, cognitive composure, and zero-distraction navigation.

The design movement combines **Corporate Modern** with **Tactile Soft Minimalism**:
- Calm workspace foundation prioritizing open margins and quiet surfaces over decorative noise.
- Visual clarity reinforced through soft, spacious container cards, tactile hairline boundaries, and restrained structural depth.
- Human-in-the-loop transparency: automation statuses and research proofs are conveyed through semantic status indicators and quiet, confident typography.

## Colors
The palette balances authoritative engineering blue with natural signaling hues and ultra-soft, low-saturation backgrounds to maintain comfort over long analytical sessions.

### Light Mode (Default)
- **Canvas Background**: `#faf8fe`
- **Surface / Cards**: `#ffffff`
- **Hairline / Dividers**: `#e6e7ee`
- **Structural Outlines**: `#797a84` (subtle secondary borders: `#c5c6d0`)
- **Primary**: `#0153dc`
- **Primary Container**: `#dbe1ff`
- **Text Dominant**: `#30323b`
- **Text Muted / Hints**: `#5d5f68`
- **Success / Confirmed**: `#006e31` on `#e6f4ea`
- **Warning / Review**: `#8a5a00` on `#fff4dc`
- **Error / Danger**: `#a83836` on `#fdecec`
- **Neutral Status / Idle**: `#475569` on `#f1f5f9`

### Dark Mode
- **Canvas Background**: `#0b1220`
- **Surface / Cards**: `#111a2e`
- **Hairlines & Separators**: `#1e293b`
- **Text Dominant**: `#e2e8f0`
- **Text Muted**: `#94a3b8`
- **Primary Accent**: `#5b8def`
- **Success**: `#4ade80` (container: `rgba(74, 222, 128, 0.12)`)
- **Warning**: `#fbbf24` (container: `rgba(251, 191, 36, 0.12)`)
- **Error**: `#f87171` (container: `rgba(248, 113, 113, 0.12)`)

## Typography
Typography is tuned for systematic, high-density comprehension without visual fatigue.

- **Primary Typeface**: `Inter` handles all primary content, hierarchy, titles, and structural labels.
- **Monospace Accent**: `JetBrains Mono` is restricted solely to verified data codes: frame reference codes, part identification numbers, hashes, and monetary amounts. It must always follow or sit adjacent to plain-language labels, never substituting general conversational UI text.
- **Scale Rules**:
  - Console titles: `headline-lg` (26px, Semibold).
  - Module & Section heads: `headline-md` (18px, Semibold).
  - Default administrative reading text: `body-lg` (15px, Regular).
  - Guidance, contextual annotations, and breadcrumbs: `body-sm` (13px, Muted).

## Layout & Spacing
The layout follows a fluid-responsive 12-column grid within bounded application bounds.

- **Desktop (>= 1200px)**: 12-column fluid grid, 2rem (`32px`) canvas page margins, 1.5rem (`24px`) gutters. Side rail navigation remains pinned; main operational cards use generous 1.5rem–2rem interior spacing.
- **Tablet (768px – 1199px)**: 8-column layout, 1.5rem page margins, 1rem gutters. Inspector panels collapse into dismissible drawer overlays.
- **Mobile (< 768px)**: 4-column layout, 1rem edge margin, 1rem gutters. Complex multi-part tabular records reflow into vertically stacked sub-cards.

## Elevation & Depth
Depth is created through clean, high-precision surface separation rather than heavy drop shadows:

- **Base Card Shadow**: Soft, tinted elevation `0 4px 16px rgba(1, 83, 220, 0.04)` combined with a crisp 1px hairline border (`#e6e7ee` in light mode, `#1e293b` in dark mode).
- **Raised & Floating Elements (Dropdowns, Flyouts)**: `0 8px 24px rgba(1, 83, 220, 0.08)`, hairline border.
- **Surface Nesting**: Inner data tables and inspection trays sit flush against the card using `#faf8fe` or neutral tints without additive drop shadows.

## Shapes
- **Cards & Data Modules**: Fixed `16px` border-radius (`rounded-lg`), delivering a modern, approachable workspace frame.
- **Buttons & Form Inputs**: `8px` radius (`rounded`), providing crisp structural anchors.
- **Trust Badges & Status Pills**: Full rounded pill shape (`9999px`) to immediately distinguish ephemeral metadata and statuses from structural interactive cards.
- **Modal Containers**: `16px` radius matching the core card paradigm.

## Components

### Buttons
- **Primary Button**: Solid `#0153dc`, text `#ffffff`, 8px radius, height 40px, font Inter 14px/Medium. Hover: `#0142b0`.
- **Secondary Button**: Background `#ffffff`, 1px border `#c5c6d0`, text `#30323b`, 8px radius, height 40px. Hover: `#f8f9fc` with border `#797a84`.
- **Danger Button**: Background `#ffffff`, 1px border `#a83836`, text `#a83836`, 8px radius. Hover: `#fdecec`.
- **Icon Buttons**: Strict 32px × 32px box, visible 1px hairline border (`#c5c6d0`), center-aligned icon (16px), 8px border-radius.

### Trust Pills & Status Badges
All status badges are pill-shaped (`9999px`), 24px height, horizontal padding 10px, Inter 12px/Medium:
- **Confirmed**: Green `#006e31` text on `#e6f4ea` background with a checkmark prefix icon.
- **Confirmed · You Checked It**: Outline pill with 1px border `#006e31`, text `#006e31`, background transparent, with a small user outline icon.
- **Needs Checking**: Amber `#8a5a00` text on `#fff4dc` background.
- **Browser Check**: Blue `#0153dc` text on `#dbe1ff` container background with an inline browser-window icon.
- **Not Started Yet / Waiting Turn**: Slate `#475569` text on soft slate `#f1f5f9`.
- **Couldn't Find**: Neutral muted outline pill (1px `#c5c6d0`), text `#5d5f68`.
- **Researching (Live)**: Blue `#0153dc` on `#dbe1ff` with an active 6px pulsing dot prefix.
- **Added Automatically**: Green 1px outline (`#006e31`), text `#006e31`, transparent fill.
- **Paused**: Neutral slate `#475569` on `#f1f5f9`.

### Cards & Data Panels
- Always constructed with `#ffffff` (light) or `#111a2e` (dark), exact `16px` border-radius, hairline border (`#e6e7ee`), and ambient shadow `0 4px 16px rgba(1,83,220,0.04)`.
- Internal sections are delineated with 1px hairline dividers rather than elevated containers.

### Form Inputs & Checkboxes
- **Input Fields**: 40px height, background `#ffffff`, 1px border `#c5c6d0`, 8px radius, text `#30323b` (14px). Focus ring: 2px soft `#0153dc` with 0px offset. Hints placed below inputs in 13px muted `#5d5f68`.
- **Checkboxes & Radios**: 18px dimensions, 4px corner radius for checkboxes, 1px border `#797a84`. Active state: `#0153dc` fill with white checkmark.