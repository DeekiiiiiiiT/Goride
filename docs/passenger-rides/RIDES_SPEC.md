# Roam passenger rides — domain spec (`roam-s.co`)

Enterprise-facing specification for Uber-style **automatic dispatch**, aligned with the bounded-context **`rides`** schema and **`rides`** Supabase Edge function.

---

## 1. Goals

- **Riders** book on **`roam-s.co`**; **drivers** fulfill on **`roamdriver.co`**.
- **Server authority**: ride lifecycle transitions occur through authenticated **`rides`** Edge handlers using **`SUPABASE_SERVICE_ROLE_KEY`** after JWT verification (never expose service role to browsers).
- **Contract-first**: versioned paths under `/v1/*`; payloads stabilized in `@roam/types` (`rides` module).

---

## 2. Ride state machine

Canonical statuses (`rides.ride_requests.status`):

| Status | Meaning |
|--------|---------|
| `matching` | Rider requested; system issuing/expiring driver offers in waves. |
| `driver_assigned` | A driver accepted an offer; pre-pickup. |
| `driver_en_route_pickup` | Driver is navigating to pickup. |
| `driver_arrived_pickup` | Driver at pickup point. |
| `on_trip` | Passenger onboard en route to dropoff. |
| `awaiting_cash_settlement` | **(Flag-gated)** Cash fare locked; driver must confirm cash received. Not active until `CASH_SETTLEMENT_ENABLED=1`. |
| `completed` | Trip finished; receipt available. |
| `cancelled` | Terminal cancel (rider, driver, or system). |

### Allowed transitions (abbrev.)

- `matching` → `driver_assigned` — driver **`accept`** on pending non-expired offer (exclusive winner).
- `driver_assigned` → `driver_en_route_pickup` → `driver_arrived_pickup` → `on_trip` → `completed` — driver **`PATCH`** status (`driver_transition`).
- **Cash settlement (flag-gated):** `on_trip` → `awaiting_cash_settlement` → `POST /v1/requests/:id/cash-settlement` → `completed`. Card trips skip settlement.
- Any active → `cancelled` — rider **`cancel`** or driver **`cancel`** with rules below.

### Cash settlement & wallet (flag-gated)

**Flags (default OFF):** server `CASH_SETTLEMENT_ENABLED=1` on the rides edge function; client `VITE_CASH_SETTLEMENT=1` on passenger and driver builds. Do not enable in production until staging QA passes.

When enabled:

- Cash trips: `on_trip` → **`awaiting_cash_settlement`** (fare locked) → driver **`POST /v1/requests/:id/cash-settlement`** → **`completed`**. Card trips skip settlement (`on_trip` → `completed`).
- Driver confirms **`cash_received_minor`** (fare only; tips stored separately). Idempotent via **`idempotency_key`** (`409` on same key + different amount).
- Outcomes: **exact**, **underpay** (rider arrears), **overpay** (change credit to rider wallet), **unpaid** (ops backstop after 7 days).
- Double-entry wallet: `rides.payment_accounts` + `rides.payment_journal_entries`; system accounts **`platform:receivable`**, **`platform:clearing`**.
- **`driver_net_minor`** always reflects full fare; underpay does not reduce driver earnings.
- Wallet read APIs: **`GET /v1/wallet`**, **`GET /v1/wallet/journal`** (rider); **`GET /v1/drivers/me/wallet`**, **`GET /v1/drivers/me/wallet/journal`** (driver). Legacy **`GET /v1/wallet/transactions`** ride list remains when flag OFF; use **`?legacy=1`** during transition if needed.
- Driver cannot accept new trips while status is **`awaiting_cash_settlement`**; app relaunch routes to mandatory settlement screen.
- Ops backstop: **`public.rides_run_cash_settlement_timeout()`** (pg_cron daily) auto-completes stale settlement rows as **unpaid**.
- Deploy: run migrations, then `pnpm deploy:rides` from repo root.

---

## 3. Matching policy (Uber-style, phased implementation)

**Wave dispatch**

