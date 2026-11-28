---
name: Fleet Driver Interface
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#1d4ed8'
  on-secondary: '#ffffff'
  secondary-container: '#4069f2'
  on-secondary-container: '#fffbff'
  tertiary: '#984300'
  on-tertiary: '#ffffff'
  tertiary-container: '#bb5810'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#b7c4ff'
  on-secondary-fixed: '#001551'
  on-secondary-fixed-variant: '#0039b5'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
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
  label-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  metric-odometer:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: 0.02em
  plate-display:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers a calm, utilitarian, and modern consumer-grade experience tailored specifically for commercial fleet drivers. The interface prioritizes high-stress legibility, swift glanceability, and tactile reassurance during in-transit and turnaround vehicle checks.

### Personality & Emotional Tenor
- **Calm & Reassuring:** Mitigates operational friction and roadside anxiety through generous spacing, structured hierarchy, and muted contextual surfaces.
- **Utilitarian Precision:** Actionable vehicle data, mileage logs, and service timetables are prioritized over decorative flourishes.
- **Consumer Polish:** Moves away from archaic enterprise telematics into an ergonomic, modern mobile tool that drivers respect and trust.

### Design Style Archetype
- **Clean Modernism with Soft Tonal Layering:** Crisp, distinct white cards resting on a cool slate ground, framed by crisp hairline boundaries and diffused ambient depth. Critical status signals leverage saturated accent badges and structural accent bars.

## Colors

The palette establishes strict functional role clarity across standard workflows, critical warnings, scheduled maintenance, and standard navigation.

### Primary & Functional Roles
- **Canvas Base:** `#f1f5f9` (Slate 100) — Ambient backdrop establishing contrast beneath stacked cards.
- **Surface Elevation:** `#ffffff` (Pure White) — Primary card, modal, and drawer backgrounds.
- **Hairline Border:** `#e2e8f0` (Slate 200) — 1px subtle separation for cards, inputs, and dividers.
- **Primary Operational Accent:** `#059669` (Emerald 600) — Primary CTA buttons, verified inspection checkmarks, active bottom navigation states, and operational readiness indicators.
- **Primary Action Active / Pressed:** `#047857` (Emerald 700) — Active touch feedback.

### Status & Feedback Tokens
- **Hazard / Do-Not-Drive:** `#dc2626` (Red 600) text and icons on `#fef2f2` (Red 50) container surface, paired with a solid 4px left-border anchor.
- **Urgent / Expiring Soon:** `#b45309` (Amber 700) text and icons on `#fffbeb` (Amber 50) container surface.
- **Booked Fleet Services:** `#1d4ed8` (Blue 700) text and icons on `#eff6ff` (Blue 50) container surface.
- **License Plate Carrier:** Background `#f1f5f9` (Slate 100), Border `#cbd5e1` (Slate 300), Text `#0f172a` (Slate 900).

### Typography Tones
- **Primary High-Contrast:** `#0f172a` (Slate 900) — Headings, plate numbers, metric values, primary input values.
- **Secondary Muted:** `#475569` (Slate 600) — Metadata labels, form prompts, timestamps, secondary navigation.
- **Subtle / De-emphasized:** `#94a3b8` (Slate 400) — Inactive icons, placeholder inputs, structural track lines.

## Typography

The typography relies entirely on Inter to ensure absolute legibility in high-vibration conditions and daylight glare.

### Numerical Data Formatting
- All odometer distances, vehicle speeds, service countdowns, and timestamps must enable OpenType tabular numbers (`font-variant-numeric: tabular-nums;` or `font-feature-settings: "tnum" 1`). This maintains consistent column widths and prevents jitter during real-time updates.
- Plate tags leverage `plate-display` styling: fully capitalized with widened tracking (`0.08em`) to mimic physical stamped automotive tags.

## Layout & Spacing

The layout is optimized for an ergonomic 390px baseline viewport width (standard modern mobile hand size) with rigid touch bounds.

