---
name: Roam Admin Console
colors:
  surface: '#faf8ff'
  surface-dim: '#d8d9e4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fe'
  surface-container: '#ecedf8'
  surface-container-high: '#e7e7f2'
  surface-container-highest: '#e1e2ec'
  on-surface: '#191b23'
  on-surface-variant: '#434655'
  inverse-surface: '#2e3038'
  inverse-on-surface: '#eff0fb'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#003ea9'
  on-primary: '#ffffff'
  primary-container: '#0153dc'
  on-primary-container: '#ced8ff'
  inverse-primary: '#b4c5ff'
  secondary: '#555e75'
  on-secondary: '#ffffff'
  secondary-container: '#d9e2fe'
  on-secondary-container: '#5b647c'
  tertiary: '#634000'
  on-tertiary: '#ffffff'
  tertiary-container: '#835500'
  on-tertiary-container: '#ffd196'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d9e2fe'
  secondary-fixed-dim: '#bdc6e1'
  on-secondary-fixed: '#121b2f'
  on-secondary-fixed-variant: '#3e465d'
  tertiary-fixed: '#ffddb4'
  tertiary-fixed-dim: '#fabb61'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#633f00'
  background: '#faf8ff'
  on-background: '#191b23'
  surface-variant: '#e1e2ec'
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
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
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
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system powers an enterprise automotive administration console dedicated to vehicle master data and powertrain configurations. The visual personality balances the architectural rigor of Stripe and Linear with the human-centric approachability and airy clarity of Airbnb. It avoids the intimidating visual density typical of legacy automotive ERPs, presenting complex configuration layers with breathability, crisp hierarchy, and deliberate micro-interactions.

The interface evokes competence, precision, calm, and high control. Data engineers, fleet specifiers, and plant administrators navigate dense mechanical taxonomy effortlessly through balanced whitespace, luminous surfaces, and crisp typographical anchors. The dark navy sidebar creates an authoritative operational perimeter, allowing the main canvas to remain radiant, uncluttered, and scannable.

## Colors

The palette leverages a crisp, hyper-legible blue anchor against a warm, light violet-tinted off-white field (`#faf8fe`). The structural boundary between system-level navigation and data entry is articulated via deep navy anchors (`#0d131f` for root navigation, `#111a2e` for elevated navigation items and active states).

- **Primary (`#0153dc`):** Interactive actions, active configuration states, primary toggles, focused outlines, and key call-to-actions.
- **Primary Container (`#dbe1ff`):** Highlight fills, soft selected row backgrounds, multi-select active tags.
- **Surface & Background:** Canvas rests on `#faf8fe`, while active workspaces, data cards, modals, and tables utilize clean white (`#ffffff`).
- **Typography & Structural Contrast:** Dominant headers and primary content use `#30323b`; secondary captions, metadata labels, and helper text use `#5d5f68`. Structural outlines and dividers are strictly tethered to `#797a84` at adjusted alpha channels (12% to 20% opacity for subtle separation).
- **Functional Semantics:**
  - **Success / Confirmed:** `#006e31` text on `#e8f5ed` soft green fill.
  - **Warning / Amber / Needs Checking:** `#8a5a00` text on `#fef3e2` soft amber fill.
  - **Error / High-Voltage Alert:** `#a83836` text on `#fdf2f2` soft crimson fill.

## Typography

