# Haulage regression checklist

Use before and after Roam Haul releases.

## Rider (roam-s.co)

- [ ] `/services/haulage` loads catalog (`HAULAGE_CATALOG_ENABLED`)
- [ ] Quote returns fare (`HAULAGE_QUOTE_ENABLED`)
- [ ] Booking creates `ride_requests` + `haulage_bookings` (`HAULAGE_BOOKING_ENABLED`)
- [ ] Confirmation page shows request id
- [ ] Activity feed shows haulage trip

## Hauler (roamhaul.co)

- [ ] Hauler login accepts `surface: hauler` accounts
- [ ] Wrong-surface gate blocks rides-only drivers
- [ ] Going online sends `dispatch_mode: haulage` on presence
- [ ] Haul offers appear; rideshare offers do not
- [ ] Trip request overlay shows haulage manifest
- [ ] Accept → en route → arrived → on trip → complete

## Rideshare driver (roamdriver.co)

- [ ] No haulage offers when online
- [ ] No haulage manifest on trip request overlay
- [ ] Rideshare dispatch unchanged

## Haul admin (roamhaul.co/admin)

- [ ] `haul_admin` can sign in
- [ ] Catalog list loads from `/haul/admin/haulage/items`
- [ ] Variant weight/dimension edits persist

## Rides admin (roam-s.co/admin)

- [ ] No Haulage nav under Services
- [ ] Rideshare/courier/event admin unchanged

## Platform admin (dominion)

- [ ] Roam Haul section shows overview card
- [ ] Link opens roamhaul.co/admin

## Edge / DB

- [ ] `haul` function health: `GET /haul/health`
- [ ] `dispatch_mode` column on `rides.driver_locations`
- [ ] `fare_rules` row for `vehicle_type: haulage`
- [ ] Dispatch constraints filter by body type when enabled

## Dual-role account

- [ ] Same user can use roamdriver.co and roamhaul.co with separate sessions
- [ ] Presence mode matches active app
