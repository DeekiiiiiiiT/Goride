---
name: High-Sun Fleet Utility
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
  secondary: '#bb0112'
  on-secondary: '#ffffff'
  secondary-container: '#e02928'
  on-secondary-container: '#fffbff'
  tertiary: '#8d4b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#b15f00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#ffdad6'
  secondary-fixed-dim: '#ffb4ab'
  on-secondary-fixed: '#410002'
  on-secondary-fixed-variant: '#93000b'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-plate:
    fontFamily: Space Mono
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: 0.1em
  label-code:
    fontFamily: Space Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.05em
  label-button:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  label-status:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered specifically for outdoor operations, field utility, and vehicle fleet management in high-glare tropical environments. Built for commercial drivers managing daily vehicle handovers, pre-trip inspections, and inventory audits under intense Jamaican sunlight, the system prioritizes legibility, split-second recognition, and immediate tactile certainty.

The aesthetic rejects delicate textures, low-contrast shadows, 3D skeuomorphism, and blurred layers. Instead, it adopts a high-contrast, functional utilitarian design movement: crisp planar cards, bold deliberate borders, deep slate typography, and distinct semantic accents. Tone of voice is plain, warm, direct, and conversational—avoiding corporate fleet jargon in favor of active checklist verification language that can be scanned while standing beside a vehicle.

## Colors

The palette balances intense outdoor ambient light with strict operational feedback states. All foreground text meets WCAG AAA standards on primary surfaces to counteract device screen glare.

- **Primary (`#059669` - Emerald 600):** Operational certainty, completed checks, verified vehicle kit items, and positive affirmations.
- **Secondary / Critical (`#dc2626` - Red 600):** Damaged gear, missing safety items, broken equipment, and blockers requiring immediate supervisor intervention.
- **Tertiary / Warning (`#d97706` - Amber 600):** Pending reviews, flagged minor issues, inspection queues, and temporary allowances.
- **Linked Neutral (`#64748b` - Slate 500):** Paired items, secondary kit links, and operational metadata.
- **Canvas (`#f1f5f9` - Slate 100):** Anti-reflective base canvas preventing harsh pure-white eye strain under open sunlight.
- **Card Surfaces (`#ffffff`):** Opaque white cards delineated by strong borders (`#cbd5e1` - Slate 300) to ensure structural separation without relying on washed-out drop shadows.
- **Text Layers:** Deep primary text (`#0f172a` - Slate 900) ensures maximum optical contrast; supporting instructions use resilient muted slate (`#475569` - Slate 600).

## Typography

The type system pairs **Inter** for conversational clarity with **Space Mono** for alphanumeric technical data. 

- **Inter:** Chosen for neutral, robust counters and open letterforms that resist optical blur at wide viewing angles. Headlines and body copy use heavier baseline weights (`600` and `700`) to guarantee crisp edge definition through polarizing sunglasses.
- **Space Mono:** Applied exclusively to vehicle registration identifiers (e.g., `5179KZ`), equipment serial tags, tire pressures, and batch verification numbers. Fixed character widths eliminate ambiguity between `0` and `O`, `1` and `I`.
- **Sizing Strategy:** Base body text does not drop below 16px for interactive checks. Minimum legible badge sizes are locked to 13px at bold weight.

## Layout & Spacing

A disciplined 8px base rhythm governs all vertical cadences, component heights, and layout gaps.

- **Mobile Viewport Focus:** Primary consumption occurs on handheld mobile devices mounted to vehicle dashboards or held single-handed in open sunlight. Mobile margins are locked at `1rem` (16px) with an edge-to-edge reading canvas.
- **Touch Bounds:** All tap targets conform to an absolute minimum of 48×48px. Form controls, verification checkboxes, list rows, and quick-filter chips default to a comfortable 52px or 56px height to accommodate gloved or hurried hand movements.
- **Reflow & Hierarchy:** Single-column stacked layouts are enforced on mobile to prevent horizontal tracking fatigue. Multi-column cards appear only on tablet or console widths above 768px.

