# Haulage architecture

## Overview

Haulage reuses the rides lifecycle (`ride_requests` + wave dispatch) with `vehicle_option: 'haulage'`. Manifest data lives in `haulage_bookings` + `haulage_booking_lines`.

## Product surfaces

| Domain | Audience | Admin |
|--------|----------|-------|
| [roam-s.co](https://roam-s.co) | Riders book haulage | Rides admin (no haul catalog) |
| [roamhaul.co](https://roamhaul.co) | Haulers dispatch freight | [roamhaul.co/admin](https://roamhaul.co/admin) |
| [roamdriver.co](https://roamdriver.co) | Rideshare/courier drivers | Driver admin |

Rider booking: `roam-s.co/services/haulage`  
Hauler app: `roamhaul.co` (separate session from roamdriver)  
Dual-role accounts supported; presence `dispatch_mode` separates haul vs rideshare offers.

## Data flow

1. **Admin** edits catalog at roamhaul.co/admin (`GET/PUT /haul/admin/haulage/*`).
2. **Rider** fetches `GET /v1/haulage/catalog`, quotes, books via `POST /v1/haulage/requests`.
3. **Dispatch** matches haulers with `dispatch_mode: haulage` and body-type tiers.
4. **Hauler** sees manifest on offers and active trip in Roam Haul app.

## Feature flags

| Flag | Purpose |
|------|---------|
| `HAULAGE_CATALOG_ENABLED` | Catalog API |
| `HAULAGE_QUOTE_ENABLED` | Quote API |
| `HAULAGE_BOOKING_ENABLED` | Book API + activity pipeline |
| `HAULAGE_DISPATCH_CONSTRAINTS_ENABLED` | Payload/dimension filter |

## Auth

- Hauler surface: `user_metadata.surface = 'hauler'`
- Haul admin roles: `haul_admin`, `haul_ops`
- Edge: `allowsHaulerOrDriverSurface` on `/v1/drivers/*`

## Pre-launch checklist

- Apply migrations including `20260620120000_haul_dispatch_mode.sql`
- Deploy `haul` and `rides` edge functions
- Assign `haul_admin` to ops users
- Create `fare_rules` row for `vehicle_type: haulage`
- Point roamhaul.co DNS to `@roam/haul` Vercel project

See [REGRESSION_CHECKLIST.md](./REGRESSION_CHECKLIST.md).