### Canvas Constraints
- **Device Viewport:** 390px default canvas width with liquid vertical expansion.
- **Horizontal Screen Padding:** Fixed 16px (`1rem`) outer margin. No card or list content bleeds into outer margins except horizontal swipe carousels.
- **Grid Structure:** Single-column stacked hierarchy for full cards; two-column grid using a 12px (`0.75rem`) gutter for dual telemetry panels (e.g., Fuel Level / Remaining Range).

### Touch Target Architecture
- Every primary touch component adheres to a strict physical minimum hit footprint of 48px × 48px to support reliable single-handed thumb tapping while mounted in vehicle docks.

## Elevation & Depth

Visual hierarchy is constructed through planar layering and diffused multi-stage ambient shadows rather than stark high-contrast boundaries.

### Shadow Structure
- **Card Surface:** `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);` combined with a `1px solid #e2e8f0` stroke. This dual shadow isolates interactive containers softly from the `#f1f5f9` backdrop.
- **Floated Sticky Action Bar:** `box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.05);` applied to the bottom pinned navigation and submission panels.
- **Modals & Action Sheets:** `box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);` paired with a backdrop dimming layer of `#0f172a` at 40% opacity.

## Shapes

The design system maintains a roundedness token scale anchored by the 16px signature card geometry.

### Radius Assignments
- **Primary Content Cards & Group Containers:** 16px (`1rem`) corner radius.
- **Buttons & Bottom Action Sheets:** 12px (`0.75rem`) corner radius for seamless thumb nesting.
- **License Plate Badges:** 6px roundedness to preserve the appearance of stamped metal plates.
- **Status Chips & Pills:** Full pill radius (`9999px`) for contextual state tags.

## Components

### 1. Cards
- **Structure:** White (`#ffffff`) background, 16px border-radius, 1px border (`#e2e8f0`), padded uniformly with 16px (`space-md`) or 20px (`space-lg`).
- **Hierarchy:** Primary heading in Slate 900, auxiliary tags right-aligned, body content spaced by 12px.

### 2. Vehicle Registration / Plate Badges
- **Appearance:** Background `#f1f5f9`, border `1px solid #cbd5e1`, 6px corner radius.
- **Padding:** 4px 8px.
- **Content:** Typography set to `plate-display` in Slate 900. Displays vehicle identifiers (e.g., `AB12 CDE`) with monospaced letter spacing.

### 3. Action Buttons
- **Primary Button:** Emerald 600 (`#059669`) background, White (`#ffffff`) text, 48px minimum height, 12px border radius. Bold 15px label. Active state shifts to `#047857`.
- **Secondary Action Button:** Surface white (`#ffffff`), border `1px solid #e2e8f0`, text Slate 900 (`#0f172a`), 48px minimum height.
- **Critical Action Button:** Red 600 (`#dc2626`) fill with white text for reporting immediate vehicle grounding faults.

### 4. Alert Banners
- **Do-Not-Drive Banner:** Background `#fef2f2`, border-left `4px solid #dc2626`, top/right/bottom border `1px solid #fecaca`. Text Slate 900 with alert icon in Red 600.
- **Urgent / Expiring Soon Banner:** Background `#fffbeb`, border-left `4px solid #b45309`, border `1px solid #fde68a`. Text Slate 900 with warning icon in Amber 700.
- **Booked Service Banner:** Background `#eff6ff`, border-left `4px solid #1d4ed8`, border `1px solid #bfdbfe`. Text Slate 900 with maintenance wrench icon in Blue 700.

### 5. Form Inputs & Metric Counters
- **Odometer Input:** 48px height, tabular numbers, clean border `#cbd5e1`, focus ring with 2px Emerald 600 glow.
- **Checkboxes & Radios:** 24px × 24px bounding box centered in a 48px touch frame. Checked state filled with Emerald 600 and white checkmark icon.

### 6. Chips & Status Badges
- **Pill Shape:** Fully rounded (`rounded-full`), vertical padding 4px, horizontal padding 10px.
- **Status Variations:** Subtle tonal background (Red 50, Amber 50, Blue 50, Emerald 50) carrying high-contrast foreground text (Red 600, Amber 700, Blue 700, Emerald 600).