1. On **`matching`**, select candidates from **`rides.driver_locations`** where `available_for_rides`, freshness (**≤ 10 minutes**), and Haversine distance ≤ **`radius_km`** (wave 1: **5 km**, wave 2: **15 km**, wave 3: **35 km**).
2. Exclude drivers already **`declined`/`expired`** for this ride in earlier waves.
3. Rank by **drive time** when **Distance Matrix API** is available (`matching_route_source: google_distance_matrix` in audit); otherwise Haversine + 25 km/h fallback. Up to **25** nearest Haversine candidates are sent to Matrix per wave. Tie-break: stable UUID sort.
4. Emit up to **`max_offers = 8`** **`pending`** rows in **`rides.driver_offers`** per wave with **`expires_at = now + driver_offer_timeout_seconds`** (default **15**).
5. **Fairness (future hardening)**: rotate ranking seeds per wave / penalize chronic declines — tracked via **`wave`** and audit payloads.

**GET reconcile**: expired **`pending`** offers are marked **`expired`**; if still **`matching`** and no **`pending`** offers remain, advance through waves in one pass (empty waves fast-forward) or terminal **`cancelled`** with reason **`no_drivers_available`** after **`max_waves`** (**3**). Rides still **`matching`** after **`max_matching_duration_minutes`** (default **15**) are auto-cancelled with **`matching_timeout`**.

**Hygiene (DB + Edge)**:

1. **`public.rides_run_matching_hygiene()`** (pg_cron every minute when available): expires all overdue **`pending`** offers; cancels stale **`matching`** rides past **`max_matching_duration_minutes`**.
2. **`POST /v1/internal/reconcile-matching`**: runs hygiene RPC, then reconciles every **`matching`** ride (schedule every **30–60s**).
3. Rider **`GET /v1/requests/:id`**: reconciles on each poll (**5s** while **`matching`**, **30s** otherwise).

---

## 4. Fare quote & surge

### Pricing rules (`rides.fare_rules`)

- One active row per **`(city, vehicle_type)`** (MVP city: **`jamaica`**, vehicle: **`standard`**).
- Amounts in **minor units** (JMD cents). Columns: `base_fare_minor`, `price_per_km_minor`, `price_per_min_minor`, `booking_fee_minor`, `min_fare_minor`, `currency`.
- Ops can edit via **Super Admin → Roam Rides → Fare rules** (preferred) or Table Editor — see [`FARE_OPS.md`](./FARE_OPS.md).

### Route distance & time

- Edge calls **Google Directions API** (driving, `region=jm`, `departure_time=now`) using `GOOGLE_MAPS_API_KEY_RIDES` (or `GOOGLE_MAPS_SERVER_KEY_RIDES`).
- Prefers **`duration_in_traffic`** when returned (`duration_traffic_aware: true` on quote); otherwise baseline duration.
- Returns **`route_polyline_encoded`** (overview polyline) for the passenger booking map when Directions succeeds.
- On API failure: **Haversine** distance + 25 km/h speed fallback (`route_source: haversine_fallback`).

### Pickup ETA (nearest driver)

- On quote, loads **`rides.driver_locations`** (`available_for_rides`, updated within **10 min**, within **15 km** haversine of pickup).
- **Distance Matrix** (drivers → pickup) yields **`eta_pickup_seconds_estimate`** / **`pickup_eta_minutes_estimate`** when supply exists (`pickup_eta_source: google_distance_matrix` or `haversine_fallback`).
- **`eta_arrival_at`** (ISO) = now + pickup ETA + trip duration (traffic-aware trip time from Directions).
- **`drivers_available: false`** when no qualifying drivers — passenger UI shows **"No drivers nearby"** on vehicle cards (no fabricated pickup ETA).
- Vehicle cards show the same pickup/arrival line for all tiers (MVP; no per-vehicle driver pool).

### Quote (`POST /v1/quote`)

- Inputs: pickup/dropoff coordinates, optional **`vehicle_option`** (default `standard`).
- Returns: `fare_estimate_minor`, `currency`, `surge_multiplier`, `distance_estimate_km`, `duration_estimate_minutes`, `duration_traffic_aware`, optional `route_polyline_encoded`, `drivers_available`, `pickup_eta_minutes_estimate`, `eta_arrival_at`, `pickup_eta_source`, `fare_breakdown`, **`quote_token`** (signed, ~10 min TTL).

