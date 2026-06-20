# Courier admin — user management (ops playbook)

Super Admin → **User Management** (`/admin/users`) for courier accounts on courier.roamdash.co/admin.

## Metrics

| Metric | Definition |
|--------|------------|
| **Live status** | `on_delivery` if `courier_availability.active_order_id` is set; else `online` if `is_online` and GPS updated within 5 minutes; else `offline`. |
| **Account status** | `courier_profiles.status`: `active`, `pending`, `suspended`, `deactivated`. |
| **Compliance queue** | Couriers with `status = pending` OR any compliance blocker. |
| **Total deliveries** | `courier_profiles.total_deliveries` (updated by delivery pipeline). |

## Roles

| Role | List / detail | Write actions |
|------|---------------|---------------|
| courier_ops | Yes | None |
| courier_admin | Yes | Suspend, approve, compliance updates |
| platform_owner, platform_support, superadmin | Yes | All write actions; force-approve |
| platform_owner, superadmin | Yes | Delete courier profile |

## Compliance workflow

- **Account status `pending`**: Courier cannot go online until admin approves (`POST /admin/couriers/:userId/approve`).
- **Onboarding complete** does not auto-activate — admin approval is required.
- Blockers are computed in `supabase/functions/delivery/admin/complianceLogic.ts`.

### Blocker codes

| Code | Meaning |
|------|---------|
| `no_profile` | Auth account exists but no `courier_profiles` row |
| `onboarding_incomplete` | `onboarding_complete = false` |
| `background_check_not_approved` | Background check not `approved` |
| `license_missing` | No approved `drivers_license` document |
| `vehicle_missing` | No `courier_vehicles` row |
| `insurance_missing` | No approved `insurance` document |
| `account_suspended` / `account_deactivated` | Lifecycle block |

## API base

`GET/POST … /functions/v1/delivery/admin/couriers/*`  
`GET/POST … /functions/v1/delivery/admin/orders/:orderId/*`

Requires `Authorization: Bearer <jwt>` and `apikey` header. Caller must have `courier_admin`, `courier_ops`, or platform admin role.

## Deploy order

1. Apply migration `20260620120000_courier_profiles.sql`.
2. Deploy the `delivery` Edge function (courier admin routes).
3. Ship `@roam/dash-courier` with `/admin` portal.
4. Smoke test compliance approve flow on staging.

## Manual QA checklist

| # | Scenario | Expected |
|---|----------|----------|
| 1 | New signup completes permissions | `courier_profiles` row created (`pending`) |
| 2 | Compliance queue lists pending courier | Blockers shown; strict approve disabled until cleared |
| 3 | PATCH background_check approved | Blocker removed when other assets present |
| 4 | Strict approve | `status → active` |
| 5 | Force approve without reason | 400 `force_reason_required` |
| 6 | Presence map | Online couriers with fresh GPS appear on map |
| 7 | Support order lookup | Order detail + cancel/complete for write roles |

## Local dev

- Consumer app: `pnpm --filter @roam/dash-courier dev` → http://localhost:5176
- Admin portal: http://localhost:5176/admin
- Assign `courier_admin` in Supabase `app_metadata.role` for test admin user.