## Elevation & Depth

This design system avoids multi-layer ambient drop shadows and translucent backdrops. Ambient shadows wash out completely under 100,000 lux outdoor sunlight, reducing legibility and introducing visual artifacting.

Depth is achieved purely through high-contrast structural borders and solid surface stacking:
- **Base Level (Canvas):** Flat `#f1f5f9` (Slate 100).
- **Surface Level (Cards, Bins, Modules):** Solid `#ffffff` backed by a constant `1.5px` border in `#cbd5e1` (Slate 300).
- **Active / Pressed Elevation:** On interaction, surfaces swap border colors to `#0f172a` (Slate 900) or fill with high-saturation backgrounds rather than raising via vertical drop shadows.
- **Overlays / Bottom Sheets:** Modal bottom sheets sit against an opaque `#0f172a` backdrop at 65% opacity, maintaining crisp edge borders (`1.5px` in `#cbd5e1`) around the modal shell.

## Shapes

The geometric framework balances approachable handling with structured field discipline.

- **Cards and Containers:** Standardized with an exact `16px` border radius (`rounded-lg` under Level 2 tokens), creating a friendly container silhouette while maximizing internal corner content room.
- **Buttons and Inputs:** Utilize `12px` roundedness to provide visual distinction from the larger parent cards.
- **Chips and Status Badges:** Use full pill shapes (`9999px`) or tight `8px` shapes to immediately distinguish static metadata from interactive card boundaries.
- **License Plate Badges:** Fixed at `8px` radius with an inner inset border to mimic physical stamped automotive plates.

## Components

### Buttons
- **Primary Action (Check In / Complete Kit):** Solid `#059669` (Emerald 600) fill, `#ffffff` text, 52px minimum height, 12px border radius. Bold text.
- **Secondary Action (Report Issue):** Solid `#ffffff` background, 2px border in `#dc2626` (Red 600), `#dc2626` text.
- **Tertiary / Utility:** `#ffffff` card surface, 1.5px border in `#cbd5e1` (Slate 300), `#0f172a` text.

### Chips & Kit Verification States
- **'In the car':** Crisp outline chip. White surface, 1.5px border in `#059669`, text `#059669`, paired with a solid Emerald checkmark icon.
- **'Not in this car':** Critical alert chip. White surface, 1.5px border in `#dc2626`, bold `#dc2626` text, paired with an 'X' icon.
- **'Reported':** Solid warning fill. Background `#d97706`, bold `#ffffff` text, representing items currently in review.
- **'Fixed':** Verified resolve chip. Solid `#059669` fill, crisp `#ffffff` text, affirming resolved faults.
- **'Linked':** Neutral relational chip. White surface, 1.5px border in `#64748b`, `#475569` text with chain-link glyph.

### Cards (Car Kit Item Module)
- Surface is `#ffffff` with 16px corner radius and a 1.5px `#cbd5e1` border.
- Layout features a persistent 2-part structure: top row containing the item name (e.g., "Jack & Spare Tire") in `#0f172a` bold along with its status chip; bottom row displaying the verification state buttons (48px height minimum).
- Active item states highlight the border to `#059669` or `#dc2626` based on inspection results.

### Inputs & Checklists
- **Checklist Toggles:** Minimum touch target of 48×48px. Large 24×24px visual checkbox target inside. Unchecked state: 2px border `#cbd5e1`, white interior. Checked state: `#059669` fill with thick white check glyph.
- **Text Inputs (Odometer / Defect Notes):** 52px height, 1.5px border `#cbd5e1`, `#ffffff` fill, `#0f172a` text. Focus state switches border to 2px `#059669` without ambient glow.

### Vehicle Registration Plate Plaque
- Prominent module displaying the assigned vehicle identifier (e.g., `5179KZ`). Formatted in Space Mono (`label-plate`), bold 20px, uppercase, enclosed within a high-contrast `#ffffff` badge bordered by a 2px `#0f172a` perimeter with 8px radius.