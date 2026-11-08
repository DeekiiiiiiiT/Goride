---
name: Calm Modern Workspace
colors:
  surface: '#faf8fe'
  surface-dim: '#dbd9df'
  surface-bright: '#faf8fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f9'
  surface-container: '#efedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1b1b20'
  on-surface-variant: '#434655'
  inverse-surface: '#2f3035'
  inverse-on-surface: '#f2f0f6'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#003ea9'
  on-primary: '#ffffff'
  primary-container: '#0153dc'
  on-primary-container: '#ced8ff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#40465e'
  on-tertiary: '#ffffff'
  tertiary-container: '#575e77'
  on-tertiary-container: '#d2d8f6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#bfc5e2'
  on-tertiary-fixed: '#141b30'
  on-tertiary-fixed-variant: '#3f465e'
  background: '#faf8fe'
  on-background: '#1b1b20'
  surface-variant: '#e3e2e7'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  hint-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.02em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
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

This design system drives the master data management console for vehicle registries, fleet hierarchies, and platform configurations. The brand identity balances industrial rigor with executive calmness: it avoids loud data dashboards in favor of an airy, high-precision administrative workspace designed for prolonged daily focus.

### Tone & Personality
- **Architectural & Trustworthy:** Dense vehicle specifications (chassis series, engine displacement, curb weights) are presented with crisp typographic cadence and structured negative space.
- **Calm Productivity:** Low-saturation backgrounds prevent cognitive fatigue during complex catalog audits, duplicate merges, and synchronization tasks.
- **Instrumental Precision:** Monospaced data codes (VINs, engine models, frame codes) sit alongside standard typography, signaling engineering fidelity.

### Visual Style
A hybrid of **Corporate / Modern** and **Precision SaaS Workspaces**:
- A permanent, high-contrast dark navy left sidebar anchor (`#0f172a` to `#0b1329`) grounds platform context and organization identity.
- A light, radiant canvas (`#faf8fe`) with crisp white elevated record surfaces (`#ffffff`).
- Restrained elevation: hairline strokes paired with ultra-diffuse cobalt-tinted atmospheric shadows rather than heavy drop shadows.

## Colors

The palette establishes unambiguous semantic signaling while preserving a serene visual background.

### Core Canvas & Frame
- **Sidebar & Global Frame Surface:** `#0f172a` (base), `#0b1329` (subtle panel inset and divider base). Navigation icons and text utilize neutral high-contrast alphas (`#f8fafc` active, `#94a3b8` inactive).
- **Workspace Canvas Background:** `#faf8fe` — an ultra-light, cool-tinted neutral that reduces glare compared to pure white.
- **Surface Elevation (Cards, Panels, Modals):** Pure White `#ffffff`.

### Data & Brand Accents
- **Primary Cobalt:** `#0153dc` — used for key primary actions, selected navigation indicators, and focused strokes.
- **Primary Container / Tint:** `#dbe1ff` — soft highlight for active row filters, tag badges, and soft pill backgrounds.
- **Text Primary:** `#30323b` — optical off-black providing high-contrast readability without harshness.
- **Text Muted:** `#5d5f68` — supporting descriptions, metadata titles, and hints.
- **Text Secondary / Subtle:** `#8c8e98` — placeholder copy, keyboard shortcut glyphs, and helper markers.

### Semantic Tones
- **Success:** `#006e31` text on `#e6f4ea` background. Used for published specs, verified homologations, and synchronized records.
- **Warning:** `#8a5a00` text on `#fff4dc` background. Used for potential record collisions, "Looks like a duplicate" warning pills, and unverified batch imports.
- **Error / Danger:** `#a83836` text on `#fdecec` background. Used for critical conflicts, purge actions, and missing mandatory chassis keys.

### Structural Lines
- **Hairlines & Dividers:** `#e6e7ee` — standard boundary lines between table rows and sections.
- **Secondary Structural Borders:** `#c5c6d0` — input field rests, secondary button borders, and subtle card contours.
- **High-contrast Outlines:** `#797a84` — keyboard focus visible rings and active drag boundaries.

## Typography

The type system pairs **Inter** for neutral, utilitarian enterprise hierarchy with **JetBrains Mono** for mechanical clarity.

### Usage Hierarchy
- **Master Section Headlines (`headline-xl`):** Fixed 26px semibold for top-tier master catalog headers (e.g., "Vehicles Master Registry").
- **Group and Card Headers (`headline-md`):** Fixed 18px semibold for segment divisions like "Powertrain Specs", "Trim Matrices", and "Sister-Car Linked Nodes".
- **Primary Body Text (`body-md`):** 15px with `#30323b` color for specifications, definitions, and model descriptions.
- **Contextual Hints (`hint-sm`):** 13px in `#5d5f68` for field constraints, audit trail stamps, and input recommendations.

### Technical Data Convention
All machine-readable identifiers—including **Frame Codes** (e.g., `ZAA-ZE1`), **Engine Codes** (e.g., `B58B30O1`), **VIN strings**, and **Model Production Years** (`2019–2024`)—must render in **JetBrains Mono** with tabular lining figures. 

**Order Rule:** Plain text model and trim designations must precede technical codes. Always structure labels as: `[Plain English Name] · [Technical Code]` (e.g., `Subaru Outback · BT9`, not `BT9 Subaru Outback`).

## Layout & Spacing

