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

| `market_id_lock_source` | Publish recompute | Partner pin move | Force + unlock_after |
|-------------------------|-------------------|------------------|----------------------|
| `null` (Auto) | Updates town | Updates town | N/A |
| `manual` | Skipped | Skipped | Clears lock |
| `pin` | Skipped | Updates town | Clears lock |

| Case | Expect |
|------|--------|
| Publish with **Include locked merchants** unchecked | Manual + pin locked merchants unchanged |
| Publish with checkbox checked | Locked merchants updated; lock source stays |
| Publish with **Include locked** + **Also unlock for auto updates** | Locked merchants updated; `market_id_lock_source` cleared |
| Merchant detail badge | **Auto** / **Locked (manual)** / **Locked (pin)** |
| Merchant detail → **Reassign from store pin** (locked) | Town updates from pin; lock source stays |
| Reassign with **Unlock for auto updates after reassignment** | Town updates; lock cleared |
| `POST /admin/markets/backfill-merchant-markets?include_locked=true&unlock_after=true` | Same as publish unlock flow |
| `POST /admin/merchants/:id/recompute-market` body `{ unlock_after: true }` | Same as reassign unlock |

## Admin map — unified zone loader

| Case | Expect |
|------|--------|
| Town map legend | **Draft (editing)** green vs **Live (customers)** cyan dashed |
| **Show customer coverage** on + draft edits unpublished | **Draft differs from live** badge |
| Draft vs published workflow | Still separate — publish required for customer impact |

## Admin map — customer coverage preview

| Case | Expect |
|------|--------|
| Town map → **Show customer coverage** off (default) | Draft zones only (green) |
| Toggle **Show customer coverage** on | Loads published zones via shared `@roam/dash-coverage` loader + `/geo/delivery-zones` |
| Parish mode `parish_boundary` + preview on | Synthetic parish zones included in overlay |

## Parish mode suggestion (publish / restore)

After a successful publish or restore-with-republish, the API may return `parish_mode_suggestion` when heuristics match:

| Heuristic | Suggested mode |
|-----------|----------------|
| Parish has foundation polygon + exactly **1** active town with a valid include zone | `parish_boundary` (when current is `town_zones`) |
| **2+** active towns each have valid include zones | `town_zones` (when current is `parish_boundary`) |

| Case | Expect |
|------|--------|
| Publish returns suggestion | Admin toast with **Apply** / dismiss; mode is **not** auto-applied |
| Click **Apply** on toast | `updateParish` sets `coverage_mode` to suggested value |
| Publish body `apply_parish_mode` matching suggestion | Server applies mode + audit `roam_dash.parish_mode_applied` |
| Publish body `apply_parish_mode` not matching suggestion | `400` with clear error |

## Admin check-point parity

`POST /admin/markets/check-point` uses `resolveMarketForPoint` (same rules as customer checkout).

| Case | Expect |
|------|--------|
| Pin inside town zone | `inZone: true`, `marketId` set |
| Pin inside parish foundation but outside town (parish_boundary mode) | `inZone: true`, `parishBoundaryMode: true` |
| Pin outside parish foundation | `outsideParish: true`, `inZone: false` |

## Pricing / checkout

| Case | Expect |
|------|--------|
| Pricing simulator Auto + ST pin | Coverage badge “In zone → Spanish Town”; market auto-selected |
| Pricing simulator Auto + Kingston pin | Outside active zones (no silent Spanish Town price) |
| Checkout with stale out-of-zone saved address | Client blocks / out-of-delivery; server still enforces |

## Readiness

Market readiness **Merchants ready** count must use merchants with `market_id = this town` (not all approved globally).