**Manual test (pickup ETA on vehicle cards):** deploy `rides` with Maps secrets → driver app dispatch **online** near pickup → passenger app quote with pickup/drop-off → each vehicle row shows `N mins away · H:MM`; driver offline → **No drivers nearby**.

**Formula:**

```
subtotal = base + booking_fee + (km × per_km) + (min × per_min)
fare_minor = max(min_fare, round(subtotal × surge_multiplier))
```

If no active `fare_rules` row matches pickup + vehicle, quote returns **`no_fare_rule`** (404) — configure rules in Admin → Fare Rules.

### Book (`POST /v1/requests`)

- Requires **`quote_token`** from a recent quote matching coords + vehicle.
- Persists locked **`fare_estimate_minor`** / **`surge_multiplier`** (no re-surge at book).
- Errors: `quote_stale` (409) if token missing, expired, or coords changed.

**Secrets:** `ROAM_RIDES_QUOTE_SECRET` (HMAC; dev may use `unsigned.*` tokens if unset).

### Surge v1

- Coarse grid cell key: `grid:{floor(lat*50)}:{floor(lng*50)}` (≈ **2 km** scale — tune later).
- Table **`rides.surge_cells`** holds **`surge_multiplier`** (default **1**). Dispatch increments **`open_requests`** on request creation and decrements on **`completed`/`cancelled`** (approximate demand signal).
- **Surge v2** (planned): H3 indexing, supply/demand ratio every N seconds, regional caps — see load-test + observability todos.

---

## 5. Payments model

**MVP**: persist **`fare_estimate_minor`** / **`fare_final_minor`** on **`ride_requests`**; **`currency`** default **`JMD`**.

**Production**: integrate [`payments`](../../supabase/functions/payments/index.ts) service:

- **`authorize_hold`** at **`driver_assigned`** or **`on_trip`** (product decision).
- **`capture`** at **`completed`** with **idempotency keys** (`ride_id` + `intent=capture`).
- **`void`** on **`cancelled`** subject to cancellation fee rules.

Document payment state separately from ride state; never dual-write totals without ledger reconciliation.

---

## 6. Auth & roles

- **Rider**: Supabase Auth user with `user_metadata.role === 'passenger'` (set at signup or admin migration). Edge rejects drivers calling rider-only routes and vice versa.
- **Driver**: existing `driver` role; **`driver_profiles.status = 'active'`** recommended before matching (enforced in Edge).
- **RLS**: riders/drivers get **SELECT** on their own rows in **`rides`**, scoped by `user_id`; mutations go through Edge.

---

## 7. HTTP API (OpenAPI-style outline)

Base URL: `https://<project-ref>.supabase.co/functions/v1/rides`

Headers (browser): `Authorization: Bearer <JWT>`, `apikey: <anon>`, `Content-Type: application/json`

### 7.1 Platform admin (Super Admin)

Requires platform role (`platform_owner`, `platform_support`, `superadmin`, or `admin` in JWT metadata). Money fields in JSON use **major units** (dollars); DB stores minor (cents). Audit: `rides.audit_events` (`admin_fare_rule_*`, `admin_surge_cell_*`).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/fare-rules` | List all fare rules |
| GET | `/admin/fare-rules/:id` | Single rule |
| POST | `/admin/fare-rules` | Create rule |
| PATCH | `/admin/fare-rules/:id` | Update rule |
| POST | `/admin/fare-rules/:id/duplicate` | Clone rule |
| GET | `/admin/surge-cells` | Paginated list (`search`, `page`, `limit`) |
| GET | `/admin/surge-cells/:cellKey` | Single cell |
| PATCH | `/admin/surge-cells/:cellKey` | Set multiplier (1.0–3.0) |
| POST | `/admin/surge-cells/:cellKey/reset` | Clear `open_requests`; optional reset multiplier |
| POST | `/admin/surge-cells/reset-all` | Bulk reset (platform owner / superadmin) |

#### Rider user management

Requires `rides_ops`, `rides_admin`, or platform role. See [`RIDER_ADMIN.md`](./RIDER_ADMIN.md).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/riders` | Directory (`q`, `status`, `sort`, `page`, `limit`) |
| GET | `/admin/riders/:userId` | Profile, stats, recent notes/activity |
| GET | `/admin/riders/:userId/trips` | Paginated trip history |
| GET | `/admin/riders/:userId/notes` | Internal notes |
| POST | `/admin/riders/:userId/notes` | Add note (`rides_admin`+) |
| PATCH | `/admin/riders/:userId` | Update display name / phone |
| POST | `/admin/riders/:userId/suspend` | Suspend + auth ban (`rides_admin`+) |
| POST | `/admin/riders/:userId/unsuspend` | Reinstate |
| POST | `/admin/riders/:userId/ban` | Permanent ban (platform_owner / superadmin) |
| POST | `/admin/riders/:userId/reset-password` | Send recovery email |
| POST | `/admin/riders/:userId/sign-out` | Global sign-out |

