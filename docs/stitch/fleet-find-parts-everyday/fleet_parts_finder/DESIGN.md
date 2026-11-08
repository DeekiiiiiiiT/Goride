---
name: Fleet Parts Finder
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#47464c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#78767d'
  outline-variant: '#c9c5cd'
  surface-tint: '#5e5c74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b192e'
  on-primary-container: '#84819a'
  inverse-primary: '#c8c3df'
  secondary: '#5a5f62'
  on-secondary: '#ffffff'
  secondary-container: '#dce0e4'
  on-secondary-container: '#5e6367'
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
  secondary-fixed: '#dfe3e7'
  secondary-fixed-dim: '#c3c7cb'
  on-secondary-fixed: '#171c1f'
  on-secondary-fixed-variant: '#43474b'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb690'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#783200'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-page:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-card:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  part-identifier:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.08em
  part-identifier-mobile:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.08em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-base-bold:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-muted:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  badge-label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
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
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers a friendly, calm, and consumer-grade parts identification tool built for simplicity, clarity, and reassurance. The product removes the anxiety, visual noise, and intimidating industrial complexity often associated with automotive and fleet catalogs. 

The tone of voice is plainspoken, transparent, and approachable. To ensure universal usability, the interface intentionally bans industrial jargon: terms like OEM, chassis tags, technical engine codes, pricing, stock levels, and commerce cart elements are strictly excluded. The emotional takeaway must be effortless certainty—users know instantly whether a component matches their vehicle without second-guessing specifications.

Aesthetically, the system pairs Modern Minimalism with tactile, soft elevations. Crisp, high-contrast near-black controls anchor bright, airy card modules resting on an ultra-subtle slate canvas. High-visibility semantic trust pills immediately signal part validation and risk mitigation at a glance.

## Colors

The palette establishes immediate visual authority while maintaining a light, non-threatening atmosphere:

- **Canvas & Surfaces:**
  - Page Background Wash: `#f8fafc` provides an open, fatigue-free canvas.
  - Card & Container Surface: `#ffffff` crisp white for focal isolation.
  - Soft Tile Surface: `#f1f5f9` applied to logo placeholders, avatar backdrops, and part diagram containers.

- **Primary & Neutral Scales:**
  - Primary / Interactive / Selected: `#030213` (near-black) provides definitive contrast for selected states, active segments, and primary actions.
  - Deep Text (Primary): `#0a0a0a` guarantees effortless readability for headers and critical data.
  - Muted Text (Secondary): `#64748b` for hints, subtext, labels, and secondary details.
  - Hairline Border: `rgba(0, 0, 0, 0.06)` for cards; `#cbd5e1` for secondary button and control perimeters.

- **Semantic Trust & Status Accents:**
  - **Verified / Perfect Fit:** Text/Icon `#059669` over Surface `#ecfdf5`. Signals exact match and verified compatibility.
  - **Check Before Buying / Attention:** Text/Icon `#b45309` over Surface `#fffbeb`. Signals potential variance or required vehicle check.
  - **Error / Danger:** Text/Icon `#d4183d` over Surface `#fff1f2`. Signals incompatibility or destructive commands.
  - **Fleet Maintenance Highlight:** `#f97316` reserved exclusively for fleet maintenance icons, status indicators, and operational alert badges.

## Typography

The typographic hierarchy prioritizes legibility, scannability, and clear information parsing:

- **Inter** serves as the universal workhorse for all user-facing communication, headers, action labels, and descriptions. Page titles sit confidently at 28px Semi-Bold, while card and module headers use 20px Semi-Bold. Explanatory text uses standard 16px body copy, supported by 14px muted guidance copy.
- **JetBrains Mono** is reserved exclusively for part lookup identifiers, replacement codes, and reference tags. Styled at 22px Semi-Bold with wide letter spacing (`0.08em`), it turns complex alphanumeric codes into cleanly parsed, distinct characters that users can verify without squinting or transposing letters.

## Layout & Spacing

The layout employs a fixed-max-width, centered responsive container (up to 1200px) that ensures dense search data remains comfortable to scan. 

