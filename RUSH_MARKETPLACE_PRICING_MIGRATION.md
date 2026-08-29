# Rush Marketplace Pricing — Migration Audit

**Date:** 2026-08-28
**Scope:** Roam Rush food-delivery pricing (`delivery` schema, `dash-*` apps)
**Status:** Audit only. No code was changed.

**Question asked:** how do we move from the current pricing architecture to the
merchant-subsidized marketplace model (tier-driven delivery fees, menu inflation,
partitioned micro-fees)?

**Short answer:** you are roughly 70% of the way there already, and the remaining 30%
is not evenly distributed. The fee *engine* is more sophisticated than the blueprint
asks for. The three things the blueprint actually depends on — tiers controlling the
customer-facing delivery fee, menu inflation, and courier pay decoupled from the
delivery fee — are the three things that do not exist. There are also two live money
defects that are survivable today and become severe the moment commission goes to 30%.

---

## 1. What you already have

Your current system is internally called **Model B** / `pricing_v2`, gated behind a
`pricing_v2_enabled` flag. It is genuinely good. Inventory:

### 1.1 Merchant tiers — table exists, seeded, admin-editable

`delivery.merchant_tiers` ([migration](supabase/migrations/20260823120000_dash_pricing_engine.sql)):

| column | meaning | wired up? |
|---|---|---|
| `slug`, `name` | tier identity | yes |
| `commission_rate` | 0–1, platform's cut of food | **yes — this is the only live field** |
| `search_boost` | intended feed ranking reward | **no — stored, never read** |
| `default_delivery_radius_km` | intended radius reward | **no — stored, never read** |
| `promo_eligible` | intended promo gating | **no — stored, never read** |

Seeded as `basic 12%` / `standard 20%` / `premium 25%`.
Merchants link via `merchants.pricing_tier_id`, with a per-merchant escape hatch
`merchants.merchant_commission_rate`.

