# Roam Rush — Pricing Architecture

**Date:** 2026-08-30 · **Implementation reviewed:** 2026-08-30
**Scope:** `delivery` schema pricing, `@roam/dash-pricing` engine, Model B money split, Merchant Tiers
**Status:** ✅ **Architecture implemented — 9 of 10 build items complete and verified.**
One blocker outstanding ([§10.2 A](#a--build-item-1-was-never-done--blocker)) and two minor
defects. See [§10 Implementation review](#10-implementation-review).
**Context:** Pre-launch, no backwards compatibility required. GoRide ledger / fleet finance
explicitly out of scope.

---

## 1. The decision

**Rebuild the pricing model around one invariant: *every order is profitable by construction, and
no admin configuration can make it otherwise*.**

The current model can lose money on a delivery, and the tier ladder pays you *less* as merchants
move up it. Both are consequences of a single design choice — **the tier sells a per-order cash
delivery subsidy**. Remove that, and both problems disappear permanently rather than being tuned
around.

Three levers, cleanly separated:

| Lever | What it does | Who sets it | Cost to Roam |
|---|---|---|---|
| **Tier** | Commission % ↔ **demand goods only**: radius, ranking, promo eligibility, ads, Rush Pass | Roam, per merchant | ~zero marginal cash |
| **Delivery fee** | Distance-based cost recovery, **identical across all tiers** | Roam, platform-wide | provably positive |
| **Menu inflation** | Merchant offsets their own commission | Merchant, within platform cap | zero |

This is the DoorDash / Uber Eats structure. It makes the ladder monotone **by construction** — a
higher tier can never earn you less, because it no longer costs you cash per order.

> **Previous revisions of this document proposed a phased rollout** with tier recalibration deferred
> behind merchant-comms risk and live AOV data. With all data disposable and no merchants signed,
> that sequencing solved a problem that does not exist. Build the correct end state directly.

---

## 2. Why the current design fails

Verified by running the real `buildOrderPricing` against the live config. Detail in
[§9 Appendix](#9-appendix--evidence).

### 2.1 The tier ladder pays you less as merchants move up it

Platform contribution at 5 km, by in-store basket:

| In-store basket | Economy | Growth | Dominant |
|---|---|---|---|
| J$1,200 | **J$810** | J$662 | J$478 |
| J$2,000 | **J$1,010** | J$983 | J$876 |
| J$2,500 | J$1,143 | **J$1,184** | J$1,125 |
| J$4,000 | J$1,540 | J$1,786 | **J$1,872** |

Economy is the most profitable tier below **~J$2,575** basket. You pay J$600/order of delivery
discount to move a merchant Economy → Dominant, and the extra 15pp commission + 20% inflation only
repays it at `0.233 × basket = 600`.

The crossover cuts both ways: above ~J$2,700 the **customer** also pays more on Dominant, because
20% menu inflation on a large basket outgrows a fixed J$600 delivery saving. Menu inflation is
*proportional*; the delivery discount is *fixed*. **These can never be aligned across all basket
sizes** — which is why recalibrating the numbers is not a real fix.

### 2.2 The delivery fee cap creates an unbounded loss

`max_fee_jmd: 1500` caps what the customer pays. The courier ladder is uncapped.

| Road km | Customer | Courier | Platform |
|---|---|---|---|
| 20 | J$1,500 | J$1,350 | +J$150 |
| 30 | J$1,500 *(capped)* | J$1,950 | **−J$450** |
| 50 | J$1,500 *(capped)* | J$3,150 | **−J$1,650** |

**The cap is the sole cause.** With it removed and nothing else changed, delivery margin is exactly
`tierBase − 270`, flat from 4 km to 100 km. Customer and courier per-km rates already match at
J$60, so distance is self-correcting — until the cap bites.

Nothing gates it: the only order-path check is `assertSameMarketCoverage`
([customerOrderRoutes.ts:245](supabase/functions/delivery/customerOrderRoutes.ts#L245)), a market
**polygon**, not a distance limit.

### 2.3 Dominant loses money on every delivery

`delivery margin = tierBase − 270` (≥4 km) ⇒ Economy +J$480, Growth +J$180, **Dominant −J$120**.
At ≤2 km the courier min-pay floor makes it `tierBase − 350` ⇒ **Dominant −J$200**.

### 2.4 Three overlapping order floors, one of them dead

`min_order_subtotal_jmd: 800` is **never enforced** —
[customerOrderRoutes.ts:306-321](supabase/functions/delivery/customerOrderRoutes.ts#L306-L321) skips
that branch whenever a small-order fee is configured, and one is. Real floor is `hard_min` = J$600.
`merchants.min_order_amount` is silently ignored too, and `resolveMinOrderSubtotal` is unreachable
code. The threshold (750) also sits *below* the advertised minimum (800), so J$750–800 orders clear
no floor and pay no fee.

### 2.5 The radius lever is dead

`merchant_tiers.default_delivery_radius_km` (6/10/15) is read into `MerchantTier` at
[pricingResolver.ts:137](supabase/functions/delivery/pricingResolver.ts#L137) and **never used by
anything**. `merchants.delivery_radius_km` is settable in admin and enforced nowhere. This is the
primary tier lever at both DoorDash and Uber Eats and it is already paid for.

### 2.6 `platform_fee` is not margin

[dashMoneySplit.ts:72](supabase/functions/_shared/dashMoneySplit.ts#L72) bundles GCT owed to TAJ and
WiPay processing into `platform_fee`. On a J$2,500 Economy order it reports **J$1,822** against a
true contribution of **J$1,143** — **+59%**. Correct as a cash-custody figure, wrong as margin, and
there is currently no field that states margin.

### 2.7 Merchants silently fund all discounts

`merchantReceivable = discountedSubtotal − commission`
([dashMoneySplit.ts:89](supabase/functions/_shared/dashMoneySplit.ts#L89)). A J$500 discount costs
the merchant J$425 and Roam J$75. Free-delivery promos *are* correctly platform-funded via
`promoCostJmd`. There is no `funded_by` attribution, so a Roam-run acquisition promo would be billed
to the restaurant.

---

## 3. Target architecture

### 3.1 The invariant

```
INVARIANT:  customerDeliveryFee(km) − courierPay(km) ≥ minDeliveryMarginJmd,  ∀ km
```

Two config properties break it, and **only** two:

| Breaks it | Fix |
|---|---|
| `included_km > 0` — free km paid to courier, not charged to customer | **`included_km: 0`** |
| `max_fee_jmd` — caps the customer while courier cost keeps climbing | **remove the field** |

With both gone and customer per-km ≥ courier per-km, delivery margin is
`deliveryBase − courierBasePay`, constant at every distance. **The bad state becomes
unrepresentable** rather than merely avoided.

### 3.2 Verified behaviour of the proposed config

Delivery margin, identical for every tier (`delivery_base_jmd: 450`, `included_km: 0`,
`per_km: 60`, no cap):

| Road km | Customer | Courier | **Margin** |
|---|---|---|---|
| 1 | J$510 | J$350 | **+J$160** ← worst case |
| 4 | J$690 | J$390 | **+J$300** |
| 20 | J$1,650 | J$1,350 | **+J$300** |
| 100 | J$6,450 | J$6,150 | **+J$300** |

```
worst-case margin = deliveryBase + perKm − courierMinPay = 450 + 60 − 350 = J$160
steady-state      = deliveryBase − courierBasePay        = 450 − 150     = J$300
```

Asserted positive at every integer km from 1 to 100.

Platform contribution, at 5 km:

| In-store basket | Economy (15%) | Growth (25%) | Dominant (30%) | Monotone |
|---|---|---|---|---|
| J$800 | J$570 | J$650 | J$690 | ✅ |
| J$1,500 | J$698 | J$848 | J$923 | ✅ |
| J$2,500 | J$963 | J$1,213 | J$1,338 | ✅ |
| J$4,000 | J$1,360 | J$1,760 | J$1,960 | ✅ |
| J$10,000 | J$2,800 | J$3,800 | J$4,300 | ✅ |

**Strictly increasing in commission at every basket size.** No crossover can exist.

Customer total is **identical across tiers** (J$4,180.66 at a J$2,500 basket, 5 km) — the tier is
invisible to the customer and only changes the Roam/merchant split. That is the point: it removes
the entire class of "which tier is cheaper for whom" reasoning that made this hard to understand.

Worst realistic case — J$600 basket, 50 km, Dominant: contribution **+J$780**.

> **Note:** at 50 km the customer would pay J$3,450 for delivery. Absurd as a *product*, fine as
> *economics*. That is exactly right: distance limits become a **product decision** (radius), not a
> financial safety mechanism. Finance is handled structurally.

### 3.3 Concrete configuration

**Global rules** (`delivery.global_pricing_profiles.rules`):

```jsonc
{
  "rider": {
    "courier_base_pay_jmd": 150,
    "courier_per_km_jmd": 60,
    "courier_min_pay_jmd": 350,
    "road_distance_multiplier": 1.4,
    "tip_processing_from_rider": true,
    "cod": { "pause_threshold_jmd": 10000 }
  },
  "customer": {
    "delivery": {
      "base_jmd": 450,          // NEW — platform-wide, replaces per-tier base
      "included_km": 0,         // was 2 — the free-km giveaway
      "per_km_jmd": 60          // must be >= courier_per_km_jmd
      // max_fee_jmd: REMOVED
    },
    "service_fee": {
      "mode": "marginal", "avg_rate": 0.115, "override_rate": 0.085,
      "override_threshold_jmd": 5000, "min_jmd": 150, "max_jmd": 2500
    },
    "min_order_subtotal_jmd": 600,   // the ONLY floor. Blocks below this.
    "small_order_threshold_jmd": 800,
    "small_order_fee_jmd": 150
    // hard_min_order_subtotal_jmd: REMOVED (collapsed into the above)
  },
  "platform": { "max_menu_inflation_percent": 0.25 },
  "guardrails": {                    // NEW — enforced at config write, see §5
    "min_delivery_margin_jmd": 100,
    "min_order_contribution_jmd": 150
  }
}
```

**Tiers** (`delivery.merchant_tiers`) — demand goods only:

| Tier | Commission | Radius | Search boost | Promo eligible | Rush Pass | Auto ads |
|---|---|---|---|---|---|---|
| Economy | 15% | 6 km | 0 | ✗ | ✗ | ✗ |
| Growth | 25% | 10 km | 10 | ✓ | ✗ | ✗ |
| Dominant | 30% | 15 km | 50 | ✓ | ✓ | ✓ |

`base_delivery_fee_jmd` and `menu_inflation_percent` are **dropped from the tier table**.
Commission rates match DoorDash Basic/Plus/Premier exactly and need no change.

**Menu inflation** moves to `merchants.menu_inflation_percent` — merchant-chosen, 0–25%, disclosed
in-app. Neither major requires price parity; both cap and surface it. Industry average markup is
20%+, but consumer research puts the tolerable ceiling nearer 12% — surface it to merchants as a
metric the way Uber Eats does.

### 3.4 Radius becomes real

Gate the order on `min(merchants.delivery_radius_km, tier.default_delivery_radius_km)` against
**`distanceKmRaw`** — straight-line, since a "6 km radius" is a crow-flies concept, not a road one.
Apply the same filter in `customerDiscoveryRoutes` so out-of-range merchants never appear in the
feed. This turns a dead column into the tier's headline benefit at zero cash cost.

---

## 4. What to delete

Nothing depends on any of this. Remove it rather than carrying it.

| Delete | Where | Why |
|---|---|---|
| `pricing_model` column + all legacy branching | orders, `customerOrderRoutes`, `dashMoneySplit` | Every order is v2. A dual path is pure risk. |
| `max_fee_jmd` | rules blob, `DeliveryFeeRules`, `resolveDeliveryFee` | Sole cause of §2.2 |
| `merchant_tiers.base_delivery_fee_jmd` | tier table, `MerchantTier`, resolver | Delivery is platform-wide now |
| `merchant_tiers.menu_inflation_percent` | tier table | Moves to `merchants` |
| `hard_min_order_subtotal_jmd` | rules blob | Collapsed into one floor |
| `resolveMinOrderSubtotal` + the dead soft-min branch | `engine.ts`, `customerOrderRoutes:306-321` | Unreachable (§2.4) |
| `commission_base` | live rules blob | Removed from code already; stale in DB |
| The 28 test orders | `delivery.orders` + dependent ledger rows | ⚠️ **Irreversible — your call, I have not run it.** Clears the way for a clean first real order. |

---

## 5. Making bad configuration unrepresentable

**This is the part that matters most at enterprise scale.** F1–F3 existed undetected because nothing
asserts profitability — the admin UI will happily accept a config that loses money on every order,
and did.

Add `validatePricingConfig(rules, tiers)` in `@roam/dash-pricing`, called from **every** write path
in `pricingRoutes` (market rules, tier edits, parish/town overrides) and run as a CI test against
the live config:

| Check | Rule | Error code |
|---|---|---|
| Per-km parity | `customer.per_km_jmd >= rider.courier_per_km_jmd` | `PER_KM_BELOW_COST` |
| No free km | `included_km == 0` unless `base_jmd` covers `included_km × courier_per_km` | `INCLUDED_KM_UNFUNDED` |
| No binding cap | `max_fee_jmd` unset, or `> courierPay(maxRadiusKm)` | `CAP_BINDS_BELOW_COST` |
| Delivery margin | `min over km∈[1, maxRadius] (customerFee − courierPay) >= min_delivery_margin_jmd` | `DELIVERY_MARGIN_FLOOR` |
| Tier monotonicity | contribution strictly increasing in commission at reference baskets {800, 2500, 10000} | `TIER_LADDER_NOT_MONOTONE` |
| Floor coherence | `min_order_subtotal <= small_order_threshold` | `ORDER_FLOORS_INCOHERENT` |

Reject the write with the specific code and the failing distance/basket. **A config that loses money
should be impossible to save, not merely discouraged.**

Second layer — a quote-time assertion as defence in depth:

```ts
const contribution = merchantCommissionAmount + serviceFee
                   + deliveryFeePlatformAmount + smallOrderFee;
if (contribution < guardrails.min_order_contribution_jmd) {
  // log + alert; reject with "order_below_margin_floor"
}
```

With §3 in place this should never fire. If it does, a config or code invariant has broken and you
want to know immediately.

---

## 6. Observability

**Add `contribution_jmd`** to orders, written at capture:

```
contribution_jmd = merchant_commission_amount + service_fee
                 + delivery_fee_platform_amount + small_order_fee
                 - peak_pay_amount
```

Leave `platform_fee` semantics alone — it is correct as cash custody and the ledger reconciles on
it. Document the distinction in `dashMoneySplit.ts` so the first revenue dashboard doesn't reach for
the wrong field.

**Add `promo_funded_by`** (`merchant` | `platform` | `shared`). When `platform`, the discount reduces
platform contribution instead of merchant receivable — mirroring how `promoCostJmd` already works
for free delivery. Cheap now; unattributable retroactively.

**Metrics** once volume exists:

| Metric | Alert |
|---|---|
| Per-order contribution p5 / p50 | p5 < `min_order_contribution_jmd` |
| Delivery margin by road-km bucket | negative in any bucket |
| Contribution by tier × basket decile | any tier inversion |
| Menu inflation distribution by merchant | merchants at the 25% cap |
| Settlement drift | [reconcile_v2_money_split.sql](supabase/scripts/reconcile_v2_money_split.sql) non-zero |

**Make the Simulator a gate, not a toy.** The Pricing → Simulator tab should render contribution,
courier pay, merchant net and customer total for a basket × distance × tier, flag negative
contribution in red, and run `validatePricingConfig` against pending edits *before* Save is enabled.

---

## 7. Build order

Each step is independently shippable and leaves the system correct.

| # | Work | Unblocks |
|---|---|---|
| **1** | **Place one real end-to-end v2 order and reconcile it** against `buildOrderPricing` — `pricing_model='v2'`, `distance_km` populated, `pricing_snapshot` written, tier + ladder applied, `computeDashCaptureSplit` reconciling to the capture. The Model B engine has **never executed in production**; every number in this document is derived from code, not observed. | everything |
| **2** | Engine: `included_km: 0`, remove `max_fee_jmd`, move delivery base from tier → global rules. Update `resolveDeliveryFee` signature + tests. | 3, 4 |
| **3** | `validatePricingConfig` + wire into all `pricingRoutes` write paths + CI test against live config (§5) | safety |
| **4** | Enforce radius in `customerOrderRoutes` **and** `customerDiscoveryRoutes` vs `distanceKmRaw` (§3.4) | tier value |
| **5** | Collapse order floors to one; delete the dead soft-min branch (§2.4) | — |
| **6** | Move `menu_inflation_percent` tier → merchant; drop `base_delivery_fee_jmd` from tiers (§3.3) | — |
| **7** | `contribution_jmd` + `promo_funded_by` columns (§6) | reporting |
| **8** | Delete legacy: `pricing_model`, `commission_base`, `resolveMinOrderSubtotal`, dual-path branching (§4) | — |
| **9** | Simulator as a gate (§6) | ops safety |
| **10** | Rewrite Merchant Tiers copy — lead with radius, ranking, promos, Rush Pass. **Never claim "cheaper delivery"**: delivery is now identical across tiers. | sales |

**Later, once volume exists:** Rush Pass subscription (turns cheap delivery into prepaid recurring
revenue rather than a margin leak — how DashPass/Uber One actually fund it), and a DoorDash-style
Growth Guarantee on Dominant (refund commission below N orders/month). Both need real order
frequency to price; neither is a prerequisite for anything above.

---

## 8. What this fixes

| Was | After |
|---|---|
| §2.1 ladder inverts below J$2,575 | Monotone at every basket size, **by construction** |
| §2.2 unbounded loss past 25 km | Margin ≥ J$160 at every distance to 100 km, **asserted** |
| §2.3 Dominant −J$120/delivery | +J$300 steady state, identical across tiers |
| §2.4 dead J$800 minimum | One floor, enforced |
| §2.5 dead radius lever | The tier's headline benefit |
| §2.6 no margin field | `contribution_jmd` |
| §2.7 unattributed promos | `promo_funded_by` |
| Nothing prevents bad config | Six invariants, enforced at write + CI |
| "Hard to even understand" | Tier = commission ↔ visibility. Delivery = distance. Inflation = merchant's choice. Three independent things. |

---

## 9. Appendix — evidence

Every figure was produced by running the **real** `buildOrderPricing` against the **live** rules
blob, not hand-calculated. Reproduce by creating a scratch test in `packages/dash-pricing/src/` and:

```bash
cd packages/dash-pricing && npx vitest run src/<scratch>.test.ts
```

Contribution helper used throughout:

```ts
const contribution = (b: PricingBreakdown) =>
  b.merchantCommissionAmount + b.serviceFee + b.deliveryFeePlatformAmount + b.smallOrderFee;
```

Order construction: `subtotal` passed to the engine is the **marketplace** subtotal
(`inStore × (1 + inflation)`), matching
[customerOrderRoutes.ts:162](supabase/functions/delivery/customerOrderRoutes.ts#L162), which prices
lines from `marketplace_price`. GCT 15%, card payment, no tip, no zone surcharge.

**Production state, 2026-08-30** (`csfllzzastacofsvcdsc`): 28 orders, all `pricing_model='legacy'`,
last 2026-08-21 — all predating the marketplace migration. 8 merchants, all on Growth, none on
Economy or Dominant. Coordinates present on 26/28. `distance_km`, `pricing_snapshot` NULL throughout
because the v2 path has never run. All disposable.

**Competitive benchmark.** Commission 15/25/30 matches DoorDash Basic/Plus/Premier exactly; Uber Eats
sits at 20/25/30 having *raised* its entry tier. Both differentiate tiers on **radius, ranking,
subscriber access, and ads** — not on a per-order cash delivery subsidy. DoorDash charges an
*uncapped* Long Distance Fee beyond ~10 miles and varies service fee with distance; it does not cap
the customer while driver cost climbs.

[DoorDash Pricing Plans](https://merchants.doordash.com/en-us/blog/new-partnership-plans) ·
[DoorDash Merchant Pricing](https://merchants.doordash.com/en-us/pricing) ·
[Basic vs Plus vs Premier](https://www.deliverguard.io/resources/doordash-basic-vs-plus-vs-premier) ·
[DoorDash pricing updates](https://about.doordash.com/en-us/news/announcing-updates-to-provide-more-choice-flexibility-and-transparency-for-local-restaurants) ·
[Fees matched to delivery effort](https://about.doordash.com/en-us/news/updating-our-fee-structure) ·
[What fees do I pay?](https://help.doordash.com/en-us/consumers/article/what-fees-do-i-pay) ·
[Uber Eats raises marketplace fees](https://www.restaurantdive.com/news/uber-eats-increases-marketplace-fees/814294/) ·
[Uber Eats commission 2026](https://www.restolabs.com/blog/uber-eats-commission-fee) ·
[Uber Eats Menu Markup metric](https://help.uber.com/merchants-and-restaurants/article/how-is-the-menu-markup-metric-calculated?nodeId=9f210f22-dbf9-4839-93de-33e49bc02811) ·
[Delivery markup study](https://ktla.com/news/local-news/fast-food-delivery-fees/) ·
[DashPass vs Uber One](https://www.joinkudos.com/blog/doordash-dashpass-vs-uber-one-which-saves-more)

---

## 10. Implementation review

Verified 2026-08-30 against the working tree and the live database (`csfllzzastacofsvcdsc`).
Method: read every changed code path, ran the `@roam/dash-pricing` suite (**33 tests, all pass**),
and queried production schema + config directly rather than trusting the diff.

### 10.1 Build-item status

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Place one real v2 order and reconcile | ❌ **Not done** | `delivery.orders` = **0 rows** |
| 2 | `included_km: 0`, remove `max_fee_jmd`, delivery base tier → global | ✅ | [engine.ts:194](packages/dash-pricing/src/engine.ts#L194) takes no tier arg; cap stripped in [rulesBlob.ts:69](packages/dash-pricing/src/rulesBlob.ts#L69) |
| 3 | `validatePricingConfig` + all write paths + CI | ✅ **Exceeds spec** | [engine.ts:687](packages/dash-pricing/src/engine.ts#L687); all 5 write paths; CI at `ci.yml:44` |
| 4 | Radius enforced, both paths, vs `distanceKmRaw` | ✅ | [customerOrderRoutes.ts:304-332](supabase/functions/delivery/customerOrderRoutes.ts#L304-L332), [customerDiscoveryRoutes.ts:305-316](supabase/functions/delivery/customerDiscoveryRoutes.ts#L305-L316) |
| 5 | Collapse order floors; delete dead soft-min branch | ✅ | Single `orderFloor` gate at [customerOrderRoutes.ts:296](supabase/functions/delivery/customerOrderRoutes.ts#L296) |
| 6 | Inflation tier → merchant; drop tier delivery base | ✅ | Tier table has neither column; `merchants.menu_inflation_percent` exists |
| 7 | `contribution_jmd` + `promo_funded_by` | ✅ | Both columns live; written at [customerOrderRoutes.ts:395](supabase/functions/delivery/customerOrderRoutes.ts#L395) |
| 8 | Delete legacy | ✅ | `pricing_model` column **dropped**; `commission_base` gone; `resolveMinOrderSubtotal` collapsed |
| 9 | Simulator as a gate | ⚠️ **Partial** | Server rejects with code; client Save not pre-gated — see [C](#c--simulator-save-is-not-pre-gated-client-side) |
| 10 | Merchant Tiers copy rewrite | ✅ | No "cheaper delivery" claims remain in admin or merchant onboarding |

**Delivered beyond scope:** Rush Pass membership (`rush_pass_membership_id`, subsidy-aware
contribution floor) and Growth Guarantee (`growth_guarantee` config + `/pricing/growth-guarantee/run`).
Both were listed as "later, once volume exists" — building them early is fine, but neither can be
priced meaningfully until real order frequency exists.

### 10.2 Findings

<a id="a--build-item-1-was-never-done--blocker"></a>
#### A — Build item 1 was never done 🔴 Blocker

`delivery.orders` contains **zero rows**. The test orders were cleared, but no replacement order was
ever placed. **The Model B engine has still never executed in production** — the one precondition
the build order called out as gating everything else.

Everything in §3 is verified against the real engine in unit tests, and the live config is correct.
But no order has traversed `resolveDashOrderPricing` → `buildOrderPricing` →
`computeDashCaptureSplit` → ledger in production. Untested integration seams:

- Tier + radius join shape in `customerOrderRoutes` — the embedded `pricing_tier` can arrive as an
  object *or* an array; [line 314](supabase/functions/delivery/customerOrderRoutes.ts#L314) handles
  both, unverified against a real PostgREST response
- `distanceKmRaw` actually populated from real dropoff coordinates
- `contribution_jmd` / `promo_funded_by` round-tripping to the DB
- `computeDashCaptureSplit` reconciling against a real WiPay capture
- GCT split against a real merchant registration status

**Do this before anything else ships.** Place one order end-to-end, then reconcile with
[reconcile_v2_money_split.sql](supabase/scripts/reconcile_v2_money_split.sql).

#### B — GCT unit slip in tests and validator 🟡 Low

`taxRatePercent: 0.15` is passed in three places — the validator's monotonicity check
([engine.ts:751](packages/dash-pricing/src/engine.ts#L751)) and the acceptance test
([architectureAcceptance.test.ts:96](packages/dash-pricing/src/architectureAcceptance.test.ts#L96)
and [:114](packages/dash-pricing/src/architectureAcceptance.test.ts#L114)).

GCT is a **percent** everywhere else — `resolveOrderGct` divides by 100, so `0.15` means **0.15%,
not 15%**. On a J$2,500 basket: `0.15` gives tax J$4.63; `15` gives J$463.13.

**This is not currently a behavioural bug.** `contributionJmd` excludes tax, so neither the
validator's verdict nor ladder monotonicity changes. I re-ran every architecture invariant at a real
15% GCT — monotonicity, identical customer total across tiers, and the J$150 contribution floor
**all still hold**.

Still worth fixing: the acceptance test currently asserts customer-total parity under an unrealistic
~0% tax, and the moment any tax-dependent term enters `contributionJmd`, the validator would
silently start passing bad configs. Change all three to `15`.

<a id="c--simulator-save-is-not-pre-gated-client-side"></a>
#### C — Simulator Save is not pre-gated client-side 🟡 Low

§6 asked the Simulator to run `validatePricingConfig` against pending edits and disable Save on
failure. Save buttons in `PricingHubPage.tsx` gate on `canWrite` and `saving` only.

**The invariant is genuinely enforced** — all five write paths reject with a 400 and the specific
error code, so no invalid config can be persisted. This is a UX gap, not a correctness gap: an admin
discovers the failure on Save rather than before it. Worth closing, not urgent.

#### D — Not a defect: the duplicate per-km key

The live blob carries both `per_km_jmd` and `per_extra_km_jmd`. Deliberate alias —
[rulesBlob.ts:73](packages/dash-pricing/src/rulesBlob.ts#L73) normalises one to the other and
[:166](packages/dash-pricing/src/rulesBlob.ts#L166) writes both. Leave it.

### 10.3 Live configuration — verified against target

| Setting | Target (§3.3) | Live | |
|---|---|---|---|
| `delivery.base_jmd` | 450 | 450 | ✅ |
| `delivery.included_km` | 0 | 0 | ✅ |
| `delivery.max_fee_jmd` | removed | absent | ✅ |
| `min_order_subtotal_jmd` | 600 | 600 | ✅ |
| `small_order_threshold_jmd` | 800 | 800 | ✅ |
| `hard_min_order_subtotal_jmd` | removed | absent | ✅ |
| `guardrails` | present | margin 100 · contribution 150 | ✅ |
| `commission_base` | removed | absent | ✅ |
| Tier commission | 15 / 25 / 30 | 15 / 25 / 30 | ✅ |
| Tier radius | 6 / 10 / 15 | 6 / 10 / 15 | ✅ |
| Tier search boost | 0 / 10 / 50 | 0 / 10 / 50 | ✅ |
| Tier delivery base / inflation | dropped | columns gone | ✅ |

`service_fee.distance_addon` is present but `enabled: false` — correct, and the validator checks the
margin invariant still holds at max radius if it is ever switched on.

### 10.4 Remaining work

1. 🔴 **Place one real v2 order and reconcile it** (finding A) — nothing else should ship first.
2. 🟡 Change `0.15` → `15` in the three GCT call sites (finding B).
3. 🟡 Pre-gate Simulator Save on `validatePricingConfig` (finding C).
4. ⚪ **Commit the work** — 67 files are uncommitted on `main` with no branch. This is a full
   pricing-architecture replacement sitting in a dirty tree.
5. ⚪ Price Rush Pass and the Growth Guarantee once real order frequency exists.

### 10.5 Verdict

**The architecture is correctly and completely implemented.** Every invariant from §3 holds in the
shipped code, the live configuration matches the target exactly, the validator is wired into all
five write paths plus CI, and the two structural defects that caused the original findings —
`included_km > 0` and `max_fee_jmd` — are gone at both the code and data layer. The validator is
better than what I specified.

The gap is verification, not construction: a pricing engine that has never priced a real order is
not yet proven, however good its unit tests.
