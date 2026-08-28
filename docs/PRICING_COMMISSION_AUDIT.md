# Pricing & Commission — Audit & Enterprise Enhancement Plan

**Date:** 2026-08-27
**Scope:** `packages/dash-admin/src/pages/pricing/*` (2,643 LOC), `packages/dash-pricing/*` (797 LOC),
`supabase/functions/delivery/pricingResolver.ts`, `pricingLayers.ts`, `courierCashLedger.ts`,
`supabase/functions/delivery/admin/pricingRoutes.ts` (829 LOC),
`delivery.global_pricing_profiles` / `parish_pricing_profiles` / `market_pricing_profiles` /
`merchant_tiers` / `courier_cash_balances`
**Method:** Code read + live database verification against GoRide (`csfllzzastacofsvcdsc`).
**Status:** Audit only — **no code changed.**
**Related:** `docs/FINANCIAL_INTEGRITY_AUDIT.md` (RoamFleet driver settlements — different vertical,
same structural disease; see §7).

---

## Market Rules — Three-party model (2026-08-28)

Market Rules admin UI and DB JSON now use **Customer**, **Partner**, **Rider**, and **Platform** namespaces under each layer (Default → Parish → Town). Partner commission % remains on **Merchant Tiers**. See [pricing-party-rules-matrix.md](./pricing-party-rules-matrix.md).


The pricing engine is **not underdeveloped in the way it looks**. The math package is clean, pure,
well-factored, and has 24 passing tests. The layering model (Default → Parish → Town), the versioned
profiles, the change log, and the order-time `pricing_snapshot` design are all *correct architecture*.

The problem is that **none of it is switched on, and the platform is recording no revenue.**

> `pricing_v2_enabled: false` on the only active global profile.
> All **28 orders** are `pricing_model = 'legacy'` with **zero** `pricing_snapshot`.
> Recorded merchant commission across the entire order history: **J$0.00**.
> Recorded service fees: **J$0.00**.
> `courier_cash_balances`: **0 rows**, despite **23 of 28 orders being cash**.

Merchant tiers are configured (12% / 20% / 25%) and all 8 merchants are assigned to one. None of it
reaches an order. On J$35,100 of gross food sold, a 20% commission would have been **J$7,020** —
the system recorded J$0.00.

**This is not a "finish the UI" problem. It is a "the revenue engine is built, tested, and disconnected"
problem**, plus a small number of genuine defects that will bite the moment it is connected — one of
which (COURIER-1) takes money out of couriers' pockets, and one of which (GCT-1) misallocates
government tax.

**Verdict:** do not build more UI. Fix the four defects in §2, then run a controlled enablement.

---

## 1. What exists and works (fair credit)

| Area | State |
|---|---|
| Pricing math (`packages/dash-pricing/src/engine.ts`) | ✅ Pure functions, no I/O, consistent 2-dp rounding, **24/24 tests passing** |
| Layer model | ✅ Default → Parish → Town deep-merge (`mergePricingRuleLayers`), arrays replaced not concatenated |
| Soft layer toggles | ✅ `override_enabled` lets a layer exist but be skipped |
| Versioned profiles | ✅ `version` + `is_active` + `effective_from` on all three scopes |
| Change log | ✅ `pricing_change_log` — **17 entries**, before/after states captured |
| Order-time snapshot | ✅ `orders.pricing_snapshot` design is correct (immutable at capture) |
| Simulator fidelity | ✅ Calls the **real** `resolveDashOrderPricing` — no parallel re-implementation to drift |
| Write validation | ✅ `validatePricingRules` guards service-fee rates, min/max ordering, processing-fee ceiling |
| Coverage integration | ✅ Refuses to invent a market when dropoff is uncovered (`requireCoverage`) |
| GCT resolution | ✅ `buildOrderPricing` **throws** rather than silently defaulting tax to 0 |

The engine is genuinely the strongest part of this section. Findings below are about **wiring,
allocation, and enablement** — not arithmetic.

---

## 2. Critical findings

### REVENUE-1 — The pricing engine has never priced an order ⚠️ **P0**

