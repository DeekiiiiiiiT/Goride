# Rush Marketplace Pricing — Migration Audit & Implementation Review

**Scope:** Roam Rush food-delivery pricing (`delivery` schema, `dash-*` apps)
**Original audit:** 2026-08-28
**Implementation reviewed:** 2026-08-28, commit `515a88ea` (50 files, +2,464/−418)
**Status:** Migration substantially complete. 5 gaps closed, 2 defects fixed and verified.
One build blocker and three money/consistency issues remain open.

---

## 0. Verification summary

Every item from the original audit was re-checked against the code. What follows is the
scorecard; details and evidence are in §1 (closed) and §2 (open).

| # | Item | Status |
|---|---|---|
| GAP 1 | Tier controls customer-facing delivery fee | ✅ **Closed** |
| GAP 2 | Menu inflation (dual price model) | ✅ **Closed** |
| GAP 3 | Courier pay decoupled from delivery fee | ✅ **Closed** |
| GAP 4 | Small-order fee instead of hard block | ✅ **Closed** |
| GAP 5 | Feed card fee matches checkout | ⚠️ **Partial** — feed + search fixed, **detail page not** |
| GAP 6 | `search_boost` drives ranking | ✅ **Closed** (with "Promoted" labels) |
| GAP 7 | Merchant tier selection + contract history | ✅ **Closed** |
| GAP 8 | Payout automation | ⏸️ Deferred (out of scope for this pass) |
| GAP 9 | Client pricing mirror kept in sync | ✅ **Closed** |
| GAP 10 | Currency / magnitude translated to JMD | ✅ **Closed** |
| GAP 11 | Model A retired | ✅ **Closed** |
| DEFECT A | v2 orders settling through Model A branch | ✅ **Fixed** |
| DEFECT B | Promo/subsidy cost charged to merchant | ✅ **Fixed** (verified numerically) |

**Test/typecheck state at review time:**

| Check | Result |
|---|---|
| `dash-pricing` unit tests | 51 passed, **1 failed** (stale assertion — §2.4) |
| `dashMoneySplit` Deno tests | 5 passed |
| `dash-courier` tests | 29 passed |
| `dash-customer` tests | 99 passed |
| `dash-admin` typecheck | Clean **with the uncommitted fix**; HEAD does not compile (§2.1) |
| `deno check` edge graph | 410 errors — pre-existing baseline, **none touch the new fields** |

On that last row: the errors are spread across ~25 edge files, most untouched by this
work (`marketRoutes` 38, `merchantInventoryRoutes` 29, `identityRoutes` 17, …), and a
filter for every new field name (`small_order`, `courier_base_pay`, `subsidy`,
`marketplace_price`, `in_store_price`, `base_delivery_fee`, `menu_inflation`,
`commission_base`) returns zero hits. This migration did not add to that pile, but it is
worth knowing the baseline is 410 and not 0.

---

## 1. What was implemented

### GAP 1 — Tier-driven delivery fee ✅

The blueprint's core mechanism now exists end to end.

- `merchant_tiers.base_delivery_fee_jmd` + `menu_inflation_percent`
  ([migration](supabase/migrations/20260829200000_rush_marketplace_pricing.sql))
