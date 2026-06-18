# Haulage architecture

## Overview

Haulage reuses the rides lifecycle (`ride_requests` + wave dispatch) with `vehicle_option: 'haulage'`. Manifest data lives in `haulage_bookings` + `haulage_booking_lines`.

## Data flow

1. **Admin** seeds/edits catalog (`rides.haulage_*` tables) and links body types under Services → Haulage → Transport.
2. **Rider** fetches `GET /v1/haulage/catalog`, builds cart from variant specs, quotes via `POST /v1/haulage/quote`, books via `POST /v1/haulage/requests`.
3. **Dispatch** filters drivers by `service_body_types` tiers; optional `HAULAGE_DISPATCH_CONSTRAINTS_ENABLED` adds weight/dimension checks.
4. **Driver** sees `haulage_manifest` on offers and active trip UI when `vehicle_option === 'haulage'`.

## Feature flags

| Flag | Purpose |
|------|---------|
| `HAULAGE_CATALOG_ENABLED` | Catalog API |
| `HAULAGE_QUOTE_ENABLED` | Quote API |
| `HAULAGE_BOOKING_ENABLED` | Book API + activity pipeline |
| `HAULAGE_DISPATCH_CONSTRAINTS_ENABLED` | Payload/dimension filter |

## Pre-launch checklist

- Apply migrations including seed (`20260619150000_haulage_catalog_seed.sql`)
- Create `fare_rules` row for `vehicle_type: haulage`
- Link haulage service to body types in admin
- Fill body capacity on vehicle body types
- Enable flags in order (catalog → quote → book → dispatch constraints)

See [REGRESSION_CHECKLIST.md](./REGRESSION_CHECKLIST.md).
