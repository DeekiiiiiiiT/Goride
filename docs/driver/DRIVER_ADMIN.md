# Driver admin — user management (ops playbook)

Super Admin → **User Management** (`/admin/users`) for driver (`role: driver`) accounts on roamdriver.co/admin.

## Metrics (Uber-style)

| Metric | Definition |
|--------|------------|
| **Live status** | `on_trip` if assigned ride is active; else `online` if `available_for_rides` and location updated within 5 minutes; else `offline`. |
| **Account status** | `driver_profiles.status`: `active`, `pending`, `suspended`, `deactivated` (separate from live status). |
| **Compliance queue** | Drivers with `status = pending` OR any compliance blocker (incomplete onboarding, background check not approved, missing insurance/vehicle for independent drivers). |
| **Total trips** | Rides where `assigned_driver_user_id` = driver. |
| **Acceptance rate** | `offers_accepted / offers_sent × 100` (all offer waves). |
| **Completion rate** | `completed_trips / total_trips × 100`. |
| **Lifetime earnings** | Sum of `fare_final_minor` on completed trips. |
| **Hours online** | Not tracked in v1 (no session table). |

## Roles

| Role | List / detail | Write actions |
|------|---------------|---------------|
| driver_ops | Yes | None |
| driver_admin | Yes | Suspend, approve, compliance updates |
| platform_owner, platform_support, superadmin | Yes | All write actions; force-approve (owner/superadmin only) |
| platform_owner, superadmin | Yes | Delete driver profile |

## Compliance workflow

### Status vs compliance

- **Account status `pending`**: Driver cannot go online until admin approves (`POST /admin/drivers/:userId/approve`).
- **Onboarding complete** does not auto-activate — admin approval is required.
- **Compliance blockers** are computed server-side in `complianceLogic.ts` (single source of truth).

### Blocker codes

| Code | Meaning |
|------|---------|
| `no_profile` | Auth account exists but no `driver_profiles` row |
| `onboarding_incomplete` | `onboarding_complete = false` |
| `background_check_not_approved` | Background check not `approved` |
| `insurance_missing` | No `insurance_expiry` (independent drivers only) |
| `vehicle_missing` | No `driver_vehicles` row (independent drivers only) |
| `account_suspended` / `account_deactivated` | Lifecycle block — approve rejected |

### Approval policy

- **Strict approve** (default): All required blockers cleared; sets `status = active`.
- **Force approve**: `platform_owner` or `superadmin` only; requires reason ≥ 10 characters; audit logged.

## API contracts

### `GET /functions/v1/driver/admin/compliance`

Query: `limit`, `offset`, `queue=true` (default). Legacy: `status=pending|complete` filters by onboarding only.

Response: `{ drivers: DriverComplianceRow[], total, limit, offset }`

### `PATCH /functions/v1/driver/admin/compliance/:driverId`

Body: `{ background_check?: 'pending' | 'approved' | 'rejected' }`  
Requires write role. Returns updated driver row with blockers.

### `POST /functions/v1/driver/admin/drivers/:userId/approve`

Body: `{ force?: boolean, reason?: string }`  
Errors: `not_pending`, `blocked_lifecycle_state`, `compliance_incomplete`, `force_reason_required`, `no_profile`, `forbidden`

## Deploy order (compliance + activation)

1. Deploy the `driver` Edge function (backend routes must exist first).
2. Ship the driver admin frontend (Compliance page + approve actions).
3. Smoke test `/admin/compliance` and approve flow on staging.

## Manual QA checklist (compliance)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | New signup, no onboarding | Pending; blockers include onboarding; cannot strict approve |
| 2 | Onboarding complete, BG pending | Blocker = background check; PATCH approve BG → strict approve enabled |
| 3 | Strict approve | `status → active`; driver can go online |
| 4 | Force approve as driver_admin | 403 forbidden |
| 5 | Force approve as superadmin without reason | 400 `force_reason_required` |
| 6 | Force approve with reason | Active + audit event |
| 7 | Approve already active | 200 idempotent |
| 8 | Approve suspended | 409 blocked |
| 9 | driver_ops role | Can view queue; no write buttons |
| 10 | Suspend active driver | Lifecycle unchanged |

## Technical notes

- Apply migration `20260519120000_driver_admin_directory.sql` and redeploy the `driver` Edge function.
- Hosted Supabase: ensures `public.driver_directory_stats`, `public.rides_driver_locations`, `public.rides_driver_offers`.
- API: `GET /functions/v1/driver/admin/drivers`, `GET .../drivers/:userId`, `GET .../admin/compliance`, `POST .../drivers/:userId/approve`.

## Deploy order (independent driver / trip ledger)

1. Apply migration `20260526120000_ride_payment_and_completion.sql` and reload PostgREST schema.
2. Redeploy the `rides` Edge function (driver `me/trips`, `me/earnings`, completion ledger fields).
3. Redeploy the `driver` Edge function (platform trip ledger).
4. Ship the driver app (independent Home / Earnings / Trips UI).

## Independent driver work week (earnings)

- **Work week** on Home uses **Monday 04:00 → next Monday 04:00** (`America/Jamaica`).
- **Today** uses calendar midnight–midnight Jamaica.
- Implemented in `supabase/functions/_shared/driverRideQueries.ts` (`jamaicaWorkWeekBounds`).

## Manual test checklist (independent vs fleet)

| Scenario | Expected |
|----------|----------|
| Independent driver, Trips tab | Roam trips from `rides.ride_requests` |
| Independent Home, This week | Cash earnings for completed trips in calendar week (Jamaica) |
| Independent Earnings | Lifetime cash total; digital $0 + coming soon |
| Fleet driver, Home | Welcome / milestone / Uber-InDrive cards + TripTimer unchanged |
| Fleet driver, Trips / Earnings | Legacy KV-backed screens unchanged |
| Admin Trip Ledger | All platform trips with filters |

## Manual test checklist (admin portal)

1. Open `/admin` as superadmin — dashboard shows real driver counts.
2. Open **User Management** — directory loads with live status dots; pending drivers show blocker summary.
3. Open **Compliance** — queue lists drivers with blockers and approve actions.
4. Search by driver email; filter by account status and live status.
5. Open a driver — Compliance tab shows checklist; approve activates account.
6. Log in as `driver_ops` — can view; no write actions in UI.