```
global_pricing_profiles: 2 rows (v1 inactive, v2 active)
  active profile rules.pricing_v2_enabled = false
parish_pricing_profiles: 0 rows
market_pricing_profiles: 0 rows
```

`customerOrderRoutes.ts:303` gates the entire Model B block on `if (v2Pricing?.pricingV2Enabled)`.
With the flag false, every one of these stays at its initialised zero:

| Order column | Value on all 28 orders |
|---|---|
| `pricing_model` | `'legacy'` |
| `merchant_commission_amount` | `0` / null (28/28) |
| `service_fee` | `0` / null (28/28) |
| `delivery_fee_platform_amount` | `0` / null (28/28) |
| `delivery_fee_courier_amount` | `0` / null (28/28) |
| `distance_km` | null (28/28) |
| `pricing_profile_version` | null (28/28) |
| `pricing_snapshot` | null (28/28) |

Legacy pricing (`_shared/orderPricing.ts`) computes **only** subtotal, tax, discount, total. It has no
concept of commission, service fee, delivery split, or courier share. The J$2,290 of `platform_fee`
and J$4,050 of `delivery_fee` on record come from the older Model A path, not from this section.

**Business impact:** the Pricing & Commission screen presents a fully operational-looking control
surface for an engine that is inert. Every number an operator sets there is currently decorative.

**Fix:** treat enablement as a project, not a checkbox — see §6 Phase 1. Flip `pricing_v2_enabled`
per-market via the town layer first, not globally.

---

### COURIER-1 — Couriers are paid J$0 delivery fee on every free-delivery promo order ⚠️ **P0**

`engine.ts:205-216`:

```ts
let deliveryFee = resolveDeliveryFee(input.rules.delivery, distanceKm);
const freeDeliveryApplied = shouldApplyFreeDelivery(...);
if (freeDeliveryApplied) {
  deliveryFee = 0;                                   // ← customer pays nothing
}
const { platformAmount, courierAmount } =
  resolveDeliverySplit(deliveryFee, input.rules.courierDeliveryShare);
// resolveDeliverySplit(0, 0.8) → { platformAmount: 0, courierAmount: 0 }
```

The promo zeroes the fee **before** the split, so the courier's 80% share is 80% of zero. The active
global profile sets `free_delivery_first_n_orders: 3`, so **a courier earns no delivery fee on each
customer's first three orders** — exactly the highest-volume acquisition window.

The promotion is funded entirely by the courier, not by the platform.

**This is untested.** `engine.test.ts:156` asserts `deliveryFee === 0` and `freeDeliveryApplied === true`
but never asserts `deliveryFeeCourierAmount`, so the behaviour has never been examined.

**Fix:** decide the funding policy explicitly, then encode it. The usual pattern is to keep the courier
whole and book the promo as platform marketing cost:

```
courierAmount   = split(grossDeliveryFee).courierAmount   // courier paid as normal
platformAmount  = -courierAmount                          // platform absorbs it
promoCostJmd    = courierAmount                           // booked as marketing spend
customerCharged = 0
```

Whatever is chosen, **assert it in a test** and surface promo cost in reporting (§3, GAP-3).

---

### GCT-1 — Legacy and v2 disagree on who holds the government's tax ⚠️ **P1**

`courierCashLedger.ts:168-197`, `computeCodLedgerAmounts`:

**v2 branch:**
```
platformDue = serviceFee + merchantCommission + deliveryPlatform
merchantDue = discountedSubtotal − merchantCommission        ← excludes tax
```
Courier collects `total` (which includes tax). Platform and merchant dues exclude it, so the **courier
retains the GCT** in their cash balance with nothing routing it onward. Meanwhile the merchant — who is
the GCT-registered supplier of the food — receives food-minus-commission and **must remit GCT they
were never paid**.

**Legacy branch:**
```
merchantDue = total − platformFee − deliveryFee − tip        ← includes tax
```
Here the merchant *does* receive the tax.

The two branches allocate GCT to different parties. Both cannot be right.

