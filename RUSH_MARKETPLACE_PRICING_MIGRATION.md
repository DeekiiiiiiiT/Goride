# Rush Marketplace Pricing — Migration Audit & Implementation Review

> **SUPERSEDED (2026-08-30):** Target architecture is now
> [RUSH_PRICING_STRATEGY_REVIEW.md](RUSH_PRICING_STRATEGY_REVIEW.md) —
> platform-wide delivery fee, merchant-owned inflation, tiers as demand goods only.
> Migration `20260830300000_rush_pricing_architecture.sql`. Keep this file as
> historical audit trail only.

**Scope:** Roam Rush food-delivery pricing (`delivery` schema, `dash-*` apps)
**Original audit:** 2026-08-28
**Implementation:** commit `515a88ea` (50 files, +2,464/−418)
**Follow-up fixes:** commit `63c4d928` (12 files), plus the COD fix in the working tree
**Status:** Historical — see architecture rebuild doc for current model.

**Legacy retirement (2026-08-29):** Market-wide `delivery.base_fee_jmd`, Model A /
`pricing_v2_enabled` toggle, and courier `%` delivery share are **removed**.
**(Superseded 2026-08-30):** tier `base_delivery_fee_jmd` also removed — delivery base
is global `customer.delivery.base_jmd`.

---

## 0. Verification summary

| # | Item | Status |
|---|---|---|
| GAP 1 | Tier controls customer-facing delivery fee | ✅ Closed |
| GAP 2 | Menu inflation (dual price model) | ✅ Closed |
| GAP 3 | Courier pay decoupled from delivery fee | ✅ Closed |
| GAP 4 | Small-order fee instead of hard block | ✅ Closed |
| GAP 5 | Feed card fee matches checkout | ✅ Closed — feed, search **and detail page** |
| GAP 6 | `search_boost` drives ranking | ✅ Closed (with "Promoted" labels) |
| GAP 7 | Merchant tier selection + contract history | ✅ Closed |
| GAP 8 | Payout automation | ⏸️ Deferred (out of scope) |
| GAP 9 | Client pricing mirror kept in sync | ✅ Closed |
| GAP 10 | Currency / magnitude translated to JMD | ✅ Closed |
| GAP 11 | Model A retired | ✅ Closed |
| DEFECT A | v2 orders settling through Model A branch | ✅ Fixed |
| DEFECT B | Promo/subsidy cost charged to merchant | ✅ Fixed (verified numerically) |

**Second-pass items (raised in review 1, all now closed in `63c4d928`):**

| Item | Raised | Status |
|---|---|---|
| Duplicate `};` breaking the admin build | review 1 | ✅ Fixed and committed |
| `processingFeeTip` charged to merchant | review 1 | ✅ Fixed — split uses `courier_tip_net` |
| `peak_pay_amount` charged to merchant | review 1 | ✅ Fixed — peak now reduces platform take |
| Merchant detail page showed legacy static fee | review 1 | ✅ Fixed — tier joined, fee resolved |
| `commission_base` dead knob | review 1 | ✅ Removed entirely (code + migration) |
| Stale `rulesBlob` test assertion | review 1 | ✅ Rewritten to assert parse behaviour |
| Migration sorted before applied migrations | review 1 | ✅ Renamed to `20260830240000` |
| COD split missing the small-order fee | review 2 | ✅ Fixed — 24/24 sweep, zero drift |
| Settled-order reconciliation query | review 2 | ✅ Added as a read-only SQL script |
| Subsidy-by-tier cost report | review 2 | ✅ Added as a read-only SQL script |

**Test / typecheck state:**

| Check | Result |
|---|---|
| `dash-pricing` unit tests | **53 passed, 0 failed** (+1 COD below-threshold) |
| `dashMoneySplit` Deno tests | **7 passed** (was 5 — two leak regressions added) |
| `dash-courier` tests | 29 passed |
| `dash-customer` tests | 99 passed |
| `deno check` edge graph | 411 errors — pre-existing baseline, unchanged |
| root `tsc --noEmit` | 10,063 errors — pre-existing baseline, not a usable signal |

**On the two baselines.** Neither is a regression indicator, and both predate this work.
The edge graph moved 410 → 411 with an identical per-file distribution
(`courierConsumerRoutes` 116 → 114, `marketRoutes` 38, `merchantInventoryRoutes` 29, …);
the hits that mention new field names are all instances of the pre-existing
Supabase-client-collapses-to-`never` pattern in `courierConsumerRoutes`, not type errors
in the new logic. The root `tsc` config lacks `allowImportingTsExtensions` and Deno
types, so most of its 10k errors are `TS5097`/`Cannot find name 'Deno'` noise. Zero of
them are in `PricingHubPage.tsx` — the syntax error is gone. The one real-looking hit,
`partyRulesUtils.ts(210,5): 'default_tier_slug' does not exist in type
'PricingRulesPayload'`, traces via `git log -L` to commit `b8a8ee10`, i.e. it predates
the marketplace work.

