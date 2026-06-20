# Roam product lines

## Rideshare stack (Uber-like)

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamfleet.co](https://roamfleet.co) | Rideshare fleet managers | [roamfleet.co/admin](https://roamfleet.co/admin) — fleet product ops |
| [roamdriver.co](https://roamdriver.co) | Drivers | `/admin` — driver product ops |
| [roam-s.co](https://roam-s.co) | Riders | `/admin` — rides product ops |
| [roamhaul.co](https://roamhaul.co) | Haulers | `/admin` — haul product ops |

Fleet managers are tagged `productLine: fleet` and `businessType: rideshare`.

## Roam Enterprise (multi-vertical fleet)

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamenterprise.co](https://roamenterprise.co) | Delivery, taxi, trucking, shipping fleets | [roamdominion.co](https://roamdominion.co) — platform Super Admin (Dominion) |

Enterprise fleet managers are tagged `productLine: enterprise` with their chosen `businessType`.

## Roam Dash

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamdash.co](https://roamdash.co) | Merchants & ops | `/admin` — dash product ops |
| [courier.roamdash.co](https://courier.roamdash.co) | Couriers | `/admin` — courier product ops |

## Shared backend

One Supabase project. Platform settings are stored per segment:

| Segment | KV key | Settings UI |
|---------|--------|-------------|
| Global | `platform:settings:global` | [roamdominion.co](https://roamdominion.co) → Global Settings |
| Fleet | `platform:settings:fleet` | Dominion → Roam Fleet; roamfleet.co/admin |
| Enterprise | `platform:settings:enterprise` | Dominion → Roam Enterprise; roamdominion.co |
| Rides | `platform:settings:rides` | roam-s.co/admin |
| Driver | `platform:settings:driver` | roamdriver.co/admin |
| Haul | `platform:settings:haul` | roamhaul.co/admin |
| Dash | `platform:settings:dash` | roamdash.co/admin |
| Courier | `platform:settings:courier` | courier.roamdash.co/admin |

Legacy key `platform:settings` is read-only (dual-read fallback for fleet/enterprise migration).

Clients send:

- `X-Roam-Settings-Segment` — primary segment selector
- `X-Roam-Product-Line: fleet|enterprise` — backward compat (from `VITE_PRODUCT_LINE`)

Full architecture: [`docs/platform/SETTINGS_ARCHITECTURE.md`](../platform/SETTINGS_ARCHITECTURE.md)

## Vercel env

| Project | `VITE_PRODUCT_LINE` |
|---------|---------------------|
| `@roam/fleet` | `fleet` |
| `@roam/enterprise` | `enterprise` |
| `@roam/admin` | `enterprise` |

## Migrations (superadmin)

After deploy, run once from enterprise admin session:

1. `POST /make-server-37f42386/admin/migrate-platform-settings` (idempotent)
2. `POST /make-server-37f42386/admin/migrate-product-lines`
