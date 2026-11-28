---
name: Roam Fleet
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
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#331200'
  on-tertiary-container: '#cf6721'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  page-title:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  page-title-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  card-title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  part-number:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: 0.08em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  helper-text:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  badge-text:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
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

This design system supports Roam Fleet, a friendly, modern consumer-grade web application. The brand personality is approachable, clear, and dependable, designed to make complex tasks feel effortless for everyday users. The UI should evoke confidence, clarity, and calm efficiency.

The design style blends **Minimalism** with **Corporate / Modern** sensibility:
- **Clean Hierarchy:** Generous whitespace, a restrained light-mode palette, and crisp typography keep focus on the content.
- **Tactile Clarity:** Softly elevated white cards on a cool, neutral page wash create clear separation without visual clutter.
- **Consumer-Grade Polish:** Friendly rounded corners, unmistakable button affordances, and high-contrast status indicators ensure immediate scannability and ease of use.

## Colors

The palette is anchored in a crisp, light-mode foundation with high-contrast near-black primary actions and semantic status accents.

- **Primary (`#030213`):** Near-black used for primary buttons, active/selected states, and key interactive anchors.
- **Surface & Canvas:**
  - Page wash: `#f8fafc`
  - Card & elevated surface: `#FFFFFF`
  - Soft tile fill: `#f1f5f9` (used for subtle recessed containers, secondary tiles, and hover states)
- **Text & Borders:**
  - Primary text: `#0a0a0a`
  - Muted / helper text: `#64748b`
  - Card hairline border: `rgba(0, 0, 0, 0.06)`
  - Secondary button / input border: `#cbd5e1`
- **Semantic Status Colors:**
  - **Verified (Success):** `#059669` text/icon on `#ecfdf5` background
  - **Check Before Buying (Warning):** `#b45309` text/icon on `#fffbeb` background
  - **Error (Danger):** `#d4183d` text/icon on `#fff1f2` background

## Typography

The system pairs **Inter** for all interface copy, headings, and controls with **JetBrains Mono** for technical identifiers such as part numbers.

- **Page Titles (`28px` Semibold):** Anchor each view with tight `-0.02em` tracking; scales down to `24px` on mobile viewports.
- **Card Titles (`20px` Semibold):** Establish clear section hierarchy inside elevated containers.
- **Part Numbers (`22px` JetBrains Mono):** Rendered with wide `0.08em` letter spacing to ensure individual characters and digits are unmistakable at a glance.
- **Body (`16px` Regular/Medium):** Comfortable reading size for primary content and form labels.
- **Muted Helper Text (`14px` Regular):** Paired with `#64748b` for secondary descriptions, hints, and metadata.

## Layout & Spacing

The layout uses a **12-column fluid grid** with `1.5rem` (`24px`) gutters and `1.5rem` (`24px`) outer margins on desktop, adapting cleanly to smaller viewports.

- **Desktop (`>= 1024px`):** 12-column fluid grid, `24px` gutters, `24px`–`32px` outer margins. Cards typically span 4, 6, or 12 columns.
- **Tablet (`768px – 1023px`):** 8-column fluid grid, `20px` gutters, `24px` outer margins. Multi-column card grids reflow to 2 columns.
- **Mobile (`< 768px`):** 4-column fluid grid, `16px` gutters, `16px` outer margins. Cards stack full-width (`4` columns) with `space-md` (`16px`) vertical rhythm.

Use `space-lg` (`24px`) for internal card padding and `space-md` (`16px`) for gaps between related form controls or list items.

## Elevation & Depth

Visual hierarchy relies on **ambient shadows** paired with **low-contrast hairline outlines** over a cool `#f8fafc` page wash.

- **Cards & Elevated Surfaces:** Pure white (`#FFFFFF`) surfaces use a dual-layered soft shadow (`0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)`) combined with a `1px` hairline border (`rgba(0, 0, 0, 0.06)`) to define edges crisply without heavy contrast.
- **Recessed / Nested Tiles:** Use the flat `#f1f5f9` soft tile fill without shadows to group secondary information inside a white card.

## Shapes

The shape language is friendly and approachable, using distinct corner radii to differentiate container hierarchy:

- **Cards & Modals:** `20px` radius for a soft, modern consumer feel.
- **Buttons & Inputs:** `12px` radius for tactile, approachable interactive controls.
- **Chips & Badges:** Fully rounded (`9999px` pill shape) to clearly distinguish status indicators and filter tags from rectangular buttons.

## Components

### Buttons
Buttons must always look unmistakably like buttons—never plain text links.
- **Primary:** Solid `#030213` background, `#FFFFFF` text, `12px` radius, `12px 20px` padding, `16px` medium weight.
- **Secondary:** Solid `#FFFFFF` background, `1px solid #cbd5e1` border, `#0a0a0a` text, `12px` radius, `12px 20px` padding.

### Cards
- `#FFFFFF` background, `20px` border radius, `1px solid rgba(0, 0, 0, 0.06)` border, and the standard soft ambient shadow.
- Internal padding of `24px` (`space-lg`) on desktop/tablet and `16px` (`space-md`) on mobile.

### Chips & Status Badges
- Fully rounded (`9999px` radius), `4px 12px` padding, `12px` semibold text.
- **Verified:** `#059669` text on `#ecfdf5` fill.
- **Check Before Buying:** `#b45309` text on `#fffbeb` fill.
- **Error:** `#d4183d` text on `#fff1f2` fill.

### Input Fields
- `#FFFFFF` background, `1px solid #cbd5e1` border, `12px` radius, `12px 16px` padding, `16px` text (`#0a0a0a`).
- Focus state uses a `2px` `#030213` ring. Error state uses `#d4183d` border with `#fff1f2` subtle tint and helper text below.

### Lists & Recessed Tiles
- List items or grouped metadata inside cards sit on `#f1f5f9` soft tile fills with `12px` radius and `16px` internal padding.

### Checkboxes & Radio Buttons
- `1px solid #cbd5e1` border on `#FFFFFF` surface when unselected.
- Selected state fills with `#030213` and `#FFFFFF` checkmark/dot. Checkboxes use a `6px` radius; radio buttons are circular.