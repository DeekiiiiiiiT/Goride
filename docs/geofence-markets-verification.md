# Geofence / Markets — Live verification checklist

Run after deploying migration `20260827120000_parish_coverage_mode.sql` and edge function `delivery`.

## Prep

1. Activate **only Spanish Town** in Delivery Markets (other towns inactive).
2. Publish Spanish Town coverage if draft is dirty.
3. In Admin → Merchants, assign Spanish Town merchants a **Delivery town**; leave Kingston merchants unassigned or on Kingston.
4. Optional: `POST /admin/markets/backfill-merchant-markets` to auto-assign from store pins.
5. Optional: `POST /admin/markets/backfill-merchant-markets?include_locked=true` to include locked merchants.

## Same-town cases (default `town_zones` parish mode)

| Case | Expect |
|------|--------|
| Discover with Spanish Town pin | Only ST-assigned merchants |
| Discover with Kingston pin (ST-only active) | Empty list / out of coverage |
| Order: ST address + ST merchant | Success |
| Order: ST address + Kingston merchant | `400` `merchant_out_of_market` |
| Order: Kingston address + ST merchant | `400` `out_of_coverage` |
| Order: no delivery pin | `400` `dropoff_required` |
| Pin inside town zone but outside parish foundation | `400` `outside_parish` |

## Parish border mode (`parish_boundary`)

1. Set parish coverage mode to **Parish border** in Delivery Markets.
2. Ensure parish foundation polygon is set and covers the test pin.

| Case | Expect |
|------|--------|
| Discover with pin inside parish | Merchants from all active towns in that parish |
| Order: pin in parish + merchant in same parish (any town) | Success |
| Order: pin in parish + merchant in different parish | `400` `merchant_out_of_parish` |

## Locked merchant recompute

| Case | Expect |
|------|--------|
| Publish with **Include locked merchants** unchecked | Locked merchants unchanged |
| Publish with checkbox checked | Locked merchants updated; lock stays |
| Merchant detail → **Reassign from store pin** (locked) | Town updates from pin; lock stays |
| `POST /admin/merchants/:id/recompute-market` | Same as reassign button |

## Pricing / checkout

| Case | Expect |
|------|--------|
| Pricing simulator Auto + ST pin | Coverage badge “In zone → Spanish Town”; market auto-selected |
| Pricing simulator Auto + Kingston pin | Outside active zones (no silent Spanish Town price) |
| Checkout with stale out-of-zone saved address | Client blocks / out-of-delivery; server still enforces |

## Readiness

Market readiness **Merchants ready** count must use merchants with `market_id = this town` (not all approved globally).