> **Correction to review 1.** That review reported "dash-admin typecheck: clean". The
> command it relied on was `ls packages/dash-admin/tsconfig.json && npx tsc -p …`; the
> package has no `tsconfig.json`, so the `&&` short-circuited and `tsc` never ran. The
> conclusion happened to be right — the syntax error was real and is now fixed, confirmed
> by its absence from the root typecheck — but it was not verified at the time.

---

## 1. What was implemented

### GAP 1 — Tier-driven delivery fee ✅

The blueprint's core mechanism now exists end to end.

- `merchant_tiers.base_delivery_fee_jmd` + `menu_inflation_percent`
  ([migration](supabase/migrations/20260830240000_rush_marketplace_pricing.sql))
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

### GAP 5 — Feed fee source ✅

All three customer surfaces now resolve the real tier fee through the shared engine, so
the number on the card is the number checkout charges:

- Home feed joins the tier and calls `resolveDeliveryFee(marketRules.delivery, null, tierBase)`
  ([index.ts:211](supabase/functions/delivery/index.ts#L211))
- Search does the same, and correctly widened its window to 40 rows before sorting and
  slicing to 20 — so boost ranking isn't confined to an arbitrary page
  ([customerDiscoveryRoutes.ts:251](supabase/functions/delivery/customerDiscoveryRoutes.ts#L251))
- Restaurant detail joins the tier, resolves the fee in the same `Promise.all` as the
  menu/hours load, and returns an `enrichedMerchant` with `delivery_fee` overridden plus
  `search_boost` / `promoted` / `tier_slug`
  ([index.ts:312-355](supabase/functions/delivery/index.ts#L312))

The legacy static `merchants.delivery_fee` column is now overridden on every read path
that a customer sees.

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


### Split hardening (second pass) ✅ verified

`63c4d928` went further than the review asked. `computeDashCaptureSplit` now computes the
merchant's cut **directly** rather than as a residual, which was the longer-term
recommendation:

```ts
merchantReceivable = discountedSubtotal − merchantCommission   // when subtotal present
                   = gross − platformFee − courierPayable      // fallback
```
— [dashMoneySplit.ts:84-92](supabase/functions/_shared/dashMoneySplit.ts#L84)

Both leaks are gone with it. `courierPayable` now uses `courier_tip_net` (new
`courierTipEarnings` helper, also adopted by the courier payout aggregation at
[courierConsumerRoutes.ts:153](supabase/functions/delivery/courierConsumerRoutes.ts#L153)),
and `peak_pay_amount` is subtracted from `platformFee` — correctly treated as a
platform-funded cost, the same way the delivery subsidy is.

The capture callback selects the extra columns the new logic needs (`courier_tip_net`,
`subtotal`, `discount`) — [payments/index.ts:200](supabase/functions/payments/index.ts#L200).

I re-ran the real engine into the real split across four scenarios rather than trusting
the tests. Merchant cut is exact and the three-way split still reconciles to the capture
with zero drift — which was the thing worth checking, since computing one leg directly
could easily have unbalanced the ledger:

| Scenario | Platform | Courier | Merchant | Expected merchant | Sum vs capture |
|---|---|---|---|---|---|
| Dominant 12 km, tip, card | 2,396.40 | 1,687.50 | 2,800.00 | 2,800.00 | **0.00** |
| Dominant 12 km + peak J$300 | 2,096.40 | 1,987.50 | 2,800.00 | 2,800.00 | **0.00** |
| Economy 3 km, cash | 1,771.93 | 490.00 | 2,125.00 | 2,125.00 | **0.00** |
| Growth small order (J$900) | 1,120.42 | 665.50 | 675.00 | 675.00 | **0.00** |

Note row 2: peak pay moves J$300 from platform to courier and leaves the merchant
untouched. That is the fix working.

Five regression tests now guard this — including the invariant the review asked for
("Dominant subsidy + tip + peak: merchant == food − commission").

---

### COD small-order fee ✅ fixed, verified

The last open item is closed. `smallOrderFee` was added to `CodTrialBalanceInput` and to
`platformDueJmd` ([codBalance.ts:56-61](packages/dash-pricing/src/codBalance.ts#L56)),
and `computeCodLedgerAmounts` now passes `order.small_order_fee` through
([courierCashLedger.ts:203](supabase/functions/delivery/courierCashLedger.ts#L203)). Both
COD call sites load the order with `select("*")`, so the column arrives without a further
select change.

Rather than re-run the one failing case, I swept the real engine into the real COD balance
across **3 tiers × 4 basket sizes × 2 distances (24 combinations)**, spanning
above/below the small-order threshold and subsidised/unsubsidised delivery:

```
24/24  drift 0.00   merchantDue == food − commission   assertCodTrialBalance OK
```

Sample rows:

| Tier | Subtotal | Small-order fee | Subsidy | Total | Drift | Merchant |
|---|---|---|---|---|---|---|
| dominant | 900 | 400 | 460 | 2,439.25 | **0.00** | 630 / 630 |
| growth | 1,400 | 400 | 160 | 3,391.65 | **0.00** | 1,050 / 1,050 |
| economy | 4,000 | 0 | 0 | 6,906.85 | **0.00** | 3,400 / 3,400 |
| dominant | 450 | 400 | 200 | 1,315.00 | **0.00** | 315 / 315 |

The regression test added at
[codBalance.test.ts](packages/dash-pricing/src/codBalance.test.ts) covers a
below-threshold basket, which is the branch that had no coverage before.

Card and COD splits now agree on all four fee treatments: signed delivery share, GCT to
platform, small-order fee to platform, courier paid tip **net**.

---

## 2. Ops tooling added

Two read-only SQL scripts landed alongside the fix, covering follow-up steps 2 and 3 from
the previous review.

**[reconcile_v2_money_split.sql](supabase/scripts/reconcile_v2_money_split.sql)** — flags
any settled v2 card order whose recorded merchant receivable drifted from
`food − commission` by more than 2¢, reading
`payments.transactions.provider_data->'money_split'` with a fallback to `net_amount`
(which is the same figure at insert time, so the fallback is consistent). This is the
backfill check for orders settled under the old leaky logic. Run it before any corrective
payouts.

**[subsidy_by_market_tier.sql](supabase/scripts/subsidy_by_market_tier.sql)** — sums
`platform_delivery_subsidy_jmd` by market and tier, with average distance. It reads
`pricing_snapshot->>'tier_slug'` first and falls back to the merchant's *current* tier,
which is the right precedence: the snapshot preserves the tier actually charged, so
historical rows stay correct across tier changes.

I verified the schema assumptions in both rather than just reading them:
`delivery.orders` genuinely has no `market_id` (it lives on `delivery.merchants`, as the
scripts' comments note), and `payments.transactions` has the `net_amount`, `provider_data`
and `amount` columns they select.

One reading note on the subsidy script: it filters `platform_delivery_subsidy_jmd > 0`, so
`order_count` means *subsidised* orders, not all orders. That is the right shape for a
cost report, but it means you cannot derive "what share of orders are subsidised" from
this output alone — add a second unfiltered count if you want that ratio.

---

## 3. Remaining watch items

### Courier distance pay starts at km 0 🟢

Unchanged from the last review, and not a defect. The customer's distance charge starts
after `included_km` (2 km) while the courier's distance pay bills from km 0 — on the 12 km
example, 12 × J$80 out versus 10 × J$60 in. The subsidy therefore widens with every
kilometre, on top of the tier discount.

This looks deliberate (couriers do drive the first 2 km), but it means long trips to
Dominant-tier merchants are your most expensive orders. `platform_delivery_subsidy_jmd` is
recorded on every order row now, so grouping it by market and tier against real delivered
distances will tell you whether Dominant is safe to roll out broadly.

### GAP 8 — payout automation ⏸️

Still deferred, and now fully unblocked. `payments.merchant_payouts` remains admin-driven,
and Stripe Connect is scaffolding while WiPay is the live rail. The precondition the
original audit set — "only after the split math is proven correct against real settled
orders" — is now met for both the card and COD paths. Pick the rail before building on it.

### Trivia

`backfillCashLedgerForOrder` ([courierCashLedger.ts:221](supabase/functions/delivery/courierCashLedger.ts#L221))
is exported but has no callers anywhere in the repo. It predates this work and is
harmless — noted only so it isn't mistaken for a wired-up ops path if you go looking for
one during the reconciliation run.

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
- [20260830240000_rush_marketplace_pricing.sql](supabase/migrations/20260830240000_rush_marketplace_pricing.sql) — tier fees, dual prices, ladder + small-order columns, Model B forcing, tier reseed

---

## 5. Bottom line

The migration is done, and nothing is outstanding. Every gap from the original audit and
every item from both follow-up reviews is closed. The parts that handle money were
verified by running the real engine into the real split across 28 scenarios rather than by
reading the code or trusting the new tests.

The three load-bearing mechanisms — tier-driven delivery fees, menu inflation, courier pay
decoupling — are implemented properly, with guardrails the blueprint never mentioned:
inflation cap, two-floor order minimum, Promoted labels, tier assignment history.

The thing that makes this durable rather than merely correct-today is the change to
`merchantReceivable`. It is now a **computed** quantity — `discountedSubtotal − commission`
— instead of a residual. Three separate defects (the subsidy clamp, the tip processing
fee, peak pay) were all the same bug wearing different clothes: the merchant's leg was
where the arithmetic landed, so any platform cost that the customer hadn't funded silently
came out of it. Moving the merchant off the residual eliminated the whole class, not three
instances of it. Card and COD splits now agree on all four fee treatments, and both
reconcile to the collected total with zero drift.

The last fix carries the lesson worth keeping: a new customer-facing fee has to land in
**four** places — the customer total, the platform GCT base, the card split, and the COD
split. The small-order fee reached three of them, and only an assertion that fails loudly
caught the fourth. Keep that assertion, and add a below-threshold case whenever a new fee
appears.

Two things to run before widening the rollout, both now scripted: reconcile settled orders
against the invariant, and check the subsidy-by-tier numbers against real delivered
distances. Then payout automation, on a split that is provably correct and balanced.
