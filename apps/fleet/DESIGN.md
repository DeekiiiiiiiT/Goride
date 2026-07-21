---
name: Precision Operations — Fleet Expense Hub
source: Stitch — Roam Fleet APP (projects/3587123323600813385)
designSystem: assets/d393c21ec4be4c768bf9a2e8060fd674
device: MOBILE (390×844) first + DESKTOP (1280+)
colorMode: LIGHT
colorVariant: FIDELITY
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd8e5'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2ff'
  surface-container: '#f0ecf9'
  surface-container-high: '#eae6f4'
  surface-container-highest: '#e4e1ee'
  on-surface: '#1b1b24'
  on-surface-variant: '#464555'
  inverse-surface: '#302f39'
  inverse-on-surface: '#f3effc'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#684000'
  on-tertiary: '#ffffff'
  tertiary-container: '#885500'
  on-tertiary-container: '#ffd4a4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  background: '#fcf8ff'
  on-background: '#1b1b24'
  surface-variant: '#e4e1ee'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
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
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
spacing:
  unit: 8px
  container-padding-mobile: 16px
  container-padding-desktop: 24px
  gutter: 16px
  component-gap: 8px
  touch-target-min: 44px
  touch-target-preferred: 48px
---

# Fleet Expense Hub — Design constraints

Use **Precision Operations** only (not Merchant Core). This document governs Expense Hub screens inside Business Finance.

## Product rules
- Mobile-first; desktop/tablet are variants of the same information architecture.
- Structural spacing on an **8px grid**.
- Interactive targets ≥ **44px** (prefer 48px) on mobile.
- **No hardcoded demo numbers** in implementation — Stitch screens may show placeholders; production UI binds real API data only.
- Preserve existing Fleet navigation patterns (Business Finance tabs, indigo primary actions, slate surfaces).

## Screen inventory (must exist in Stitch)
- Expense Hub — Overview (Mobile / Desktop)
- Expense Hub — Expense Register (Mobile / Desktop)
- Expense Hub — New Expense: Details (Mobile / Desktop)
- Expense Hub — New Expense: Allocate & Review (Mobile / Desktop)
- Expense Hub — Recurring Rules (Mobile / Desktop)
- Expense Hub — Rule Builder: Assign Vehicles (Mobile / Desktop)
- Expense Hub — Approvals Queue (Mobile / Desktop)
- Expense Hub — Expense Detail & Payment (Mobile / Desktop)
- Expense Hub — Categories & Vendors (Mobile / Desktop)

## States to include in specs
Loading, empty, error, permission-denied, validation, destructive confirmation, partial payment.

## Brand
High-utility fleet finance: dense tables on desktop, stacked cards on mobile, soft status chips, indigo primary, emerald success, amber warning, rose destructive.