A dead giveaway sits in the code: the legacy branch computes `const tax = Number(order.tax ?? 0);`
and **never uses it** — a vestige of unresolved intent about who holds GCT.

> This is the same disease the RoamFleet audit diagnosed: *"no single definition of cash"* with each
> path making its own defensible-but-different allocation. Resolve it before enabling v2, because
> mis-allocated GCT is a tax-compliance exposure, not just a reporting inconsistency.

**Fix:** define GCT ownership once (almost certainly: merchant receives and remits food GCT; platform
receives and remits GCT on its own service fee — see QUESTION-1), then make both branches agree, with
a test asserting the three-way split sums to the collected total.

---

### COD-1 — The COD ledger has never recorded a single collection ⚠️ **P1**

`courier_cash_balances` = **0 rows**, `courier_cash_events` unused — despite **23 of 28 orders being
cash**, including J$11,781.25 already delivered/completed with a courier assigned.

Root cause — `courierCashLedger.ts:149`:

```ts
if (paymentMethod === "cash" && paymentStatus === "pending_collection") { … }
```

Live `payment_status` distribution for cash orders:

| payment_method | payment_status | orders |
|---|---|---:|
| cash | **paid** | 23 |
| cash | `pending_collection` | **0** |

Cash orders are written as `paid` at creation and never pass through `pending_collection`, so
`handleOrderDelivered` never fires the ledger. The pause threshold, the settlement flow, and the entire
**COD Ledger** admin tab are dead code paths in production.

**Consequence:** couriers are holding platform cash with no system record, no balance, and no pause
enforcement. The `pause_threshold_jmd: 10000` safety limit cannot trigger because no balance ever
accrues.

**Fix:** set `payment_status = 'pending_collection'` when a cash order is created, and backfill the
already-delivered cash orders. Add an invariant test: a delivered cash order must produce exactly one
`courier_cash_events` row.

---

### MINORDER-1 — The minimum-order floor is unenforced ⚠️ **P2**

The `min_order_subtotal_jmd: 800` gate lives **inside** the v2 block (`customerOrderRoutes.ts:304-315`).
With v2 off, it never runs. A J$1 order is currently accepted.

**Fix:** hoist the minimum-order check outside the v2 gate — it is a policy control, not a pricing-model
detail.

---

### FEE-1 — A merchant service-fee override silently removes the market's caps ⚠️ **P2**

`engine.ts:72-98`. When a `service_fee_override` is present, `resolveLegacyServiceFee` builds its
effective rules **entirely from the override**:

```ts
const effective = override ? {
  mode: override.mode,
  flatJmd:  override.mode === 'flat'    ? override.amount : undefined,
  percent:  override.mode === 'percent' ? override.amount : undefined,
  minJmd: override.min,     // undefined if the override omits it
  maxJmd: override.max,     // undefined if the override omits it
} : rules;
…
const max = effective.maxJmd ?? 99999;   // market's max_jmd = 2500 is discarded
```

Two consequences:

1. The market's `min_jmd` / `max_jmd` clamps (currently 150 / 2500) are **dropped**, falling back to
   `0` / `99999`. A `{mode:'percent', amount:0.05}` override on a J$50,000 order yields a J$2,500
   service fee with no ceiling to stop it going higher on larger orders.
2. The override **downgrades marginal mode to flat/percent** — the active profile uses
   `mode: 'marginal'`, so any merchant override silently opts that merchant out of the bracketed
   pricing model.

Currently latent: **0 of 8 merchants have a `service_fee_override`.** It is a loaded gun, not a live
wound.

**Fix:** treat an override as a *partial* — inherit market min/max unless the override explicitly sets
them, and preserve `mode` unless explicitly overridden.

---

### DIST-1 — Delivery fees are computed on straight-line distance ⚠️ **P2**

`pricingResolver.ts:238` uses `haversineKm` (great-circle) between merchant and dropoff pins. Jamaica's
road network — mountainous interior, coastal routing, one-way systems in Kingston — commonly runs
**1.4–2× straight-line**. Delivery fees therefore systematically **under-recover** on exactly the trips
that cost couriers the most.

