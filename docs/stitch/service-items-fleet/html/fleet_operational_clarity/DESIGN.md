---
name: Fleet Operational Clarity
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#47464c'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#78767d'
  outline-variant: '#c9c5cd'
  surface-tint: '#5e5c74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b192e'
  on-primary-container: '#84819a'
  inverse-primary: '#c8c3df'
  secondary: '#a73a00'
  on-secondary: '#ffffff'
  secondary-container: '#fd651e'
  on-secondary-container: '#571a00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002114'
  on-tertiary-container: '#069669'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dffc'
  primary-fixed-dim: '#c8c3df'
  on-primary-fixed: '#1b192e'
  on-primary-fixed-variant: '#46445b'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.005em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  title-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
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
    letterSpacing: 0.02em
  currency-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
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

This design system establishes an ultra-clean, utilitarian, yet human-centered interface for commercial fleet operations and maintenance tracking. It marries the typographic rigor and density of modern technical tools (Linear, Stripe) with the warm, breathable hospitality and polished ease of consumer-grade flagships (Airbnb).

### Core Attributes
- **Precise & Operational:** Uncluttered layouts prioritize legibility, fast triage, and effortless scanning across large logs and multi-vehicle rosters.
- **Airy & High-Stakes Friendly:** Soft surfaces and deliberate whitespace reduce cognitive fatigue during urgent roadside log submissions, inspections, and cost reconciliations.
- **Instrument-Grade Warmth:** Utilitarian near-black structural tokens contrast with a warm maintenance orange accent to signify hands-on craftsmanship and kinetic progress.

### Design Language
- **Surfaces:** Feather-light neutral canvas with crisp, pure-white elevated containers.
- **Lines & Boundaries:** Ultra-subtle, razor-thin borders combined with diffused, low-opacity ambient drop shadows rather than heavy structural divider lines.
- **Tactility:** Highly reactive, clean interactive targets that respond with micro-depth shifts upon click or hover.

## Colors

The palette balances stark corporate legibility with high-clarity situational status indicators. 

### Role Allocations
- **Primary Canvas (`#030213`):** Anchor for top-level headers, primary command buttons, selected states, and structural icons.
- **Surface Grounds:** Default canvas background is `#f8fafc`. Panels, sheets, modal overlays, and primary cards rest on `#ffffff` to create immediate structural layering without harsh visual friction.
- **Typography & Details:** Heavy body copy sits on `#0a0a0a` to avoid the blinding severity of pure pitch black while maintaining WCAG AAA compliance. Secondary labels, timestamps, and placeholders utilize `#71717a`.
- **Maintenance & Brand Accent (`#ea580c` / `#f97316`):** Dedicated to fleet actions, active servicing workflows, wrench markers, and high-visibility milestones.
- **Status & Feedback Tokens:**
  - **Success / Verified / Compliant:** `#059669` paired with `#ecfdf5` background pills.
  - **Attention / Pending / Syncing:** `#d97706` paired with `#fffbeb` background pills.
  - **Critical / Grounded / Hazard:** `#d4183d` paired with `#fef2f2` background pills.
- **Borders & Dividers:** Subtle, structural boundaries use `#e2e8f0`. Soft badge fills utilize `#f1f5f9`.

## Typography

The typographic system utilizes **Inter** across all roles to ensure geometric purity, high micro-legibility, and extensive OpenType feature support.

### Operational Typographic Rules
- **Tabular Numerals (`tnum`):** All odometer readings, hour meters, VIN entries, parts quantities, and currency entries must enable OpenType tabular figures (`font-feature-settings: "tnum" 1`). This ensures clean vertical column alignment in dense fleet spreadsheets and log summaries.
- **Currency Representation:** Display Jamaican dollar currency figures with consistent currency prefixing, tabular spacing, and explicit separators (e.g., `J$ 1,200.00`).
- **Tracking & Weighting:** Negative letter-spacing is applied strictly to display and headline tiers (`-0.02em` to `-0.005em`) to evoke the bespoke, calibrated polish of technical web applications. Body and functional labels remain neutral or slightly expanded for instant peripheral recognition.

## Layout & Spacing

The interface embraces a responsive, desktop-first architecture targeted at a standard 1440px viewport while gracefully degrading to mobile screens for field mechanics and logistics drivers.

### Grid & Layout Structure
- **Desktop (1440px):** Fixed max-width canvas container (1392px content width + 24px margins) or fluid full-width layout with a sticky 260px left navigation rail. Multi-column views leverage a 12-column fluid grid system with `1.5rem` (24px) gutters.
- **Tablet (768px – 1024px):** Collapse utility sidebars into overlay drawers or horizontal rail segments. The grid contracts to 8 columns with `1.25rem` gutters.
- **Mobile (< 768px):** Single-column stacked layouts utilizing `1rem` (16px) gutters and margins to maximize vertical scroll bandwidth.

