---
name: Merchant Core
source: Stitch — Roam Dash Partner App (projects/4244471701037965477)
device: MOBILE (390×884 base) + TABLET (1280×1024+)
colorMode: LIGHT
colorVariant: FIDELITY
colors:
  surface: '#fff8f5'
  surface-dim: '#e0d8d5'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf2ee'
  surface-container: '#f4ece8'
  surface-container-high: '#eee7e3'
  surface-container-highest: '#e9e1dd'
  on-surface: '#1e1b19'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#33302d'
  inverse-on-surface: '#f7efeb'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#712edd'
  on-secondary: '#ffffff'
  secondary-container: '#8b4ef7'
  on-secondary-container: '#fffbff'
  tertiary: '#5d5f5f'
  on-tertiary: '#ffffff'
  tertiary-container: '#a2a3a3'
  on-tertiary-container: '#38393a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ebddff'
  secondary-fixed-dim: '#d3bbff'
  on-secondary-fixed: '#250059'
  on-secondary-fixed-variant: '#5b00c5'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#fff8f5'
  on-background: '#1e1b19'
  surface-variant: '#e9e1dd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
  gutter: 16px
  margin-mobile: 16px
  margin-tablet: 32px
---

## Brand & Style

The brand identity for this design system is rooted in operational clarity and professional reliability, specifically tailored for the Roam Dash Partner Merchant experience. The aesthetic is **Modern Minimalist**, prioritizing high-speed information processing and "at-a-glance" status monitoring.

The emotional response should be one of confidence and calm efficiency. By utilizing a high-ratio of whitespace and a warm, off-white background, the interface reduces cognitive load for busy merchants. The style avoids unnecessary decorative elements, focusing instead on structural hierarchy and purposeful color usage to signify business health and order status.

## Colors

This design system utilizes a sophisticated palette where color acts as a functional signifier.