The workspace uses a desktop-first architectural layout tuned for wide console efficiency while preventing visual drift on ultrawide monitors.

### Grid & Max Dimensions
- **Frame Partition:** Fixed 260px Dark Navy Sidebar docked to the left viewport boundary.
- **Top Bar:** Fixed 64px height docked to the top viewport, pinned across the remaining canvas.
- **Content Column:** Centered main workspace container with a strict **1120px maximum width** (`max-w-[1120px]`) running on a 1440px desktop baseline.
- **Grid Structure:** 12-column layout with 24px (`1.5rem`) gutters and 32px (`2rem`) horizontal page padding.

### Responsive Behavior
- **Desktop (1440px+):** Sidebar locked expanded. Main content column centered at 1120px with standard spacing.
- **Compact Desktop / Tablet Landscape (1024px – 1439px):** Content column switches to fluid 100% width with 24px margins. Sidebar can collapse into an icon rail (68px).
- **Tablet Portrait & Mobile (<1024px):** Sidebar converts into an off-canvas drawer. Tables gain horizontal smooth-scroll containers with pinned primary identity columns.

## Elevation & Depth

This design system avoids heavy, dark shadows in favor of calm, surface-level boundary layering.

### Surface Tiers
- **Canvas Base:** `#faf8fe` (ground level).
- **Surface Level 1 (Cards, Modules, Table Bodies):** `#ffffff` framed by a 1px hairline stroke of `#e6e7ee` and supported by an ultra-soft blue-tinted ambient shadow:
  `box-shadow: 0 4px 16px rgba(1, 83, 220, 0.04);`
- **Surface Level 2 (Floating Popovers, Search Menus, Dropdown Palettes):** `#ffffff` with a double boundary: 1px `#c5c6d0` plus an ambient drop shadow:
  `box-shadow: 0 12px 32px -4px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(1, 83, 220, 0.04);`
- **Surface Level 3 (Modal Confirmation Sheets & Flyouts):** `#ffffff` anchored by a dark modal backdrop using `rgba(11, 19, 41, 0.48)` with a 4px backdrop blur.

## Shapes

Corner radii balance technical structure with modern tactile softness:

- **Cards & Data Modules:** Strict **16px** (`rounded-2xl` or `1rem`) corner radius. This gives the vehicle master tables and inspector panels a clean, calm presence.
- **Inputs & Button Surfaces:** **8px** (`0.5rem`) corner radius for crisp structural alignment with form fields.
- **Maker Insignia Tiles:** Circular badge styling (**50% / full round**) for brand logos, nested inside 12px rounded bounding tiles.
- **Pills & Status Badges:** Fully rounded capsule styling (`9999px`) for state indicators, count chips, and keyboard shortcut tags.

## Components

### Interactive Search Bar
- **Prominence:** Top-tier workspace anchor. 44px height, light background `#ffffff`, bordered with `#c5c6d0`.
- **Keyboard Affordance:** Inline right-aligned pill containing `⌘K` or `/` in `caption` font with a subtle border `#e6e7ee` and muted text `#5d5f68`.
- **Focus State:** 2px solid ring of `#0153dc` with an ambient glow of `rgba(1, 83, 220, 0.15)`.

### Buttons
- **Primary:** Solid `#0153dc` background, white text, 8px border-radius, 38px standard height, medium weight font. Hover: `#0045ba`.
- **Secondary:** White background `#ffffff`, 1px border `#c5c6d0`, text `#30323b`. Hover: `#f4f5f9` with border `#797a84`.
- **Danger Action:** White background with 1px `#a83836` border and `#a83836` text. Destructive confirms transition to solid `#a83836` with white text.
- **Icon Actions:** 32px × 32px square with 8px radius, 1px border `#e6e7ee`, `#5d5f68` icon color, centered glyph.

### Empty Data State Pattern
- **Strict Rule:** Never render empty strings, dashes (`—`), zeroes (`0`), or blank metric stubs (`0 kg`, `0 cc`).
- **Standardized Presentation:** Render the cell with a muted `hint-sm` string: `"Not on file"` in `#5d5f68`, immediately accompanied by a compact 24px outlined button: `+ Add` with a 1px dashed or hairline border `#c5c6d0`.

### Maker Logo Tiles
- Horizontal modular card or top-filter item.
- Circular 36px white insignia badge with 1px border `#e6e7ee` housing the vector car manufacturer logo.
- Bold maker title (e.g., "Toyota", "Volvo") paired with a tabular count pill on the right (e.g., `48 models`) set in `code-sm` using text color `#5d5f68`.

### Warning & Duplicate Resolution Pill
- Capsule badge styled with background `#fff4dc`, text `#8a5a00`, and a 1px border `rgba(138, 90, 0, 0.2)`.
- Label: `"Looks like a duplicate"` accompanied by an alert icon and an inline interactive `"Review & Merge"` text trigger.

### Sister-Car Synchronization Toggle
- Segmented switch component displaying an interlocking chain icon.
- When active: tinted in `#dbe1ff` with `#0153dc` accents indicating synchronized attributes (e.g., shared engine, chassis variants between badge-engineered platforms).

### Modal Confirm Sheets
- Centered modal sheets (max 540px width) with 16px corner radius, `#ffffff` surface, 24px padding.
- Emphasizes explicit change impact metrics (e.g., "Updating this displacement will alter 4 associated vehicle trim models across 2 production years").