### Spacing Philosophy
- Base layout rhythm is built on an **8px linear scale** (with a 4px sub-step for compact metadata tags and segmented controls).
- Use `space-xs` (4px) and `space-sm` (8px) for inline badges, icon-to-label gaps, and tight data clusters.
- Use `space-md` (16px) and `space-lg` (24px) for card interior padding and form element spacing.
- Use `space-xl` (32px) and `space-2xl` (48px) exclusively for major operational section separations.

## Elevation & Depth

Visual hierarchy relies on crisp surface separation rather than heavy physical drops, mirroring the modern Stripe and Linear interface paradigm.

### Layering Strategy
1. **Canvas Base (Level 0):** Background surface `#f8fafc`. Unhovered data tables and read-only records live flush on this surface.
2. **Elevated Panels (Level 1):** Solid white `#ffffff` cards bounded by a single-pixel hairline border (`1px solid #e2e8f0`). Elevated cards introduce an ultra-diffused, ambient shadow:
   `box-shadow: 0 1px 3px 0 rgba(3, 2, 19, 0.04), 0 1px 2px -1px rgba(3, 2, 19, 0.02)`.
3. **Interactive Floats & Dropdowns (Level 2):** Flyout action sheets, autocomplete results, and calendar pickers receive enhanced optical lift:
   `box-shadow: 0 10px 15px -3px rgba(3, 2, 19, 0.06), 0 4px 6px -4px rgba(3, 2, 19, 0.03)`.
4. **Dialogs & Critical Sheets (Level 3):** Modal overlays sit on a backdrop blur (`backdrop-filter: blur(4px)`) tinted with `rgba(3, 2, 19, 0.4)`. The dialog body utilizes:
   `box-shadow: 0 20px 25px -5px rgba(3, 2, 19, 0.08), 0 8px 10px -6px rgba(3, 2, 19, 0.04)`.

## Shapes

The design system applies calibrated geometric radiuses to communicate structural hierarchy across macro and micro surfaces:

- **Macro Containers (16px / `1rem`):** All major cards, metric dashboard blocks, modal containers, and full-screen bottom sheets.
- **Controls & Inputs (10px / `0.625rem`):** Interactive utility surfaces including form inputs, action buttons, table search bars, and dropdown triggers.
- **Micro Tokens & Status Badges (Pill / `9999px`):** Fully rounded badges, verification chips, status markers, and numerical counter pills.

## Components

### Buttons
- **Primary Action:** Solid `#030213` fill, white `#ffffff` text, 10px border-radius, minimum 40px height (`padding: 0 16px`). Micro-hover shifts background to `#1f1e2e`.
- **Maintenance Accent:** Solid `#ea580c` fill with white text for critical field tasks (e.g., "Log Service", "Dispatch Mechanic"). Micro-hover shifts to `#c2410c`.
- **Secondary / Subtle:** White `#ffffff` background with 1px border `#e2e8f0`, text `#0a0a0a`. Hover transitions background to `#f1f5f9`.
- **Destructive:** Crimson `#d4183d` text on `#fef2f2` fill, or solid `#d4183d` fill for confirm modals.

### Form Inputs & Select Fields
- **Container:** Height 42px, radius 10px, background `#ffffff`, border `1px solid #e2e8f0`.
- **State Changes:** On active focus, applies an outline-free ring `0 0 0 2px rgba(234, 88, 12, 0.2)` and border color `#ea580c`.
- **Labels & Hints:** Labels sit above inputs in `title-sm` (14px, weight 600). Helper or validation hints sit 4px beneath in `label-md` (`#71717a`).

### Status Badges & Pills
- **Geometry:** Height 24px, pill radius (`9999px`), inline padding 10px, typography `label-sm` (11px, weight 600).
- **Status Variations:**
  - *Active / Fit:* Background `#ecfdf5`, text `#059669`.
  - *Maintenance Pending:* Background `#fffbeb`, text `#d97706`.
  - *Grounded / Overdue:* Background `#fef2f2`, text `#d4183d`.
  - *Draft / Idle:* Background `#f1f5f9`, text `#71717a`.

### Cards & Data Panels
- Pure white `#ffffff` fill, radius 16px, border `1px solid #e2e8f0`, interior padding `24px`.
- Card headers feature an optional right-aligned metadata slot (e.g., license plate badge or service date).

### Data Tables & Log Rows
- Compact row height of 48px with alternating subtle hover states (`#f8fafc`).
- Cell typography uses `body-md` (14px). Cost columns and odometer readings are right-aligned with tabular figures enabled.

### Specialized Fleet Components
- **Vehicle Stat Meter:** Dual-tone progress bar measuring fluid levels and preventive service intervals, utilizing maintenance orange `#ea580c` alongside safe emerald `#059669`.
- **VIN & Plate Stamp:** Monospaced tabular tag with `#f1f5f9` fill, `#0a0a0a` text, and a distinct 6px radius for machine-readable verification.