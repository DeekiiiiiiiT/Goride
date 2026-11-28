---
name: Calm Finance Desk
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf4'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d5e3fc'
  on-surface: '#0d1c2e'
  on-surface-variant: '#47464c'
  inverse-surface: '#233144'
  inverse-on-surface: '#eaf1ff'
  outline: '#78767d'
  outline-variant: '#c9c5cd'
  surface-tint: '#5e5c74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b192e'
  on-primary-container: '#84819a'
  inverse-primary: '#c8c3df'
  secondary: '#595f68'
  on-secondary: '#ffffff'
  secondary-container: '#dbe0eb'
  on-secondary-container: '#5d636c'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002114'
  on-tertiary-container: '#079669'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#dde3ed'
  secondary-fixed-dim: '#c1c7d1'
  on-secondary-fixed: '#161c24'
  on-secondary-fixed-variant: '#414750'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0d1c2e'
  surface-variant: '#d5e3fc'
typography:
  headline-xl:
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
  title-sm:
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
  numeric-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  numeric-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
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
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-compact: 1rem
  margin: 2rem
  margin-compact: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The brand personality embodies disciplined precision, quiet authority, and friction-free operational clarity. Tailored for enterprise fleet operators, treasury leads, and finance controllers, this design system establishes an environment of unwavering composure during complex, high-volume reconciliations.

The aesthetic merges modern functionalism with editorial restraint. It rejects aggressive SaaS patterns in favor of breathing room, soft contextual washes, pristine structural contrast, and deliberate hierarchy. Every interaction prioritizes trust, legibility, and reduced visual fatigue across sustained desktop workstation sessions.

## Colors
The palette leverages a structured system of deep contrasts and light, breathable surface washes:
- **Base Canvas:** The workspace rests on a cool neutral wash `#f8fafc`. Surface cards elevate in `#ffffff`.
- **Primary Ink & Accents:** Near-black `#030213` drives primary command triggers, active tab states, and structural emphasis. Base typography utilizes `#0d1c2e`, tempered by secondary muted metadata in `#47464c`.
- **Sub-surfaces:** Internal panels and inactive input shells leverage a soft periwinkle wash `#eff4ff`, transitioning to crisp `#ffffff` on active interaction. Hairline structures use `#c9c5cd` or `rgba(0, 0, 0, 0.06)`.
- **Semantic Signals:**
  - *Approved / Healthy:* Deep forest `#00714e` on mint `#82f5c1` for chips; emerald `#069669` on tinted `#ecfdf5` for analytical tiles.
  - *Pending / In-Review:* Deep amber `#b45309` on warm linen `#fffbeb`.
  - *Attention / Flagged / Rejected:* Crimson `#ba1a1a` on soft rose `#ffdad6`.
  - *Station / Telemetry Check:* Deep sky `#0c4a6e` on luminous `#e0f2fe`.
  - *Neutral Context:* Muted slate `#47464c` on clean ice `#e6eeff`.

## Typography
Typography is rendered exclusively in Inter to ensure unmatched typographic rhythm and numerical clarity across data-heavy tables, ledgers, and operational dashboards.

All monetary values, transaction IDs, counts, and date timestamps must strictly employ tabular lining figures (`font-feature-settings: "tnum" 1, "cv05" 1`). Headings favor tight tracking and confident medium-to-semibold weights, avoiding dramatic scale shifts to preserve an even typographic texture.

## Layout & Spacing
The layout model uses a disciplined 12-column grid anchored by a primary desktop canvas width up to 1600px with fixed 32px (`margin`) outer margins and 24px (`gutter`) inter-column channels.

Vertical alignment adheres to an explicit 4px baseline grid. Content blocks, ledger tables, and analytical sidecars rely on generous inner structural gaps (`space-lg` to `space-xl`) to establish hierarchy without dense borders. Complex data density is modulated via standard padding tokens: `space-xs` and `space-sm` for compact control groups, `space-md` for row items, and `space-lg` for card interiors.

## Elevation & Depth
Depth is quiet and architectural, rejecting multi-layered floating drops in favor of surface tonal differences and diffused ambient support.

- **Primary Canvas Cards:** Built on pure `#ffffff` over the `#f8fafc` page wash, supported by a dual-stage ambient shadow: `0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(15,23,42,0.06)` paired with an exact `1px` hairline boundary in `rgba(0,0,0,0.06)`.
- **Sub-Surface Tiering:** Nested inspection areas, aggregate summaries, and contextual side rails sit directly inside primary cards using the tinted `#eff4ff` fill, eliminating unnecessary drop shadows.
- **Overlays & Drawers:** Modal drawers and transaction deep-dives apply an elevation of `0 16px 40px rgba(15,23,42,0.10)` alongside a 1px solid `#c9c5cd` border.

## Shapes
Geometry balances ergonomic warmth with modern utility through three distinct corner radii:
- **Cards & Primary Modules:** Fixed at `16px` for comfortable boundary containment on the page wash.
- **Controls, Input Fields & Photo Tiles:** Standardized at `12px` to deliver a cohesive tactile profile between buttons, data cells, and image evidence.
- **Status Chips & Badges:** Fully rounded (`9999px` pill architecture) to visually distinguish immutable metadata tags from clickable inputs.

## Components

### Buttons
All buttons maintain a strict minimum height of `44px` with a `12px` border-radius and horizontal padding of `20px` (`space-md` + `space-xs`).
- **Primary:** Solid `#030213` fill, white text, zero border. Hover shifts smoothly to `#1e1c38`.
- **Secondary:** Solid `#ffffff` background, crisp 1px `#c9c5cd` border, text in `#0d1c2e`. Hover state transitions the background to `#f8fafc`.
- **Danger:** Solid `#ffffff` background, 1px `#ba1a1a` border, text in `#ba1a1a`. Hover state applies `#ffdad6` background tint.

### Form Inputs & Selects
- Inputs feature a `44px` height, `12px` border-radius, and default `#eff4ff` background with a subtle border in `rgba(0,0,0,0.06)`.
- **Focus State:** Background transitions to pure `#ffffff` with a crisp 1.5px outline in `#030213`.
- Placeholder text sits in `#47464c`, shifting to `#0d1c2e` on entered value.

### Chips & Badges
All status chips feature full-pill geometry (`rounded-full`), `6px 12px` padding, and `label-md` uppercase-tracked typography:
- **Approved / Complete:** Text `#00714e` on `#82f5c1`.
- **Waiting / Processing:** Text `#b45309` on `#fffbeb`.
- **Attention / Rejected:** Text `#ba1a1a` on `#ffdad6`.
- **Station Check:** Text `#0c4a6e` on `#e0f2fe`.
- **Neutral:** Text `#47464c` on `#e6eeff`.

### Cards & Analytical Tiles
- **Standard Card:** Pure `#ffffff` surface, `16px` border-radius, hairline `rgba(0,0,0,0.06)` outline, dual soft shadow.
- **Embedded Metric Tile:** Sits within standard cards, leveraging `#ecfdf5` background for positive reconciliations or `#eff4ff` for standard telemetry, framed in `12px` corner radii.

### Lists & Ledger Tables
- Headers set in `label-md` muted `#47464c` with clean 1px bottom border `#c9c5cd`.
- Rows feature a `48px` minimum height, hovering to `#f8fafc`. All financial figures align right using tabular figures (`numeric-md`).
- Selection checkboxes feature `12px` rounded check targets with a `#030213` fill when active.