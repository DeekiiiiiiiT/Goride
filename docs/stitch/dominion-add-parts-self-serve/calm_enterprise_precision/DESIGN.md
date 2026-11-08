---
name: Calm Enterprise Precision
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
  secondary: '#575d77'
  on-secondary: '#ffffff'
  secondary-container: '#dbe1ff'
  on-secondary-container: '#5d637d'
  tertiary: '#3f475b'
  on-tertiary: '#ffffff'
  tertiary-container: '#575e74'
  on-tertiary-container: '#d1d8f1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#bfc5e2'
  on-secondary-fixed: '#141b30'
  on-secondary-fixed-variant: '#3f465e'
  tertiary-fixed: '#dbe2fb'
  tertiary-fixed-dim: '#bfc6df'
  on-tertiary-fixed: '#131b2d'
  on-tertiary-fixed-variant: '#3f465b'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ed'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-lg:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  data-mono-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
  data-mono-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
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
The design system serves a mission-critical master parts database where clarity, spatial calm, and instantaneous data recognition are paramount. The visual language balances structural enterprise discipline with a calm, high-order modern aesthetic. It eliminates cognitive fatigue during long sessions through balanced white space, deliberate contrast hierarchies, and restrained visual ornamentation.

The visual direction uses a dual-canvas paradigm: a commanding deep navy navigation anchor on the left (`#0d1527` to `#0b1220`) contrasted against an expansive, airy operational canvas (`#faf8fe`). Structural panels and cards employ pristine white surfaces with subtle tinted ambient shadows and delicate hairlines to convey precision and tactile order.

## Colors
The palette is structured to handle dense enterprise data grids while keeping immediate focus on verification status and operational state:

- **Primary Canvas & Chrome:** Light canvas background is set to `#faf8fe`, with elevated workspaces and cards resting on `#ffffff`. The persistent primary sidebar uses `#0d1527` with sub-layer accents grounded in `#0b1220`.
- **Primary Actions:** `#0153dc` drives core commitments and navigational accents. Tonal highlights, selected rows, and pill fills utilize `#dbe1ff`.
- **Text & Structure:** Primary readability is anchored by `#30323b` for high contrast without the starkness of pure black. Secondary labels, hints, and timestamps use `#5d5f68`. Hairline dividers use `#e6e7ee`, and structural component borders use `#797a84` and `#c5c6d0`.
- **Semantic & Verification States:**
  - **Success / Verified:** `#006e31` text on `#e6f4ea` background.
  - **Warning / Needs Checking:** `#8a5a00` text on `#fff4dc` background.
  - **Error / Danger:** `#a83836` text on `#fdecec` background.

## Typography
The system is powered exclusively by Inter, selected for its neutral geometry, comprehensive weight distribution, and robust OpenType capabilities. 

All technical data—specifically part numbers, OEM codes, chassis designations, quantities, and manufacturing years—must strictly use the OpenType tabular numerals feature flag (`font-feature-settings: 'tnum' on, 'zero' on`). This enforces precise vertical alignment across dense enterprise data grids, inventory audit columns, and master spec sheets without requiring a discordant monospace typeface.

## Layout & Spacing
The layout employs an asymmetric operational workspace tailored for high-resolution desktop terminals:

- **Structural Layout:** A fixed 260px dark navy left rail hosts the primary navigation and context switcher. The main content zone uses a fluid container with a consistent outer margin of 32px (`2rem`) and 24px (`1.5rem`) grid gutters.
- **Rhythm & Grid:** A base 8px linear scale guides horizontal and vertical alignment. Data tables conform to compact row heights (40px compact, 48px standard) to preserve visual scan density, while form panels and analytics views step out into broader 16px to 24px container padding.
- **Responsive Adaptations:** Below 1280px viewports, the primary left navigation collapses to a high-density icon bar (68px width) to guarantee data grid legibility. Secondary detail flyouts transition into modal side-sheets with independent vertical scroll.

