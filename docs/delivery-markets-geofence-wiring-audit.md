# Delivery Markets / Geofence Wiring Audit

**Date:** 2026-08-23
**Type:** Audit only — no code changed.
**Trigger:** Admin confusion over Delivery Markets UI — only "Spanish Town" is toggled Active in St. Catherine, yet the parish map shows other towns' geofences, and test orders (e.g. "Island Grill", possibly a Kingston merchant) don't appear to respect any of this.

## Bottom line

**Checkout is NOT wired to the geofence config. Neither is the simulator.**

The point-in-polygon coverage engine is real, working code — not a stub — but it is only consumed in two places: an admin-only "Test pin" diagnostic tool, and the pricing resolver, which **silently discards** a "not covered" result and falls back to pricing the order as if it were in whatever market happens to be first in the list. Nothing rejects or flags an order for being geographically out of a merchant's or customer's covered zone. Merchants have no market/town association in the schema at all, so there is currently no way to even ask "is this merchant inside an active delivery zone."

The parish map showing other towns' borders is intentional, documented UI ("shown for context") — not a bug, and not evidence those zones are live.

---

## 1. Data model

Schema lives in the `delivery` Postgres schema:

- **`delivery.service_parishes`** — parish rows, plus `foundation_polygon` (ops-only outline).
  `supabase/migrations/20260816190000_rush_parish_foundation.sql:1-7` — comment literally states: *"Parish foundation borders (ops geography)... Does not drive customer delivery coverage."*
- **`delivery.service_markets`** — this is the "town" record: `is_active`, `waitlist_enabled`, `parish_id`, plus `draft_dirty`, `published_version_id`, `readiness_merchants_min`, `readiness_couriers_min`.
  `supabase/migrations/20260816123000_rush_ops_markets_zones.sql:4-11`, `20260816180000_rush_enterprise_coverage.sql:28-32`
- **`delivery.service_zone_polygons`** — actual town border ("include") and non-delivery zone ("exclude") polygons per `market_id`. `kind` added in `20260816140000_rush_zone_kind_exclude.sql:3-15`.
- **`delivery.service_coverage_versions`** — immutable snapshot written on "Publish coverage" (`zones_json`, `version`).
- **`delivery.town_outline_templates` / `parish_outline_templates`** — reusable seed shapes.
- **`delivery.zone_waitlist`** — "notify me" signups for out-of-zone addresses.

The Active toggle you see in the UI = `service_markets.is_active`. "Publish coverage" writes a `service_coverage_versions` row and clears `draft_dirty` (`supabase/functions/delivery/admin/marketRoutes.ts:524-584`).

**Critical gap: `delivery.merchants` has no market/town/parish column.** It only has raw `lat`/`lng` (`supabase/migrations/20260511140000_delivery_schema.sql:7-31`), confirmed unchanged through the newest merchants migration (`20260823120000_dash_pricing_engine.sql:60-64`, which only adds pricing-tier columns). There is no way, today, to look up "which market is Island Grill in."

---

## 2. Order/checkout flow — is geography actually enforced?

**Client-side (`dash-customer`), address entry only:**
`apps/dash-customer/src/lib/deliveryZones.ts` has its own point-in-polygon check (`pointInPolygon` / `evaluateActiveCoverage`, lines 244/261), fed by the public endpoint `GET /geo/delivery-zones` (`supabase/functions/delivery/admin/marketRoutes.ts:1091-1131`).

It's called from exactly three places, **all address-creation/onboarding screens, never checkout**:
- `apps/dash-customer/src/pages/AddAddressPage.tsx:92,110`
- `apps/dash-customer/src/pages/onboarding/DeliveryAddressPage.tsx:72,125`
- `apps/dash-customer/src/pages/onboarding/DeliveryDetailsPage.tsx:42`

If out of zone, the user is bounced to an "out-of-delivery" screen — but only when **saving a new address**. A saved address is never re-checked later, including at checkout.

