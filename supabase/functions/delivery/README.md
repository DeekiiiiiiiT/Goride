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
| GET | `/admin/merchants/incomplete-setup` | Draft merchants + submitted merchants with incomplete setup |
| GET | `/admin/merchants/stats` | Verification counts |
| GET | `/admin/merchants/queue` | SLA verification queue |
| GET | `/admin/merchants` | List with filters |
| GET | `/admin/merchants/:id` | Detail + team + docs |
| POST | `/admin/merchants/:id/status` | Verification status change |
| POST | `/admin/merchants/:id/suspend\|unsuspend\|deactivate\|reactivate` | Operational lifecycle |
| DELETE | `/admin/merchants/:id` | Remove Dash partner store (`platform_owner` / `superadmin` / `dash_admin`; body: `reason`, `confirm_name`) |
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
| DELETE | `/admin/customers/:id` | Remove Dash customer (`dash_admin`+; body: `reason`, `confirm_name`) |
| DELETE | `/admin/team/:userId` | Revoke dash admin team role |
| GET/PATCH | `/admin/finance/*` | Payouts, disputes, reviews |
| GET/POST/PATCH/DELETE | `/admin/onboarding/business-types` | Manage business type taxonomy |
| GET/POST/PATCH/DELETE | `/admin/onboarding/business-type-sections` | Manage business type sections |

Courier admin routes remain under `/admin/couriers/*`.

## Partner onboarding routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/partner/bootstrap` | Idempotent draft `merchants` row when partner signs in |
| PATCH | `/partner/onboarding-draft` | Sync wizard step + partial form JSON |
| GET | `/partner/business-types` | Active business type sections for partner setup form |
| POST | `/merchants` | Final submit — transitions `draft` → `submitted` |

Ops playbook: `docs/dash-admin/OPS_PLAYBOOK.md`

## Merchant verification status machine

`pending` → `in_review` → `approved` | `rejected` | `docs_requested`

Post-approval operations use `operational_status`: `active` | `suspended` | `deactivated`.

## Product-scoped delete contract

Destructive admin deletes use this shape across Dash routes (merchants, customers, team):

```
DELETE /admin/{entity}/:id
Body: { reason: string, confirm_name: string }
Auth: {product}_admin | platform_owner | superadmin
Effect: remove product data only; auth.users unchanged
Response: { ok: true, message: string }
```

`confirm_name` must match the entity display name (or id for drafts). Never deletes `auth.users`.

## SMTP

See original README section for `SMTP_*` env vars for verification emails.