## Elevation & Depth
Depth is constructed through a subtle balance of delicate structural hairlines and soft ambient light:

- **Level 0 (Canvas Base):** Ground `#faf8fe` surface. No elevation.
- **Level 1 (Cards & Data Panels):** Solid `#ffffff` background, bound by a crisp 1px border in hairline `#e6e7ee`, elevated with a soft primary-tinted ambient shadow: `0 4px 16px rgba(1, 83, 220, 0.04)`.
- **Level 2 (Active Flyouts & Dropdowns):** Solid `#ffffff` background with border `#c5c6d0`, elevated by `0 8px 24px rgba(13, 21, 39, 0.08)`.
- **Level 3 (Modals & Overlays):** Positioned over a 40% `#0b1220` scrim, with elevation cast at `0 16px 36px rgba(13, 21, 39, 0.16)`.

## Shapes
Surfaces and controls follow a unified corner language that is tactile yet structured:

- **Cards & Data Tables:** Uniform 16px corner radius (`rounded-lg`), delivering a modern, clean look to large surface containers without breaking internal grid geometry.
- **Form Fields & Buttons:** Standard 8px radius (`0.5rem`), ensuring crisp form alignment.
- **Badges & Verification Chips:** Compact 6px radius (`0.375rem`) for concise, industrial tagging that reads cleanly against tabular rows.

## Components

### Buttons
- **Primary:** Solid `#0153dc` background, `#ffffff` text, 8px border radius, 40px height, medium weight typography. Hover: `#0047c0`. Active: `#003da6`.
- **Secondary:** `#ffffff` background, `#30323b` text, 1px border in `#c5c6d0`, 8px border radius. Hover: `#f4f4fa` with border `#797a84`.
- **Danger:** `#ffffff` background, `#a83836` text, 1px border in `#a83836`, 8px border radius. Hover: `#fdecec`.
- **Subtle / Ghost:** Transparent background, `#5d5f68` text. Hover: `#e6e7ee` with text `#30323b`.

### Chips & Status Badges
- **Verified:** Background `#e6f4ea`, text `#006e31`, 1px solid transparent, 6px border radius, uppercase or medium-weight label with an optional 6px dot indicator.
- **Needs Checking:** Background `#fff4dc`, text `#8a5a00`, 6px border radius.
- **Error / Rejected:** Background `#fdecec`, text `#a83836`, 6px border radius.
- **Neutral / Draft:** Background `#f0f1f6`, text `#5d5f68`, 6px border radius.

### Input Fields
- Standard height: 40px. Background: `#ffffff`. Border: 1px solid `#c5c6d0`. Corner radius: 8px. Text: `#30323b` with placeholder in `#797a84`.
- Focus state: Border transitions to `#0153dc` with an ambient 3px outer glow ring (`rgba(1, 83, 220, 0.15)`).
- Error state: Border transitions to `#a83836` with helper text rendered in `#a83836`.

### Cards & Data Tables
- **Cards:** Crisp `#ffffff` fill, 16px corner radius, 1px border in `#e6e7ee`, accompanied by `0 4px 16px rgba(1, 83, 220, 0.04)`.
- **Data Tables:** Outer wrapper enclosed in standard card elevation. Header row features `#f9f9fd` fill, 1px bottom border in `#e6e7ee`, with uppercase column headers in `#5d5f68`. Data rows feature 44px height, `#ffffff` base, hairline bottom border `#e6e7ee`, transitioning to `#f4f7ff` on row hover. Selected row state applies background `#dbe1ff` at 35% opacity with a solid 3px left indicator bar in `#0153dc`.

### Checkboxes & Radio Buttons
- Custom 18px square (checkbox) or circle (radio), `#ffffff` background, 1.5px border in `#797a84`. Checked state: Solid `#0153dc` with pure white indicator glyph and zero outline jitter. Focus-visible applies a 2px outer ring in `rgba(1, 83, 220, 0.25)`.