- `MerchantTier.baseDeliveryFeeJmd` ([types.ts:7](packages/dash-pricing/src/types.ts#L7))
- `resolveDeliveryFee(rules, distanceKm, tierBaseFeeJmd)` — tier base **replaces** market
  base, market `per_extra_km_jmd` and `max_fee_jmd` still apply
  ([engine.ts:174](packages/dash-pricing/src/engine.ts#L174))
- Resolver loads the tier columns
  ([pricingResolver.ts:143](supabase/functions/delivery/pricingResolver.ts#L143))
- Admin tier editor exposes base fee + inflation
  ([PricingHubPage.tsx:2864](packages/dash-admin/src/pages/pricing/PricingHubPage.tsx#L2864))

This matches the recommendation exactly: base set commercially per tier, distance
economics still set geographically.

**Tier ladder reseeded** — `basic/standard/premium` renamed in place to
`economy/growth/dominant`:

| Tier | Commission | Base delivery | Menu inflation | Search boost |
|---|---|---|---|---|
| Economy | 15% | J$900 | 0% | 0 |
| Growth | 25% | J$450 | 10% | 10 |
| Dominant | 30% | J$150 | 20% | 50 |

The in-place `UPDATE … WHERE slug = 'basic'` followed by an `INSERT … ON CONFLICT`
is the right shape — existing `pricing_tier_id` foreign keys survive the rename.

### GAP 2 — Menu inflation ✅

- `menu_items.in_store_price` + `marketplace_price`, backfilled from `price`
- A `BEFORE INSERT OR UPDATE` trigger (`sync_menu_item_price_alias`) keeps `price` as a
  live alias of `marketplace_price` — nothing downstream that still reads `price` breaks
- `resolveMarketplaceMenuPrices` applies tier inflation and enforces the platform cap
  ([index.ts:125](supabase/functions/delivery/index.ts#L125)), rejecting manual
  overrides above `max_menu_inflation_percent` (default 25%) with a readable error
- Merchant dashboard edits the in-store price and previews the marketplace price
  ([EditItemView.tsx](apps/dash-merchant/src/components/menu/EditItemView.tsx))
- Customer paths read `marketplace_price` with a `price` fallback — order lines
  ([customerOrderRoutes.ts:161](supabase/functions/delivery/customerOrderRoutes.ts#L161)),
  discovery ([customerDiscoveryRoutes.ts:327](supabase/functions/delivery/customerDiscoveryRoutes.ts#L327)),
  menu mapping ([merchantMenu.ts](apps/dash-customer/src/lib/merchantMenu.ts))
- Order line snapshots record **both** prices, so historical orders stay auditable
  against the merchant's real menu

The guardrail recommendation was taken: `max_menu_inflation_percent` is a platform-level
rule in the `platform` namespace, inheritable per market.

### GAP 3 — Courier pay ladder ✅

`resolveCourierPayLadder` computes courier pay from trip economics only
([engine.ts:222](packages/dash-pricing/src/engine.ts#L222)) — `courier_base_pay_jmd`
(J$250) + `courier_per_km_jmd` (J$80) × km, floored at `courier_min_pay_jmd` (J$350),
with the min-pay top-up attributed to base so the UI can show components.

The customer delivery fee and courier pay are now fully independent. The platform share
is the signed difference and can go negative, with the shortfall booked as
`platformDeliverySubsidyJmd` ([engine.ts:327-346](packages/dash-pricing/src/engine.ts#L327)).
The old `courierDeliveryShare` path is kept as a fallback for profiles without a ladder
and marked `@deprecated`.

Worked example from the test suite — Dominant tier, 12 km:

```
customer delivery fee   J$750    (150 base + 10 extra km × 60)
courier ladder pay      J$1,210  (250 base + 12 km × 80)
platform delivery share −J$460   (signed)
platform subsidy         J$460   (booked, not hidden)
```

The subsidy also reaches accounting: `dualWriteDash.ts` now posts an
`order_capture_platform_subsidy` ledger entry when the platform take is negative.
Courier apps read `courier_base_pay_jmd` for earnings display.

### GAP 4 — Small-order fee ✅

Correctly implemented as a **two-floor** model rather than replacing the wall with a fee:

- `hard_min_order_subtotal_jmd` (J$400) still hard-blocks with `min_order_not_met`
- Between J$400 and `small_order_threshold_jmd` (J$1,500), a J$400
  `small_order_fee_jmd` applies instead of a block
- The old soft-min block only runs when no small-order fee is configured
  ([customerOrderRoutes.ts:306](supabase/functions/delivery/customerOrderRoutes.ts#L306)) —
  a good compatibility guard

The fee is threaded everywhere it needs to be: the platform GCT base
([gct.ts:37](packages/dash-pricing/src/gct.ts#L37)), the platform's take in
`computeDashCaptureSplit`, an `orders.small_order_fee` column, the client mirror, and
the admin customer-rules form.

### GAP 5 — Feed fee source ⚠️ partial

Home feed and search both now resolve the real tier fee through the shared engine:

- Home feed joins the tier and calls `resolveDeliveryFee(marketRules.delivery, null, tierBase)`
  ([index.ts:211](supabase/functions/delivery/index.ts#L211))
- Search does the same, and correctly widened its window to 40 rows before sorting and
  slicing to 20 — so boost ranking isn't confined to an arbitrary page
  ([customerDiscoveryRoutes.ts:251](supabase/functions/delivery/customerDiscoveryRoutes.ts#L251))

**The restaurant detail page was missed.** See §2.3.

### GAP 6 — Search ranking ✅

Both listings sort by `search_boost DESC` then `rating DESC`, and set `is_promoted` /
`promoted` flags. The disclosure recommendation was taken — `DiscoverStoreCard` renders
a **"Promoted"** badge ([DiscoverStoreCard.tsx:56](apps/dash-customer/src/components/discovery/DiscoverStoreCard.tsx#L56)).

### GAP 7 — Tier selection and history ✅

- `merchant_tier_assignments` table (merchant, tier, effective_from/to, changed_by, agreed_at)
- Written from admin tier changes
  ([merchantRoutes.ts:699](supabase/functions/delivery/admin/merchantRoutes.ts#L699))
  and from merchant onboarding
  ([merchant_application_routes.ts:445](supabase/functions/delivery/merchant_application_routes.ts#L445))
- Merchant-facing plan chooser with commission and tagline per tier
  ([PlanStepContent.tsx](apps/dash-merchant/src/components/onboarding/PlanStepContent.tsx))

### GAP 9 / 10 / 11 — Mirror, currency, Model A ✅

The client mirror carries `smallOrderFee` through both the quote and fallback paths
([orderPricing.ts](apps/dash-customer/src/lib/orderPricing.ts)).

Defaults were retranslated to JMD, and the audit's recommendations were adopted: min
order J$1,500, small-order fee J$400, hard floor J$400, courier ladder 250/80/350. The
marginal service fee was correctly left alone, and `included_km` stayed at 2 rather than
copying the blueprint's US-suburb 10 km.

Model A is gone: `computeDashCaptureSplit` no longer branches on `pricing_model`, the
migration forces `pricing_v2_enabled: true` on all three profile layers (both nested and
flat key forms — a nice touch for legacy blobs), and `defaultPricingRules()` now
defaults it to `true`.

### DEFECT A — capture select list ✅ fixed

[payments/index.ts:200](supabase/functions/payments/index.ts#L200) now selects
`pricing_model`, `service_fee`, `processing_fee`, `merchant_commission_amount`,
`delivery_fee_platform_amount`, `delivery_fee_courier_amount`, `peak_pay_amount`,
`tax_food_jmd`, `tax_platform_jmd`, `platform_delivery_subsidy_jmd`, and
`small_order_fee`. Commission is now actually withheld at capture.

### DEFECT B — subsidy charged to merchant ✅ fixed, verified

The `Math.max(0, …)` clamp on `delivery_fee_platform_amount` is gone; the value is now
read signed, with an explanatory comment
([dashMoneySplit.ts:55](supabase/functions/_shared/dashMoneySplit.ts#L55)). GCT is also
now attributed to the platform rather than falling into the merchant residual.

I verified this numerically rather than by reading. On a Dominant-tier 12 km order with
a J$460 platform subsidy, the merchant receives `discountedSubtotal − commission`
exactly — the subsidy is absorbed by the platform, as intended. The regression test the
audit asked for exists ("free-delivery negative platform share (merchant not charged)").

---

## 2. Open items

### 2.1 🔴 HEAD does not compile — duplicate `};` in PricingHubPage

The committed version of
[PricingHubPage.tsx](packages/dash-admin/src/pages/pricing/PricingHubPage.tsx) has a
stray second `};` at line 835:

```
      setSimRunning(false);
    }
  };
  };          ← syntax error
```

Your **uncommitted working-tree change already deletes it** — `git diff` shows exactly
that one-line removal, and `tsc --noEmit -p packages/dash-admin` is clean with it
applied. So the fix exists; it just isn't committed. Commit it before anything builds
from `main`.

### 2.2 🟠 Two residual leaks still charge the merchant

`computeDashCaptureSplit` derives `merchantReceivable` as
`gross − platformFee − courierPayable`. Because it's a residual, anything the platform
pays that the customer didn't fund lands on the merchant. Two such items remain.

I ran the real engine + split against a Dominant-tier 12 km order (food J$4,000, tip
J$500, card):

```
expected merchant     J$2,800.00   (discountedSubtotal − commission)
actual merchant       J$2,777.50   → short J$22.50
with peak pay J$300   J$2,477.50   → short J$322.50
```

**Leak 1 — `processingFeeTip`.** The engine computes `courierTipNet = tip − processingFeeTip`
([engine.ts:169](packages/dash-pricing/src/engine.ts#L169)), meaning the courier is
intended to absorb the card fee on the tip. But the split credits the courier the
**gross** `tip` while `platformFee` also includes the full `processing_fee` (order +
tip portions). The tip fee gets counted twice and the merchant covers it.
`courier_tip_net` is computed, stored on the order, and used by the COD ledger
([courierCashLedger.ts:207](supabase/functions/delivery/courierCashLedger.ts#L207)) —
but the card capture path ignores it.

**Leak 2 — `peak_pay_amount`.** Platform-funded courier bonus. It's added to
`courierPayable` with no offsetting entry in `platformFee`, and the customer never paid
it — so it comes straight out of the merchant residual. This one predates the migration,
but it's larger and more visible now.

The same gross-tip treatment appears in the courier payout aggregation
([courierConsumerRoutes.ts:1036](supabase/functions/delivery/courierConsumerRoutes.ts#L1036)),
which sums `courierDeliveryEarnings + tip + peak_pay_amount`.

**Suggested fix:** use `courier_tip_net` in `courierPayable`, and subtract `peak_pay` from
`platformFee` (it is a platform cost, like the delivery subsidy). Then add the invariant
as a test — it's the cheapest guard against this class of bug recurring:

```
merchantReceivable === discountedSubtotal − merchantCommissionAmount
```

Longer term, consider computing `merchantReceivable` **directly** from that formula and
letting the *platform* take the residual. The merchant is the party with the least
ability to audit the split; they shouldn't be the one absorbing arithmetic drift.

### 2.3 🟠 Restaurant detail page still shows the legacy static fee

GAP 5 was fixed on the two list surfaces but not on the page the customer actually lands
on before adding to cart.

- `GET /merchants/:id` does `select("*")` with no tier join and returns the row as-is
  ([index.ts:287](supabase/functions/delivery/index.ts#L287)) — no `delivery_fee` override
- `mapMerchantMenuResponse` reads `merchant.delivery_fee`
  ([merchantMenu.ts:113](apps/dash-customer/src/lib/merchantMenu.ts#L113)) and renders
  `"Free delivery"` when it is 0

New merchants are created with `delivery_fee: 0`
([merchantRestaurantRoutes.ts:214](supabase/functions/delivery/merchantRestaurantRoutes.ts#L214)),
so an Economy-tier restaurant shows **J$900 on the feed card and "Free delivery" on its
own page**, then charges J$900 at checkout. That's the exact bait-and-switch the original
GAP 5 was about, on the highest-intent screen.

The item prices on that same endpoint *were* fixed (the commit updated `mapMenuItem` to
prefer `marketplace_price`), so this looks like a simple miss rather than a design
choice. Fix: join the tier in `/merchants/:id` and resolve the fee the same way the feed
does.

### 2.4 🟡 One stale failing test

[rulesBlob.test.ts:60](packages/dash-pricing/src/rulesBlob.test.ts#L60) asserts that a
legacy blob with explicit `pricing_v2_enabled: false` and `min_order_subtotal_jmd: 800`
parses equal to `defaultPricingRules()` — which now returns `true` and `1500`.

The parse is behaving **correctly**: it honours the explicit stored values over the new
defaults, which is exactly what you want for old profiles. The test's expectation is
what's stale. Rewrite it to assert against an explicit expected object instead of
`defaultPricingRules()`, so it tests parsing rather than tracking defaults.

### 2.5 🟡 `commission_base` is a dead knob

`commission_base` is defined in the platform rules type, parsed, serialized, validated,
merged across layers, and defaulted to `'marketplace'` — and **never read by any pricing
logic**. `resolveMerchantCommission` unconditionally uses `discountedSubtotal`, which is
always built from marketplace (inflated) prices.

Setting `commission_base: 'in_store'` today silently does nothing.

This was flagged in the original audit as *the* decision to make explicit rather than
leave emergent, and the config field was added — but the branch behind it wasn't. The
current behaviour (commission on the inflated subtotal) matches the blueprint and the
industry norm, so the *behaviour* is fine; the problem is a setting that lies.

Two honest options: implement the branch (order routes would need to compute an
in-store subtotal from the line snapshots, which already carry `in_store_price`), or
drop the field and document the choice in the merchant agreement. It is currently not
exposed in the admin UI, which limits the blast radius — don't expose it until it works.

### 2.6 🟡 Migration filename sorts before 20 already-applied migrations

`20260829200000_rush_marketplace_pricing.sql` sorts **before** twenty existing
`20260830*` migrations (toll views, geospatial boundaries, coverage). If those are
already applied on the remote, the Supabase CLI may skip this one or require
`--include-all`, and the ordering will look wrong in migration history forever.

Rename it to a timestamp later than the newest applied migration
(`20260830230000_fix_net_coverage_multipolygon.sql`) before pushing, and confirm against
`supabase migration list` rather than the local directory.

### 2.7 🟢 Worth sanity-checking: courier distance pay starts at km 0

The customer's distance charge starts after `included_km` (2 km), but the courier's
distance pay bills from km 0. On the 12 km example that's 12 × J$80 vs the customer's
10 × J$60 — structurally, the subsidy widens with every kilometre, on top of the tier
discount.

This looks deliberate (couriers really do drive the first 2 km), but it means long trips
to Dominant-tier merchants are your most expensive orders. Run the ladder against real
delivered-order distances before turning Dominant on broadly — the numbers are now all
recorded on the order rows, so `platform_delivery_subsidy_jmd` grouped by market and
tier will answer it directly.

---

## 3. Recommended order of work

1. **Commit the `PricingHubPage.tsx` fix** (§2.1) — nothing builds until then.
2. **Fix the two split leaks** (§2.2) and add the `merchantReceivable` invariant test.
3. **Join the tier in `/merchants/:id`** (§2.3) — small, and it closes the last
   place where the displayed fee and the charged fee diverge.
4. **Rename the migration** (§2.6) before the next push.
5. **Repair the stale test** (§2.4).
6. **Decide on `commission_base`** (§2.5) — implement or delete.
7. Then GAP 8 (payout automation), on a split that's now provably correct.

---

## 4. Architecture reference

Retained from the original audit — the map of what lives where.

**Engine (single source of truth; edge functions re-export it via a 2-line shim):**
- [packages/dash-pricing/src/engine.ts](packages/dash-pricing/src/engine.ts) — `buildOrderPricing`, fee resolvers, courier ladder, rules parse/serialize
- [packages/dash-pricing/src/types.ts](packages/dash-pricing/src/types.ts) — `MerchantTier`, `PricingInput`, `PricingBreakdown`, party rule blobs
- [packages/dash-pricing/src/gct.ts](packages/dash-pricing/src/gct.ts) — food vs. platform tax base
- [packages/dash-pricing/src/rulesBlob.ts](packages/dash-pricing/src/rulesBlob.ts) — party namespacing, validators, provenance
- [supabase/functions/_shared/dashPricing.ts](supabase/functions/_shared/dashPricing.ts) — re-export shim

**Server:**
- [pricingResolver.ts](supabase/functions/delivery/pricingResolver.ts) — tier + market load, distance, engine call
- [pricingLayers.ts](supabase/functions/delivery/pricingLayers.ts) — Global → Parish → Town merge
- [customerOrderRoutes.ts](supabase/functions/delivery/customerOrderRoutes.ts) — order placement, dual-price lines, snapshot, order gates
- [customerDiscoveryRoutes.ts](supabase/functions/delivery/customerDiscoveryRoutes.ts) — search feed, tier fee, boost ranking
- [index.ts](supabase/functions/delivery/index.ts) — home feed, merchant detail, pricing quote, menu inflation helper
- [admin/pricingRoutes.ts](supabase/functions/delivery/admin/pricingRoutes.ts) — tier CRUD, preview, backtest, reconciliation
- [_shared/dashMoneySplit.ts](supabase/functions/_shared/dashMoneySplit.ts) — capture split
- [_shared/unifiedLedger/dualWriteDash.ts](supabase/functions/_shared/unifiedLedger/dualWriteDash.ts) — ledger posting incl. subsidy

**Clients:**
- [apps/dash-customer/src/lib/orderPricing.ts](apps/dash-customer/src/lib/orderPricing.ts) — client mirror
- [apps/dash-merchant/src/components/menu/EditItemView.tsx](apps/dash-merchant/src/components/menu/EditItemView.tsx) — dual-price editing
- [apps/dash-merchant/src/components/onboarding/PlanStepContent.tsx](apps/dash-merchant/src/components/onboarding/PlanStepContent.tsx) — tier selection
- [apps/dash-courier/src/lib/](apps/dash-courier/src/lib/) — ladder-based earnings
- [packages/dash-admin/src/pages/pricing/](packages/dash-admin/src/pages/pricing/) — hub, tier editor, party rule forms, simulator

**Schema:**
- [20260511140000_delivery_schema.sql](supabase/migrations/20260511140000_delivery_schema.sql) — base tables
- [20260823120000_dash_pricing_engine.sql](supabase/migrations/20260823120000_dash_pricing_engine.sql) — tiers, market profiles, order snapshots, COD
- [20260829120000_pricing_hierarchy_layers.sql](supabase/migrations/20260829120000_pricing_hierarchy_layers.sql) — global/parish layers
- [20260829200000_rush_marketplace_pricing.sql](supabase/migrations/20260829200000_rush_marketplace_pricing.sql) — tier fees, dual prices, ladder + small-order columns, Model B forcing, tier reseed

---

## 5. Bottom line

The migration landed well. The three load-bearing mechanisms the original audit called
out — tier-driven delivery fees, menu inflation, and courier pay decoupling — are all
implemented properly, with the guardrails (inflation cap, two-floor order minimum,
Promoted labels, tier assignment history) that the audit recommended but the blueprint
never mentioned. Both accounting defects are fixed, and I confirmed the subsidy one
numerically rather than taking the code's word for it.

What's left is a short list. One is a build blocker you've already fixed but not
committed. One is a pair of small residual leaks that still route platform costs onto
merchants — worth fixing now precisely because the split is otherwise correct, and
because a residual-based split will keep producing this bug shape until the invariant is
asserted in a test. One is a single missed endpoint that reintroduces the
feed-vs-checkout divergence on the highest-intent screen. The rest are hygiene.
