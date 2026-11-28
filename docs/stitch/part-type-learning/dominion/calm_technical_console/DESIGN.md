---
name: Calm Technical Console
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
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
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
  secondary-fixed: '#dce2f6'
  secondary-fixed-dim: '#c0c6da'
  on-secondary-fixed: '#151b2a'
  on-secondary-fixed-variant: '#404757'
  tertiary-fixed: '#9af7aa'
  tertiary-fixed-dim: '#7fda90'
  on-tertiary-fixed: '#00210a'
  on-tertiary-fixed-variant: '#005323'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
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
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: '0'
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
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-dense: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style
The design system establishes a focused, reassuring, and rigorously engineered workspace tailored for master vehicle reference parts management. Balancing utility and composure, it pairs deep technical precision with visual tranquility, mitigating cognitive fatigue during high-volume catalog auditing, cross-referencing, and schematic verification.

The aesthetic blends **Modern Corporate** restraint with crisp **Technical Functionalism**:
- High legibility and spacious density calibrations designed for multi-column data sheets.
- High-contrast structural framing anchored by an authoritative deep navy navigation spine.
- Subtle tactile surface treatments, hairline divider systems, and quiet contextual color signals.

## Colors
The palette maintains an airy, clinical brightness accented by disciplined structural contrasts:

- **Primary Interactive (`#0153dc`):** Anchor for interactive calls-to-action, active selection halos, and progressive indicators.
- **Primary Container (`#dbe1ff`):** Low-stress interactive fills, active table row highlights, and segmented tab selection states. Text paired on this surface resolves to `#002d80`.
- **Canvas Base (`#faf8fe`):** A serene, cool-violet off-white background that prevents glare across wide desktop viewports.
- **Surface Elevation (`#ffffff`):** Pure white container faces for record cards, flyouts, and modal sheets.
- **Hairline Border (`#e6e7ee`):** Subtle definition separating data cells, toolbars, and nested card structures without heavy optical noise.
- **Navigation Spine (`#0b1220`):** Obsidian dark navy sidebar surface creating deep spatial contrast and anchoring global navigation.
- **Semantic Feedback States:**
  - *Success / Verified:* Fill `#e6f4ea`, Text/Icon `#006e31`
  - *Warning / Review:* Fill `#fff4dc`, Text/Icon `#8a5a00`
  - *Critical / Superseded:* Fill `#fdecec`, Text/Icon `#a83836`
  - *Neutral / Inactive:* Fill `#f1f5f9`, Text/Icon `#475569`

## Typography
Typography is split strictly by cognitive domain:
- **Inter** handles linguistic content, navigation labels, contextual headers, and general descriptive prose. It brings an open, neutral clarity with optimized x-height.
- **JetBrains Mono** is enforced across all alphanumeric vehicle part numbers (SKUs, OEM cross-references, VIN lookups), ISO date stamps, system revisions, and quantitative stock dimensions. Always render with OpenType `tnum` (tabular figures) enabled to ensure strict vertical column alignment across comparative data grids.

## Layout & Spacing
The layout follows a fixed navigation bar with a fluid application canvas:
- **Navigation Spine:** Fixed 260px dark navy (`#0b1220`) left vertical rail on desktop; collapses into an icon dock (72px) on medium viewports or an off-canvas drawer on mobile screens.
- **Workspace Canvas:** Fluid 12-column grid utilizing a base 8px harmonic grid (`space-xs` through `space-2xl`).
- **Data Densities:**
  - *Standard Mode:* 16px cell padding (`space-md`), 24px grid gutters. Used for general system configuration and overview cards.
  - *Dense Audit Mode:* 8px vertical cell padding (`space-sm`), 12px horizontal gutters (`gutter-dense`). Dedicated to inventory cross-matching tables.
- **Breakpoints:**
  - `Desktop Large`: ≥ 1440px (expanded panels + persistent metadata inspect tray).
  - `Desktop Standard`: 1024px – 1439px (standard two-column data layout).
  - `Tablet`: 768px – 1023px (sidebar collapses to icon bar, inspect panels convert to bottom sheets).
  - `Mobile`: < 768px (stacked single-column layout, bottom toolbars).

