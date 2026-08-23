# Geofence / Markets — Live verification checklist

Run after deploying migration `20260826120000_merchant_market_id.sql` and edge function `delivery`.

## Prep

1. Activate **only Spanish Town** in Delivery Markets (other towns inactive).
2. Publish Spanish Town coverage if draft is dirty.
3. In Admin → Merchants, assign Spanish Town merchants a **Delivery town**; leave Kingston merchants unassigned or on Kingston.
4. Optional: `POST /admin/markets/backfill-merchant-markets` to auto-assign from store pins.

## Cases

| Case | Expect |
|------|--------|
| Discover with Spanish Town pin | Only ST-assigned merchants |
| Discover with Kingston pin (ST-only active) | Empty list / out of coverage |
| Order: ST address + ST merchant | Success |
| Order: ST address + Kingston merchant | `400` `merchant_out_of_market` |
| Order: Kingston address + ST merchant | `400` `out_of_coverage` |
| Order: no delivery pin | `400` `dropoff_required` |
| Pricing simulator Auto + ST pin | Coverage badge “In zone → Spanish Town”; market auto-selected |
| Pricing simulator Auto + Kingston pin | Outside active zones (no silent Spanish Town price) |
| Checkout with stale out-of-zone saved address | Client blocks / out-of-delivery; server still enforces |

## Readiness

Market readiness **Merchants ready** count must use merchants with `market_id = this town` (not all approved globally).
