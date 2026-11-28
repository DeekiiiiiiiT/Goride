---
name: Calm Car-Care Desk
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf6'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d3e3ff'
  on-surface: '#0b1c30'
  on-surface-variant: '#47464c'
  inverse-surface: '#213146'
  inverse-on-surface: '#ebf1ff'
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
  tertiary-container: '#131c2b'
  on-tertiary-container: '#7c8497'
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
  tertiary-fixed: '#dbe2f8'
  tertiary-fixed-dim: '#bec6dc'
  on-tertiary-fixed: '#131c2b'
  on-tertiary-fixed-variant: '#3f4758'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e3ff'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
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
  label-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  tabular-numeric:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: 0em
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

This design system establishes a quiet, dependable, and highly focused interface for fleet mechanics, depot managers, and operations dispatchers. Grounded in utilitarian precision, the visual language draws from the concept of a modern, immaculately organized workshop desk: tools are where they belong, critical signals stand out without shouting, and ambiguity is engineered out of every transaction.

The aesthetic marries **Modern Corporate** clarity with **Tactile/Industrial Utility**:
- **Confidence & Composure:** High contrast between data tiers without visual clutter; a stark white upper shell grounded by a nocturnal control tier.
- **Physical Certainty:** Interactive elements feel mechanical and tangible. Buttons retain unmistakable solid or structured outlines—never floating or ambiguous.
- **High-Utility Wayfinding:** Functional status colors (service cadences, urgent maintenance, odometer checks) use disciplined background tints paired with deeply saturated ink tones to ensure instant triage across daylight and glare-heavy depot offices.

## Colors

The palette operates under a strict hierarchy: a pale slate foundation holds crisp white card modules, separated by dark architectural framing in the shell and illuminated by an intentional functional status taxonomy.

### Structural & Base Tones
- **Page Wash:** `#f8fafc` — Soft, low-fatigue slate canvas.
- **Surface Elevation (Cards, Drawers):** `#ffffff` — Pure white foreground for clean visual isolation.
- **Sub-Bar & Console Anchor:** `#020817` — Deep obsidian-navy for search, operational timekeeping (EST Jamaica), and persistent controls.
- **Primary Ink & Text:** `#0b1c30` — High-legibility deep slate navy for primary data, card headers, and values.
- **Secondary Ink / Muted:** `#47464c` — Balanced neutral gray for labels, secondary details, and helper text.
- **Hairline Dividers:** `rgba(0, 0, 0, 0.06)` — Razor-thin borders preserving container separation without heavy visual weight.

### Action & Category Highlights
- **Primary Action Fill:** `#030213` — Near-black tone for active states, key interactive buttons, and high-priority commands. Text on this surface is `#ffffff`.
- **Domain Identity (Maintenance Accent):** `#ea580c` — Energetic safety-orange used exclusively for the fleet maintenance insignia and tool badges.

### Maintenance Cadence & State Tokens
- **Operational / OK:** `#059669` on `#ecfdf5` (Dark emerald on mint surface).
- **Due Soon / Attention:** `#b45309` on `#fffbeb` (Deep amber on warm cream surface).
- **Overdue / Critical:** `#d4183d` on `#fff1f2` (Crimson rose on soft blush surface).
- **History Unknown:** `#6d28d9` on `#f5f3ff` (Violet ink on pale purple tint).
- **Waiting for Odometer / Neutral State:** `#475569` on `#f1f5f9` (Cool slate gray on soft neutral wash).
- **Custom / Specialty Protocol:** `#4f46e5` on `#eef2ff` (Indigo ink on clear ice-blue surface).

## Typography

The typography is built entirely on **Inter**, optimized for desktop density and immediate numeric absorption.

- **Card Titles:** Strictly 20px semibold (`headline-md`) with tightened letter-spacing for crisp enclosure.
- **Card Subtitles & Metrics Context:** 15px regular (`body-lg`) using the muted `#47464c` value.
- **Body & Row Text:** 15px standard reading size for work order narratives and component specs.
- **Metadata & Form Assist:** 13px medium (`label-md`) for field instructions, helper text, and secondary timestamps.
- **Tabular Figures (`tnum`):** All odometer readings (km), Jamaican Dollar currency (`J$`), chassis hours, and date columns must explicitly activate `font-variant-numeric: tabular-nums` to guarantee vertical column alignment across dense tables and service cards.

## Layout & Spacing

The layout is engineered for standard and widescreen desktop workstations (1280px to 1920px+ viewport widths).

### Navigation & Shell Hierarchy
1. **Primary Global Bar (H: 56px):** Pure white background (`#ffffff`), anchored by the black "Roam Fleet" tile. Hosts global application tabs with clear underline/pill indicators (`Vehicle Operations` active).
2. **Sub-Bar Command Deck (H: 48px):** Deep navy (`#020817`), spanning the full viewport width. Contains global vehicle/VIN search, depot filters, and an active operational clock: `EST (Jamaica) — HH:mm:ss`.
3. **Domain Header (H: 72px):** Page canvas wash (`#f8fafc`) featuring the orange wrench badge (`#ea580c`) titled `Fleet Maintenance`, accompanied by horizontal navigational segment pills: `Overview`, `Service history`, `Work orders`, `Find parts`, `Not done yet`, `Requests`, and `Schedule`.

