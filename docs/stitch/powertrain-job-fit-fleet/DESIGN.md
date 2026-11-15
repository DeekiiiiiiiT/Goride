---
name: Fleet Precision
colors:
  surface: '#fbf8ff'
  surface-dim: '#dad9e3'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fd'
  surface-container: '#eeedf7'
  surface-container-high: '#e8e7f1'
  surface-container-highest: '#e3e1ec'
  on-surface: '#1a1b22'
  on-surface-variant: '#47464c'
  inverse-surface: '#2f3038'
  inverse-on-surface: '#f1effa'
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
  tertiary-container: '#2f1500'
  on-tertiary-container: '#c76c00'
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
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#fbf8ff'
  on-background: '#1a1b22'
  surface-variant: '#e3e1ec'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.015em
  title-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
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
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers a high-craft, operational elegance calibrated for modern fleet logistics, dispatch operations, and asset telemetry. Rooted in the refined visual restraint of Linear, the micro-interaction fidelity of Stripe, and the welcoming clarity of Airbnb, the system prioritizes clarity, low cognitive load, and immediate scanability.

The emotional signature is poised, dependable, and airy:
- **High Craft & Polish:** Every element displays micro-level alignment, subtle borders, and intentional spatial rhythm.
- **Airy & Legible:** Deep contrast pairing of stark near-black structural tones against pure white surfaces and soft, pale-slate canvases.
- **Pragmatic Modernism:** Form strictly serves situational awareness, utilizing precise status semantics without visual clutter or unnecessary decorative styling.

## Colors

The color palette is built on high contrast, strict semantic utility, and surgical color accents over a clean, neutral substrate.

### Canvas & Surfaces
- **Canvas Base:** `#f8fafc` (slate-50) serves as the ambient page foundation, creating subtle separation against pure white components.
- **Surface Elevation (Cards, Modals, Popovers):** `#ffffff` (pure white) provides elevated contrast and crisp visual boundaries.
- **Structural Outlines:** `#e2e8f0` (slate-200) defines precise hairline borders across all interactive containers, data grids, and input fields.

### Brand & Neutrals
- **Primary Ink / Structural:** `#030213` (near-black) anchors headlines, high-priority interactive states, and solid command buttons.
- **Secondary Ink / Body:** `#334155` (slate-700) delivers balanced, accessible contrast for long-form data tables and contextual text.
- **Tertiary Ink / Subdued:** `#71717a` (zinc-500) dedicated to metadata labels, table column headers, helper text, and inactive iconography.

### Semantic Tones
- **Success:** Emerald `#059669` (with `#ecfdf5` badge fill) for active vehicles, healthy telemetry, and completed dispatches.
- **Attention / Warning:** Amber `#d97706` (with `#fef3c7` badge fill) for geofence breaches, scheduled maintenance, or pending dispatches.
- **Critical / Danger:** Crimson `#d4183d` (with `#fff1f2` badge fill) for telemetry dropouts, vehicle faults, collisions, or destructive operations.

## Typography

Typography relies entirely on Inter, tuned for programmatic data density and tabular precision. 

