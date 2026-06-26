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

## SMTP / Resend

Required Edge Function secrets for transactional email (merchant approval, team invites):

| Secret | Example | Notes |
|--------|---------|-------|
| `SMTP_HOST` | `smtp.resend.com` | |
| `SMTP_PORT` | `465` | |
| `SMTP_USER` | `resend` | Auth username only — **not** used as From address |
| `SMTP_PASS` | `re_...` | Resend API key |
| `SMTP_FROM` | `Roam Dash <noreply@roam-s.co>` | **Required** — must be a verified Resend domain |
| `RESEND_FROM` | (optional) | Overrides `SMTP_FROM` for Resend API sends |

Resend sends use the REST API when `SMTP_HOST` contains `resend.com` and `SMTP_PASS` starts with `re_`.
Never use the SMTP username (`resend`) as the sender — it is not a valid email address.

## Merchant team invites

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/merchant/team` | Owner | Roster + pending invites |
| POST | `/merchant/team/invites` | Owner | Sends SMTP email when configured |
| POST | `/merchant/team/invites/:id/resend` | Owner | Regenerates token |
| DELETE | `/merchant/team/invites/:id` | Owner | Cancel pending invite |
| PATCH | `/merchant/team/members/:id` | Owner | Update role, permissions, `job_station` |
| DELETE | `/merchant/team/members/:id` | Owner | Remove member |
| GET | `/merchant/team/invites/preview/:token` | Public (anon `apikey` + `Authorization`) | Sanitized invite preview |
| GET | `/merchant/team/invites/pending` | Invitee | List invites for session email |
| POST | `/merchant/team/invites/token/:token/accept` | Invitee | Join store team via invite link |
| POST | `/merchant/team/invites/:id/accept` | Invitee | Join store team |
| POST | `/merchant/team/invites/:id/decline` | Invitee | Decline invite |

Env: `PARTNER_PORTAL_URL` (default `https://partner.roamdash.co`) for invite links.

Hosting: partner SPA must serve `index.html` for `/team-invite/*` paths.

`job_station` on invites and members: `counter` | `kitchen` | `manager` | `NULL` (legacy). Invites accept copies station to the new member row. `GET /merchant/profile` and `GET /merchant/orders` expose `membership.job_station` and optional `lastHandledBy` on orders.

## Staff station PIN (floor roster)

Roster members (`login_type = roster`) sign in on a shared tablet: owner/manager stays logged in, staff pick their name and enter a self-set PIN. Feature-flagged on the client (`staffOperationsV1` + `staffStationPinV1`).

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/merchant/team/members/roster` | Owner | Create floor staff (name + `job_station`); no email |
| POST | `/merchant/team/members/:id/pin-reset` | Owner | Lock PIN; clears hash and active shift sessions |
| GET | `/merchant/station/roster` | Owner/manager device JWT | Safe roster list (`pin_status`, no hash) |
| POST | `/merchant/station/pin/create` | Owner/manager device JWT | First PIN or after reset (`memberId`, `pin`, `confirmPin`) |
| POST | `/merchant/station/pin/verify` | Owner/manager device JWT | Normal shift login; returns `shiftToken` |
| POST | `/merchant/station/shift/end` | Device JWT + `X-Staff-Shift-Token` | End shift |

`PUT /orders/:id/status` accepts optional `X-Staff-Shift-Token` to set `order_events.team_member_id` for `lastHandledBy` attribution while keeping `actor_id` as the device user.

Member fields: `login_type` (`account` \| `roster`), `pin_status` (`unset` \| `active` \| `locked`). PINs stored as bcrypt hash only.