Resolution order lives in
[engine.ts:31](packages/dash-pricing/src/engine.ts#L31):
merchant override → tier rate → `0.20` fallback. Commission is charged on the
*discounted* subtotal ([engine.ts:45](packages/dash-pricing/src/engine.ts#L45)).

Admin CRUD: [pricingRoutes.ts:748-825](supabase/functions/delivery/admin/pricingRoutes.ts#L748).
Admin UI: "Merchant Tiers" tab in [PricingHubPage.tsx](packages/dash-admin/src/pages/pricing/PricingHubPage.tsx#L1621) — but the
editor only exposes the commission percentage.

### 1.2 Partitioned micro-fees — already richer than the blueprint

[`buildOrderPricing`](packages/dash-pricing/src/engine.ts#L228) already emits every line
item the blueprint describes, plus several it doesn't:

| blueprint line item | your equivalent | status |
|---|---|---|
| Base delivery fee | `delivery.base_fee_jmd` | ✅ exists (per-market, not per-tier) |
| Long-distance surcharge | `included_km` + `per_extra_km_jmd` + `max_fee_jmd` | ✅ exists, better (has a cap) |
| Service fee (10–15%) | marginal-bracket service fee | ✅ exists, **much** better |
| Small-order penalty | — | ❌ **missing** (you hard-block instead) |
| — | zone risk surcharge | ✅ bonus |
| — | card processing fee, split order/tip | ✅ bonus |
| — | dual-supply GCT (food vs. platform) | ✅ bonus |
| — | courier/platform delivery-fee split | ✅ bonus |

Your service fee is already a **marginal bracket**, which is strictly better than the
blueprint's flat percentage: 15% up to J$5,000 of food, 9% on everything above,
clamped to J$150–J$2,500 ([engine.ts:56](packages/dash-pricing/src/engine.ts#L56)).
That is the DoorDash-style curve. Do not replace it with the blueprint's flat 10%.

Distance is haversine × a `road_distance_multiplier` (default 1.4), rounded up to whole
km before the per-km charge ([engine.ts:174](packages/dash-pricing/src/engine.ts#L174)).

### 1.3 Three-layer rules hierarchy

Rules resolve **Global → Parish → Town**, deep-merged, each layer independently
toggleable via `override_enabled`, each versioned, with per-leaf provenance for the
admin UI and a `pricing_change_log` audit table.

- Tables: `global_pricing_profiles`, `parish_pricing_profiles`, `market_pricing_profiles`
- Merge: [pricingLayers.ts](supabase/functions/delivery/pricingLayers.ts)
- Blob shape: rules are namespaced by *party* (`platform` / `customer` / `rider` / `partner`)
  in [rulesBlob.ts](packages/dash-pricing/src/rulesBlob.ts), with per-party validators.

This is the single most valuable asset you have for this migration. Any new knob the
new model needs (tier delivery fees, inflation caps, small-order fee) drops into this
hierarchy and inherits geographic override for free.

### 1.4 Order snapshotting

Every v2 order writes an immutable `pricing_snapshot` jsonb plus flattened columns
(`merchant_commission_amount`, `service_fee`, `delivery_fee_platform_amount`,
`delivery_fee_courier_amount`, `tax_food_jmd`, `tax_platform_jmd`, `courier_tip_net`,
`pricing_profile_version`) — [customerOrderRoutes.ts:464-470](supabase/functions/delivery/customerOrderRoutes.ts#L464).
This means a rules change never retroactively rewrites historical money. Keep this
discipline for every new field.

### 1.5 Current default rules (Spanish Town / global)

```
delivery:      base J$400, 2km included, J$60/extra km, cap J$1,500
service fee:   marginal 15% → 9% above J$5,000, min J$150, max J$2,500
courier share: 80% of delivery fee
GCT:           16.5%
card fee:      4.5%
min order:     J$800 (hard block)
road mult:     1.4×
```

---

## 2. Gaps — what the new model needs that does not exist

Ordered by how much work each one is and how load-bearing it is.

### GAP 1 — Tier does not control the customer-facing delivery fee 🔴 load-bearing

**This is the entire mechanism of the new model and it is absent.**

Today `base_fee_jmd` lives in the *market* rules blob (global/parish/town). Every
merchant in Spanish Town shows the same J$400 base delivery fee regardless of whether
they pay 12% or 25%. There is no way to express "Dominant tier merchants show J$150,
Economy tier merchants show J$900, same town."

The blueprint's entire premise — restaurant surrenders commission, platform buys down
their visible delivery fee — has no representation in the schema.

**What's needed:**
- `merchant_tiers.base_delivery_fee_jmd` (and probably `included_km` / `per_extra_km_jmd`
  overrides too, so tiers can differ on distance policy).
- A resolution order in `resolveDeliveryFee`: **tier delivery override → market rules →
  defaults**, mirroring how commission already resolves.
- `MerchantTier` type gains the fields ([types.ts:2](packages/dash-pricing/src/types.ts#L2)).
- `PricingInput` already carries `tier`, so the plumbing to the engine is free.

**Design decision you have to make:** does the tier fee *replace* the market base fee,
or *cap* it? Recommendation: replace the base, but keep market-level `per_extra_km_jmd`
and `max_fee_jmd` — you want distance economics set geographically (rural Portland costs
more to serve than Kingston) and the base set commercially.

### GAP 2 — No menu inflation 🔴 load-bearing

`delivery.menu_items` has exactly one price column:
[delivery_schema.sql:48](supabase/migrations/20260511140000_delivery_schema.sql#L48). No
`in_store_price` / `marketplace_price` split, no per-tier inflation multiplier, no
merchant-facing UI for it ([MenuPage.tsx](apps/dash-merchant/src/pages/MenuPage.tsx)).

This is a bigger change than it looks, because *everything downstream is computed off
that single price*:

- order `items` jsonb snapshot
- `subtotal` → commission base
- `subtotal` → food GCT base
- `subtotal` → merchant payout base
- `subtotal` → service fee bracket
- min-order gate

**Non-obvious consequence you should decide deliberately:** in the blueprint's own math,
commission is taken on the **inflated** subtotal ($48 × 30%, not $40 × 30%). That means
the merchant pays you commission on the markup *they* added to cover your commission.
That is how the majors do it, and it is also the single most common cause of merchant
churn and "delivery apps are killing restaurants" press. It is a real business decision,
not a technical detail. Whichever way you go, make it an explicit config field
(`commission_base: 'marketplace' | 'in_store'`) rather than an emergent property of
which column the code happens to read.

**Second consequence:** GCT. The customer pays 16.5% on the inflated food price, and the
merchant is the one who remits it. Their tax exposure goes up with the markup. That
needs to be stated in the merchant contract, not discovered by their accountant.

**What's needed:**
- `menu_items.in_store_price` + `menu_items.marketplace_price` (keep `price` as a
  generated/synced alias during transition so nothing breaks).
- `merchant_tiers.menu_inflation_percent` (Economy 0%, Growth 10%, Dominant 20%).
- Backfill: `in_store_price = price`, `marketplace_price = price` — zero-inflation start.
- Merchant dashboard shows both, clearly labeled ("your in-store price" vs "what
  customers see in Roam Rush").
- A platform-level `max_menu_inflation_percent` guardrail so a merchant can't set 80%
  and torch your marketplace's price perception.
- Customer surfaces read `marketplace_price` **only**, everywhere.

### GAP 3 — Courier pay is a % of the customer's delivery fee 🔴 load-bearing

Today: `courier_delivery_share = 0.80`, applied to whatever the customer paid for
delivery ([engine.ts:205](packages/dash-pricing/src/engine.ts#L205)).

Under the new model this breaks immediately. A Dominant-tier merchant shows J$150
delivery. A 12km run. Courier earns J$120 for a 12km trip and stops accepting Rush
offers in that town. The blueprint explicitly says the platform pays the driver a base
rate **out of pocket** — meaning courier pay must be computed from *trip economics*, not
from *customer-facing price*.

**The good news:** the seam already exists. Your free-delivery promo path already models
"customer pays less than the courier earns, platform eats the difference":

```
deliveryFeeCourierAmount = base share + surcharge share   // courier made whole
deliveryFeePlatformAmount = -baseSplit.courierAmount + …  // goes NEGATIVE
promoCostJmd = baseSplit.courierAmount                    // marketing cost booked
```
— [engine.ts:276-293](packages/dash-pricing/src/engine.ts#L276)

Generalize that into a first-class **courier pay ladder** (`courier_base_pay_jmd` +
`courier_per_km_jmd` + `courier_min_pay_jmd`) computed independently of the customer
delivery fee, with the delta booked as `platform_delivery_subsidy_jmd`. This also makes
your unit economics legible — right now you cannot answer "what did we spend subsidizing
delivery in Spanish Town last week" from the data.

⚠️ But see **DEFECT A** below: the negative-platform-share case is currently clamped away
at capture, so today the *merchant* silently absorbs the promo cost. Fix that before you
generalize the pattern, or you will multiply the bug.

### GAP 4 — No small-order fee 🟡

You currently **hard-block** below the minimum:

```
code: "min_order_not_met"  → HTTP 400
```
— [customerOrderRoutes.ts](supabase/functions/delivery/customerOrderRoutes.ts), min resolved as
`max(market floor, merchant floor)` ([engine.ts:507](packages/dash-pricing/src/engine.ts#L507)).

The blueprint wants a **penalty fee instead of a wall**, which converts a lost order into
a profitable small one. Blocking is the more customer-hostile of the two and it silently
discards revenue.

**What's needed:** `small_order_fee_jmd` + `small_order_threshold_jmd` in the `customer`
rules namespace; a new `smallOrderFee` line in `PricingBreakdown`; a new
`orders.small_order_fee` column; and — easy to forget — it must be added to the
**platform GCT base** in [gct.ts:33](packages/dash-pricing/src/gct.ts#L33) and to the
platform's take in [dashMoneySplit.ts:60](supabase/functions/_shared/dashMoneySplit.ts#L60).
Recommend keeping the hard block as a *second, much lower* floor (say J$400) so J$50
orders still can't happen.

### GAP 5 — The feed card shows a different fee than checkout charges 🟠

Discovery selects the **legacy static column** `merchants.delivery_fee`:

```
.select("… avg_prep_time_mins, delivery_fee, min_order_amount, market_id")
…
deliveryFee: m.delivery_fee != null ? Number(m.delivery_fee) : null,
```
— [customerDiscoveryRoutes.ts:235](supabase/functions/delivery/customerDiscoveryRoutes.ts#L235)
and [:270](supabase/functions/delivery/customerDiscoveryRoutes.ts#L270)

Meanwhile checkout charges the engine's computed fee. These two numbers have no
enforced relationship. They can silently diverge right now.

The entire psychological premise of the new model is *"customer sees J$150 on the card,
feels like a deal, converts."* If the card says J$150 and checkout says J$400, you get
the worst of both: the trust damage of a bait-and-switch **and** none of the conversion
lift. This gap is cheap to fix and expensive to leave.

**What's needed:** the feed must render the tier-resolved base delivery fee from the
same resolver checkout uses (at zero distance), not a denormalized column. Either join
`merchant_tiers` in discovery, or maintain `merchants.delivery_fee` as a
trigger-maintained cache of the tier fee. Prefer the join; caches drift.

### GAP 6 — `search_boost` is decorative 🟠

Grep confirms `search_boost` appears only in the tier type, the admin write path, and
the client type. **No discovery query orders by it.** Discovery has no ranking clause at
all beyond the market filter.

The Dominant tier's headline promise — "we push you to the top of search" — is currently
not a thing the software does. You would be selling it. Either implement ranking
(`ORDER BY tier.search_boost DESC, rating DESC`) or remove it from the tier pitch.

Note the compliance angle: paid ranking placement generally needs disclosure ("Sponsored" /
"Promoted") in most markets. Build the label at the same time as the sort.

### GAP 7 — No merchant-facing tier selection or contract record 🟡

`pricing_tier_id` is admin-assigned only. There is no merchant self-serve plan chooser,
no record of *when* a merchant moved tiers, no contract/consent artifact, and no
effective-dating. The blueprint's "three fixed signup plans" implies merchants pick one
at onboarding and can change it.

**What's needed:** a `merchant_tier_assignments` history table (merchant_id, tier_id,
effective_from, effective_to, changed_by, agreed_at), plus a plan-selection step in
merchant onboarding. Orders already snapshot `tier_slug` and
`merchant_commission_rate` into `pricing_snapshot`, so historical orders stay correct
across tier changes — that part is already right.

### GAP 8 — Payout automation is manual 🟡

`payments.merchant_payouts` exists but is driven by admin CRUD in
[financeRoutes.ts](supabase/functions/delivery/admin/financeRoutes.ts). Stripe Connect
account onboarding exists ([stripeConnectRoutes.ts](supabase/functions/delivery/stripeConnectRoutes.ts))
but there is **no automated split transfer** — no `application_fee_amount`, no
`transfer_data`, no destination charges. The blueprint's step 4 ("payment gateway
initiates a split transfer") is not implemented.

Also note your live rail is **WiPay** (JMD), not Stripe — Stripe Connect appears to be
scaffolding. The split logic lives in the WiPay callback and is currently defective
(see DEFECT A). Decide which rail is real before building automation on top of it.

### GAP 9 — Client-side pricing mirror will drift 🟡

[apps/dash-customer/src/lib/orderPricing.ts](apps/dash-customer/src/lib/orderPricing.ts)
re-implements the total formula client-side ("Client totals must match server formula").
The *server* is properly single-sourced — `_shared/dashPricing.ts` is a 2-line re-export
of the `dash-pricing` package, so edge functions and the admin share one engine. The
customer app does not.

Every new line item (small-order fee, subsidy, inflation) must land in **both** places or
the cart preview stops matching the charge. Consider making the client render the
server's quote verbatim rather than recomputing.

### GAP 10 — Currency and magnitude 🟢 easy but do it deliberately

The blueprint is written in USD; your engine is JMD integers. Rough translation at
~J$155/USD, with sane rounding:

| blueprint | JMD equivalent | your current value |
|---|---|---|
| $0.99 base delivery | J$150 | J$400 |
| $2.99 base delivery | J$450 | — |
| $5.99 base delivery | J$900 | — |
| $0.75 / extra km | J$115 | J$60 |
| 10 km free radius | 10 km | 2 km |
| $12 min order | J$1,800 | J$800 |
| $2.50 small-order fee | J$400 | — (blocked) |
| 10% service fee | 10% | 15%→9% marginal |

Two things stand out. Your **included distance is 2 km, not 10 km** — on a Jamaican town
geography that is probably correct and the blueprint's 10 km is a US-suburb assumption;
do not copy it. And your **service fee is already higher and better-shaped** than the
blueprint's — keep yours.

### GAP 11 — The legacy Model A path is still live and semantically confusing 🟡

`pricing_v2_enabled` is `true` only for Spanish Town. Everywhere else, orders fall
through to the legacy branch, which uses `merchants.commission_rate` as a
**platform fee percentage** — not as a commission
([customerOrderRoutes.ts](supabase/functions/delivery/customerOrderRoutes.ts),
[platformFeeRate.ts](supabase/functions/delivery/platformFeeRate.ts)). The same column
name means two different things in two code paths. The 2026-08-23 migration tried to
untangle this by copying `commission_rate` into `service_fee_override`, but the legacy
reader still reads the original column.

Before this migration, decide: are you cutting over every market to v2, or maintaining
both? Maintaining both while adding tier fees + inflation + small-order fees means
building each feature twice. **Recommendation: finish the v2 cutover first**, delete the
legacy branch, then build the new model on one path.

---

## 3. Two live money defects to fix first

These exist today. They are survivable at 12–25% commission with J$400 delivery fees.
At 30% commission with deliberately below-cost delivery fees, they are not.

### DEFECT A — Model B orders settle through the Model A branch at capture 🔴

The WiPay capture callback loads the order with this select:

```ts
.select("merchant_id, courier_id, platform_fee, delivery_fee, tip")
```
— [payments/index.ts:197-202](supabase/functions/payments/index.ts#L197)

…and passes it to `computeDashCaptureSplit`, which branches on
`order.pricing_model === "v2"` ([dashMoneySplit.ts:31](supabase/functions/_shared/dashMoneySplit.ts#L31)).

`pricing_model` **is not in the select list.** Neither are `service_fee`,
`merchant_commission_amount`, `delivery_fee_platform_amount`,
`delivery_fee_courier_amount`, `processing_fee`, or `peak_pay_amount`.

So `isModelB()` returns `false` for every order, and every v2 order settles through the
legacy Model A formula:

- platform keeps only `platform_fee` — **merchant commission is never withheld**
- courier is credited the **full customer delivery fee**, not the 80% share
- merchant receivable is the residual, so the merchant absorbs both errors

The split is then written into `payments.transactions.net_amount` and dual-written into
the unified ledger, so the error propagates into accounting, not just a display.

**Fix is one line** (add the missing columns to the select), but verify the resulting
numbers against `pricing_snapshot` on existing v2 orders before backfilling anything —
and check whether any payouts were already made on the wrong figures.

### DEFECT B — Free-delivery promo cost is charged to the merchant 🟠

`computeDashCaptureSplit` clamps the platform delivery share at zero:

```ts
const deliveryPlatform = Math.max(0, Number(order.delivery_fee_platform_amount ?? 0));
```
— [dashMoneySplit.ts:52](supabase/functions/_shared/dashMoneySplit.ts#L52)

But the engine deliberately makes that value **negative** under a free-delivery promo —
that negative number *is* the platform's marketing cost
([engine.ts:290](packages/dash-pricing/src/engine.ts#L290)). Clamping it to zero doesn't
make the cost disappear; since merchant receivable is computed as
`gross − platformFee − courierPayable`, the courier still gets paid the full share and
the shortfall comes straight out of the merchant's line.

Separately, neither GCT component appears in `platformFee`, so `tax_platform_jmd` —
which is Roam's own tax liability — currently lands in the merchant residual too.

This is masked today because DEFECT A means the v2 branch never runs. Fixing A will
expose B. **Fix them together**, and add a test asserting
`merchantReceivable == discountedSubtotal − commission + taxFood` for the promo case.

This matters enormously for the new model, because GAP 3's courier-pay decoupling makes
"platform delivery share is negative" the **normal** case for Dominant-tier orders, not
a promo edge case.

---

## 4. Suggested migration sequence

Each phase is independently shippable and independently reversible. Do not start at
phase 3.

### Phase 0 — Stop the bleeding (before any new features)
1. Fix DEFECT A (select list) and DEFECT B (clamp + GCT attribution) together.
2. Add regression tests to `dashMoneySplit.test.ts` covering: v2 normal, v2 free-delivery,
   v2 with negative platform delivery share, legacy.
3. Reconcile: compare `pricing_snapshot` against `payments.transactions.money_split` for
   all existing v2 orders. Quantify any real exposure before deciding on corrections.
4. Fix GAP 5 (feed fee source) — cheap, and it's a trust issue that compounds.

### Phase 1 — Make tiers actually mean something
1. `merchant_tiers` gains `base_delivery_fee_jmd`, `menu_inflation_percent`,
   `search_boost` (already there — start reading it), and effective-dating.
2. `resolveDeliveryFee` learns the tier override, ordered tier → market → default.
   Add to `PricingInput` (tier is already passed in — pure engine change).
3. Implement `search_boost` in discovery ordering **with a "Promoted" label**.
4. Wire `default_delivery_radius_km` and `promo_eligible` — they're seeded and ignored.
5. Admin tier editor exposes the new fields; the simulator in `PricingHubPage` should
   show side-by-side tier comparison for the same basket.
6. Re-seed the tier ladder to the new commercial shape. Note the blueprint's ladder is
   materially more aggressive than yours (15/25/30 vs your 12/20/25) — that's a pricing
   decision, run it past the merchant pipeline before committing.

### Phase 2 — Courier pay decoupling
1. New `rider` rules: `courier_base_pay_jmd`, `courier_per_km_jmd`, `courier_min_pay_jmd`.
2. `buildOrderPricing` computes courier pay independently; books the delta as
   `platform_delivery_subsidy_jmd` in the breakdown and on the order.
3. `courier_delivery_share` becomes legacy — keep reading it for old orders, stop writing it.
4. Money split and the unified ledger learn the subsidy line.
5. Courier apps read the new field
   ([mapOrderToActiveDelivery.ts](apps/dash-courier/src/lib/mapOrderToActiveDelivery.ts),
   [mapOrderToSingleOffer.ts](apps/dash-courier/src/lib/mapOrderToSingleOffer.ts),
   [courierApi.ts:534](apps/dash-courier/src/lib/courierApi.ts#L534)).

**Do this before Phase 3.** Cheap delivery fees without decoupled courier pay = supply
collapse in the exact markets you're trying to grow.

### Phase 3 — Menu inflation
1. Schema: `in_store_price` + `marketplace_price`, backfilled equal, `price` kept as an
   alias during transition.
2. Decide and encode `commission_base: 'marketplace' | 'in_store'` explicitly.
3. Ingestion applies tier inflation on merchant menu writes; platform cap enforced.
4. Merchant dashboard shows both prices side by side, unambiguously labeled.
5. Every customer read path switches to `marketplace_price`. Audit for stragglers —
   discovery item search reads `price` directly today
   ([customerDiscoveryRoutes.ts:250](supabase/functions/delivery/customerDiscoveryRoutes.ts#L250)).
6. Merchant agreement language updated for the GCT exposure on the markup.

### Phase 4 — Small-order fee
Straightforward once the pattern from Phase 1–3 is established: new rules fields, new
breakdown line, new column, GCT platform base, money split, client mirror, admin form,
simulator scenario.

### Phase 5 — Retire Model A
Cut every market to `pricing_v2_enabled: true`, delete the legacy branch in
`customerOrderRoutes` and `dashMoneySplit`, retire `merchants.commission_rate` and
`merchants.delivery_fee`.

### Phase 6 — Payout automation
Only after the split math is proven correct against real settled orders. Pick the rail
(WiPay vs Stripe Connect) first.

---

## 5. Decisions you asked to be prompted on

You closed by asking for three numbers. Here they are with recommendations, plus the
ones you didn't ask about that matter more.

**Service fee default.** Keep what you have — marginal 15% → 9% above J$5,000, clamped
J$150–J$2,500. It is better than the blueprint's flat 10%: it protects small-basket
economics without punishing large orders. Do not flatten it.

**Long-distance threshold.** Keep 2 km included, not 10. Ten kilometers is a US-suburb
number; on Spanish Town / Kingston geography a 10 km free radius means most orders never
trigger distance pricing at all, and you eat the cost. Consider raising `per_extra_km_jmd`
from J$60 toward J$100–115 instead, and making *that* the tier-varying knob.

**Small-order threshold and fee.** J$1,500 threshold, J$400 fee, with a hard block
retained at J$400 subtotal. Replaces a J$800 wall with a fee, which converts orders you
currently reject.

**The ones that matter more, and that only you can answer:**

1. **Commission base under inflation** — marketplace price or in-store price? Determines
   whether merchants pay commission on the markup covering your commission. Business and
   reputational decision, not technical.
2. **Max inflation cap** — a platform ceiling on `menu_inflation_percent`. Without one,
   your marketplace's price perception is in each merchant's hands.
3. **Courier pay floor** — the actual JMD number a courier must clear on a 12 km run for
   supply to hold. Everything in Phase 2 is downstream of this number, and it's the one
   the blueprint hand-waves.
4. **Model A retirement date** — every phase costs roughly double while both paths live.
5. **Disclosure posture** — paid ranking labeling, and whether in-app prices are
   disclosed as differing from in-store. Some jurisdictions require the latter.

---

## 6. Files this migration touches

**Engine (single source of truth, shared server-side):**
- [packages/dash-pricing/src/engine.ts](packages/dash-pricing/src/engine.ts) — `buildOrderPricing`, fee resolvers, rules parse/serialize
- [packages/dash-pricing/src/types.ts](packages/dash-pricing/src/types.ts) — `MerchantTier`, `PricingInput`, `PricingBreakdown`, rules blobs
- [packages/dash-pricing/src/gct.ts](packages/dash-pricing/src/gct.ts) — tax base classification for every new fee
- [packages/dash-pricing/src/rulesBlob.ts](packages/dash-pricing/src/rulesBlob.ts) — party namespacing, validators, provenance
- [supabase/functions/_shared/dashPricing.ts](supabase/functions/_shared/dashPricing.ts) — re-export shim, no changes needed

**Server:**
- [supabase/functions/delivery/pricingResolver.ts](supabase/functions/delivery/pricingResolver.ts) — tier + market load, distance, engine call
- [supabase/functions/delivery/pricingLayers.ts](supabase/functions/delivery/pricingLayers.ts) — layer merge
- [supabase/functions/delivery/customerOrderRoutes.ts](supabase/functions/delivery/customerOrderRoutes.ts) — order placement, snapshot, min-order gate, legacy branch
- [supabase/functions/delivery/customerDiscoveryRoutes.ts](supabase/functions/delivery/customerDiscoveryRoutes.ts) — feed fee source, ranking, item prices
- [supabase/functions/delivery/admin/pricingRoutes.ts](supabase/functions/delivery/admin/pricingRoutes.ts) — tier CRUD, preview, backtest, reconciliation
- [supabase/functions/_shared/dashMoneySplit.ts](supabase/functions/_shared/dashMoneySplit.ts) — **defect A/B live here**
- [supabase/functions/payments/index.ts](supabase/functions/payments/index.ts#L197) — **defect A live here**

**Clients:**
- [apps/dash-customer/src/lib/orderPricing.ts](apps/dash-customer/src/lib/orderPricing.ts) — client mirror, must stay in sync
- [apps/dash-merchant/src/pages/MenuPage.tsx](apps/dash-merchant/src/pages/MenuPage.tsx) — dual-price editing
- [apps/dash-courier/src/lib/](apps/dash-courier/src/lib/) — earnings display
- [packages/dash-admin/src/pages/pricing/](packages/dash-admin/src/pages/pricing/) — hub, tier editor, party rule forms, simulator

**Schema:**
- [20260511140000_delivery_schema.sql](supabase/migrations/20260511140000_delivery_schema.sql) — base tables
- [20260823120000_dash_pricing_engine.sql](supabase/migrations/20260823120000_dash_pricing_engine.sql) — tiers, market profiles, snapshots, COD
- [20260829120000_pricing_hierarchy_layers.sql](supabase/migrations/20260829120000_pricing_hierarchy_layers.sql) — global/parish layers

---

## 7. Bottom line

The blueprint reads like a greenfield spec, but you are not greenfield — you have a
better fee engine than it describes, sitting on a three-layer geographic override system
it doesn't imagine. What you're missing is narrow and specific:

1. Tiers must set the customer's delivery fee, not just your commission. *(the whole idea)*
2. Menus need a two-price model. *(the subsidy)*
3. Courier pay must stop being a percentage of the customer's delivery fee. *(or supply dies)*
4. Small orders need a fee, not a wall. *(recovered revenue)*
5. The feed must show the fee checkout will actually charge. *(or the illusion is a lie)*

And two accounting defects need fixing before any of it, because the new model makes
both of them much worse.
