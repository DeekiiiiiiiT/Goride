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
3. Rank by **drive time** when **Distance Matrix API** is available (`matching_route_source: google_distance_matrix` in audit); otherwise Haversine + 25 km/h fallback. Up to **25** nearest Haversine candidates are sent to Matrix per wave. Tie-break: stable UUID sort.
4. Emit up to **`max_offers = 8`** **`pending`** rows in **`rides.driver_offers`** per wave with **`expires_at = now + driver_offer_timeout_seconds`** (default **15**).
5. **Fairness (future hardening)**: rotate ranking seeds per wave / penalize chronic declines — tracked via **`wave`** and audit payloads.

**GET reconcile**: expired **`pending`** offers are marked **`expired`**; if still **`matching`** and no **`pending`** offers remain, advance to next wave or terminal **`cancelled`** with reason **`no_drivers_available`** after **`max_waves`** (**3**).

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

### Quote (`POST /v1/quote`)

- Inputs: pickup/dropoff coordinates, optional **`vehicle_option`** (default `standard`).
- Returns: `fare_estimate_minor`, `currency`, `surge_multiplier`, `distance_estimate_km`, `duration_estimate_minutes`, `duration_traffic_aware`, optional `route_polyline_encoded`, `fare_breakdown`, **`quote_token`** (signed, ~10 min TTL).

**Formula:**

```
subtotal = base + booking_fee + (km × per_km) + (min × per_min)
fare_minor = max(min_fare, round(subtotal × surge_multiplier))
```

Env fallbacks if no DB row: `ROAM_RIDES_*_MINOR` (see `supabase/functions/rides/fare/rules.ts`).

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
