# Stitch design reference — Earnings Policy Configuration

Project: **Roam Fleet APP** (`3587123323600813385`)  
Design system: **Precision Operations** (`assets/d393c21ec4be4c768bf9a2e8060fd674`)

## Screens

| Screen | Device | ID |
|--------|--------|-----|
| Earnings Policy Configuration (Rules) | DESKTOP | `5456fcde4ae04a0f86ea1395f626cfae` |
| Earnings Policy Configuration (Rules) | MOBILE | `e538666b246e4605bd0b5c9162ead85d` |
| Earnings Policy Configuration (Schedule) | DESKTOP | `2a469867766f4413b806a40b17abef7b` |
| Add / Edit Schedule Version | DESKTOP | `dd53db1a339045da97e99d027ef58004` |

React: `apps/fleet/src/components/earnings-policy/`  
Nav: Driver Operations → **Earnings Policy Configuration** (`earnings-policy`, permission `nav.tier_config`).

## As-built UX

- **Rules / Schedule** tabs (Fleet Policy IA).
- Create/Edit policy = **5-step wizard**: Basics → Tiers → Quotas → Allowance → Review. Create/Save only on Review.
- Quota/PA left off require explicit confirm checkboxes so steps cannot be skipped silently.

## Resolution order (runtime)

1. Version membership (driver on covering Monday window)  
2. Default policy template/version for the week  
3. Prefs fallback (`tierService` / `preferences:general`) when library empty or no Default  

Empty GET `/earnings-policies` returns `[]` — no auto-seed. Global Tier Config UI removed.