### Canvas Spacing & Grid Model
- **Grid Architecture:** 12-column layout with fixed 24px (`1.5rem`) gutters and 32px (`2rem`) outer canvas margins.
- **Card Padding:** Internal card padding is consistently 24px (`1.5rem`), reducing to 16px (`1rem`) on compact nested summary tables.
- **Visual Rhythm:** Elements within cards conform to a 4px/8px modular vertical cadence. Form inputs and inline buttons maintain consistent 8px inter-element margins.

## Elevation & Depth

Visual depth follows a restrained, architectural layering system. Planes do not hover arbitrarily; they sit grounded upon the `#f8fafc` workbench surface with crisp physical boundaries.

### Card Elevation & Ghost Outlines
Every data card, modal window, and modular surface utilizes dual-tier ambient diffusion paired with a micro-stroke:
- **Surface Border:** `1px solid rgba(0, 0, 0, 0.06)` (hairline edge definition preventing edge bleed).
- **Depth Shadows:**
  - `box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04), 0 8px 24px 0 rgba(15, 23, 42, 0.06);`
- **Raised Interactive Cards (Hover):**
  - Subtle elevation shift: `0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 12px 28px -2px rgba(15, 23, 42, 0.08)`.

### Header & Bar Separation
- Global shell bands avoid fuzzy dropshadows in favor of razor-sharp structural divider lines: `1px solid rgba(0, 0, 0, 0.08)`.
- Modals, flyout service records, and slide-in part drawers incorporate a clean backdrop scrim (`rgba(2, 8, 23, 0.40)`) with an elevated shadow tier: `0 20px 40px -8px rgba(15, 23, 42, 0.16)`.

## Shapes

The shape hierarchy is strictly assigned by functional component category:

- **Cards & Data Modules:** 16px corner radius (`1rem`). Large enough to convey warmth and containment, but structural enough to align clean grid systems.
- **Interactive Controls (Buttons, Inputs, Selectors):** 12px corner radius (`0.75rem`). Ensures inputs and buttons look solid, ergonomic, and distinct from content containers.
- **Pills, Chips & Badges:** Fully rounded (`9999px`). Status tokens, filter categories, and sub-nav pills use stadium capsules to maximize color-patch scanability without clashing with card corners.
- **Tiles & Insignia:** 8px to 10px corner radius on the primary brand mark and the orange wrench fleet badge.

## Components

### Buttons
All buttons must unequivocally telegraph clickability. Ghost-style unbordered links are strictly prohibited for actionable commands.
- **Primary Button:** `#030213` solid fill with `#ffffff` text, 12px radius, height 40px, padding `0 16px`, font weight 600. On hover: `#18182e`.
- **Secondary Button:** `#ffffff` surface, `1px solid rgba(0, 0, 0, 0.14)`, text `#0b1c30`. On hover: `#f1f5f9` background.
- **Destructive Button:** `#d4183d` fill with `#ffffff` text or `#fff1f2` wash with `#d4183d` border and text.

### Chips & Status Badges
Chips maintain a strict 24px height, full pill radius (`9999px`), 10px horizontal padding, and 12px/13px bold text.
- **OK / Compliant:** Background `#ecfdf5`, text `#059669`, optional 6px solid dot indicator.
- **Due Soon:** Background `#fffbeb`, text `#b45309`.
- **Overdue:** Background `#fff1f2`, text `#d4183d`.
- **History Unknown:** Background `#f5f3ff`, text `#6d28d9`.
- **Waiting for Odometer:** Background `#f1f5f9`, text `#475569`.
- **Custom / Service Kit:** Background `#eef2ff`, text `#4f46e5`.

### Input Fields & Controls
- **Height & Radius:** 40px height, 12px corner radius.
- **Borders & Fill:** `#ffffff` background with `1px solid rgba(0, 0, 0, 0.12)`.
- **Focus State:** `border-color: #030213; outline: 2px solid rgba(3, 2, 19, 0.15);`.
- **Checkboxes & Radios:** Solid mechanical styling with a 1.5px border in `#47464c`, shifting to `#030213` fill with white check/dot when active.

### Cards
- Standard layout block with a pure `#ffffff` background, 16px corner radius, hairline border `rgba(0, 0, 0, 0.06)`, and double ambient shadow.
- Header region contains the 20px semibold card title, optional muted 15px subtitle, and trailing action buttons or badge indicators.
- Internal content sections are separated by full-width 1px hairline dividers (`rgba(0, 0, 0, 0.04)`).

### Service History Lists & Work Order Tables
- Rows use alternating hover highlight (`#f8fafc`).
- Cells feature tabular figures for J$ costs, odometer entries, and maintenance ticket codes.
- Headers are sticky, styled in 11px uppercase slate-muted typography (`label-sm`) with subtle bottom border.