# Haulage API (Rides Edge Function)

Haulage endpoints live under `/rides/v1/haulage/*`. They reuse the standard ride lifecycle (`ride_requests` + dispatch) with `vehicle_option: 'haulage'`.

## Feature flags

| Env | Default | Purpose |
|-----|---------|---------|
| `HAULAGE_CATALOG_ENABLED` | `0` | `GET /v1/haulage/catalog` |
| `HAULAGE_QUOTE_ENABLED` | `0` | `POST /v1/haulage/quote` |
| `HAULAGE_BOOKING_ENABLED` | `0` | `POST /v1/haulage/requests` |
| `HAULAGE_DISPATCH_CONSTRAINTS_ENABLED` | `0` | Weight/dimension filter when matching haulage jobs |

## Endpoints

### `GET /v1/haulage/catalog`

Authenticated rider. Returns nested catalog DTO (`HaulageCatalogResponse`).

### `POST /v1/haulage/quote`

**Request:** `HaulageQuoteRequest`

**Response:** `HaulageQuoteResponse` including `quote_token` (HMAC, product `haulage`, TTL 5 min immediate / 30 min scheduled).

**Errors:** `haulage_disabled`, `invalid_items`, `invalid_location`, `scheduled_too_soon`, `scheduled_too_far`, `no_fare_rule`.

### `POST /v1/haulage/requests`

**Request:** `HaulageBookRequest` (`quote_token`, `idempotency_key`, optional `payment_method`)

**Response:** `HaulageBookResponse`

Creates `ride_requests` + `haulage_bookings` + `haulage_booking_lines`. Immediate bookings start matching; scheduled use `booking_kind: 'scheduled'`.

**Errors:** `quote_stale`, `quote_mismatch`, `haulage_disabled`, `idempotency_conflict`.

## Quote token

Separate HMAC namespace from passenger rides (`product: 'haulage'`). Tokens cannot be used on `POST /v1/requests`.

## Idempotency

`idempotency_key` on book — duplicate returns same `ride_request_id` / `haulage_booking_id`.

## Admin

`/rides/admin/haulage/*` — catalog CRUD (service_role + product admin auth).

## Types

See `packages/types/src/haulage.ts`.