Compounding it, `engine.ts:143` charges `Math.ceil(extraKm)`: crossing `included_km` by a single metre
costs a full J$60 extra-kilometre. So the model is simultaneously *too generous* on long trips
(straight-line) and *abrupt* at the threshold (ceiling).

**Fix:** either apply a calibrated road-distance multiplier (cheap, no new dependency) or use a routing
matrix for the fee. Consider charging fractional kilometres, or make the ceiling behaviour explicit in
customer-facing copy.

---

## 3. Gaps

| # | Gap | Consequence |
|---|---|---|
| GAP-1 | **No revenue or margin reporting anywhere** | Nobody can see take-rate, gross margin, or commission earned. The Overview tab shows a parish list and three tier rows — no money at all |
| GAP-2 | **No effective-rate visibility** | With Default→Parish→Town layering, nothing shows the *resolved* rules for a given town beside the layer that supplied each value |
| GAP-3 | **No promo cost attribution** | Free-delivery promos have no cost line anywhere — see COURIER-1 |
| GAP-4 | **No per-merchant commission view** | Tiers are set, but there is no screen showing what each merchant actually generated |
| GAP-5 | **No parish or market profiles exist** | The 3-layer model is built and unused — every market resolves to global defaults |
| GAP-6 | **`effective_from` is never scheduled** | Column exists on all three profile tables; no UI or job applies future-dated pricing |
| GAP-7 | **No approval workflow** | Any dash-write admin can change platform-wide pricing instantly; the change log records it after the fact |
| GAP-8 | **No margin guardrails** | Nothing warns when a rule change drives take-rate below cost |
| GAP-9 | **No courier earnings preview** | The simulator shows the customer's bill; it does not show what the courier nets |
| GAP-10 | **No reconciliation between pricing and finance** | `pricing_snapshot` is designed as the immutable record but nothing reads it back to verify payouts |

---

## 4. Redundancies & code smells

| # | Finding | Detail |
|---|---|---|
| RED-1 | **Double merchant fetch** | `pricingResolver.ts:95-135` queries `merchants` twice for the same row — once minimal, once for Model B columns — defensively guarding against columns that now exist |
| RED-2 | **Two default sources that disagree** | `defaultPricingRules()` returns `maxFeeJmd 1500`, `freeDeliveryFirstNOrders 3`, `minOrderSubtotalJmd 800`, `cardProcessingFeePercent 0.045`. `parsePricingRules({})` returns **none** of them. Currently unreachable — `pricingLayers.ts:151` falls back to `null` when merged is empty, and `serializePricingRules` always writes a complete blob — but any partial blob written directly via SQL silently disables the delivery-fee cap, the order floor, and processing-fee recovery |
| RED-3 | **Resolver defaults disagree with parser defaults** | `resolveMarginalServiceFee` defaults `max` to `99999`; `parsePricingRules` defaults `maxJmd` to `200`. Only unreachable because the parser always supplies a value |
| RED-4 | **Dead `tax` variable** | `courierCashLedger.ts` legacy branch computes `tax` and never uses it — see GCT-1 |
| RED-5 | **Misleading test name** | `engine.test.ts:115` `'computes PayPal fee'` passes `'wipay'`; `PaymentMethod` is only `'wipay' \| 'cash'`. Creates false confidence that a PayPal path is covered |
| RED-6 | **`platform_fee = serviceFee` back-compat alias** | `customerOrderRoutes.ts:319` writes service fee into the legacy `platform_fee` column too. Two columns, one number, no comment saying which is authoritative |

---

## 5. Validation gaps

`validatePricingRules` (`pricingRoutes.ts:21-37`) checks service-fee rates, min ≤ max, non-negative
order floor, and caps processing fee at 15%. It does **not** validate:

| Unvalidated field | Risk |
|---|---|
| `courier_delivery_share` | Accepts any number; `resolveDeliverySplit` clamps 0–1 at compute time, so a stored `5` displays as 500% in the UI while behaving as 100% |
| `delivery.base_fee_jmd`, `per_extra_km_jmd`, `included_km` | Negative values accepted; `Math.max(0, …)` masks them at compute time |
| `delivery.max_fee_jmd` vs `base_fee_jmd` | A max below base is accepted and silently caps every delivery at the max |
| `tax_rate_percent` | Unbounded — a typo of `165` instead of `16.5` would pass validation |
| `launch_promos.free_delivery_first_n_orders` | Unbounded; `999` would make delivery permanently free |

The pattern throughout is **defensive clamping at compute time instead of validation at write time**.
That prevents crashes but lets the stored configuration diverge from what the engine actually does —
so the admin UI can display a rule the system is not honouring.

---

## 6. UI/UX findings

| # | Finding | Recommendation |
|---|---|---|
| UX-1 | **Nothing indicates Model B is OFF** | This is the single most important UI fix. The screen looks fully operational while being inert. A persistent banner: *"Model B pricing is disabled — orders are priced by the legacy engine. Nothing configured here affects live orders."* |
| UX-2 | Overview tab is nearly empty | Two cards (parish list, tier list). Should lead with take-rate, commission earned, promo cost, margin trend |
| UX-3 | Tier rows show rate but no usage | Show merchant count per tier and link through to the merchants on it |
| UX-4 | No resolved-rules view | Show effective rules per town **with the layer that won each field** (Default / Parish / Town) |
| UX-5 | COD Ledger tab with zero data and no explanation | Empty state should say *why* it is empty (COD-1) rather than implying no cash is outstanding |
| UX-6 | Simulator shows only the customer's bill | Add the other side: merchant net, courier net, platform net — the split is the point |
| UX-7 | No diff preview before saving pricing | Versioning and change log exist; show a before/after diff at the moment of the change |
| UX-8 | Audit Log tab exists but change log is the only populated table | Good — surface it more prominently, including who/when on the Overview |
| UX-9 | No "what would this have earned" backtest | With 28 historical orders, a replay against proposed rules would de-risk enablement enormously |

---

## 7. Relationship to the RoamFleet financial audit

`docs/FINANCIAL_INTEGRITY_AUDIT.md` diagnosed RoamFleet as having *"no single definition of a week, no
single definition of cash, and no single ledger that all screens read"* — ~7 independent projections
over raw data, each internally defensible, mutually inconsistent.

Roam Rush pricing is **early enough to avoid that outcome**, and currently shows two of the same
symptoms in miniature:

- **GCT-1** — two branches of one function allocate the same tax to different parties.
- **COD-1 / GCT-1** — `computeCodLedgerAmounts` returns only `platformDue` and `merchantDue`; the
  courier's retention is the *implicit remainder*. There is no explicit three-way split and no assertion
  that the parts sum to the amount collected. That is precisely the "no enforced trial balance" pattern.

**Recommendation:** before enabling v2, make the COD split explicit and self-checking:

```ts
{ platformDueJmd, merchantDueJmd, courierRetainedJmd, gctDueJmd }
// invariant, asserted in test:
platformDue + merchantDue + courierRetained + gctDue === collectedTotal
```

One test enforcing that invariant now prevents the entire class of reconciliation drift the fleet audit
had to untangle retroactively.

---

## 8. Open questions for the business

These are **policy decisions, not defects** — the code cannot be judged correct or incorrect until they
are answered.

| # | Question | Why it matters |
|---|---|---|
| QUESTION-1 | **Is GCT charged on the platform's service fee and delivery fee?** Today `tax = discountedSubtotal × rate` — GCT is applied to **food only**. If Roam Rush is GCT-registered, its own service fee is a taxable supply | Under-collected GCT is a direct liability |
| QUESTION-2 | **Who funds free-delivery promos?** Currently 100% the courier (COURIER-1) | Courier retention and fairness |
| QUESTION-3 | **Who holds and remits food GCT on COD orders?** (GCT-1) | Tax compliance |
| QUESTION-4 | Should the customer pay the card processing fee on their own **tip**? `orderTotal` includes tip before the fee is applied (`engine.ts:219-226`) | Defensible — the processor does charge on the full amount — but should be a conscious choice |
| QUESTION-5 | Is a **J$150 minimum service fee** intended on small orders? On a J$300 order that is a 50% effective rate | Regressive on the smallest baskets |