- **Numeric Rigor:** All tabular contexts, data grids, coordinates, timestamps, and metric readouts must activate OpenType tabular numbers (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "cv05" 1`).
- **Tracking Discipline:** Headings utilize negative tracking (`-0.02em` to `-0.03em`) to deliver modern, tight visual rhythm inspired by high-end engineering platforms.
- **Hierarchy:** Display and title levels use semi-bold (`600`) weights sparingly to prevent visual fatigue in high-density dashboards. Labels and captions use medium (`500`) and semi-bold (`600`) for immediate legibility at reduced sizes.

## Layout & Spacing

The layout structure relies on a responsive 12-column fluid grid system bounded by standard desktop viewports (max-width `1600px` for operations dashboards, `1280px` for standard views).

### Breakpoints & Adaptive Rhythm
- **Desktop (1024px+):** 12 columns, `1.5rem` (`24px`) gutters, `2rem` (`32px`) canvas margins. Side navigation remains persistent, offering fixed-width utility while telemetry panels flex proportionally.
- **Tablet (768px - 1023px):** 8 columns, `1rem` (`16px`) gutters, `1.5rem` (`24px`) canvas margins. Sidebar collapses to icon-only rails; data grids collapse non-vital metrics into detail drawers.
- **Mobile (< 768px):** 4 columns, `0.75rem` (`12px`) gutters, `1rem` (`16px`) canvas margins. Layout reflows vertically into stacked single-column cards and bottom-sheet drawers.

### Spacing Scale
Layout distances adhere to a strict 4px/8px modular rhythm. Component paddings leverage `space-xs` (4px), `space-sm` (8px), `space-md` (16px), `space-lg` (24px), and `space-xl` (32px) to maintain structured optical balance throughout dashboards and inspection overlays.

## Elevation & Depth

Visual hierarchy is maintained through high-clarity surface containment and ultra-diffused, ambient drop shadows rather than heavy drop-shadow stacks.

### Layering Philosophy
- **Level 0 (Canvas):** `#f8fafc` background plane.
- **Level 1 (Structural Cards & Modules):** Pure white `#ffffff` with a crisp `1px solid #e2e8f0` border and a delicate atmospheric shadow: `0 1px 3px 0 rgba(3, 2, 19, 0.03), 0 1px 2px -1px rgba(3, 2, 19, 0.02)`.
- **Level 2 (Popovers, Dropdowns & Menus):** Pure white `#ffffff`, `1px solid #e2e8f0`, elevated with `0 10px 15px -3px rgba(3, 2, 19, 0.06), 0 4px 6px -4px rgba(3, 2, 19, 0.04)`.
- **Level 3 (Modal Dialogs & Slide-out Panels):** Pure white `#ffffff`, `1px solid #cbd5e1`, supported by an ambient backdrop scrim (`rgba(3, 2, 19, 0.4)` with 4px backdrop blur) and cast shadow: `0 25px 50px -12px rgba(3, 2, 19, 0.18)`.

## Shapes

The geometric personality features purposeful, differentiated corner radiuses to reinforce hierarchy and interaction paradigms:

- **Large Containers (Cards & Modals):** Explicitly set to `16px` (`rounded-xl` in the context of this scale). Softens extensive dashboard panels while preserving structural rectangular alignment.
- **Interactive Controls (Buttons & Inputs):** Explicitly set to `10px`. Gives primary touchpoints a tailored, modern, and ergonomic profile distinct from surrounding containers.
- **Status Badges, Chips & Avatars:** Fully rounded pill radius (`9999px`). The pill shape ensures instant visual delineation between actionable interactive components and read-only status metadata.

## Components

### Buttons
- **Primary:** Solid `#030213` fill, `#ffffff` label, `10px` border radius, `h-10 px-4` standard. Hover: `#1e1b4b` with a smooth 150ms transition. Active: scale `0.99`.
- **Secondary / Outline:** Pure `#ffffff` fill, `1px solid #e2e8f0`, `#030213` label, `10px` border radius. Hover: `#f8fafc` and `#cbd5e1` border.
- **Destructive:** Solid `#d4183d` fill, `#ffffff` label, `10px` border radius. Secondary destructive: `#ffffff` fill, `1px solid #fecdd3`, `#d4183d` label. Hover: `#fff1f2`.

### Inputs & Selectors
- **Input Fields:** `#ffffff` surface, `1px solid #e2e8f0`, `10px` border radius, `14px` font size. Placeholder: `#71717a`.
- **Focus State:** `border-color: #030213`, complemented by an offset focus ring (`ring-2 ring-[#030213]/10`).
- **Helper & Validation Text:** Displayed at `12px` (`label-md`). Normal: `#71717a`; Error: `#d4183d`.

### Cards & Dialogs
- **Cards:** `#ffffff` surface, `16px` border radius, `1px solid #e2e8f0`, padding `24px` (`space-lg`). Card headers display clear `16px` (`title-md`) sectioning with subtle hairline separators (`border-b border-[#e2e8f0]`).
- **Dialogs & Drawers:** `16px` border radius, pure `#ffffff` canvas, padded `32px` (`space-xl`). Always include an explicit top-right close trigger (`20px` Lucide `X` icon).

### Badges, Tags & Chips
- **Status Pills:** Continuous `9999px` pill radius, `py-0.5 px-2.5`, `12px` font size (`label-md`), semi-bold.
  - *Active / Success:* Background `#ecfdf5`, text `#059669`, border `1px solid #a7f3d0`. Optional 6px pulsing emerald indicator dot.
  - *Attention / Pending:* Background `#fef3c7`, text `#d97706`, border `1px solid #fde68a`.
  - *Critical / Inactive:* Background `#fff1f2`, text `#d4183d`, border `1px solid #fecdd3`.
  - *Neutral / Tag:* Background `#f1f5f9`, text `#475569`, border `1px solid #e2e8f0`.

### Checkboxes & Radio Buttons
- **Checkboxes:** `18px x 18px`, `6px` border radius, `1.5px solid #cbd5e1`. Checked: `#030213` fill with white checkmark icon.
- **Radio Buttons:** `18px x 18px`, circular `9999px`, `1.5px solid #cbd5e1`. Selected: `#030213` ring with centered `#030213` pip.

### Data Tables & Lists
- **Table Head:** `#f8fafc` background, uppercase `11px` (`label-sm`) `#71717a` text, tracked `+0.03em`, height `40px`.
- **Table Row:** `1px solid #e2e8f0` bottom divider, height `52px`, hover highlight `#f8fafc`. All metrics and timestamps render with tabular figures.

### Iconography
- **Style:** Lucide line icons, geometric stroke weight of `1.75px` to `2px`. Standardized sizing of `16px` (in-button/badge), `20px` (list/navigation), and `24px` (hero/stat cards).