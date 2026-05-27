# Driver admin — user management (ops playbook)

Super Admin → **User Management** (`/admin/users`) for driver (`role: driver`) accounts on roamdriver.co/admin.

## Metrics (Uber-style)

| Metric | Definition |
|--------|------------|
| **Live status** | `on_trip` if assigned ride is active; else `online` if `available_for_rides` and location updated within 5 minutes; else `offline`. |
| **Account status** | `driver_profiles.status`: `active`, `pending`, `suspended`, `deactivated` (separate from live status). |
| **Total trips** | Rides where `assigned_driver_user_id` = driver. |
| **Acceptance rate** | `offers_accepted / offers_sent × 100` (all offer waves). |
| **Completion rate** | `completed_trips / total_trips × 100`. |
| **Lifetime earnings** | Sum of `fare_final_minor` on completed trips. |
| **Hours online** | Not tracked in v1 (no session table). |

## Roles

| Role | List / detail | Write actions (v1) |
|------|---------------|---------------------|
| driver_ops | Yes | None |
| driver_admin | Yes | None (metrics-only v1) |
| platform_owner, platform_support, superadmin | Yes | None |

## Technical notes

- Apply migration `20260519120000_driver_admin_directory.sql` and redeploy the `driver` Edge function.
- Hosted Supabase: ensures `public.driver_directory_stats`, `public.rides_driver_locations`, `public.rides_driver_offers`.
- API: `GET /functions/v1/driver/admin/drivers`, `GET .../drivers/:userId`, `GET .../drivers/:userId/trips`, `GET .../admin/ledger/trips`.

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

## Manual test checklist

1. Open `/admin` as superadmin — dashboard shows real driver counts.
2. Open **User Management** — directory loads with live status dots.
3. Search by driver email; filter by account status and live status.
4. Open a driver — KPI cards and trips tab show data.
5. Log in as `driver_ops` — can view; no write actions in UI.
6. Confirm **Compliance** link from driver detail opens compliance queue.