**Server-side, order creation (`POST /orders`):**
`supabase/functions/delivery/customerOrderRoutes.ts`:
- Line 90: `assertMerchantAcceptingOrders(...)` checks only `is_active`, `is_accepting_orders`, and open-hours — no geography (`merchantOpenCheck.ts:107-137`).
- `dropoffLat/dropoffLng` are read and passed **only into pricing**, never into any eligibility check.
- No reference to `zone`/`coverage`/`market` for gating anywhere in this file besides the pricing call.

**The one place geofence data touches the order path — and it's a silent no-op on failure:**
`supabase/functions/delivery/pricingResolver.ts:67-101` (`resolveMarketForPoint`) calls the real coverage engine (`admin/coverageEval.ts:43-86`, proper ray-cast with exclude-wins-over-include), but:

```ts
const evalResult = evaluateCoverage(lat, lng, zones);
if (evalResult.inZone && evalResult.matchedInclude?.market_id) {
  return { marketId: evalResult.matchedInclude.market_id, zones };
}
// Fallback: first active market (soft launch)
const first = markets[0] as { id: string };
return { marketId: first.id, zones };
```

If the point is outside every active town's polygon (or inside an exclude cutout), it does **not** reject — it silently prices the order under `markets[0]` (whichever active market the query happens to return first — quite possibly Spanish Town, since it's the only active one in St. Catherine right now). The order is still created. This is exactly the mechanism that would let a Kingston "Island Grill" order go through, priced as if it were Spanish Town, with no error or flag anywhere.

---

## 3. Merchant-to-market association

**Does not exist.** No `market_id`/`town_id`/`parish_id` on `delivery.merchants`, and `customerDiscoveryRoutes.ts` (merchant search/listing) has zero references to market/town/parish/zone. Merchant discovery is not filtered by coverage at all — a customer can browse and order from any merchant regardless of geography, and the only "association" is `resolveMarketForPoint`'s best-effort guess based on the **customer's** dropoff point, used purely to pick a pricing profile.

---

## 4. Simulator wiring (dash-admin pricing)

The pricing simulator is fully decoupled from Delivery Markets geography:

- `packages/dash-admin/src/pages/pricing/PricingHubPage.tsx:35` hardcodes a static `DEFAULT_DROPOFF` pin (`Spanish Town (default pin)`) — never validated against a polygon.
- `selectedMarketId` is a manual `<select>` dropdown (lines 499-513, 745-751) — the admin picks a market by name.
- Line 295: the simulated quote sends `market_id: selectedMarketId` directly, **bypassing `resolveMarketForPoint`/`evaluateCoverage` entirely.**
- Lines 425-428 explicitly tell the admin: *"High-risk delivery zones are managed under Markets → exclude polygons"* — an acknowledgment, in-product, that the simulator doesn't touch that data.
- `simScenarios.ts` and `dash-pricing/src/engine.ts` contain no market/zone/geofence/polygon references at all — only pricing-rule config.

**Consequence: it is structurally impossible today to reproduce your exact question ("what happens when Island Grill in Kingston gets ordered while only Spanish Town is active") inside the simulator**, because the simulator never resolves a market from geography — it only ever prices against whatever market you manually select from a dropdown.

---

## 5. Why the parish map shows other towns' borders

Confirmed **intentional, display-only "context" layer** — stated three times in the product's own copy/comments, not a bug and not evidence of live geofences:

- `packages/dash-admin/src/pages/markets/MarketsPage.tsx:927-930`: *"This is the parish foundation outline. Town borders (green) show for context. Customer delivery still uses each town's border and non-delivery zones."*
- `packages/dash-admin/src/pages/markets/ZoneMapEditor.tsx:742-743`: *"Blue/green outline = parish foundation. Town borders shown for context. Customer delivery still uses town borders."*
- `ZoneMapEditor.tsx:856-860` — legend explicitly labels it "Town borders (context)."
- The overlay (`MarketsPage.tsx:854-862`) flat-maps **every** town's zones under the parish purely so the admin has visual reference while editing the parish outline; polygons are rendered `editable: false, draggable: false` at reduced opacity.
- DB comment: `20260816190000_rush_parish_foundation.sql:1,6-7` — *"Does not drive customer delivery coverage."*

