# Roam product lines

## Rideshare stack (Uber-like)

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamfleet.co](https://roamfleet.co) | Rideshare fleet managers | [roamfleet.co/admin](https://roamfleet.co/admin) — fleet product ops |
| [roamdriver.co](https://roamdriver.co) | Drivers | `/admin` — driver product ops |
| [roam-s.co](https://roam-s.co) | Riders | `/admin` — rides product ops |

Fleet managers are tagged `productLine: fleet` and `businessType: rideshare`.

## Roam Enterprise (multi-vertical fleet)

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamenterprise.co](https://roamenterprise.co) | Delivery, taxi, trucking, shipping fleets | [roamenterprise.co/admin](https://roamenterprise.co/admin) — platform Super Admin |

Enterprise fleet managers are tagged `productLine: enterprise` with their chosen `businessType`.

## Shared backend

One Supabase project. Platform settings are stored separately:

- `platform:settings:fleet`
- `platform:settings:enterprise`

Clients send `X-Roam-Product-Line: fleet|enterprise` (from `VITE_PRODUCT_LINE`).

## Vercel env

| Project | `VITE_PRODUCT_LINE` |
|---------|---------------------|
| `@roam/fleet` | `fleet` |
| `@roam/enterprise` | `enterprise` |
| `@roam/admin` | `enterprise` |

## Migrations (superadmin)

After deploy, run once from enterprise admin session:

1. `POST /make-server-37f42386/admin/migrate-platform-settings`
2. `POST /make-server-37f42386/admin/migrate-product-lines`