- **Desktop (1024px+):** Centered view with `1.5rem` margins and a structured grid for lookup filters, vehicle preview panels, and part resolution cards. Cards feature `1.5rem` to `2rem` internal padding.
- **Tablet (768px - 1023px):** Fluid reflow into single- or two-column configurations with `1.25rem` gutters.
- **Mobile (< 768px):** Single-column stacked cards, full-width touch targets, and `1rem` horizontal page margins.

Vertical rhythms stick to strict multiples of 4px and 8px, maintaining ample negative space between search input rows, part diagram cards, and specification grids.

## Elevation & Depth

This system avoids heavy drop shadows, harsh borders, or muddy glass effects. Instead, it relies on soft ambient light to lift critical interactive components above the background wash:

- **Cards & Surface Modules:**
  - Ambient shadow formula: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);`
  - Outline: Hairline border `border: 1px solid rgba(0, 0, 0, 0.06);`
  - Effect: Produces an effortless float above `#f8fafc` without stark demarcation lines.
- **Search Drawers & Dropdowns:**
  - Elevated shadow: `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(15, 23, 42, 0.08);`
  - Border: `1px solid rgba(0, 0, 0, 0.08);`
- **Flat Insets (Diagram Containers & Status Tiles):**
  - Zero elevation. Defined strictly by `#f1f5f9` fill on `#ffffff` surfaces to separate metadata cleanly without layering fatigue.

## Shapes

The design balances structure with modern friendliness through tiered corner rounding:

- **Cards & Primary Modules:** Fixed `20px` border radius (`rounded-2xl`). Gives vehicle and part containers a distinctive, soft, and modern consumer appearance.
- **Form Controls & Action Buttons:** Fixed `12px` border radius (`rounded-xl`). Applied consistently to search fields, secondary dropdowns, selectors, and buttons for ergonomic touch interaction.
- **Badges, Status Pills & Chips:** Completely rounded `9999px` (`rounded-full`). Encapsulates fit ratings, verified states, and vehicle model chips with distinct pill silhouettes.
- **Diagram Tiles & Logo Cutouts:** `16px` border radius inside cards to mirror the outer `20px` perimeter smoothly.

## Components

### Buttons
- **Primary:** Background `#030213`, text `#ffffff`, border radius `12px`, padding `12px 20px`. Hover: opacity `0.92`. Focus: `2px` ring `#030213` with `2px` offset.
- **Secondary:** Background `#ffffff`, text `#0a0a0a`, border `1px solid #cbd5e1`, border radius `12px`, padding `12px 20px`. Hover: background `#f8fafc`.
- **Danger:** Background `#ffffff`, text `#d4183d`, border `1px solid #d4183d`, border radius `12px`. Hover: background `#fff1f2`.

### Trust Badges & Status Pills
- Compact inline pills with `9999px` radius, padding `6px 12px`, gap `6px`, and an icon on the leading edge:
  - **Verified Match:** Background `#ecfdf5`, text `#059669`, with a checkmark icon.
  - **Check Before Buying:** Background `#fffbeb`, text `#b45309`, with an info icon.
  - **Incompatible / Warning:** Background `#fff1f2`, text `#d4183d`, with an alert circle icon.

### Cards
- Pure white background (`#ffffff`), `20px` radius, hairline border `rgba(0, 0, 0, 0.06)`, and ambient shadow (`0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(15,23,42,0.06)`).
- Padding: `24px` on desktop, `16px` on mobile.
- Headers feature the part name (20px Semi-Bold), accompanied by the part number rendered in JetBrains Mono (`22px`, letter spacing `0.08em`).

### Input Fields & Search Bars
- Background `#ffffff`, text `#0a0a0a`, placeholder `#64748b`, border `1px solid #cbd5e1`, border radius `12px`, height `48px`, padding `0 16px`.
- Focus state: border `#030213`, subtle box-shadow `0 0 0 1px #030213`.
- Helper and hint text set in `14px` muted text below the field.

### Soft Asset Tiles (Illustrations & Icons)
- Rounded containers with `16px` radius filled with `#f1f5f9`.
- Dedicated Fleet Maintenance indicators within these tiles use `#f97316` for rapid visual recognition across complex vehicle sheets.

### Selection Lists & Radio Rows
- Cards acting as radio options feature a `12px` border radius, resting border of `1px solid rgba(0, 0, 0, 0.06)`.
- When selected: Border `2px solid #030213`, background tinted with `#f8fafc` or pure white with a solid `#030213` selection dot.