---

## 9. Priority order

| Priority | Item | Notes |
|---|---|---|
| **P0** | **COURIER-1** Free-delivery promo pays couriers J$0 | Fix **before** enabling v2 — otherwise it goes live against real couriers |
| **P0** | **REVENUE-1** Engine disconnected; J$0 recorded | The headline. Requires the items below to be safe first |
| **P1** | **GCT-1** Legacy/v2 disagree on tax ownership | Tax exposure; resolve with QUESTION-1 / -3 |
| **P1** | **COD-1** COD ledger never fires | Couriers holding untracked cash today, independent of v2 |
| **P2** | **MINORDER-1** Order floor unenforced | One-line hoist out of the v2 gate |
| **P2** | **FEE-1** Overrides drop market caps | Latent — 0 merchants affected today |
| **P2** | **DIST-1** Straight-line distance | Systematic under-recovery |
| **P3** | §5 validation gaps, RED-1…6 | Robustness and clarity |
| **P3** | GAP-1…10, UX-1…9 | Visibility — build **after** the engine is live and correct |

### Recommended sequence

1. **UX-1** — banner saying Model B is off. One hour; stops anyone trusting the screen meanwhile.
2. **COD-1** — fix `pending_collection`; backfill delivered cash orders. Independent of v2, live problem today.
3. Answer **QUESTION-1 / -2 / -3**.
4. **COURIER-1** + **GCT-1** + the §7 balance invariant, with tests.
5. **MINORDER-1**, **FEE-1**, **DIST-1**.
6. **UX-9 backtest** — replay the 28 historical orders against the proposed rules; confirm the numbers.
7. Enable v2 on **one town** (Spanish Town — the only active published market) via a town-layer profile.
   Watch. Then widen.
8. Build the reporting in GAP-1…4 once real v2 orders exist to report on.

---

## Appendix — verification queries

```sql
-- Is the engine actually on?
select id, version, is_active, rules->>'pricing_v2_enabled' as v2_enabled
from delivery.global_pricing_profiles order by version desc;
select count(*) as parish_profiles from delivery.parish_pricing_profiles;
select count(*) as market_profiles from delivery.market_pricing_profiles;

-- Has it ever priced an order?  (expect all-zero until enablement)
select count(*) as orders,
       count(*) filter (where pricing_model = 'v2')        as v2_orders,
       count(*) filter (where pricing_snapshot is not null) as with_snapshot,
       round(sum(coalesce(merchant_commission_amount,0))::numeric,2) as commission_recorded,
       round(sum(coalesce(service_fee,0))::numeric,2)               as service_fee_recorded
from delivery.orders;

-- COD-1: cash orders that never entered pending_collection
select payment_method, payment_status, count(*) , round(sum(total)::numeric,2) as jmd
from delivery.orders where payment_method = 'cash'
group by 1,2;

-- COD-1: delivered cash orders with no ledger row  (should be 0 once fixed)
select count(*) from delivery.orders o
where o.payment_method = 'cash'
  and o.status in ('delivered','completed')
  and o.courier_id is not null
  and not exists (select 1 from delivery.courier_cash_events e where e.order_id = o.id);

-- FEE-1 exposure: merchants whose override would drop market caps
select count(*) from delivery.merchants where service_fee_override is not null;

-- Tier distribution (UX-3)
select t.slug, t.commission_rate, count(m.id) as merchants
from delivery.merchant_tiers t
left join delivery.merchants m on m.pricing_tier_id = t.id
group by t.slug, t.commission_rate, t.sort_order order by t.sort_order;

-- 2026-08-27 baseline:
--   28 orders · J$35,100 gross food · J$47,801.50 gross total
--   commission recorded J$0.00  (at 20% would be J$7,020.00)
--   23/28 cash · 0 courier_cash_balances rows
--   tiers: basic 0.12 · standard 0.20 · premium 0.25 · all 8 merchants assigned
```
