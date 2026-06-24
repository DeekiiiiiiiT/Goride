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

## Vertical metadata (multi-vertical Dash)

Business types carry vertical config in `delivery.merchant_business_types` (`vertical_type`, `fulfillment_type`, `go_live_rule`, `compliance_tier`, etc.). Merchants snapshot these fields on submit.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/merchants?vertical=` | Public discovery filter by `vertical_type` |
| GET/PUT | `/merchant/settings` | Pickup / scheduled order flags (`merchant_settings`) |
| POST | `/merchants/:id/catalog/import` | Bulk retail catalog import (CSV JSON body) |
| GET | `/merchant/application-status` | Setup checklist (`menuComplete` / `catalogComplete` by `go_live_rule`) |
| GET/PATCH | `/admin/onboarding/business-types` | CRUD with full metadata (vertical presets, required docs, regulated tier) |
| GET | `/admin/merchants?vertical_in=pharmacy,alcohol` | Filter merchant list by vertical snapshot |

Admin UI: **Merchants → Onboarding → Business Types** — configure sections, vertical presets, KYC documents, activate/deactivate types. Use template selector when adding types (Restaurant, Grocery, Pharmacy, etc.).

Regulated partners appear under **Merchants → Regulated** tab (`pharmacy` + `alcohol`).

Shared client helpers: `@roam/vertical-config`, `@roam/types`.

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

See original README section for `SMTP_*` env vars for verification emails and **team invite emails**.

## Merchant team invites

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/merchant/team` | Owner | Roster + pending invites |
| POST | `/merchant/team/invites` | Owner | Sends SMTP email when configured |
| POST | `/merchant/team/invites/:id/resend` | Owner | Regenerates token |
| DELETE | `/merchant/team/invites/:id` | Owner | Cancel pending invite |
| PATCH | `/merchant/team/members/:id` | Owner | Update role/permissions |
| DELETE | `/merchant/team/members/:id` | Owner | Remove member |
| GET | `/merchant/team/invites/preview/:token` | Public | Sanitized invite preview |
| GET | `/merchant/team/invites/pending` | Invitee | List invites for session email |
| POST | `/merchant/team/invites/:id/accept` | Invitee | Join store team |
| POST | `/merchant/team/invites/:id/decline` | Invitee | Decline invite |

Env: `PARTNER_PORTAL_URL` (default `https://partner.roamdash.co`) for invite links.

Hosting: partner SPA must serve `index.html` for `/team-invite/*` paths.