The typography is built around Inter, utilizing contextual ligatures and strictly enforcing lined-up tabular numbers (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "cv05" 1`) across all metric, VIN, engine displacement, and kilowatt readings. 

Clear typographic weight differentiation (400 for standard reading, 500 for interactive elements and data points, 600 for category headings and master IDs) prevents visual fatigue when scanning dense configuration matrices. Letter spacing is subtly tracked tighter on titles to convey structural precision, and tracked wider on small labels and table header metadata to optimize legibility across varied display densities.

## Layout & Spacing

The administration console operates on a fixed-width fluid viewport optimized for a 1440px desktop benchmark. The structural layout employs a dual-panel framework: a persistent 260px dark navy navigation sidebar (`#0d131f`) anchored to the left, paired with an expansive 1180px main content canvas.

Grid architecture utilizes a 12-column system with a `1.5rem` (24px) gutter and a `2rem` (32px) outer canvas margin. Internal card layouts operate strictly on an 8px modular scale. Form components and property inspectors maintain deliberate `1rem` vertical intervals, avoiding typical enterprise compression while preserving high information density through multi-column grouping. Responsive adaptation past 1440px scales outer margins symmetrically to preserve maximum scan lines without fragmenting optical flow.

## Elevation & Depth

Visual hierarchy is maintained through high-clarity tonal surfacing and subtle ambient shadows rather than stark elevation planes. 

1. **Base Plane:** The main viewport rests on `#faf8fe`.
2. **Surface Cards & Data Grids:** Pure white (`#ffffff`) surfaces sit on the base with an ambient shadow (`box-shadow: 0 1px 3px rgba(17, 26, 46, 0.04), 0 4px 12px rgba(17, 26, 46, 0.02)`) and a delicate 1px border rendered in `#797a84` at 14% opacity (`rgba(121, 122, 132, 0.14)`).
3. **Popovers, Dropdowns & Flyouts:** Floating configuration panels utilize elevated ambient depth (`box-shadow: 0 12px 32px rgba(17, 26, 46, 0.08), 0 2px 6px rgba(17, 26, 46, 0.04)`), paired with a crisp edge stroke (`rgba(121, 122, 132, 0.2)`).
4. **Interactive Focus:** Input focus and active card configurations trigger a dual-ring elevation (`box-shadow: 0 0 0 3px rgba(1, 83, 220, 0.15)`) to signal operational readiness without layout shift.

## Shapes

The interface balances sharp industrial utility with ergonomic modern software curves:
- **Cards & Data Modules:** 16px border-radius (`rounded-xl` equivalent in layout context), creating distinct, friendly modules that visually organize powertrain blocks.
- **Buttons, Inputs & Form Controls:** 10px uniform border-radius for inputs, text areas, action buttons, and segmented pickers.
- **Chips, Badges & Tags:** Fully pill-shaped (`9999px`), ensuring immediate optical distinction from interactive rectangular inputs and structural containers.
- **Icon Tiles:** 8px rounded squares providing soft-tinted backgrounds for Material Symbols Outlined icons.

## Components

### Buttons & Actions
- **Primary:** `#0153dc` solid fill, white text, 10px radius, 40px height for standard desktop rows. Subtle active depression (`transform: scale(0.99)`).
- **Secondary:** White surface, 1px border (`rgba(121, 122, 132, 0.25)`), `#30323b` text, hover transition to `#f5f6fa`.
- **Destructive:** Soft crimson container (`#fdf2f2`), `#a83836` text and border.

### Input Fields & Selects
- Height: 40px with a 10px border radius.
- Background: `#ffffff`; border: 1px solid `rgba(121, 122, 132, 0.24)`.
- Helper text anchored beneath at `label-sm` in `#5d5f68`. Tabular numeric values are enforced for numeric inputs (kW, Nm, kWh).

### Powertrain Filter & Identifier Chips
All chips feature a full pill radius, 26px height, `label-md` typography, and 12px horizontal padding:
- **Petrol / Diesel:** Neutral slate `#f1f2f6` fill, `#30323b` text.
- **Mild Hybrid:** Tinted indigo `#eef2ff` fill, `#374151` text.
- **Hybrid (HEV):** Muted sky `#e0f2fe` fill, `#0369a1` text.
- **Plug-in Hybrid (PHEV):** Cyan-teal `#ccfbf1` fill, `#0f766e` text.
- **Range-Extender (REEV):** Soft lavender `#ede9fe` fill, `#5b21b6` text.
- **Electric (BEV):** Vibrant soft blue `#dbe1ff` fill, `#0153dc` text, subtle brand accent ring.
- **Hydrogen Fuel Cell (FCEV):** Soft cyan `#e0f7fa` fill, `#006064` text.

### Status Indicators
- **Worked Out:** Neutral grey container (`#f3f4f6`), `#4b5563` text, neutral filled dot indicator.
- **Confirmed:** Soft green (`#e8f5ed`), `#006e31` text, verified checkmark icon.
- **Needs Checking:** Soft amber (`#fef3e2`), `#8a5a00` text, warning indicator icon.
- **High-Voltage Work:** High-contrast hazard badge: soft crimson (`#fdf2f2`), `#a83836` text, 1px `#fca5a5` border, electric bolt icon glyph.

### Callout Strips
Full-width inline contextual notifications (12px radius, 16px padding, 1px border):
- **Info Strip:** `#dbe1ff` fill at 40% opacity, `#0153dc` text and leading icon, `rgba(1, 83, 220, 0.15)` border.
- **Amber Warning Strip:** `#fef3e2` fill, `#8a5a00` text and leading warning icon, `rgba(138, 90, 0, 0.2)` border.

### Icon Tiles
Material Symbols Outlined icons displayed at 20px, nested inside 36x36px soft-tinted squircle tiles (8px radius) using surface-variant fills (`#f1f3fa` or `#dbe1ff` at 50% opacity) for high visual legibility.