## Elevation & Depth
Depth conveys physical layering without visual weight. Surfaces avoid heavy drop-shadows, using instead cool-tinted diffuse ambients paired with crisp `#e6e7ee` boundaries:

- **Level 0 (Canvas Base):** Flat `#faf8fe`, no shadow.
- **Level 1 (Cards, Modules, Data Panels):** Background `#ffffff`, bordered by 1px solid `#e6e7ee`. Shadow: `0 2px 8px -2px rgba(1, 41, 110, 0.04), 0 1px 3px 0 rgba(11, 18, 32, 0.02)`.
- **Level 2 (Popovers, Dropdowns, Hovered Rows):** Background `#ffffff`, 1px solid `#e6e7ee`. Shadow: `0 8px 24px -4px rgba(1, 41, 110, 0.08), 0 2px 6px -1px rgba(11, 18, 32, 0.03)`.
- **Level 3 (Overlay Modals, Flyout Drawers):** Background `#ffffff`, 1px solid rgba(230, 231, 238, 0.8). Shadow: `0 20px 48px -12px rgba(1, 41, 110, 0.16), 0 4px 12px -2px rgba(11, 18, 32, 0.06)`. Backed by an ambient backdrop veil: `rgba(11, 18, 32, 0.45)` with 4px backdrop blur.

## Shapes
The design system employs refined geometric curvature:
- **Cards and Canvas Panels:** 16px radius (`rounded-lg`), delivering a relaxed workspace silhouette.
- **Overlay Dialogs & Centered Modals:** 20px radius (`rounded-xl`) for soft focal enclosure.
- **Controls & Inputs:** 8px radius (`rounded`) ensuring crisp interaction targets that integrate gracefully alongside monospace data.
- **Badges and Status Pills:** Fully pill-shaped (`9999px`) to visually separate qualitative metadata from quantitative card modules.

## Components

### Buttons & Inputs
- **Touch Target:** Mandatory 44px height across all standard inputs, buttons, and row trigger targets to ensure ergonomic precision.
- **Primary Button:** `#0153dc` background, white label, 8px radius, 0 2px 4px rgba(1, 83, 220, 0.2) shadow. Active state compresses by 1px scale; hover illuminates to `#0147be`.
- **Secondary Button:** White background, 1px `#e6e7ee` outline, `#0b1220` label. Hover transitions surface to `#faf8fe`.
- **Text Fields:** 44px height, `#ffffff` surface, 1px `#e6e7ee` border, 8px radius. Active focus applies a 2px `#0153dc` glow ring at 20% opacity without altering layout geometry.

### Status Pills
- Pill-shaped (`rounded-full`), padded `4px 10px`, typography `label-sm` or `code-sm`:
  - *Active / Verified:* `#e6f4ea` background, `#006e31` text.
  - *Pending / Audit Warning:* `#fff4dc` background, `#8a5a00` text.
  - *Deprecating / Critical Error:* `#fdecec` background, `#a83836` text.
  - *Standard Metadata / Reference:* `#f1f5f9` background, `#475569` text.

### Data Tables & Lists
- Table headers utilize `#faf8fe` backgrounds, 1px solid bottom hairline (`#e6e7ee`), and bold uppercase label typography (`label-sm`).
- Part codes and OEM cross-references are rendered in `code-md` tabular text.
- Row heights are locked to 48px (dense) or 56px (standard), with gentle background hover transitions to `#f4f6fd`.

### Cards & Modules
- Clean `#ffffff` fill, 16px border radius, encased by a 1px `#e6e7ee` hairline border and Level 1 blue-tinted elevation. Card headers contain 20px interior padding (`space-lg`) separated by a hairline divider.

### Overlay Modals
- Fixed 640px centered card format with 20px radius and Level 3 blue-tinted elevation.
- Centered header with calm state icons, structural 1px bottom divider, padded body (24px), and sticky 44px actions anchored to the lower-right corner.