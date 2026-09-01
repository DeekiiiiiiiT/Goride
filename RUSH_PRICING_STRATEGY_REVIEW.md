# Roam Rush — Pricing Architecture

**Date:** 2026-08-30 · **Implementation reviewed:** 2026-08-30 · **Re-audited:** 2026-08-31
**Scope:** `delivery` schema pricing, `@roam/dash-pricing` engine, Model B money split, Merchant Tiers
**Status:** ✅ Architecture + audit defects through M/N/P closed. **§18 closeout (2026-08-31):**
R, T, S, U closed in code; Q **accepted**; **O remains** (PO/QA delivered lifecycle).
`@roam/dash-pricing`: **51 tests passing.**
✅ **Finding A closed 2026-08-30** — first live Model B orders priced through the real path;
`RD-2026-000001` reconciles to the cent.
✅ **Finding L closed 2026-08-30** — Pass subsidy accumulator fixed (fail-closed); real-budget
deny `RD-2026-000006` and distance deny `RD-2026-000007` persisted. See [§14.4](#144-standing-position).
✅ **M, N, P closed; R, T, S, U closed 2026-08-31** ([§18](#18-closeout-implementation--2026-08-31)).
`delivery` redeployed. Promo FD + Pass subsidy spend via Postgres RPCs.
✅ **O closed 2026-08-31** — `RD-2026-000008` → `completed`; WIPAY_DEMO capture; reconcile
delta **0.00**; delivery margin **+300**. See checklist §5.
⚪ **Q accepted / won’t-fix** — documented in ops runbook (not “closed”).
✅ **§18 closeout independently verified** ([§19](#19-independent-verification-of-the-18-closeout--2026-08-31))
at `0fd23f52`: R, S, T, U all confirmed closed at the executing layer; **51 vitest + 6 Deno passing**.
`RD-2026-000010` at 0.59 km gives the §3.2 **worst case (+J$160)** its first production evidence.
⚠️ **Three residuals:** [O's real-WiPay capture seam](#192-o--the-lifecycle-is-closed-the-capture-seam-is-not)
(both terminal orders used `DEMO-…` transactions — disclosed, but the seam finding A named is still
unexercised); [the GG money path has never executed](#193-the-growth-guarantee-money-path-has-still-never-run)
(0 adjustments, `enabled=false` — correct per P, but F/G/H remain code-verified only); and
[V](#v--the-two-subsidy-rpcs-are-security-definer-and-granted-to-authenticated) 🟡 — the two new
subsidy RPCs are `SECURITY DEFINER` and granted to `authenticated` on an exposed schema.
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

1. 🔴 **Place one real v2 order and reconcile it** (finding A) — see [docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md](docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md).
2. ~~🟡 Change `0.15` → `15` in the three GCT call sites (finding B).~~ **Fixed** in validator + acceptance/engine tests.
3. ~~🟡 Pre-gate Simulator Save on `validatePricingConfig` (finding C).~~ **Fixed** — Pricing Hub party Save pre-validates client-side.
4. ⚪ **Commit the work** when ready.
5. ~~⚪ Bound Rush Pass / fix GG money paths~~ — remediated per §11 (E–H); do not sell Pass until checklist §2–3 signed off.

### 11.3 Priority — remediation status (2026-08-30)

| Finding | Status |
|---|---|
| E Pass guardrail | **Fixed in code** — distance cap 8 km + monthly subsidy budget = plan price; validator asserts on Pass quotes |
| F GG over-credit | **Fixed** — credit from `merchant_commission_amount` |
| G in-flight orders | **Fixed** — `delivered` / `completed` only |
| H window / ceiling | **Fixed** — calendar months + `max_credit_jmd_per_period` (claw-back still deferred) |
| A real order | **Open** — manual QA checklist |
| B GCT unit | **Fixed** |
| C Simulator pre-gate | **Fixed** |

### 10.5 Verdict

**The architecture is correctly and completely implemented.** Every invariant from §3 holds in the
shipped code, the live configuration matches the target exactly, the validator is wired into all
five write paths plus CI, and the two structural defects that caused the original findings —
`included_km > 0` and `max_fee_jmd` — are gone at both the code and data layer. The validator is
better than what I specified.

The gap is verification, not construction: a pricing engine that has never priced a real order is
not yet proven, however good its unit tests.

> **Scope note.** §10 was a *completeness* check against the §7 build order. It did not review the
> ~1,000 lines of Rush Pass and Growth Guarantee code, which were never in the spec. That review is
> [§11](#11-defect-audit), and it is where the serious defects are.

---

## 11. Defect audit

Audited commit `a21a1276` (6,539 insertions / 2,695 deletions across 67 files) on 2026-08-30.
Focus: the money-handling paths added beyond the §7 spec, which §10 did not cover.
Reviewed by reading every new money path, tracing call sites, and querying live config.
**No code was changed.**

### 11.1 Findings

| # | Finding | Severity |
|---|---|---|
| [E](#e--rush-pass-has-no-effective-economic-guardrail) | Rush Pass has no effective economic guardrail — unbounded per-order subsidy | 🔴 Critical |
| [F](#f--growth-guarantee-over-credits-on-discounted-orders) | Growth Guarantee over-credits on any discounted order | 🔴 High |
| [G](#g--growth-guarantee-counts-in-flight-orders-as-completed) | Growth Guarantee counts in-flight orders as completed | 🟠 Medium |
| [H](#h--growth-guarantee-minor-issues) | Window drift + no claw-back + no credit ceiling | 🟡 Low |
| [J](#j--verified-safe-rush-pass-cannot-be-activated-without-payment) | *Verified safe:* Rush Pass cannot be activated without payment | ✅ |
| [K](#k--pre-existing-out-of-scope) | Client-declared payment status on `/wipay/complete` — **pre-existing** | ⚪ Out of scope |

<a id="e--rush-pass-has-no-effective-economic-guardrail"></a>
#### E — Rush Pass has no effective economic guardrail 🔴 Critical

**The architecture made every non-Pass order provably profitable. Rush Pass reintroduces exactly the
unbounded per-order subsidy the rebuild was designed to eliminate — and its guardrail does not
guard.**

Two independent failures compound:

**1. The validator's Pass check asserts on the wrong quote.**
[engine.ts:794-828](packages/dash-pricing/src/engine.ts#L794-L828) builds a Pass quote (`pass`) at
max radius with free delivery and a 0.5 service-fee multiplier — then never asserts anything about
`pass.contributionJmd` except `Number.isFinite()`. The only real assertion is on `base`, a
**non-Pass quote at 5 km**:

```ts
if (contribFloor > 0 && base.contributionJmd < contribFloor) {   // ← `base`, not `pass`
  return { code: 'PASS_CONTRIBUTION_FLOOR', ... };
}
```

`PASS_CONTRIBUTION_FLOOR` therefore cannot fire for an unprofitable Rush Pass configuration. It only
re-tests a baseline already covered by the monotonicity check. The comment above it describes an
assertion the code does not make.

**2. The runtime floor is explicitly bypassed for Pass orders.**
[customerOrderRoutes.ts:339](supabase/functions/delivery/customerOrderRoutes.ts#L339):

```ts
const subsidyOk = v2Pricing.rushPassApplied === true || v2Pricing.freeDeliveryApplied === true;
if (!subsidyOk && minContribution > 0 && v2Pricing.contributionJmd < minContribution) { ... }
```

So neither config-time nor quote-time enforcement applies to Pass orders.

**The exposure.** Live plan: **J$1,500 / 30 days**, `free_delivery: true`,
`service_fee_multiplier: 0.5`. Worst case within an allowed radius — Dominant (15 km), J$800 basket:

| Component | Amount |
|---|---|
| Courier ladder @ 15 km — `max(150 + 15×60, 350)` | J$1,050 |
| Customer delivery fee (free under Pass) | J$0 |
| `deliveryFeePlatformAmount` | **−J$1,050** |
| Commission (30% × 800) | +J$240 |
| Service fee (J$150 floor × 0.5) | +J$75 |
| Small-order fee (800 ≥ 800 threshold) | J$0 |
| **Contribution** | **≈ −J$735** |

**Roughly two such orders consume the entire monthly subscription fee.** There is no per-member
order cap, no monthly subsidy budget, and no distance restriction beyond the tier radius.

This is a price-point transplant: DashPass and Uber One work at ~US$9.99 because US delivery fees
are ~US$3.99 and take rates apply to much larger baskets. J$1,500 ≈ US$9.50, but the delivery being
given away costs J$1,050 at max radius — a far larger fraction of the subscription.

**Recommended (not implemented):** make the Pass check assert on `pass.contributionJmd`; add a
per-member monthly subsidy budget and/or a Pass-specific distance cap; and re-derive the price from
expected order frequency once real volume exists.

<a id="f--growth-guarantee-over-credits-on-discounted-orders"></a>
#### F — Growth Guarantee over-credits on discounted orders 🔴 High

[growthGuarantee.ts:210-215](supabase/functions/delivery/growthGuarantee.ts#L210-L215):

```ts
for (const o of completed) {
  const sub = Number((o as { subtotal?: number }).subtotal ?? 0);
  if (Number.isFinite(sub) && sub > 0) {
    credit += sub * (dominantRate - economyRate);
  }
}
```

The credit is computed from raw **`subtotal`**, but the engine charges commission on
**`discountedSubtotal`** (`subtotal − discount`) —
[engine.ts:262-267](packages/dash-pricing/src/engine.ts#L262). So any order carrying a discount is
refunded more commission than was ever charged.

The query at [line 183](supabase/functions/delivery/growthGuarantee.ts#L183) already selects
`merchant_commission_amount` — the authoritative figure — and then never uses it. Deriving the credit
from the recorded commission (`merchant_commission_amount × (1 − economyRate / dominantRate)`) would
be both correct and drift-proof.

Real money out of the door, paid automatically by
`POST /pricing/growth-guarantee/run` into `payments.merchant_adjustments`.

<a id="g--growth-guarantee-counts-in-flight-orders-as-completed"></a>
#### G — Growth Guarantee counts in-flight orders as completed 🟠 Medium

[growthGuarantee.ts:191-195](supabase/functions/delivery/growthGuarantee.ts#L191-L195):

```ts
const completed = (orders ?? []).filter((o) => {
  const s = String(o.status ?? "").toLowerCase();
  return s !== "cancelled" && s !== "rejected";
});
```

The variable is named `completed`, but the predicate admits every non-terminal status —
`pending`, `paid`, `accepted`, `preparing`, `ready`. A merchant with 15 delivered orders and 6 stuck
in `pending` counts as 21 and is denied a guarantee they qualified for. It errs in Roam's financial
favour, which is precisely why it will not surface as a complaint until a merchant audits it.

Define the qualifying set explicitly (`delivered` / `completed`) rather than by exclusion.

<a id="h--growth-guarantee-minor-issues"></a>
#### H — Growth Guarantee: window drift, no claw-back, no ceiling 🟡 Low

- **Window drift.** [line 63](supabase/functions/delivery/growthGuarantee.ts#L63) measures the
  6-month eligibility window with an average month of `30.4375` days. Near the boundary the verdict
  depends on which months a merchant's window spans. Use calendar-month arithmetic for a money gate.
- **No claw-back.** A credit is computed from orders that were non-cancelled *at run time*. If one is
  later refunded or cancelled, nothing reverses the credit.
- **No ceiling.** The credit is uncapped. Nineteen large orders produce an unbounded refund. Arguably
  correct (DoorDash refunds full commission), but it deserves a deliberate sanity limit and an alert.

Idempotency is handled well — `gg:{merchantId}:{period}` with a pre-check plus `23505` race handling.

<a id="j--verified-safe-rush-pass-cannot-be-activated-without-payment"></a>
#### J — Verified safe: Rush Pass cannot be activated without payment ✅

I traced the one plausible free-membership path and it is **closed**. Recording it so it is not
re-litigated:

- `activateRushPassFromPaymentIntent` itself never checks that the intent was paid — it trusts its
  caller. Both callers guard correctly:
- `POST /customer/rush-pass/confirm`
  ([rushPassRoutes.ts:352-355](supabase/functions/delivery/rushPassRoutes.ts#L352)) re-reads
  `intent.status` **from the database** and requires `completed`/`paid`. Client input cannot set it.
- The WiPay webhook is secret-verified (`verifyWipayCallbackSecret`) and checks
  `wipaySuccess(payload.status)` before completing.
- The client-callable `POST /wipay/complete` *can* locate any intent by `transaction_id` via
  `findWipayIntent` ([payments/index.ts:142-150](supabase/functions/payments/index.ts#L142)), which is
  **not** scoped to `order_id` — but it then calls
  `assertCustomerOwnsOrder(user.id, String(intent.order_id))`, and Rush Pass intents carry
  `order_id: null`. `String(null)` = `"null"` finds no order, so it returns 404 before reaching
  activation.

Activation is also idempotent on `last_payment_intent_id`, and renewals correctly extend from the
existing period end rather than truncating it. Renewal state machine
(`active → past_due → 3-day grace → expired`) is sound.

<a id="k--pre-existing-out-of-scope"></a>
#### K — Pre-existing, out of scope ⚪

`POST /payments/wipay/complete` accepts a client-supplied `status` and treats
`wipaySuccess(body.status)` as sufficient to complete an **order** intent. `git diff` confirms this
predates commit `a21a1276` — it is not something this work introduced, and the Rush Pass path is not
reachable through it (finding J). Flagged only so it is on the record; it belongs to a payments
audit, not this one.

### 11.2 What the audit confirmed is correct

- **The core architecture is sound.** The §3 invariant holds in shipped code; `included_km: 0` and
  the removal of `max_fee_jmd` are real at both code and data layer.
- **The validator covers all five write paths** and runs in CI — genuinely enforced, not advisory.
- **Radius gating uses `distanceKmRaw`** (straight-line) in both the order and discovery paths.
- **Rush Pass activation, idempotency, and renewal** are correctly built (finding J).
- **Growth Guarantee idempotency** is correctly built.
- **`dashMoneySplit` and `dualWriteDash`** carry no residual legacy branching.
- `@roam/dash-pricing`: **33 tests, all passing.**

### 11.3 Priority

| | Action |
|---|---|
| 1 | 🔴 **E** — fix the Pass validator assertion (`pass`, not `base`) and bound the Rush Pass subsidy. **Do not sell Rush Pass until this is closed.** |
| 2 | 🔴 **F** — derive the Growth Guarantee credit from `merchant_commission_amount`. **Do not run `/growth-guarantee/run` in anger until fixed.** |
| 3 | 🟠 **G** — define the qualifying order set explicitly |
| 4 | 🔴 **A** (§10.2) — place one real v2 order and reconcile |
| 5 | 🟡 **B, C, H** — GCT unit slip, Simulator pre-gate, Growth Guarantee minor issues |

Both critical findings sit in features that were **built ahead of the plan**, which had them as
"later, once volume exists." The spec'd architecture itself audits clean. That is the lesson worth
keeping: the parts that were designed against an invariant hold; the parts added without one do not.

---

## 12. Remediation verification

Re-audited 2026-08-30 after the remediation pass. Verified by reading each changed path, running
the suite, and querying live config. **9 of 10 findings closed.**

### 12.1 Status

| # | Finding | Status | Verification |
|---|---|---|---|
| **A** | Engine never ran in production | ❌ **Still open** | `delivery.orders` = **0 rows** |
| B | GCT unit slip (`0.15` → `15`) | ✅ Closed | No `taxRatePercent: 0.15` remains; validator uses a `GCT` constant |
| C | Simulator not pre-gated | ✅ Closed | `validatePricingConfig` imported and called at [PricingHubPage.tsx:549](packages/dash-admin/src/pages/pricing/PricingHubPage.tsx#L549) |
| **E** | Rush Pass subsidy unbounded | ✅ **Closed properly** | See [12.2](#122-finding-e--fixed-end-to-end-not-just-in-the-validator) |
| **F** | GG over-credits on discounts | ✅ Closed | Credit now derives from `merchant_commission_amount` ([growthGuarantee.ts:221](supabase/functions/delivery/growthGuarantee.ts#L221)) |
| G | GG counted in-flight orders | ✅ Closed | Explicit `GG_QUALIFYING_ORDER_STATUSES` allow-list, delivered/completed only |
| H1 | 30.4375-day month drift | ✅ Closed | `jamaicaCalendarMonthsElapsed` replaces `monthsBetween` |
| H2 | No claw-back | ✅ Closed | `shouldClawGrowthGuarantee` + claw-back adjustment posting |
| H3 | No credit ceiling | ✅ Closed | `max_credit_jmd_per_period` (live: J$50,000) |
| J/K | Verified-safe / pre-existing | — | Unchanged |

**Tests: 45 passing** (was 33). New `auditRemediation.test.ts` (12 tests) maps 1:1 onto the
findings — including the specific failure modes: over-credit vs discounted commission, qualifying
status set, calendar-month drift, and Pass distance/budget bounds. These are real regression tests,
not coverage padding.

### 12.2 Finding E — fixed end-to-end, not just in the validator

This is the one I checked hardest, because a validator can be made to pass without the runtime
actually changing. It was fixed at **all four** layers:

1. **Config schema** — `rush_pass.max_free_delivery_km` and `monthly_subsidy_budget_jmd`; live values
   **8 km / J$1,500**.
2. **Validator** — new `PASS_SUBSIDY_UNBOUNDED` rejects a zero/absent cap or budget, and the Pass
   checks now assert on **`passFree.contributionJmd`** and `platformDeliverySubsidyJmd` — the *Pass*
   quote, which was the actual bug — plus a second quote beyond the free-delivery cap that must
   clear the normal contribution floor ([engine.ts:837-912](packages/dash-pricing/src/engine.ts#L837-L912)).
3. **Resolver** — `resolveRushPassFreeDelivery` grants free delivery only within the km cap **and**
   remaining budget, tracking spend via `loadRushPassSubsidyUsed`
   ([pricingResolver.ts:464-492](supabase/functions/delivery/pricingResolver.ts#L464-L492)).
4. **Order path** — the blanket `subsidyOk` bypass is gone. Pass orders are now checked against
   *remaining budget* and rejected with `pass_subsidy_budget_exceeded`; Pass orders with delivery
   charged fall through to the normal contribution floor
   ([customerOrderRoutes.ts:334-360](supabase/functions/delivery/customerOrderRoutes.ts#L334-L360)).

**New worst case.** At the 8 km cap the courier ladder is J$630, so the subsidy is J$630 against a
J$1,500 monthly budget — roughly 2.4 max-distance free trips per member per month, after which
delivery is charged normally. The −J$735-per-order exposure is gone, and total Pass subsidy is now
bounded by the subscription price itself. Commission and the half-rate service fee still accrue on
every Pass order, so a fully-consumed budget remains net positive.

One deliberate consequence worth knowing: a Pass member at 15 km never gets free delivery — only
the 50% service-fee cut. That is correct economics; make sure the marketing copy says "free delivery
within 8 km" rather than "free delivery."

### 12.3 Finding A — closed ✅ (2026-08-30)

Superseded by [§13.4](#134-standing-position). First live Model B order
`RD-2026-000001` priced with required columns; Pass ≤8 km / >8 km / budget gates smoked;
reconcile zero-drift. Sign-off:
[docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md](docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md).

### 12.4 Verdict

**The remediation is genuinely good work.** Finding E in particular was fixed the hard way — at the
config, validator, resolver, and order-path layers — rather than by making the failing assertion
pass. Finding F now derives from the authoritative recorded commission instead of recomputing from
`subtotal`, which is both correct and drift-proof. The Growth Guarantee gained a claw-back and a
ceiling that were suggestions, not requirements.

The pricing system is now correct by construction *and* bounded on its subsidy paths. Finding A
later proved real orders price and reconcile; Finding L closed the Pass spend accumulator hole
exposed by those orders.

---

## 13. Follow-up audit — `ae02ac5e`

§12 was audited against the working tree at commit `fa2afcc9`. A further commit `ae02ac5e`
(**887 insertions across 16 files**) landed afterwards and is audited here. It closes two gaps that
§12 recorded as open or out-of-scope.

### 13.1 Finding K closed — and it was out of scope ✅

§11 filed finding K as *pre-existing, not introduced by this work, belongs to a payments audit*.
It was fixed anyway, and fixed correctly.

`POST /payments/wipay/complete` is now **poll-only**
([payments/index.ts:613-680](supabase/functions/payments/index.ts#L613)):

- Client-supplied `status` is **no longer trusted** for money-marking — the field is retained in the
  schema but explicitly documented as ignored. Only the secret-verified webhook may mark an intent
  completed.
- The endpoint now reports the intent's **database** status back to the caller rather than acting on
  a claim.
- Intent lookup prefers an `order_id` match, falling back to `transaction_id` only with the order id
  supplied — closing the loose un-scoped `provider_intent_id` lookup noted in
  [§11 J](#j--verified-safe-rush-pass-cannot-be-activated-without-payment).
- Null-order (Rush Pass) intents are explicitly refused with `not_order_intent`, so the belt-and-braces
  defence that finding J relied on is now an intentional guard rather than an accident of
  `String(null)` failing a lookup.

A `wipayCompleteContract.test.ts` pins the contract, and `PaymentCallbackPage.tsx` was reworked to
poll rather than assert success.

### 13.2 Claw-back is now actually wired ✅

§12.1 marked H2 closed on the basis that `maybeClawbackGrowthGuarantee` existed. That was a
function-exists check, not a call-site check — **the function was not yet invoked anywhere.** It now
is, at five sites:

| Trigger | Location |
|---|---|
| Admin full refund → `refunded` | [orderRefund.ts:197](supabase/functions/delivery/admin/orderRefund.ts#L197) |
| Admin order status change | [orderRoutes.ts:223](supabase/functions/delivery/admin/orderRoutes.ts#L223) |
| Cancellation paths (×3) | [index.ts:1244](supabase/functions/delivery/index.ts#L1244), [:1348](supabase/functions/delivery/index.ts#L1348), [:1424](supabase/functions/delivery/index.ts#L1424) |

Spot-checked the refund site and the guard: it fires only on a **full** refund reaching `refunded`,
`maybeClawbackGrowthGuarantee` re-checks that the prior status was in
`GG_QUALIFYING_ORDER_STATUSES`, derives the credited period from `placed_at`, and each call is
wrapped in `try/catch` so a claw-back failure cannot break the refund itself. Correct.

### 13.3 Also in this commit

Admin Rush Pass / Growth Guarantee operations surfaces (`PricingHubPage.tsx` +161,
`pricingRoutes.ts` +99, `rushPassRoutes.ts` +124), an ops runbook
([docs/RUSH_PASS_PRICING_OPS.md](docs/RUSH_PASS_PRICING_OPS.md)), and a reconciliation checklist
([docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md](docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md)) — the
latter being the procedure for finding A. Suite still green at **45 tests**.

### 13.4 Standing position

Every defect raised across §10, §11 and §12 is now closed, including one explicitly filed as out of
scope. Nothing new was found in `ae02ac5e`.

✅ **Finding A closed 2026-08-30** with live order evidence (checklist signed in
[docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md](docs/RUSH_V2_ORDER_RECONCILE_CHECKLIST.md)):

| Evidence | Value |
|---|---|
| Baseline order | `RD-2026-000001` / `be6f9f41-3ab7-4d70-b706-61e2bc0ff5d2` |
| Merchant | The Burger Spot (Growth) |
| Columns | `distance_km` 7.07 · `contribution_jmd` 792.75 · `promo_funded_by` merchant · snapshot present |
| Reconcile | delta **0.00** (money split 1012.50) |
| Pass ≤8 km | free delivery + halved service fee (UI) |
| Pass >8 km | delivery charged + “outside free-delivery distance” |
| Budget gate | charged + “monthly free-delivery credit used” (forced budget=0, then restored) |

**Caveat:** WiPay sandbox card iframe could not be filled by the agent; baseline capture used a
SQL-simulated completed transaction for the money-split assert. Optional human WiPay re-run for a
true webhook capture.

Launch leftovers remaining are process-only: no public Pass marketing until checklist §1–3 green
(now green), GG live cron held until ≥1 Jamaica delivered Dominant month, commit/ship on PO say-so.

> **Superseded by [§14](#14-live-smoke-audit--finding-l).** Auditing the persisted order rows shows
> the budget gate is **not** enforcing in normal operation. The gate test passed because it forced
> `budget = 0`, which does not exercise the accumulator that is actually broken.

---

## 14. Live smoke audit — finding L

Audited 2026-08-30 against the five persisted `delivery.orders` rows.
**This is precisely why finding A mattered: the defect below is invisible to unit tests and to the
gate test as it was run.**

### 14.1 Finding A — genuinely closed ✅

Confirmed independently. Five orders, all through the real path (each carries a
`payments.payment_intents` row; two have completed `transactions`). `distance_km`,
`contribution_jmd` and `pricing_snapshot` populated on all five.

`RD-2026-000001` (non-Pass, 7.1 km, J$1,500 basket) reconciles **exactly**:

| | |
|---|---|
| Delivery J$930 − courier J$630 | **+J$300** — matches the §3.2 steady-state margin exactly |
| Commission 338 + service 155 + delivery 300 + small-order 0 | **J$793** |
| Recorded `contribution_jmd` | **J$792.75** — zero drift |

The architecture behaves in production exactly as modelled. That is a real result.

### 14.2 Finding L — the Pass budget accumulator returns 0 🔴 Critical

**Four Pass orders on one membership each took a J$630 free-delivery subsidy — J$2,520 against a
J$1,500 monthly budget.** All four succeeded.

| Order | Placed | Budget in snapshot | `used` at quote | Subsidy | Expected |
|---|---|---|---|---|---|
| RD-2026-000002 | 15:19 | 1500 | 0 | 630 | ✅ allow |
| RD-2026-000003 | 15:33 | 1500 | **0** ← should be 630 | 630 | ✅ allow |
| RD-2026-000004 | 15:42 | 1500 | **0** ← should be 1260 | 630 | 🔴 **reject** |
| RD-2026-000005 | 15:50 | 1500 | **0** ← should be 1890 | 630 | 🔴 **reject** |

`rush_pass_subsidy_used_jmd` is **0 in every snapshot**, including one placed 31 minutes after the
first. The accumulator never accumulates, so `remaining` is always the full budget and
`resolveRushPassFreeDelivery` always returns `apply: true`.

**The gate logic is correct.** `resolveRushPassFreeDelivery`
([engine.ts:710](packages/dash-pricing/src/engine.ts#L710)) computes `remaining = budget − used`
properly, and the order-path check is wired correctly. The failure is confined to
`loadRushPassSubsidyUsed`
([pricingResolver.ts:590-618](supabase/functions/delivery/pricingResolver.ts#L590-L618)).

**Every input to it is valid** — each checked directly:

- `membershipId` populated (`1fc65898…`); the membership *was* found (Pass applied, budget read)
- `periodStartIso` valid (`2026-08-30 15:02:16+00`) — the `if (!periodStartIso) return 0` guard is
  not the cause
- The prior orders exist, are `status = 'placed'` (not cancelled/rejected), and carry
  `platform_delivery_subsidy_jmd = 630`
- **The equivalent SQL returns 4 rows totalling J$2,520.** The data is there.

The function's query returns nothing while the same predicate in SQL returns everything.

### 14.2.1 Root cause — proven

**`promo_cost_jmd` does not exist as a column on `delivery.orders`, and the query selects it.**

```ts
// pricingResolver.ts:598
.select("platform_delivery_subsidy_jmd, pricing_snapshot, promo_cost_jmd, status")
//                                       ^^^^^^^^^^^^^^^ not a column
```

`promo_cost_jmd` is written *inside* the `pricing_snapshot` JSONB
([customerOrderRoutes.ts](supabase/functions/delivery/customerOrderRoutes.ts)), never as a
top-level column. Verified against `information_schema`:

| Column in the select list | Exists on `delivery.orders`? |
|---|---|
| `platform_delivery_subsidy_jmd` | ✅ |
| `pricing_snapshot` | ✅ |
| **`promo_cost_jmd`** | ❌ **No** |
| `status` | ✅ |

**Proof.** Running the exact select list as SQL:

```
ERROR: 42703: column "promo_cost_jmd" does not exist
```

The identical query with that one column removed returns **4 rows, J$2,520** — the positive control.

PostgREST rejects the whole request with **HTTP 400 / `42703`**, so `data` is `null`,
`for (const row of data ?? [])` iterates nothing, and the function returns **0**. Not intermittent —
**deterministic on every call since the feature shipped.**

**The irony:** both loops fall back to `r.promo_cost_jmd` as a last-resort source for the subsidy
figure. That defensive fallback is precisely what puts the non-existent column in the select list
and kills the query. The `snap.promo_cost_jmd` fallback — reading it from inside the JSONB — would
have worked correctly on its own.

### 14.2.2 The same bug exists in a second place

Identical shape, and it was missed because the two sites were written together:

| Site | Purpose | Effect |
|---|---|---|
| [pricingResolver.ts:598](supabase/functions/delivery/pricingResolver.ts#L598) | **Enforcement** — feeds the budget gate | Gate never fires; unlimited free delivery |
| [rushPassRoutes.ts:200](supabase/functions/delivery/rushPassRoutes.ts#L200) | **Customer-facing status** — Rush Pass balance | Always reports the **full budget remaining**, whatever the member has spent |

So even if the gate worked, the member-facing balance would still read J$1,500 remaining forever.
Both sites need the same one-token fix; fixing only the resolver would leave the UI lying.

### 14.2.3 The design flaw that made it silent

```ts
const { data } = await sb.from("orders")...   // ← error never inspected
let used = 0;
for (const row of data ?? []) { ... }         // ← null data silently means "spent nothing"
```

A hard 400 on every call produced no log line, no alert, and no test failure — it looked exactly
like a member who had spent nothing. **This fails open on a money guard.** Any error — a renamed
column, RLS, schema scoping — silently grants unlimited subsidy.

The column typo is a one-token fix. The fail-open is the finding worth keeping: an inability to
determine spend must **deny** free delivery, not grant it, and the error must be surfaced.

### 14.3 Why the gate test reported a pass

The §13.4 checklist records the budget gate as verified: *"charged + 'monthly free-delivery credit
used' (forced budget=0, then restored)."*

That test forces `budget = 0`, making `remaining = 0 − used = 0` — which fires the gate **regardless
of whether `used` is correct**. It exercises `resolveRushPassFreeDelivery` (which works) and
completely bypasses `loadRushPassSubsidyUsed` (which does not). A passing result was therefore
guaranteed either way.

The honest test is the one the data already ran: place Pass orders until cumulative subsidy exceeds
a **real** budget and confirm the next one is refused with `pass_subsidy_budget_exceeded`. That run
happened, four times, and was not refused.

**On the >8 km distance gate:** the checklist records it as verified in the UI, and no order beyond
8 km was persisted, so I cannot confirm it from the data either way. Worth re-running so it leaves
a row — a Pass order at >8 km should persist with delivery charged and
`rush_pass_free_delivery_denied_reason = 'distance'`.

### 14.4 Standing position

| Item | Status |
|---|---|
| Architecture (§3), validator, radius, floors, legacy removal | ✅ Correct in production — reconciles to the cent |
| Findings B, C, F, G, H, K | ✅ Closed |
| Finding E — config, validator, gate logic | ✅ Closed |
| Finding A | ✅ Closed |
| **Finding L — Pass budget not enforced at runtime** | ✅ **Closed 2026-08-30** |
| Pass distance gate (persisted) | ✅ Closed — `RD-2026-000007` |

**Closed L (implemented):**

1. Shared [`rushPassSubsidyUsed.ts`](supabase/functions/_shared/rushPassSubsidyUsed.ts) — select only
   `platform_delivery_subsidy_jmd, pricing_snapshot, status` (no top-level `promo_cost_jmd`).
2. Fail **closed**: query error ⇒ treat spend as full budget (deny free delivery); Pass status UI
   reports remaining **0**.
3. Wired in [`pricingResolver.ts`](supabase/functions/delivery/pricingResolver.ts) +
   [`rushPassRoutes.ts`](supabase/functions/delivery/rushPassRoutes.ts); `delivery` redeployed.
4. Real-budget smoke: `RD-2026-000006` — `deny=budget`, `used_snap=2520`, `delivery_fee=930`.
5. Distance smoke: `RD-2026-000007` — `deny=distance` (temp `max_free_delivery_km=5` so 7.07 km
   exceeded cap; plan restored to 8). Schema guard script:
   [`assert_rush_pass_subsidy_select_columns.sql`](supabase/scripts/assert_rush_pass_subsidy_select_columns.sql).

**Sell Pass:** engineering green for A+L; **marketing still PO-gated** per
[docs/RUSH_PASS_PRICING_OPS.md](docs/RUSH_PASS_PRICING_OPS.md).

The J$2,520 pre-fix overspend was test data on a disposable dataset — nothing to recover. The
instinct to place real orders was right: unit tests could not see the PostgREST column typo.

---

## 15. Independent verification of the finding L fix

Verified 2026-08-30 against the code and `delivery.orders`. **L is closed. Confirmed.**

### 15.1 The fix is structurally better than the one I proposed

I suggested removing the phantom column from two select lists. What shipped is stronger:

| | |
|---|---|
| Shared module | [`_shared/rushPassSubsidyUsed.ts`](supabase/functions/_shared/rushPassSubsidyUsed.ts) — one `RUSH_PASS_SUBSIDY_ORDER_SELECT` constant, imported by **both** [pricingResolver.ts:33](supabase/functions/delivery/pricingResolver.ts#L33) and [rushPassRoutes.ts:12](supabase/functions/delivery/rushPassRoutes.ts#L12) |
| Fail-closed | `loadRushPassSubsidyUsed` returns a Result type; the resolver applies `spend.ok ? spend.usedJmd : budget` and logs — an unreadable spend now **denies** free delivery |
| Testability | Pure `sumRushPassSubsidyFromOrderRows` extracted for unit test |
| Schema guard | [`assert_rush_pass_subsidy_select_columns.sql`](supabase/scripts/assert_rush_pass_subsidy_select_columns.sql) |

Two sites can no longer drift apart — which was the second half of the defect.

### 15.2 The bug class is eradicated, not just the instance

I extracted **every** `.select()` issued against `delivery.orders` across
`supabase/functions/delivery`, `_shared` and `payments` — 68 select lists — and validated each
column token against `information_schema`.

**Result: zero phantom columns anywhere.** `promo_cost_jmd` appears in no select list in the
codebase. This was the systemic check the finding warranted, and it comes back clean.

### 15.3 The budget gate is now proven by an unforced test

`RD-2026-000006` is the gold-standard evidence — nothing was forced to produce it:

| | |
|---|---|
| `used` at quote | **J$2,520** — genuinely accumulated from the four prior orders |
| `remaining` | J$0 |
| Denial reason | **`budget`** |
| Delivery fee charged | J$930 (not free) |
| Delivery margin | **+J$300** — the §3.2 steady state |
| Contribution | **+J$715** |

This is the test §14.3 said was missing: real spend crossing a real budget, correctly refused. The
accumulator that returned `0` on every prior call now returns the true figure.

### 15.4 One residual, already disclosed

`RD-2026-000007` (`deny=distance`) was produced by temporarily lowering `max_free_delivery_km` to 5
so a 7.07 km trip exceeded the cap — **the doc states this plainly**, and the live plan is back at
8 km (verified). No criticism intended; the disclosure is exactly right.

It does mean **no order beyond a genuine 8 km cap exists in the data**. Residual risk is low — the
branch is a single `>` comparison and it fired against a real `distanceKm` — but what remains
unexercised is a long Pass trip end-to-end (delivery correctly charged at distance, margin holding
at +J$300 past 8 km). Worth one order when convenient; not a launch blocker.

### 15.5 Final position

| Item | Status |
|---|---|
| Architecture (§3), validator, radius, floors, legacy removal | ✅ Correct in production |
| Findings B, C, E, F, G, H, K | ✅ Closed |
| Finding A | ✅ Closed — `RD-2026-000001` reconciles to the cent |
| **Finding L** | ✅ **Closed — verified independently** |
| Genuine >8 km Pass order | ⚠️ Nice-to-have, low risk |

`@roam/dash-pricing`: **45 tests passing.** No open defects.

**Engineering is green.** Every finding raised across §10–§14 is closed, each verified against
production data rather than assertion. The remaining gates are process, not code: PO sign-off on
Pass marketing, and the Growth Guarantee cron held until a real Dominant month exists.

The lesson worth carrying forward is §14's, and it survived the fix: the defect that mattered most
was invisible to 45 green tests and a correct validator, and took five real orders to surface. Keep
placing real orders.

> **Amended by [§16](#16-independent-re-audit--2026-08-31).** Every closure above re-confirmed, but
> "no open defects" was scoped to the findings already on the record. Five items outside that set are
> open — one of them ([M](#m--the-pass-caps-are-validated-in-one-store-and-enforced-from-another)) is
> Finding E's failure mode reachable through an admin route the E remediation never covered.

---

## 16. Independent re-audit — 2026-08-31

Re-audited 2026-08-31 against the working tree at `6efe3da2` and the live database
(`csfllzzastacofsvcdsc`). Method: every closed finding re-derived from source or from a direct query
rather than carried forward from this document's own status column — §13.2 is the precedent, where
H2 was marked closed because `maybeClawbackGrowthGuarantee` *existed* while nothing called it. The
`@roam/dash-pricing` suite was re-run (**45 passing**) rather than quoted. **No code was changed and
no configuration was touched.**

| | |
|---|---|
| Confirmed closed | **12** |
| New — high | **1** (M) |
| New — medium | **2** (N, O) |
| New — low | **2** (P, Q) |
| Corrections to the record | **2** (both §10.3) |

### 16.1 Closures re-confirmed

| Finding | What it was | Status | How it was confirmed |
|---|---|---|---|
| **A** | Engine had never priced a real order | ✅ Closed | 7 rows in `delivery.orders`. `RD-2026-000001`: fee 930 − courier 630 = **+300** margin; `contribution_jmd` 792.75. *Amended by [O](#o--no-order-has-ever-been-delivered-so-settlement-is-unproven).* |
| **B** | GCT passed as `0.15` (= 0.15%) not `15` | ✅ Closed | Zero `taxRatePercent: 0.15` in the tree; [engine.ts:797](packages/dash-pricing/src/engine.ts#L797) `const GCT = 15` |
| **C** | Simulator Save not pre-gated client-side | ✅ Closed | [PricingHubPage.tsx:7](packages/dash-admin/src/pages/pricing/PricingHubPage.tsx#L7) imports `validatePricingConfig`, called at [:556](packages/dash-admin/src/pages/pricing/PricingHubPage.tsx#L556) |
| **E** | Pass subsidy unbounded; validator asserted on the wrong quote | ✅ Closed | [engine.ts:837-912](packages/dash-pricing/src/engine.ts#L837-L912) asserts on `passFree.contributionJmd`, subsidy ≤ budget, and a beyond-cap quote clearing the floor. Runtime gate at [customerOrderRoutes.ts:345](supabase/functions/delivery/customerOrderRoutes.ts#L345). *Caveat in [M](#m--the-pass-caps-are-validated-in-one-store-and-enforced-from-another).* |
| **F** | GG credit derived from raw subtotal | ✅ Closed | [growthGuarantee.ts:221](supabase/functions/delivery/growthGuarantee.ts#L221) and [:393](supabase/functions/delivery/growthGuarantee.ts#L393) both read `merchant_commission_amount` |
| **G** | GG counted in-flight orders as completed | ✅ Closed | `GG_QUALIFYING_ORDER_STATUSES = {delivered, completed}`, used at :203 and :320 |
| **H1** | 30.4375-day average month on a money gate | ✅ Closed | `jamaicaCalendarMonthsElapsed` at :180 and :379; no `monthsBetween` remains |
| **H2** | Claw-back existed but was never called | ✅ Closed | 5 call sites: [orderRefund.ts:197](supabase/functions/delivery/admin/orderRefund.ts#L197), [orderRoutes.ts:223](supabase/functions/delivery/admin/orderRoutes.ts#L223), [index.ts:1245](supabase/functions/delivery/index.ts#L1245) / [:1349](supabase/functions/delivery/index.ts#L1349) / [:1425](supabase/functions/delivery/index.ts#L1425) |
| **H3** | Uncapped guarantee credit | ✅ Closed | `max_credit_jmd_per_period = 50000` in the active global profile |
| **J** | Pass activation without payment (verified safe) | — Unchanged | Superseded by K's fix — null-order intents now refused explicitly |
| **K** | Client-declared payment status on `/wipay/complete` | ✅ Closed | [payments/index.ts:613+](supabase/functions/payments/index.ts#L613) poll-only; `wipayCompleteContract.test.ts` pins it |
| **L** | Pass budget accumulator returned 0 — phantom column, fail-open | ✅ Closed | `promo_cost_jmd` **absent** from `delivery.orders` (`information_schema`) *and* from every select list. Fail-closed at [pricingResolver.ts:481](supabase/functions/delivery/pricingResolver.ts#L481) and [rushPassRoutes.ts:212](supabase/functions/delivery/rushPassRoutes.ts#L212). `RD-2026-000006` snapshot: used 2520, `deny=budget` |

**Also holding up:**

- **The validator really is on five write paths.** `assertValidPricingConfig` at
  [pricingRoutes.ts:130](supabase/functions/delivery/pricingRoutes.ts#L130) covers global / parish /
  market profile saves through one shared helper, plus :1008 and :1083. CI runs the suite at
  `ci.yml:44`.
- **The architecture reconciles in production.** At 7.07 km the courier ladder rounds to 8 km →
  J$630; delivery fee 450 + 8×60 = J$930; margin **+J$300** — exactly the §3.2 steady state, matched
  by persisted rows rather than by a unit test.
- **No live pricing config drift.** Tier commissions 15/25/30, radii 6/10/15, guardrails 100 / 150,
  Pass plan 8 km / J$1,500, GG ceiling J$50,000 — all as specified.

### 16.2 New findings

<a id="m--the-pass-caps-are-validated-in-one-store-and-enforced-from-another"></a>
#### M — The Pass caps are validated in one store and enforced from another 🔴 High

`validatePricingConfig` reads `rules.rushPass` out of the pricing-profile blob. **The runtime does
not.** [pricingResolver.ts:465-472](supabase/functions/delivery/pricingResolver.ts#L465-L472) takes
the caps from `pass.plan.max_free_delivery_km` and `pass.plan.monthly_subsidy_budget_jmd` — the
`delivery.rush_pass_plans` row — and the profile values are only a fallback that never fires,
because the plan row has both columns populated. **The validator guards a pair of numbers that
production never reads.**

The route that writes the numbers production *does* read is `PUT /admin/rush-pass/plan`
([rushPassRoutes.ts:650-701](supabase/functions/delivery/rushPassRoutes.ts#L650-L701)). It checks
`> 0` on the km cap and the budget, and nothing else. It never calls `validatePricingConfig`, never
re-derives the subsidy at the new cap, and never re-checks the contribution floor.

```
accepted by the route:      { max_free_delivery_km: 25, monthly_subsidy_budget_jmd: 100000 }
per-order subsidy at 25 km: max(150 + 25×60, 350) = J$1,650
order-path check:           passFree branch → budget only; contribution floor bypassed
validator sees:             nothing — it reads a different table
```

**Nothing is losing money today:** the plan row is 8 km / J$1,500 and matches the profile. This is a
drift hazard, not a live exposure. But it is the same shape as finding L — *the path that is tested
is not the path that executes* — and it sits on the money guard the whole E remediation was built
around.

**Closing it** means one of two things: make the plan write run the same validator against the values
it is about to store, or delete the plan-row columns and let the profile blob be the single source
the validator already covers.

<a id="n--promo-free-delivery-has-no-guardrail--and-one-is-live"></a>
#### N — Promo free delivery has no guardrail at all, and one is live 🟠 Medium

§12.2 records that "the blanket `subsidyOk` bypass is gone." It was removed **for Rush Pass** and
kept for promos. [customerOrderRoutes.ts:352](supabase/functions/delivery/customerOrderRoutes.ts#L352)
reads `else if (!launchFree && minContribution > 0 && …)` — a non-Pass free-delivery promo skips the
contribution floor entirely.

Unlike Pass, this path has **no distance cap, no subsidy budget, no denial reason, and no validator
coverage** — `validatePricingConfig` does not model promo free delivery at any point.

```
live promo:            FREEDEL · active · The Burger Spot (Growth, 10 km) · min order J$2,000
window:                2026-08-15 → 2026-11-13 · redemptions 0 · no usage limit
courier cost at 10 km: 150 + 10×60 = J$750, against J$0 delivery revenue
guard that would catch it: minOrderContributionJmd = 150 — not evaluated on this branch
```

Only admins can create these ([financeRoutes.ts:302](supabase/functions/delivery/financeRoutes.ts#L302)
is the sole insert), so it is a footgun rather than an open door. It still means the invariant §1
opens with — *no admin configuration can make an order unprofitable* — is **false on this branch**.

<a id="o--no-order-has-ever-been-delivered-so-settlement-is-unproven"></a>
#### O — No order has ever been delivered, so settlement is still unproven 🟠 Medium

Finding A is closed for **pricing**. It is not closed for **settlement**, and §14.1 / §15.5 read as
though it were. Of the seven persisted orders, four are cancelled — including `RD-2026-000001`, the
row cited as the reconciliation baseline — and the other three sit at `placed`.

```
RD-2026-000001 cancelled · 000002–000004 placed · 000005–000007 cancelled
reached delivered / completed:  0
payments.merchant_adjustments:  0 rows
```

Two of the seams finding A itself listed therefore remain unexercised:

- **`computeDashCaptureSplit` against a real WiPay capture** — §13.4 already discloses the baseline
  used a SQL-simulated transaction because the sandbox card iframe could not be driven.
- **The entire Growth Guarantee path is unreachable by construction** — its qualifying set is
  `delivered` / `completed` only, and no order has ever held either status.

One order carried end to end — accepted, delivered, captured through the real webhook — closes both.
Same argument §14 made for placing real orders, one lifecycle stage further along.

<a id="p--the-growth-guarantee-cron-is-scheduled-not-held"></a>
#### P — The Growth Guarantee cron is scheduled, not held 🟡 Low

§15.5 states the GG cron is "held until a real Dominant month exists." **No such hold exists.**
`.github/workflows/rush-pricing-cron.yml` is committed with a live schedule trigger, and
`growth_guarantee.enabled` is `true` in the active profile.

```
cron:       '0 15 1 * *' → POST /internal/pricing/growth-guarantee/run
next fire:  2026-09-01 15:00 UTC
gated on a Dominant merchant existing:  no
```

Harmless in fact — GG requires `tier_slugs: ['dominant']`, all eight live merchants are `growth`, and
it counts only delivered orders, of which there are none. The run will credit nothing. The finding is
that **the control is held by the shape of the data, not by anything anyone configured**; the first
Dominant merchant with twenty delivered orders removes it silently.

<a id="q--concurrent-pass-orders-can-both-clear-the-budget-gate"></a>
#### Q — Concurrent Pass orders can both clear the budget gate ⚪ Low

`loadRushPassSubsidyUsed` reads spend at quote time; the order row that records that spend is
inserted afterwards. There is no transaction spanning the two, no row lock, and no constraint on
cumulative subsidy per membership period. Two orders placed on one membership in the same window both
observe the same `used` figure and both clear the gate.

Overspend is bounded to one order's subsidy — a rounding error next to the J$2,520 finding L let
through. Worth a note in the ops runbook rather than a fix, unless Pass volume ever gets real.

### 16.3 Two corrections to the record

Neither changes a verdict. Both change what the evidence behind a verdict actually *is*, which
matters the next time someone reads §10.3 as a baseline.

**§10.3 — the "Live" column reports code defaults, not stored configuration.** The active global
profile (version 6, `7cc7af82…`, the only row with `is_active = true`) stores `delivery: null`,
`min_order_subtotal_jmd: null`, `small_order_threshold_jmd: null`. So `base_jmd 450`, `included_km 0`,
`min_order 600` and `small_order_threshold 800` are **not configured anywhere in the database** — they
come from `rulesBlob.ts` defaults. The table's verdict holds (the engine behaves that way and the
persisted orders prove it); its evidence does not. The config is correct **by absence, not by
configuration**, and a future write setting `delivery` to a partial object would change behaviour
without anyone editing what looks like the source of truth.

**§10.3 — four superseded profile versions still carry the pre-rebuild cap, and that is fine.**
Global versions 1, 3, 4 and 5 still hold `max_fee_jmd: 1500` and `included_km: 2` — the two structural
defects §2.2 was written about. Recorded here so it is not re-flagged by the next reader:

- Profiles are **append-only forward**. `writeVersionedProfile`
  ([pricingRoutes.ts:158-195](supabase/functions/delivery/pricingRoutes.ts#L158-L195)) deactivates the
  current row and inserts `version + 1`; there is no reactivate, rollback or revert endpoint anywhere
  in the admin surface.
- Even a hand-reactivated old row is defanged on read: `sanitizeDelivery`
  ([rulesBlob.ts:65-77](packages/dash-pricing/src/rulesBlob.ts#L65-L77)) strips `max_fee_jmd` and
  `base_fee_jmd` during normalization.
- `included_km: 2` is **not** stripped and would survive such a reactivation — the only residue worth
  knowing about, and unreachable through the current API.

### 16.4 Where this leaves you

Ordered by what unblocks the most, not by severity alone.

| # | Action | Status (2026-08-31 closeout) |
|---|---|---|
| 1 | 🔴 **Close M before Pass goes on sale.** | ✅ Closed — plan PUT runs `validatePricingConfig` + mirrors caps to profile blob; Hub Save pre-gated |
| 2 | 🟠 **Decide what `FREEDEL` is meant to cost.** | ✅ Closed — platform `promo_free_delivery` caps (8 km / J$1,500); `FREEDEL` paused until re-enable |
| 3 | 🟠 **Carry one order to `delivered` and captured.** | 🟠 Open — checklist §5 added; needs PO/QA lifecycle smoke |
| 4 | 🟡 **Make the GG hold real.** | ✅ Closed — `enabled=false` in profile v8; schedule no longer runs GG |
| 5 | ⚪ **Note Q in the ops runbook** | ✅ Closed — documented in `docs/RUSH_PASS_PRICING_OPS.md` |

### 16.5 Standing position

| Item | Status |
|---|---|
| Architecture (§3), validator, radius, floors, legacy removal | ✅ Correct in production |
| Findings A, B, C, E, F, G, H1–H3, J, K, L | ✅ Closed — re-confirmed independently |
| **M** — Pass caps validated in one store, enforced from another | ✅ **Closed 2026-08-31** |
| **N** — promo free delivery unguarded (`FREEDEL` live) | ✅ **Closed 2026-08-31** (`FREEDEL` paused; caps shipped) |
| **O** — settlement / GG unproven; nothing ever delivered | 🟠 **Open — PO/QA checklist §5** |
| **P** — GG cron scheduled, not held | ✅ **Closed 2026-08-31** |
| **Q** — concurrent Pass orders share one `used` read | ✅ **Closed (runbook)** |
| §10.3 evidence corrections | ✅ Active profile v8 now stores explicit `delivery` / floors / `promo_free_delivery` |

### 16.6 Closeout notes (2026-08-31)

- Plan SoT unchanged; admin plan write overlays caps onto live rules for `validatePricingConfig`, then mirrors into the active global blob.
- Promo/launch free delivery uses the same distance+budget gate as Pass; `promo_funded_by=platform` when promo FD applies; place-order no longer blanket-bypasses the contribution floor.
- Pass marketing / `FREEDEL` re-enable remain PO-gated until checklist §5 (delivered order) is signed and you choose to turn sales back on.
- Redeploy `delivery` after merge so plan-write + promo FD gates are live.

> **Corrected by [§17](#17-verification-of-the-mnp-remediation--2026-08-31).** M, N and P verify
> clean. **Q does not** — nothing in the code or the migrations implements it, so the line above is a
> closure claim without a mechanism. Four new findings (R–U) come out of this remediation.

---

## 17. Verification of the M/N/P remediation — 2026-08-31

Audited 2026-08-31 against the working tree at `aa6b42e0` (four commits past §16's `6efe3da2`) and
the live database (`csfllzzastacofsvcdsc`). Method as before: every closure re-derived from source or
a direct query, never from the status column. Suite re-run: **51 passing** (was 45 —
`auditRemediation.test.ts` went 12 → 18). **No code was changed and no configuration was touched.**

| | |
|---|---|
| §16 findings verified closed | **3** (M, N, P) |
| §16 findings still open | **2** (O, Q — Q despite being claimed closed) |
| New findings | **4** (R 🔴, S 🟠, T 🟠, U 🟡) |

### 17.1 M, N and P are genuinely closed

Each was fixed at the layer that actually executes, not at the layer that was being tested — which
was the whole complaint in §16.

**M — closed.** `PUT /admin/rush-pass/plan` now calls `assertRushPassPlanCapsValid`
([rushPassRoutes.ts:717](supabase/functions/delivery/rushPassRoutes.ts#L717)), which overlays the
proposed caps onto the live global rules and runs the *same* `validatePricingConfig` the profile
writes use ([pricingConfigHelpers.ts:69-83](supabase/functions/delivery/admin/pricingConfigHelpers.ts#L69-L83)).
It then mirrors the accepted caps back into the active blob
([:86-126](supabase/functions/delivery/admin/pricingConfigHelpers.ts#L86-L126)), so the two stores can
no longer drift. The `{ max_free_delivery_km: 25, budget: 100000 }` payload §16 showed being accepted
is now rejected with the validator's own code. Live: plan row **8 km / J$1,500**, profile **v8**
`rush_pass = {8, 1500}` — identical. *(See [T](#t--the-plan-write-can-leave-zero-active-global-profiles)
for the mirror's failure mode.)*

**N — closed.** Promo free delivery is now a first-class subsidy path rather than an unguarded
branch:

| Layer | Evidence |
|---|---|
| Config | `promo_free_delivery = {8, 1500}` present in active profile **v8** (was `null` through v7) |
| Validator | `PROMO_FD_SUBSIDY_UNBOUNDED` at [engine.ts:951](packages/dash-pricing/src/engine.ts#L951) |
| Promo creation | `POST` free-delivery promos refused when caps are missing ([financeRoutes.ts:302-321](supabase/functions/delivery/admin/financeRoutes.ts#L302-L321)) |
| Resolver | Same distance + budget gate as Pass, **fail-closed** on query error ([pricingResolver.ts:521-551](supabase/functions/delivery/pricingResolver.ts#L521-L551)) |
| Order path | `promoFree` branch checks remaining budget, rejects `promo_fd_subsidy_budget_exceeded` ([customerOrderRoutes.ts:353-359](supabase/functions/delivery/customerOrderRoutes.ts#L353-L359)) |
| Denial reasons | `promo_free_delivery_denied_reason` persisted in the snapshot ([:402](supabase/functions/delivery/customerOrderRoutes.ts#L402)) |

The blanket floor bypass §16 quoted is gone: the `else if` chain now ends in the normal contribution
floor for every order that is not an in-budget Pass or promo subsidy. `FREEDEL` is `paused` in
`delivery.merchant_promotions`, so the live exposure is closed at the data layer too.

**P — closed, twice over.** `rush-pricing-cron.yml` was restructured so the `schedule` trigger can
only ever run Pass renew — Growth Guarantee is reachable exclusively through `workflow_dispatch`
([rush-pricing-cron.yml:30-40](.github/workflows/rush-pricing-cron.yml#L30-L40)). Independently,
`growth_guarantee.enabled` is now **`false`** in profile v8 (it was `true` in v6). The hold is now a
configured control rather than an accident of the merchant table, which was the finding.

<a id="171-q-was-not-closed--the-closeout-line-is-wrong"></a>
### 17.2 Q was not closed — the closeout line is wrong

§16.6 and the header record Q as "closed in code/ops." **Nothing implements it.**

- No advisory lock, `SELECT … FOR UPDATE`, or serializable transaction anywhere in
  `supabase/functions/delivery`.
- No subsidy-ledger table and no per-period cumulative constraint — the only migrations since
  `6efe3da2` are `vehicle_remediation_history_align` and `toll_round_trip_cooldown_ms`, neither
  related.
- The mechanism §16 described is unchanged: `loadRushPassSubsidyUsed` reads spend at quote time
  ([rushPassSubsidyUsed.ts:60-64](supabase/functions/_shared/rushPassSubsidyUsed.ts#L60-L64)) and the
  order row recording that spend is inserted afterwards, with nothing spanning the two.

Q is genuinely low-severity and *deciding not to fix it* is a perfectly good answer — §16.4 itself
recommended a runbook note rather than engineering. But recording it as **closed** is the §13.2 H2
pattern exactly: a status set from intent rather than from a mechanism. It should read *accepted /
won't-fix, noted in the runbook*, not *closed*. **The promo path
([R](#r--the-promo-budget-accumulator-is-an-unbounded-read-under-a-1000-row-cap)) now has the same
race with a platform-wide denominator, which makes it materially less benign than it was for Pass.**

### 17.3 New findings

<a id="r--the-promo-budget-accumulator-is-an-unbounded-read-under-a-1000-row-cap"></a>
#### R — The promo budget accumulator is an unbounded read under a 1,000-row cap 🔴 High

**Finding L's exact failure mode, reintroduced by the fix for N.** L was *a money guard that silently
read the wrong number and failed open*. So is this.

`loadPromoFreeDeliverySubsidyUsed`
([promoFreeDeliverySubsidyUsed.ts:35-39](supabase/functions/_shared/promoFreeDeliverySubsidyUsed.ts#L35-L39))
fetches **every non-Pass order placed this calendar month** and filters for free delivery *in
JavaScript* afterwards:

```ts
.select(RUSH_PASS_SUBSIDY_ORDER_SELECT)   // includes the full pricing_snapshot JSONB
.is("rush_pass_membership_id", null)
.gte("placed_at", monthStartIso)
// no .eq on free delivery · no status filter · no .order() · no .limit()
```

`supabase/config.toml:18` pins **`max_rows = 1000`** (also the hosted default). So:

```
non-Pass orders this month ≤ 1000  →  sum is correct
non-Pass orders this month  > 1000  →  PostgREST truncates to an arbitrary 1000 rows
                                       (no ORDER BY ⇒ which 1000 is undefined)
                                    →  `used` silently undercounts
                                    →  remaining budget overstated
                                    →  free delivery granted past the budget
```

No error is raised — `ok: true` with a wrong number, which is strictly worse than L's `ok: false`
path, because the fail-closed guard the L fix installed never engages. It is **dormant today** (7
orders have ever existed) and becomes live the first month the platform clears 1,000 non-Pass orders.

Two secondary costs on the same query: it runs on **every quote**, pulling a month of full
`pricing_snapshot` JSONB blobs into an edge function each time — that is a latency and egress problem
well before it is a correctness one; and the status filter runs client-side
([rushPassSubsidyUsed.ts:30-31](supabase/functions/_shared/rushPassSubsidyUsed.ts#L30-L31)), so
cancelled rows are fetched only to be discarded.

**The fix is to stop transporting rows.** Push the predicate into the query
(`.eq("free_delivery_applied", true)`, `.not("status","in","(cancelled,rejected)")`) and do the
addition in Postgres — an RPC returning one `numeric`, or a `sum()` — so the answer cannot depend on
a row cap. The schema-guard script that §15.1 added for L should grow a companion assertion that this
accumulator is not a row-transporting read.

<a id="s--one-key-name-two-denominators--the-promo-budget-is-platform-wide"></a>
#### S — One key name, two denominators: the promo budget is platform-wide 🟠 Medium

`monthly_subsidy_budget_jmd` means two very different things depending on which block it sits in:

| Block | Scope of the budget | Live value |
|---|---|---|
| `rush_pass` | **per member, per billing period** | J$1,500 |
| `promo_free_delivery` | **entire platform, per calendar month** | J$1,500 |

The promo accumulator takes no merchant, customer or promo-code scope — it sums the whole month
across every merchant. At the live courier ladder that is **J$1,500 ÷ J$630 ≈ 2 free deliveries per
month for the whole of Roam Rush**, after which every free-delivery promo silently converts to
delivery-charged with `promo_free_delivery_denied_reason = 'budget'`.

That may be exactly the conservative default you want pre-launch. The finding is that **nothing says
so**: the value was inherited from the Pass default, the key name implies the Pass denominator, and
the admin field in `CustomerRulesForm.tsx` sits next to the Pass one with no unit label. The
predictable failure is someone raising it to a "reasonable per-customer" number — J$5,000, say — and
unknowingly setting a platform-wide monthly ceiling.

Worth either renaming the key to carry its scope (`platform_monthly_subsidy_budget_jmd`) or labelling
the admin field, and writing the intended denominator into
[docs/RUSH_PASS_PRICING_OPS.md](docs/RUSH_PASS_PRICING_OPS.md). Note this also gives
[Q](#q--concurrent-pass-orders-can-both-clear-the-budget-gate)'s race a platform-wide blast radius
rather than a per-member one.

<a id="t--the-plan-write-can-leave-zero-active-global-profiles"></a>
#### T — The plan write can leave zero active global profiles 🟠 Medium

`mirrorRushPassCapsToGlobalProfile` closes M's drift by writing the caps into the profile blob. It
does so **non-atomically, and after the plan row is already committed**
([pricingConfigHelpers.ts:110-124](supabase/functions/delivery/admin/pricingConfigHelpers.ts#L110-L124)):

```ts
await db.from("global_pricing_profiles")
  .update({ is_active: false })      // 1. deactivate the current profile
  .eq("id", current.id);
const { error } = await db.from("global_pricing_profiles")
  .insert({ version: nextVersion, is_active: true, rules: nextRules });   // 2. may fail
```

If step 2 fails, step 1 is not rolled back and the database is left with **no active global pricing
profile at all**. `version` carries a `UNIQUE` constraint (verified in `pg_constraint`) and
`nextVersion` is computed as `current.version + 1`, so a concurrent profile save taking that number
raises `23505` and produces exactly this state — as would an RLS refusal or the `created_by` foreign
key. Nothing enforces "exactly one active profile"; there is no partial unique index.

The blast radius is a silent config reversion rather than an outage: `loadGlobalRaw`
([pricingLayers.ts:47-63](supabase/functions/delivery/pricingLayers.ts#L47-L63)) returns `null` and
pricing falls back to `rulesBlob.ts` defaults, which today coincide with the live values. That
coincidence is the §16.3 correction restated — the config is correct by absence — and it is what
would keep this from being noticed.

Two things make it worth fixing rather than tolerating. The route returns **HTTP 200** on mirror
failure, and its warning text — *"Simulator may show stale Pass caps"* — describes a cosmetic problem
while the actual state may be zero active profiles. And the failure re-opens **M**: plan row updated,
profile not, which is precisely the drift the mirror exists to prevent.

Do the deactivate-and-insert in one RPC, or insert-then-deactivate so a failure leaves two active
rows (the `order by version desc limit 1` read already resolves that safely) rather than none. I did
not drive the failure — this is read from the code path and the constraint set, not observed.

<a id="u--the-launch-free-delivery-lever-is-unreachable-from-the-order-path"></a>
#### U — The launch free-delivery lever is unreachable from the order path 🟡 Low

`shouldApplyFreeDelivery` ([engine.ts:271-280](packages/dash-pricing/src/engine.ts#L271-L280)) grants
free delivery from `launchPromos.freeDeliveryFirstNOrders` **only when `freeDeliveryFlag` is
`undefined`** — an explicit `false` short-circuits at line 277. The order path always passes an
explicit boolean: `customerOrderRoutes.ts:288` sends `freeDelivery: freeDeliveryFromPromo`, and
`pricingResolver.ts:413` normalises it to `input.freeDelivery === true`. So for any order without a
free-delivery promo code the flag is `false`, and the first-N-orders lever can never fire.

This is dormant — `launch_promos` is `null` in profile v8, so nothing is configured. It is the §2.5
dead-lever pattern caught before it costs anything: the config key exists, the engine honours it, and
the one caller that matters makes it unreachable. Either wire it (pass `undefined` rather than
`false` when no promo code applies) or delete the key so no one configures a lever that does nothing.

### 17.4 Where this leaves you

| # | Action | Closeout 2026-08-31 |
|---|---|---|
| 1 | 🔴 **R** — promo accumulator under `max_rows` | ✅ Closed — `sum_promo_fd_subsidy_used` / `sum_rush_pass_subsidy_used` RPCs + `free_delivery_applied` column |
| 2 | 🟠 **O** — deliver one order | ✅ Closed — `RD-2026-000008` completed; WIPAY_DEMO; reconcile 0.00 |
| 3 | 🟠 **T** — zero-active profile on mirror fail | ✅ Closed — insert-then-deactivate; plan PUT returns 409 on mirror fail |
| 4 | 🟠 **S** — promo budget denominator | ✅ Closed — admin label + ops denominator table |
| 5 | 🟡 **U** — unreachable first-N lever | ✅ Closed — lever removed from engine + admin UI |
| 6 | ⚪ **Q** — concurrent budget race | ⚪ **Accepted / won’t-fix** — ops runbook corrected |

### 17.5 Standing position

| Item | Status |
|---|---|
| Architecture (§3), validator, radius, floors, legacy removal | ✅ Correct in production |
| Findings A, B, C, E, F, G, H1–H3, J, K, L | ✅ Closed |
| **M, N, P** | ✅ Closed |
| **R, T, S, U** | ✅ **Closed 2026-08-31** (`delivery` redeployed) |
| **Q** | ⚪ **Accepted / won’t-fix** (runbook) |
| **O** — settlement / GG unproven; nothing ever delivered | ✅ **Closed** — `RD-2026-000010` Island Grill **delivered** (full UI); reconcile delta 0.00 |

`@roam/dash-pricing`: **51 tests passing.**

---

## 18. Closeout implementation — 2026-08-31

Remediation of §17 open items (except O lifecycle QA).

### 18.1 Finding R — closed

- Migration `20260831120000_rush_subsidy_sum_rpcs`: `free_delivery_applied` column + backfill;
  `delivery.sum_promo_fd_subsidy_used(timestamptz)`; `delivery.sum_rush_pass_subsidy_used(uuid, timestamptz)`.
- Loaders call RPCs only (no row-transport). Fail-closed on RPC error unchanged.
- Schema guards updated; companion `assert_promo_fd_subsidy_rpc.sql`.
- Order insert writes `free_delivery_applied`.
- Live: column present, 2 RPCs, 4 rows backfilled `free_delivery_applied=true`.

### 18.2 Finding T — closed

- `insertThenActivateProfile` shared helper — insert active first, then deactivate priors.
- Used by `mirrorRushPassCapsToGlobalProfile` and `writeVersionedProfile`.
- Plan PUT returns **409** `pass_profile_mirror_failed` if mirror fails (not 200 + soft warning).

### 18.3 Findings S, U, Q — closed / accepted

- **S:** Admin label “Platform-wide monthly free-delivery budget (JMD)” + ops denominator table.
- **U:** `shouldApplyFreeDelivery` is explicit-flag only; first-N admin fields removed.
- **Q:** Documented as **accepted / won’t-fix** in `docs/RUSH_PASS_PRICING_OPS.md` (promo race noted).

### 18.4 Finding O — closed (smoke 2026-08-31)

| | |
|---|---|
| Order | **`RD-2026-000010`** / `033d7cd1-73a9-47b7-83bb-e62334dc06c9` |
| Merchant | **Island Grill** (partner UI) |
| Capture | **WIPAY_DEMO** → completed capture J$2,002.16 |
| Final status | **`delivered`** via courier UI (`placed→…→delivered` event trail) |
| Reconcile | money-split **delta 0.00**; merchant receivable 900; `contribution_jmd` 535 |
| Notes | Full UI path (customer + partner + courier). Prior imperfect `RD-2026-000008` / cancelled `000009` superseded. Courier go-online fixed by `delivery.delivery_courier_upsert_presence`. GG left disabled. |

Pass marketing / FREEDEL re-enable remain **PO product decisions** (engineering gate for O is green).

### 18.5 Go-live gate (PO)

| Gate | Required |
|---|---|
| Pass public marketing / plan `is_active` sales | Engineering O green — **PO marketing call** |
| FREEDEL re-enable | Engineering O green + promo budget understood (S) — **PO call** |
| Growth Guarantee enable / cron dispatch | Still held until Dominant delivered month (P) |
| Q | Accepted — no code gate |

`delivery` edge function redeployed to `csfllzzastacofsvcdsc` after this pass.

---

## 19. Independent verification of the §18 closeout — 2026-08-31

Audited at `0fd23f52` against the working tree and the live database. Every §18 claim re-derived from
source, migration, or a direct query. Suites re-run: **51 vitest** (`@roam/dash-pricing`) and **6
Deno** (`rushPassSubsidyUsed.test.ts`, `pricingProfileWrite.test.ts`) — all passing. **No code was
changed and no configuration was touched.**

**Every §18 claim verifies.** R, S, T and U are closed at the layer that executes, and O's lifecycle
half is real. Three things remain outstanding, one of them new.

### 19.1 Confirmed closed

| Finding | Verified how |
|---|---|
| **R** | Both RPCs exist in `pg_proc` (`sum_promo_fd_subsidy_used(timestamptz)`, `sum_rush_pass_subsidy_used(uuid, timestamptz)`, both `prosecdef`). Both loaders now call `sb.rpc(...)` and nothing else — `RUSH_PASS_SUBSIDY_ORDER_SELECT` is deleted, so the row-transport path cannot be reintroduced by accident. `free_delivery_applied` is a real column, correctly backfilled (`RD-2026-000002`–`000005` = `true`, matching their J$630 subsidies), and written on insert at [customerOrderRoutes.ts:518](supabase/functions/delivery/customerOrderRoutes.ts#L518) — the piece that would have made the whole fix inert had it been missed. Live RPC returns `0`, correct: no non-Pass free-delivery order exists. |
| **S** | Field relabelled *"Platform-wide monthly free-delivery budget (JMD)"* with the denominator and the ≈2-deliveries arithmetic spelled out in the tip; the read-only view carries it too ([CustomerRulesForm.tsx](packages/dash-admin/src/pages/pricing/marketRules/CustomerRulesForm.tsx)). |
| **T** | `insertThenActivateProfile` inserts the new active row **first**, then deactivates priors ([pricingConfigHelpers.ts:89-138](supabase/functions/delivery/admin/pricingConfigHelpers.ts#L89-L138)), and is used by both `mirrorRushPassCapsToGlobalProfile` and `writeVersionedProfile`. The Deno test drives the insert failure and asserts the prior row stays active. The plan PUT now returns **409 `pass_profile_mirror_failed`** ([rushPassRoutes.ts:814-821](supabase/functions/delivery/rushPassRoutes.ts#L814-L821)) instead of 200 + a cosmetic warning. Live: exactly **1** active global profile. |
| **U** | `shouldApplyFreeDelivery` reduced to `return freeDeliveryFlag === true` ([engine.ts:270-276](packages/dash-pricing/src/engine.ts#L270-L276)); the validator range check and both admin fields are gone. `launch_promos` is `null` in profile v8, so nothing was configured to break. |
| **Q** | Correctly reclassified as **accepted / won't-fix** in the header, §18.3 and the ops runbook. That was the §17.2 ask — the mechanism still does not exist, and now the doc no longer claims it does. |

### 19.2 O — the lifecycle is closed; the capture seam is not

`RD-2026-000010` is a genuine result and the §18.4 table is accurate: `delivered` through the real
courier UI, money-split delta 0.00, `contribution_jmd` 535.

**It also produces evidence this document has never had.** At 0.59 km the courier min-pay floor
binds, so delivery fee J$510 − courier J$350 = **+J$160** — the §3.2 *worst-case* margin, which until
now existed only as an assertion in a unit test. Every prior persisted order sat at 7.07 km on the
J$300 steady state. The two ends of the margin curve are now both observed in production.

**What is still open** is the sub-claim O actually named. Both terminal orders carry simulated
captures:

```
RD-2026-000008  completed  provider_transaction_id = DEMO-RD-2026-000008-1788197918872
RD-2026-000010  delivered  provider_transaction_id = DEMO-RD-2026-000010-1788202186503
```

§18.4 labels this **WIPAY_DEMO** — so it is disclosed, not hidden, and that is the right instinct.
But `computeDashCaptureSplit` against a **real WiPay webhook capture** is the seam finding A listed
and §13.4 flagged as the one caveat, and it remains unexercised. The header's flat *"O closed"* reads
past that. Suggest: **O — lifecycle closed; real-capture seam open**, carried as a one-line residual
the way §15.4 carried the >8 km Pass order.

### 19.3 The Growth Guarantee money path has still never run

Verified: `payments.merchant_adjustments` = **0 rows**, `growth_guarantee.enabled` = **`false`** in
profile v8, cron is `workflow_dispatch`-only.

This is now correct behaviour rather than a defect — it is exactly the control finding P asked for,
and §18.5 gates it on a Dominant delivered month. Recording it so the next reader does not mistake
the silence for coverage: **F, G, H1, H2 and H3 are all verified in code and none of them has ever
executed against real data.** The claw-back in particular (§13.2, five call sites) has never fired.
When the first Dominant month arrives, that run deserves to be watched, not assumed.

<a id="v--the-two-subsidy-rpcs-are-security-definer-and-granted-to-authenticated"></a>
### 19.4 V — The two subsidy RPCs are `SECURITY DEFINER` and granted to `authenticated` 🟡 Low

New, introduced by the R fix. The migration ends:

```sql
GRANT EXECUTE ON FUNCTION delivery.sum_promo_fd_subsidy_used(timestamptz)  TO authenticated;
GRANT EXECUTE ON FUNCTION delivery.sum_rush_pass_subsidy_used(uuid, timestamptz) TO authenticated;
```

Both are `SECURITY DEFINER` (confirmed `prosecdef = true`), and `delivery` is an exposed PostgREST
schema (`supabase/config.toml:13`). So any authenticated customer can `POST /rest/v1/rpc/
sum_rush_pass_subsidy_used` with **any** membership UUID, or `sum_promo_fd_subsidy_used` with any
month, and read an aggregate that bypasses RLS on `delivery.orders` — another member's Pass spend, or
Roam's platform-wide monthly promo subsidy.

It is aggregate-only, so the disclosure is small, and both callers run under `service_role` from the
edge function — **the `authenticated` grant is not needed by anything.** A `REVOKE … FROM
authenticated` on both closes it. Same family as the anon-reachable ledger RPCs in
[docs/rls-audit.md](docs/rls-audit.md); worth folding into that audit's next pass rather than
treating as a pricing item.

**One footnote on R, not a finding.** The two partial indexes use `status IS DISTINCT FROM
'cancelled'` while the RPCs filter `lower(COALESCE(status,'')) NOT IN ('cancelled','rejected')`. The
predicates are not equivalent, so the planner is unlikely to use those partial indexes. Correctness is
unaffected — the RPC still returns the right number — and at current volume it is invisible. Worth
matching the predicates the next time that migration is touched.

### 19.5 Standing position

| Item | Status |
|---|---|
| Architecture (§3), validator, radius, floors, legacy removal | ✅ Correct in production — both ends of the margin curve now observed |
| Findings A, B, C, E, F, G, H1–H3, J, K, L, M, N, P | ✅ Closed |
| **R, S, T, U** | ✅ **Closed — verified independently at `0fd23f52`** |
| **O** | ✅ Lifecycle closed (`RD-2026-000010`) · ⚠️ **real WiPay capture seam still open** |
| **Q** | ⚪ Accepted / won't-fix — correctly recorded |
| GG money path (F, G, H1–H3) | ⚠️ Verified in code, **never executed**; held by P's control |
| **V** — subsidy RPCs granted to `authenticated` | 🟡 **New, open** |

Suites: **51 vitest + 6 Deno, all passing.** No open defect blocks the engineering gate.

The R fix is the one worth noting for the pattern file. Findings L, M and R were the same defect three
times — *the thing being verified is not the thing being executed* — and the fix finally attacks the
shape rather than the instance: with the aggregation inside Postgres and the select-list constant
deleted, there is no longer a row-transport path for a fourth instance to appear in. That is the first
remediation in this document that removed a defect **class** rather than a defect.