- **Primary Emerald (#10B981)** is used for primary actions and active states, symbolizing growth and "Go" signals.
- **Secondary Deep Violet (#6D28D9)** is reserved for brand moments, secondary features, and promotional highlights to provide a premium contrast.
- **Surface Strategy**: The background uses a **Warm Off-White (#FFF8F5)** to reduce screen glare during long shifts, while **Pure White (#FFFFFF)** is used for foreground cards to create a subtle, clean lift.
- **Status Colors**: Success, Warning, and Error tones are calibrated for high legibility against white surfaces, ensuring merchants can identify issues immediately.

## Typography

The design system exclusively uses **Inter** to maintain a systematic and utilitarian feel.

- **Scale**: The hierarchy is tight. Large display sizes are reserved for critical metrics (e.g., daily revenue).
- **Weight**: Bold weights (700) are used sparingly for page titles, while Semi-bold (600) is preferred for card headers and button labels to maintain professionalism without feeling "heavy."
- **Readability**: Body copy uses a slightly increased line-height (1.5x) to ensure legibility on mobile devices in fast-paced environments.

| Token | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| headline-lg | 32px | 700 | 40px | Page titles, key metrics |
| headline-lg-mobile | 24px | 700 | 32px | Mobile page titles |
| headline-md | 20px | 600 | 28px | Card headers, section titles |
| body-lg | 16px | 400 | 24px | Primary body copy |
| body-sm | 14px | 400 | 20px | Secondary copy, descriptions |
| label-md | 12px | 600 | 16px | Form labels, chips |
| label-sm | 11px | 500 | 14px | Captions, metadata |

## Layout & Spacing

This design system follows a **Fluid Grid** model with strict margin rules for different breakpoints.

- **Mobile (up to 599px)**: 4-column grid with 16px outside margins and 16px gutters.
- **Tablet (600px – 1024px)**: 8-column grid with 32px outside margins.
- **Touch Targets**: All interactive elements (buttons, list items, toggles) must maintain a minimum hit area of **48px × 48px** to accommodate high-frequency touch interaction.
- **Spacing Rhythm**: An 8pt linear scale is used for structural layout, while a 4pt scale is used for internal component spacing.

## Elevation & Depth

To maintain a "Professional/Business" aesthetic, this design system avoids heavy drop shadows. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Background)**: `#FFF8F5`
- **Level 1 (Cards/Surface)**: `#FFFFFF` with a 1px solid border of `#E5E7EB` (Light Gray).
- **Active Elevation**: When an element is being interacted with, a soft, neutral shadow (`0px 4px 12px rgba(0,0,0,0.05)`) is applied to indicate "lift."
- **Depth**: Primary navigation and sticky headers use a subtle backdrop blur (12px) when scrolling to maintain context without visual clutter.

## Shapes

The shape language is **Rounded (0.5rem / 8px)**. This choice balances the friendliness of the brand with the professional structure of a dashboard.

- **Standard Components**: Buttons, Input Fields, and Cards use the base 8px radius.
- **Large Components**: Modal sheets and large container sections use `rounded-xl` (24px) for a more modern, contained feel.
- **Small Components**: Tags and Badges use `rounded-sm` (4px) to maintain sharpness at smaller scales.

## Components

- **Buttons**: Primary buttons are solid Emerald (`#10B981`) with white text. Secondary buttons use a Deep Violet outline. All buttons have a minimum height of 48px for mobile accessibility.
- **Status Chips**: Used for order status (e.g., "Pending," "Preparing," "Delivered"). These use high-chroma backgrounds with dark text for maximum visibility in high-glare environments.
- **Cards**: The fundamental building block. Every card has a white background, 1px border, and 8px corner radius. Padding is strictly 16px or 24px.
- **Input Fields**: Modern, "ghost" style with a 1px border. On focus, the border transitions to 2px Emerald (`#10B981`). Labels are always visible (no placeholder-only fields) using `label-md`.
- **List Items**: High-density but high-clarity. Each list item in an order queue should have a vertical height of at least 64px, with clear dividers between items.
- **Progress Indicators**: Linear bars for order progress, using Primary Emerald.

## App Structure

Screen inventory from the Stitch project, organized by user journey.

### Launch & Authentication

| Screen | Purpose |
|--------|---------|
| Splash Screen | App launch branding |
| Login | Merchant sign-in |
| Onboarding - Welcome | First-run introduction |
| Onboarding - How It Works | Product walkthrough |
| Home - Discover Roam Dash | Marketing / discovery landing |
| Onboarding Complete - Go Live | Post-onboarding confirmation |

### Sign Up & Verification

| Screen | Purpose |
|--------|---------|
| Sign Up - Business Details | Business info capture |
| Sign Up - Restaurant Info | Restaurant-specific details |
| Sign Up - Location | Store location setup |
| Sign Up - Bank Details | Payout account setup |
| Sign Up - Verification | Identity / document upload |
| Account Pending | Awaiting approval state |
| Verification Status Banners Showcase | Status banner variants |
| P2 — Regulated Vertical Warning | Inline banner for regulated businesses |
| P3 — Operations Setup — Restaurant (Step 3) | Restaurant ops wizard |
| P4 — Operations Setup — Grocery/Retail (Step 3) | Retail ops wizard |
| P5 — Verification — Pharmacy with Extra Doc | Pharmacy compliance step |
| P6 — Go Live Checklist — Retail | Post-approval go-live checklist |

### Business Setup Wizard

| Screen | Purpose |
|--------|---------|
| P1 — Business Profile + Vertical Selection (Step 1) | Business type selection |
| Setup: Business Information (Step 1) | Core business info |
| Setup: Location & Delivery (Step 2) | Delivery zone config |
| Setup: Contact Information (Step 3) | Contact details |
| Setup: Operating Hours (Step 4) | Hours of operation |
| Setup: Branding (Step 5) | Logo and brand assets |
| Setup: Operations (Step 3 - Grocery) | Grocery-specific ops |
| Business Profile - Step 1 (Grocery) | Grocery profile setup |
| Business Hours | Hours management |
| Business Type Metadata Editor | Vertical metadata config |

### Home & Dashboard

| Screen | Purpose |
|--------|---------|
| Home Dashboard | Primary merchant home |
| Tablet - Orders Dashboard | Tablet-optimized order board |
| Store Closed / After Hours | Closed-state messaging |
| Store Status - Pause Orders | Pause incoming orders |
| Live Order Alert Overlay | Real-time order notification |
| First Order Celebration | Milestone celebration |
| Poor Performance Warning | Performance alert |

### Orders (Live Queue)

| Screen | Purpose |
|--------|---------|
| Orders - Live Queue | Active order list |
| New Order - Full Detail | Incoming order review |
| Order Accepted - Confirmation | Acceptance confirmation |
| Reject Order - Reason | Rejection flow with reason |
| Order Detail - Preparing | In-kitchen state |
| Order Detail - Ready | Ready for pickup |
| Order Detail - Picked Up | Courier collected |
| Order Detail - Completed | Fulfilled order |
| Orders - Completed History | Historical orders |
| Orders - Cancelled | Cancelled order list |
| At Store - Ready Pickup (Restaurant) | Pickup-ready state |
| Pharmacy Order Notice | Pharmacy-specific order alert |
| Age Verification - Alcohol Order | Alcohol compliance check |
| Age Verify at Delivery (Alcohol) | Delivery-age verification |

### Delivery & Fulfillment

| Screen | Purpose |
|--------|---------|
| Delivery Offer - Multi-Vertical | Multi-stop delivery offer |
| Stacked Offer - Two Stops | Two-stop route offer |
| Delivery Settings | Delivery configuration |

### Menu Management

| Screen | Purpose |
|--------|---------|
| Menu - Overview | Menu home |
| Menu - Category View | Category browsing |
| Menu - Item Detail / Edit | Item editing |
| Menu - Add Option Group | Modifier group creation |
| Menu - Mark Sold Out (Quick Action) | Quick sold-out toggle |
| Tablet - Menu Management | Tablet menu editor |
| Image Upload Components & States | Image upload UI states |
| Search: Chicken Results | Menu search results |

### Store Profiles

| Screen | Purpose |
|--------|---------|
| Store: Fresh Mart Grocery | Grocery store profile |
| Store: Island Grill | Restaurant store profile |
| Restaurant Profile - Edit | Profile editing |
| Shop & Pick - Grocery | Grocery shop-and-pick flow |

### Analytics

| Screen | Purpose |
|--------|---------|
| Analytics - Overview | Dashboard summary |
| Analytics - Sales Breakdown | Revenue breakdown |
| Analytics - Popular Items | Top-selling items |
| Analytics - Operations | Operational metrics |
| Analytics - Ratings & Reviews | Customer feedback |

### Earnings & Promotions

| Screen | Purpose |
|--------|---------|
| Earnings & Payouts | Revenue and payout history |
| Payout Detail | Individual payout detail |
| Promotions & Marketing | Promo management home |
| Create Promotion | New promotion builder |

### Account & Settings

| Screen | Purpose |
|--------|---------|
| Account & Settings | Settings hub |
| Team Members Management | Staff access management |
| Notification Settings | Push / alert preferences |
| Help & Support | Support center |

### Brand Assets

| Screen | Purpose |
|--------|---------|
| Roam Dash Partner Logo | App logo (200×200) |
| Animated SVG | Brand animation asset |
