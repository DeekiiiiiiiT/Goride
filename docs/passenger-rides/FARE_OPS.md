# Roam Rides — fare operations (no-code)

How to change prices and surge without deploying code.

## `rides.fare_rules` (base pricing)

**Supabase → Table Editor → `rides` schema → `fare_rules`**

| Column | Meaning | Example (JMD) |
|--------|---------|----------------|
| `city` | Region key | `jamaica` |
| `vehicle_type` | Product tier | `standard` |
| `base_fare_minor` | Flat start fee (cents) | `30000` = $300 |
| `price_per_km_minor` | Per km (cents) | `12000` = $120/km |
| `price_per_min_minor` | Per minute (cents) | `5000` = $50/min |
| `booking_fee_minor` | Fixed add-on (cents) | `5000` = $50 |
| `min_fare_minor` | Floor (cents) | `50000` = $500 |
| `currency` | ISO code | `JMD` |
| `is_active` | Only one active row per city+vehicle | `true` |

**Notes:**

- Minor units = **cents** (two decimal places when shown to riders).
- Edge caches rules ~60 seconds per deploy instance; new quotes pick up edits quickly.
- To add **Premium**, insert a second row with `vehicle_type = premium` and tune rates.

## `rides.surge_cells` (demand multiplier)

**Supabase → Table Editor → `rides` schema → `surge_cells`**

| Column | Meaning |
|--------|---------|
| `cell_key` | Grid id, e.g. `grid:900:4500` |
| `surge_multiplier` | Fare multiplier (1.0 = normal) |
| `open_requests` | Approximate demand counter (auto) |
| `available_drivers` | Supply signal (future automation) |

**Manual surge:** set `surge_multiplier` on a cell (e.g. `1.5` = +50%). The system also drifts multiplier when `open_requests` is high.

## Edge secrets (deploy once)

| Secret | Purpose |
|--------|---------|
| `GOOGLE_MAPS_API_KEY_RIDES` | Directions API for route distance/time |
| `ROAM_RIDES_QUOTE_SECRET` | Sign `quote_token` (required in production) |
| `ROAM_RIDES_*_MINOR` | Optional env fallback if DB row missing |

Enable **Directions API** on the Google Cloud project tied to the rides key.

## Audit

`rides.audit_events` logs `fare_quoted` and `fare_locked` with breakdown JSON for support.
