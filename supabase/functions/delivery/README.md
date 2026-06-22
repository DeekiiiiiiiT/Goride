# Roam Dash - Delivery Edge Function

Backend service for Roam Dash (merchants, menus, orders, courier assignment, admin).

Mounted at `/delivery`.

## Admin roles

Dash admin routes require `requireProductAdmin(c, "dash")`:

- `platform_owner`, `platform_support`, `superadmin`
- `dash_admin`, `dash_ops`

Write actions require `dash_admin` or platform write roles (`dashPermissions.ts`).

## Dash admin routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/dashboard/stats` | Platform KPIs |
| GET | `/admin/merchants/stats` | Verification counts |
| GET | `/admin/merchants/queue` | SLA verification queue |
| GET | `/admin/merchants` | List with filters |
| GET | `/admin/merchants/:id` | Detail + team + docs |
| POST | `/admin/merchants/:id/status` | Verification status change |
| POST | `/admin/merchants/:id/suspend\|unsuspend\|deactivate\|reactivate` | Operational lifecycle |
| PATCH | `/admin/merchants/:id/ops` | Force pause, commission |
| PATCH | `/admin/merchants/:id/assign` | Reviewer assignment |
| PATCH | `/admin/merchants/:id/checklist` | Verification checklist |
| PATCH | `/admin/merchants/documents/:docId` | Per-document review |
| GET | `/admin/merchant-owners` | Owner search |
| GET | `/admin/team` | Dash admin staff |
| GET | `/admin/orders` | Order list |
| GET | `/admin/orders/:id` | Order detail |
| POST | `/admin/orders/:id/cancel\|complete` | Order ops |
| GET | `/admin/customers` | Customer list |
| GET/PATCH | `/admin/finance/*` | Payouts, disputes, reviews |

Courier admin routes remain under `/admin/couriers/*`.

Ops playbook: `docs/dash-admin/OPS_PLAYBOOK.md`

## Merchant verification status machine

`pending` → `in_review` → `approved` | `rejected` | `docs_requested`

Post-approval operations use `operational_status`: `active` | `suspended` | `deactivated`.

## SMTP

See original README section for `SMTP_*` env vars for verification emails.
