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
| `completed` | Trip finished; receipt available. |
| `cancelled` | Terminal cancel (rider, driver, or system). |

### Allowed transitions (abbrev.)

- `matching` → `driver_assigned` — driver **`accept`** on pending non-expired offer (exclusive winner).
- `driver_assigned` → `driver_en_route_pickup` → `driver_arrived_pickup` → `on_trip` → `completed` — driver **`PATCH`** status (`driver_transition`).
- Any active → `cancelled` — rider **`cancel`** or driver **`cancel`** with rules below.

---

## 3. Matching policy (Uber-style, phased implementation)

**Wave dispatch**

1. On **`matching`**, select candidates from **`rides.driver_locations`** where `available_for_rides`, freshness (**≤ 10 minutes**), and Haversine distance ≤ **`radius_km`** (wave 1: **5 km**, wave 2: **15 km**, wave 3: **35 km**).
2. Exclude drivers already **`declined`/`expired`** for this ride in earlier waves.
3. Rank by distance ascending (tie-break: stable UUID sort for fairness).
4. Emit up to **`max_offers = 8`** **`pending`** rows in **`rides.driver_offers`** per wave with **`expires_at = now + driver_offer_timeout_seconds`** (default **15**).
5. **Fairness (future hardening)**: rotate ranking seeds per wave / penalize chronic declines — tracked via **`wave`** and audit payloads.

**GET reconcile**: expired **`pending`** offers are marked **`expired`**; if still **`matching`** and no **`pending`** offers remain, advance to next wave or terminal **`cancelled`** with reason **`no_drivers_available`** after **`max_waves`** (**3**).

---

## 4. Fare quote & surge

### Quote (`POST /v1/quote`)

- Inputs: pickup/dropoff coordinates (+ optional `vehicle_option`).
- **Haversine** distance \(d\) km; estimated duration \(t = (d / 25) * 60\) minutes (placeholder until routing engine).
- **Fare (minor units, cents)**:

```
fare_minor = round(
  base_minor
  + per_km_minor * d
  + per_min_minor * t
) * surge_multiplier
```

Defaults (env-tunable in Edge): `base_minor=250`, `per_km_minor=150`, `per_min_minor=35`, min fare clamp **500**.

### Surge v1

- Coarse grid cell key: `grid:{floor(lat*50)}:{floor(lng*50)}` (≈ **2 km** scale — tune later).
- Table **`rides.surge_cells`** holds **`surge_multiplier`** (default **1**). Dispatch increments **`open_requests`** on request creation and decrements on **`completed`/`cancelled`** (approximate demand signal).
- **Surge v2** (planned): H3 indexing, supply/demand ratio every N seconds, regional caps — see load-test + observability todos.

---

## 5. Payments model

**MVP**: persist **`fare_estimate_minor`** / **`fare_final_minor`** on **`ride_requests`**; **`currency`** default **`USD`**.

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

### Rider

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/quote` | Fare + ETA estimates (no persistence). |
| POST | `/v1/requests` | Create ride (`idempotency_key` optional). Body: pickup/dropoff coords + addresses + `vehicle_option`. |
| GET | `/v1/requests/:id` | Ride detail + reconcile matching waves / expire offers. |
| POST | `/v1/requests/:id/cancel` | Rider cancel (`reason` optional). |

### Driver

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/drivers/presence` | Upsert GPS + `available_for_rides`. |
| GET | `/v1/drivers/offers` | Pending offers for JWT user. |
| POST | `/v1/drivers/offers/:id/accept` | Accept if pending & non-expired. |
| POST | `/v1/drivers/offers/:id/decline` | Decline offer. |
| PATCH | `/v1/requests/:id/driver-transition` | Body `{ "status": "<next>" }` per allowed graph. |

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

## 9. References (implementation)

- DB migration: [`supabase/migrations/20260515140000_rides_schema.sql`](../../supabase/migrations/20260515140000_rides_schema.sql)
- Edge service: [`supabase/functions/rides/index.ts`](../../supabase/functions/rides/index.ts)
- Types: [`packages/types/src/rides.ts`](../../packages/types/src/rides.ts)