So the display is working as designed — but as shown in §2 and §4, **no town's border, active or inactive, currently gates anything at order time either.** The confusion is legitimate even though this specific screen isn't the culprit.

---

## 6. Is this just admin CRUD with no consumer?

Nearly, but not quite — two narrow, non-authoritative consumers exist:

1. **Admin "Test pin" tool** — `checkCoveragePoint` (`packages/dash-admin-client/src/dashAdminService.ts:830-835`) → `POST /admin/markets/check-point` (`marketRoutes.ts:424-447`), wired only to the "Test pin" button in `ZoneMapEditor.tsx` (lines 816-832, 1055-1069). Diagnostic only — never touches the customer app or order flow, despite a comment at `dashAdminService.ts:829` claiming *"same rules as Rush customer app."*
2. **Client-side address gate** (`deliveryZones.ts`) — gates only the address-entry screens, and duplicates the point-in-polygon math independently from the server's `coverageEval.ts` (two separate implementations of the same algorithm — a drift risk, compounded by the client's 10-minute zone cache, `ZONES_CACHE_TTL_MS`).
3. **`pricingResolver.ts`'s `resolveMarketForPoint`** — the only order-path consumer, and it explicitly swallows "not covered" via the `// Fallback: first active market (soft launch)` comment.

The `readiness_merchants_min` / `readiness_couriers_min` "readiness" system only gates whether an admin is *allowed to flip `is_active` on* — it has no runtime effect on order placement either.

---

## What would need to be built (not done — audit only)

1. **Hard eligibility check at order creation.** In `customerOrderRoutes.ts`'s `POST /orders` handler (near the existing `assertMerchantAcceptingOrders` call at line 90), call the existing `evaluateCoverage` against the resolved dropoff point using only active-market zones, and reject the order (4xx) if not covered — instead of `pricingResolver.ts` silently falling back to `markets[0]`.
2. **Merchant-location eligibility.** Merchants have no market association today. Either (a) add a `market_id` column to `delivery.merchants` and gate on that market being active, or (b) run `evaluateCoverage(merchant.lat, merchant.lng, activeZones)` at order time too — otherwise a Kingston merchant can fulfill an order that only "passed" because the customer's Spanish Town address happened to validate at address-creation time.
3. **Make "not covered" distinguishable from "pricing fallback."** `resolveMarketForPoint` should be able to return `{ marketId: null, covered: false }` on a genuine miss, so callers (order creation) can act on it, rather than always returning a truthy market id that looks like a match.
4. **Re-validate at checkout, not just at address save time.** A saved address's coverage status can go stale — either the town's polygon changed, or ops toggled a town's `is_active` off — after the address was saved. The zone check should run again immediately before `POST /orders`, not only once during onboarding.
5. **Wire the simulator to the real resolver.** `PricingHubPage.tsx` should let ops drop a real pin (or type a merchant/address) and compute the market via the shared `evaluateCoverage`/`resolveMarketForPoint` path, instead of a manual market-name dropdown — so you can actually simulate "order from Island Grill while only Spanish Town is active" and see what really happens today.
6. **Filter merchant discovery by coverage**, if "you can only order from merchants inside your delivery area" is the intended product behavior — `customerDiscoveryRoutes.ts` currently has no such filter.

## Suggested immediate test to confirm this live

With only Spanish Town active, place a test order with a delivery address genuinely inside Spanish Town's polygon, from a merchant you know sits in Kingston (outside every active zone). Per this trace, the order should still succeed today — silently priced under Spanish Town's pricing profile — with no rejection or warning anywhere in the flow. If it does succeed, that directly confirms §2's finding.
