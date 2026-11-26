---
name: Calm Modern Workspace
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
  secondary: '#495c95'
  on-secondary: '#ffffff'
  secondary-container: '#acbfff'
  on-secondary-container: '#394c84'
  tertiary: '#852500'
  on-tertiary: '#ffffff'
  tertiary-container: '#ad3402'
  on-tertiary-container: '#ffcec0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#31447b'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59e'
  on-tertiary-fixed: '#3a0b00'
  on-tertiary-fixed-variant: '#842500'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ed'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
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
    lineHeight: 26px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
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
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a calm, modern workspace tailored for operations, inventory, and manufacturing administrators. The interface is built to reduce cognitive load during extended, data-dense sessions, evoking a sense of clarity, precision, and quiet reliability.

The visual language blends **Corporate / Modern** structure with **Minimalism**:
- **Airy Light Mode:** A soft, cool-tinted canvas (`#faf8fe`) paired with crisp white card surfaces (`#ffffff`) creates effortless visual separation without harsh contrast.
- **Restrained Depth:** Subtle `1px` hairlines and ultra-diffused, primary-tinted ambient shadows replace heavy drop shadows and thick borders.
- **Precision Data:** Clean humanist sans-serif typography for navigation and prose is paired with tabular monospaced numerals for part numbers, dates, and financial figures.

## Colors

The palette is anchored in a high-clarity light mode with a decisive cobalt primary accent and cool, slate-tinted neutrals.

### Core Surfaces & Text
- **Primary (`#0153dc`):** Used for primary actions, active navigation states, and key interactive focal points.
- **Primary Container (`#dbe1ff`):** Soft indigo-blue fill for part type icon containers, active/making status pills, and subtle highlights.
- **Background (`#faf8fe`):** The global application canvas.
- **Card Surface (`#ffffff`):** Elevated content containers, paired with a `1px` `#e6e7ee` hairline border.
- **Tint Panels (`#f3f4fb`):** Recessed or secondary grouping areas and empty media frames.
- **Text (`#30323b`):** Primary body copy, headings, and high-emphasis data.
- **Muted (`#5d5f68`):** Secondary labels, hints, and metadata.
- **Input Borders (`#c5c6d0`):** Default stroke for form fields, secondary buttons, and empty-state placeholder icons.

### Semantic Status Pills
Status indicators use high-contrast text on soft, tinted pill backgrounds:
- **Success:** `#006e31` text on `#e6f4ea` fill
- **Warning:** `#8a5a00` text on `#fff4dc` fill
- **Error:** `#a83836` text on `#fdecec` fill
- **Slate / Neutral:** `#475569` text on `#f1f5f9` fill
- **Making / Active:** `#0153dc` text on `#dbe1ff` fill

## Typography

The design system pairs **Inter** for all interface chrome, headings, and prose with **JetBrains Mono** for structured operational data.

- **Page Titles (`headline-lg`):** `26px` Semibold (`600`), used for top-level console views.
- **Section Titles (`headline-sm`):** `18px` Semibold (`600`), used to anchor card groups and modal headers.
- **Body (`body-lg`):** `15px` Regular (`400`) in `#30323b` for primary reading and table cells.
- **Hints (`body-sm`):** `13px` Regular (`400`) in muted `#5d5f68` for helper text, timestamps, and field descriptions.
- **Tabular Data (`mono-md` / `mono-sm`):** **JetBrains Mono** with `font-variant-numeric: tabular-nums` is required for all part numbers, dates, and monetary values to ensure vertical alignment across lists and tables.

## Layout & Spacing

The console uses a **12-column fluid grid** with `1rem` (`16px`) gutters and `1.5rem` (`24px`) outer canvas margins on desktop, allowing data tables and multi-card dashboards to breathe.

- **Desktop (`>= 1024px`):** Full 12-column grid with persistent side navigation and multi-column card layouts (e.g., 4/8 or 6/6 splits).
- **Tablet (`768px - 1023px`):** 8-column grid; side navigation collapses into a drawer, and 3-column card rows reflow to 2-column grids.
- **Mobile (`< 768px`):** 4-column grid with `1rem` (`16px`) outer margins; cards stack vertically at full width.
- **Overlay Spacing:** Centred modal overlays maintain a fixed `640px` maximum width on desktop/tablet with `2rem` (`32px`) internal padding.

## Elevation & Depth

Visual hierarchy is achieved through **tonal layering**, **low-contrast outlines**, and **ambient shadows**:

1. **Base Canvas (`#faf8fe`):** The lowest visual plane.
2. **Tint Panels (`#f3f4fb`):** Recessed or secondary containers placed directly on cards or the canvas without shadows.
3. **Card Surface (`#ffffff`):** Elevated above the canvas using a crisp `1px solid #e6e7ee` hairline border paired with a soft, primary-tinted ambient shadow: `0 4px 16px rgba(1, 83, 220, 0.04)`.
4. **Centred Overlays:** Modals sit above a `40%` dimmed backdrop (`rgba(48, 50, 59, 0.4)`) to isolate focus during critical workflows.

## Shapes

The design system uses a **Rounded** shape language that softens technical workflows while maintaining structural discipline:

- **Inputs & Buttons:** `10px` border radius.
- **Tint Panels & Part Picture Frames:** `12px` border radius.
- **Cards:** `16px` border radius.
- **Centred Overlays / Modals:** `20px` border radius.
- **Status Pills:** Full pill (`9999px` border radius).

## Components

### Buttons
All standard action buttons share a `44px` height, `10px` border radius, and `14px` Medium (`500`) Inter label:
- **Primary:** Solid `#0153dc` fill with `#ffffff` text.
- **Secondary:** `#ffffff` fill with a `1px solid #c5c6d0` border and `#30323b` text.
- **Danger:** `#ffffff` fill with a `1px solid #a83836` border and `#a83836` text.

### Input Fields
Text inputs, selects, and search bars use a `10px` border radius, `#ffffff` background, and `1px solid #c5c6d0` border. Focus states transition the border to `#0153dc` with a subtle `#dbe1ff` focus ring. Helper hints sit below in `13px` `#5d5f68`.

### Cards & Tint Panels
- **Cards:** `#ffffff` background, `16px` border radius, `1px solid #e6e7ee` hairline, and `0 4px 16px rgba(1, 83, 220, 0.04)` shadow.
- **Tint Panels:** `#f3f4fb` background with `12px` border radius for grouping metadata, summary stats, or secondary controls inside a card.

### Chips & Status Pills
Compact, pill-shaped (`9999px`) badges using `12px` Semibold (`600`) text. Always pair the semantic foreground and background tokens (Success, Warning, Error, Slate, Making/Active).

### Lists, Checkboxes & Radio Buttons
- **Lists:** Separated by `1px solid #e6e7ee` dividers with generous vertical padding (`12px`–`16px`) and tabular JetBrains Mono alignment for part numbers, dates, and currency.
- **Checkboxes & Radios:** `1px solid #c5c6d0` default border; checked states fill with `#0153dc` and crisp white indicators.

### Centred Overlays
Modals are `640px` wide, centred over a `40%` dimmed backdrop, with `20px` border radius and `32px` internal padding.

### Icons & Part Pictures
- **Icons:** **Material Symbols Outlined** (`20px`–`24px`).
- **Part Type Icons:** Housed in `44px × 44px` soft `#dbe1ff` rounded squares (`10px`–`12px` radius) with `#0153dc` icon strokes.
- **Part Pictures:** Square frame with `12px` border radius. When no image is present, render a `#f3f4fb` fill with a large, soft outline icon in `#c5c6d0`.