Suspended/banned riders: `403` `rider_account_restricted` on `POST /v1/quote` and `POST /v1/requests`.

### 7.2 Rider & driver (`/v1/*`)

#### Rider

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/quote` | Fare + ETA estimates (no persistence). |
| POST | `/v1/requests` | Create ride (`idempotency_key` optional). Body: pickup/dropoff coords + addresses + `vehicle_option`. |
| GET | `/v1/requests/:id` | Ride detail + reconcile matching waves / expire offers. |
| POST | `/v1/requests/:id/cancel` | Rider cancel (`reason` optional). |

#### Driver

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/drivers/presence` | Upsert GPS + `available_for_rides`. |
| GET | `/v1/drivers/offers` | Pending offers for JWT user. |
| POST | `/v1/drivers/offers/:id/accept` | Accept if pending & non-expired. |
| POST | `/v1/drivers/offers/:id/decline` | Decline offer. |
| PATCH | `/v1/requests/:id/driver-transition` | Body `{ "status": "<next>" }` per allowed graph. |

#### Internal (ops)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/internal/reconcile-matching` | Expire offers + advance waves for all `matching` rides. Auth: `Authorization: Bearer $SUPABASE_ANON_KEY` + header `X-Rides-Cron-Secret: $RIDES_CRON_SECRET`. Schedule every 15–60s via Supabase cron or external scheduler. |

### Observability

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness. |

---

## 8. Non-functional requirements

- **Observability**: structured JSON logs (`svc`, `request_id`, `ride_id`, `latency_ms`, outcomes).
- **Rate limiting**: per-IP sliding window on **`quote`** / **`requests`** (see Edge implementation).
- **Privacy**: location TTL + retention policy for **`driver_locations`** (purge stale rows via cron — future).
- **Compliance**: export/delete hooks via Supabase Auth + rider profile deletion cascade.

---

## 10. Driver app rollout (independent-first beta)

- **`rides.dispatch_settings.independent_only_matching`** (default **true**): only **`driver_profiles.mode = independent`** drivers receive offers and may go online for Roam passenger dispatch. Fleet drivers keep the legacy **START TRIP** home flow until this flag is turned off in Control Panel.
- Independent drivers: home screen **`RideDispatchHome`** — Go Online → listen for offers (Realtime + 4s poll fallback) → accept → state transitions.
- Fleet drivers (beta): home **`TripTimer`** unchanged; **Ride offers** nav remains available as fallback.

### Phase 3 — fleet-wide dispatch (when ready)

1. Set **`independent_only_matching = false`** in Control Panel → Dispatch settings.
2. In `apps/driver/src/components/legacy/DriverDashboard.tsx`, render **`RideDispatchHome`** for all drivers (remove `isIndependentDriver` branch).
3. Deprecate **`TripTimer`** for Roam passenger trips; completed Roam rides live in **`rides.ride_requests`**.

---

## 9. References (implementation)

- DB migration: [`supabase/migrations/20260515140000_rides_schema.sql`](../../supabase/migrations/20260515140000_rides_schema.sql)
- Edge service: [`supabase/functions/rides/index.ts`](../../supabase/functions/rides/index.ts)
- Types: [`packages/types/src/rides.ts`](../../packages/types/src/rides.ts)
