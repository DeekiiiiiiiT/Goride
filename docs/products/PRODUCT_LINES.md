# Roam product lines

## Rideshare stack (Uber-like)

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamfleet.co](https://roamfleet.co) | Rideshare fleet managers | [roamfleet.co/admin](https://roamfleet.co/admin) — fleet product ops |
| [roamdriver.co](https://roamdriver.co) | Drivers | `/admin` — driver product ops |
| [roam-s.co](https://roam-s.co) | Riders | `/admin` — rides product ops |
| [roamhaul.co](https://roamhaul.co) | Haulers | `/admin` — haul product ops |

Fleet managers are tagged `productLine: fleet` and `businessType: rideshare`.

## Roam Enterprise (Path B — standalone product)

| Domain | Audience | Surfaces |
|--------|----------|----------|
| [roamenterprise.co](https://roamenterprise.co) | Multi-vertical B2B orgs | Marketing (public) + `/sign-in` product picker; real `/login` only on courier/freight-forwarder doors + `/admin` product ops |
| [roamdominion.co](https://roamdominion.co) | Platform Super Admin | Dominion segment `enterprise` |

**Architecture (locked 2026-07-31):** Enterprise is its **own authenticated app** inside `apps/enterprise` (Path B). It is **not** a second deploy of `apps/fleet`. Shared packages (`@roam/ui`, `@roam/auth-client`, `@roam/admin-core`, etc.) are reused; Fleet’s app shell is not.

Enterprise orgs are tagged `productLine: enterprise` with business types from `@roam/business-config` (default vertical: `freight_forwarding`). Rideshare/taxi are excluded from Enterprise signup toggles.

### Products on the same domain (Freight Forwarder & Courier)

Sibling products under `productLine: enterprise` (see [`WAREHOUSE_COURIER_MODEL.md`](./WAREHOUSE_COURIER_MODEL.md) and [`ENTERPRISE_PRODUCT_DOORS.md`](./ENTERPRISE_PRODUCT_DOORS.md)):

| Door host | Product | Buyer (`business_type`) | Lands on |
|-----------|---------|-------------------------|----------|
| `courier.roamenterprise.co` | **Courier** | `freight_forwarding` (+ courier verticals) | `/app` |
| `freight-forwarder.roamenterprise.co` | **Freight Forwarder** | `warehouse` | `/freight-forwarder` |
| `roamenterprise.co` (apex) | Marketing | — | public site; `/sign-in` picks Rideshare / Delivery / Enterprise apps (no apex password form) |

Local: `courier.localhost:3003` / `freight-forwarder.localhost:3003`.

**Connection model:** many-to-many `freight.warehouse_courier_links`. Packages carry `owner_org_id` (courier) + `operating_warehouse_org_id` (freight forwarder). In-house floors use a self-link (`warehouse_org_id = courier_org_id`).

Paths `/app` and `/freight-forwarder` remain inside the SPA; **permanent installs** are per door hostname (two PWAs).

### Locked v1 scope (Freight Forwarding / Courier)

- Back-office desktop only (no customer self-serve portal in intl pipeline)
- Own fleet + 3PL carriers modeled from day one
- Domestic Jamaica shipments **and** international mailbox pipeline (US intake → customs pack → JA hub → pickup/door)
- Mixed last-mile fleets: Roam marketplace, org fleet, client-owned, 3PL
- Customs: broker CSV export + manual status board (no live ASYCUDA API)
- Monetization / payment wall deferred
- Fuel/toll available via fleet-bridge modules

Full ops runbook: [`docs/enterprise-intl-freight-pipeline.md`](../enterprise-intl-freight-pipeline.md)

## Roam Rush

| Domain | Audience | Admin |
|--------|----------|-------|
| [roamrush.app](https://roamrush.app) | Customers & ops | `/admin` — rush product ops |
| [partner.roamrush.app](https://partner.roamrush.app) | Merchants (Partner) — delivery orders only | Partner portal + embedded admin |
| [command.roamrush.app](https://command.roamrush.app) | Merchants (Command) — in-store ops, invite-only | POS, inventory, staff tablets |
| [courier.roamrush.app](https://courier.roamrush.app) | Couriers | `/admin` — courier product ops |

## Shared backend

One Supabase project. Platform settings are stored per segment:

| Segment | KV key | Settings UI |
|---------|--------|-------------|
| Global | `platform:settings:global` | [roamdominion.co](https://roamdominion.co) → Global Settings |
| Fleet | `platform:settings:fleet` | Dominion → Roam Fleet; roamfleet.co/admin |
| Enterprise | `platform:settings:enterprise` | Dominion → Roam Enterprise; roamenterprise.co/admin |
| Rides | `platform:settings:rides` | roam-s.co/admin |
| Driver | `platform:settings:driver` | roamdriver.co/admin |
| Haul | `platform:settings:haul` | roamhaul.co/admin |
| Dash | `platform:settings:dash` | roamrush.app/admin |
| Courier | `platform:settings:courier` | courier.roamrush.app/admin |

Legacy key `platform:settings` is read-only (dual-read fallback for fleet/enterprise migration).

Clients send:

- `X-Roam-Settings-Segment` — primary segment selector
- `X-Roam-Product-Line: fleet|enterprise` — from `VITE_PRODUCT_LINE`

Freight APIs live at `supabase/functions/freight` (`API_ENDPOINTS.freight`), not `_fleet-server`.

Full architecture: [`docs/platform/SETTINGS_ARCHITECTURE.md`](../platform/SETTINGS_ARCHITECTURE.md)

## Vercel env

| Project | `VITE_PRODUCT_LINE` |
|---------|---------------------|
| `@roam/fleet` | `fleet` |
| `@roam/enterprise` | `enterprise` |
| `@roam/admin` | `enterprise` (Dominion default segment for Enterprise ops) |

Auth clients: `supabaseEnterpriseApp` / `supabaseEnterpriseAdmin` in `@roam/auth-client`.

## Migrations (superadmin)

After deploy, run once from enterprise admin session:

1. `POST /make-server-37f42386/admin/migrate-platform-settings` (idempotent)
2. `POST /make-server-37f42386/admin/migrate-product-lines`
