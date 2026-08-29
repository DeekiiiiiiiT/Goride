# GCT Engine — Implementation Audit

**Status:** Audit (2026-08-29) + **verification pass after implementation (2026-08-29)** — see §0.5.
**Goal:** Build a single GCT calculation engine in Roam Dominion (under Accounting) that every
other Roam product consumes, starting with Roam Rush (customer / partner / courier). Remove the
legacy GCT settings currently living in Dominion → Global Settings → General.

> **Current position:** Phases 1–3 are built and the architecture is sound. Two live money bugs
> remain — the 16.5% over-collection is staged but not cut over, and the POS silent-zero-GCT path
> is still open. Jump to [§0.5 Verification pass](#05-verification-pass--post-implementation).

**Companion docs:** [JAMAICA_GCT_GUIDE.md](./JAMAICA_GCT_GUIDE.md) (the law),
[dash-gct-centralization-audit.md](./dash-gct-centralization-audit.md) (prior pass, partially
implemented), [dash-gct-fee-taxability.md](./dash-gct-fee-taxability.md) (fee policy, approved).

---

## 0. Executive summary

You are not starting from zero. A previous centralization pass already landed the useful half of
this: a `gct_registered` flag on merchants, a multi-supply split (food GCT vs platform-fee GCT),
`tax_food_jmd` / `tax_platform_jmd` order columns, a COD trial balance, and separate GCT lines on
checkout and the POS receipt. That work is sound and should be kept.

Three things are wrong, and one of them is costing money right now.

| # | Finding | Severity | Status after implementation |
|---|---|---|---|
| **F1** | **The platform is charging the wrong rate.** Rush uses **16.5%**; the statutory rate has been **15%** since 1 April 2020. Roam Rush has been over-collecting 1.5 points on every taxable supply. | 🔴 Critical | ⏸ **Staged, not cut over.** Engine seeded at 15%, but `db_authoritative = false` means live charging still reads KV. See V1 |
| **F2** | **The platform charges two different rates for the same tax.** Rush/Dominion use 16.5%; Fleet reports, Freight landed cost and Enterprise duty use a hardcoded 15%. Same statute, two answers, no shared source. | 🔴 Critical | ✅ Largely fixed — single kernel; Fleet fabricated line removed; Freight takes the engine rate. Residue in V4/V7 |
| **F3** | **Merchants were auto-marked GCT-registered without a TRN.** The backfill migration set `gct_registered = true` where `operational_status = 'active'` OR `verification_status = 'approved'` — status, not registration. Any merchant caught by that who is not actually registered is collecting tax unlawfully (s. 56(5), up to $5M), and the amount is recoverable from whoever issued the invoice (s. 49). | 🔴 Critical | ✅ Structurally fixed — `gct_entities_trn_when_registered` CHECK constraint. **Ops review of existing rows still required** |
| **F4** | **There is no GCT liability ledger and no remittance output.** Nothing aggregates output tax, nothing records input tax, nothing produces a monthly figure you could put on a Form 4A. A grep for remittance/liability reporting returns nothing. | 🟠 High | ✅ Built — output ledger wired, period close, remittance page. Input tax is manual-entry only (V8) |
| **F5** | **The rate is a single mutable number with no effective dates.** s. 4(2) rate changes are gazetted with an effective date. Today, changing the number in Dominion silently restates how every future quote prices with no record of what applied when. | 🟠 High | ✅ Fixed — `accounting.gct_rates` is effective-dated with a range CHECK |
| **F6** | **Only one supply class exists.** No zero-rated, no exempt, no 10% tourism, no 25% telephone. The moment Rush adds groceries or pharmacy — or Rides/Haul plug in — the flat model is legally wrong. | 🟠 High | ✅ Fixed — `gct_supply_classes` with `taxable` / `credit_allowed` flags |
| **F7** | **Passenger transport is exempt and nothing models that.** 3rd Sch. Pt II ¶2 exempts transportation of people within Jamaica. Rides/Haul/courier passenger legs must not be taxed; Rush parcel delivery must be. That also makes Roam a partly-exempt trader with an input-tax apportionment obligation. | 🟠 High | 🟡 Partial — Rides classifier wired into `buildQuote`; Haul classifier written but never imported (V6). Apportionment still unmodelled |

**The correction in F1 must not be done by editing the number in Dominion.** `16.5` is hardcoded
or persisted in at least ten places, including inside JSON blobs in the database. Changing the KV
value alone leaves most of them untouched. Inventory in §2.

---

## 0.5 Verification pass — post-implementation

**Verified 2026-08-29** against the shipped code. Working tree clean; all changes committed.
`npx vitest run packages/gct-core packages/dash-pricing` → **63 tests passing** (5 files).

### Built and verified ✅

| Area | Evidence |
|---|---|
| **Kernel** | `packages/gct-core/src` — `rates.ts`, `supplyClasses.ts`, `taxPoint.ts`, `orderGct.ts`, `inputTax.ts`, `types.ts`, `index.ts`, plus 10 unit tests |
| **Deno twin** | [`_shared/gctCore.ts`](../supabase/functions/_shared/gctCore.ts) is a **2-line re-export** of `packages/gct-core/src/index.ts`. This beats the CI drift-check recommended in §5.2 — there is only one source, so drift is impossible by construction |
| **Schema** | [`20260830280000_accounting_gct_engine.sql`](../supabase/migrations/20260830280000_accounting_gct_engine.sql) — `gct_supply_classes`, `gct_rates` (effective-dated + range CHECK), `gct_entities` (TRN CHECK when registered), `gct_periods` (`open`/`closed`/`filed`), `gct_output_tax` (`tax_point`, `reversal_of_id`), `gct_input_tax` (`credit_restriction`), `gct_engine_flags`. RLS enabled on all |
| **Legacy data strip** | [`…280100_gct_strip_legacy_tax_rate_blobs.sql`](../supabase/migrations/20260830280100_gct_strip_legacy_tax_rate_blobs.sql) — removes `tax_rate_percent` from `pricing_rules`, `pricing_rule_layers`, `party_pricing_rules`; resets backfilled POS overrides |
| **Dominion UI** | `apps/admin/src/components/admin/gct/` — `GctEnginePage`, `GctRatesPage`, `GctEntitiesPage`, `GctLedgerPage`, `GctRemittancePage`. Nav registered in `ACCOUNTING_CHILDREN` (line 135-139) **and** `SHARED_PLATFORM_PAGES` (line 235-239); routed in `AdminPortal` (line 362-393) |
| **API** | `supabase/functions/gct-admin` — 13 routes: `/rates` (GET/POST), `/entities` (GET/PATCH), `/threshold-watchlist`, `/ledger`, `/periods`, `/periods/ensure-month`, `/periods/:id/close`, `/input-tax`, `/resolver-flags`, `/config`, `/health` |
| **Output ledger wired** | `recordOrderOutputTax` in `courierCashLedger.ts`; `reverseOrderOutputTax` in `admin/orderRoutes.ts`, `customerOrderRoutes.ts`, `delivery/index.ts` |
| **Period lock honoured** | [`gctLedger.ts:35`](../supabase/functions/_shared/gctLedger.ts#L35) — returns null rather than attaching to a `closed`/`filed` period |
| **Duplicate collapse** | Both `apps/*/src/lib/order-pricing.ts` are now 3-line re-exports of `@roam/merchant-ops/order-pricing` |
| **Client fallback neutralised** | `GCT_RATE_FALLBACK_PERCENT = Number.NaN` with an explicit fail-visible branch at [orderPricing.ts:190](../apps/dash-customer/src/lib/orderPricing.ts#L190) — "do not invent a statutory rate on the client" |
| **Resolver literal removed** | `pricingResolver.ts` uncovered-address path now loads the config instead of hardcoding 16.5 |
| **Fleet report** | Fabricated `revenue × 0.15` "GCT Liabilities" line **removed**, replaced with a pointer to Dominion Accounting → GCT remittance |
| **Freight** | `landedCost` accepts an engine rate via `LandedCostInput.gctRate` |
| **Rides** | `classifyRideFareGct` imported into `rides/fare/buildQuote.ts` |
| **Defaults corrected** | `platform-settings/defaults.ts` and `_fleet-server/platform_settings.ts` now seed **15** |

### Outstanding

| # | Item | Severity | Location |
|---|---|---|---|
| **V1** | **The over-collection is still live.** `gct_engine_flags.resolver` is `{"prefer_db": true, "kv_fallback": true, "db_authoritative": false}`. In that state [`loadGlobalGctConfig`](../supabase/functions/_shared/gctRate.ts#L168) returns **`kv.ratePercent`** for actual charging — the DB rate is read only to log `gct_rate_source_disagreement`. Production KV holds whatever was last saved in the Global Settings card (16.5 as at the audit). Deliberate and correctly commented, pending D1 sign-off — but **F1 is not closed until the flag flips** | 🔴 | `gct_engine_flags`, `gctRate.ts:168-177` |
| **V2** | **POS silent-zero GCT — the original bug, still open.** [`PosRegisterPage.tsx:46`](../apps/rush-command/src/pages/restaurant-mgmt/PosRegisterPage.tsx#L46) passes `taxRateProp ?? 0` into [`merchant-ops/order-pricing.ts:33`](../packages/merchant-ops/src/order-pricing.ts#L33), which has **no guard**: `Math.max(0, Number(input.taxRatePercent))`. The server twin `_shared/orderPricing.ts:42` throws; the client mirror does not, despite its header claiming it mirrors the server. A GCT-registered merchant whose prop is missing rings up a sale with **$0 GCT on the receipt** — under-collection, s. 56(4). Deduplicating the two files removed the copy, not the defect | 🔴 | `PosRegisterPage.tsx:46`, `merchant-ops/order-pricing.ts:33` |
| **V3** | **Legacy Global Settings GCT card not deleted.** Still at `GlobalPlatformSettingsPage.tsx:211-264`, with `TaxSettings` (types.ts:106), `DEFAULT_TAX_SETTINGS` (defaults.ts:140) and the `tax` block (`_fleet-server/platform_settings.ts:140`). Defensible while KV is authoritative — but there are now **two editable rate fields and the deprecated one is the one that charges**. Remove at cutover, not before | 🟠 | §6 deletion list |
| **V4** | **`partyRulesUtils.ts` re-injects 16.5.** Lines 109 and 159 use `tax_rate_percent ?? 16.5`. The migration stripped that key from the DB blobs, so this fallback now **resurrects the stripped field with the wrong number** in the admin seed/diff path | 🟠 | `packages/dash-admin/src/pages/pricing/marketRules/partyRulesUtils.ts:109,159` |
| **V5** | `DEFAULTS.taxRatePercent = 15` still consumed at `engine.ts:528` as a silent fallback for `flat.tax_rate_percent`. §6 called for deletion — `buildOrderPricing` already throws without a rate, so the default only masks bugs | 🟡 | `packages/dash-pricing/src/engine.ts:528,586` |
| **V6** | `rides/haulage/gctClassify.ts` exports `classifyHaulageGoodsSupply` / `classifyHaulPassengerLegIfAny` — **never imported anywhere**. Dead code, and F7 stays partial for Haul | 🟡 | `supabase/functions/rides/haulage/gctClassify.ts` |
| **V7** | `freight/landedCost.ts:10` keeps `GCT_RATE = 0.15` as the default when no engine rate is supplied. Confirm every caller passes `gctRate`, or the constant silently re-introduces a second source | 🟡 | `supabase/functions/freight/landedCost.ts:10` |
| **V8** | **Input tax is manual-entry only** (`POST /input-tax`). Nothing feeds it from the vendor/expense data Accounting already holds, so `net_payable_jmd` overstates the liability until it does | 🟡 | `gct-admin/index.ts:370` |
| **V9** | Supplies whose tax point lands in a `closed`/`filed` period are written with **`period_id = NULL`**. Correct — but there is no orphan sweep or report, so they silently never reach a return | 🟡 | `_shared/gctLedger.ts:35` |
| **V10** | `engine.test.ts` fixtures still assert against `16.5`. Cosmetic, but the suite now encodes a rate that is not the statutory one | 🟡 | `packages/dash-pricing/src/engine.test.ts` |

### Recommended order

1. **V2 and V4 now** — both are independent of the rate decision. V2 under-collects; V4 quietly undoes the migration you just ran.
2. **V5, V6, V7, V10** — cheap cleanup, any time.
3. **D1 sign-off**, then the cutover runbook: flip `db_authoritative`, verify no `gct_rate_source_disagreement` warnings, then **V3** (delete the card and `TaxSettings`).
4. **V8, V9** before the first real filing, or the first Form 4A figure will be wrong in both directions.

---

## 1. What exists today — the current GCT surface

> **Sections 1–11 describe the pre-implementation state and are kept as the record of why the
> engine was built.** For what shipped and what is still open, see [§0.5](#05-verification-pass--post-implementation).

### 1.1 Configuration

| Layer | Location | Notes |
|---|---|---|
| Storage | KV `platform:settings:global` → `.tax` | `{ gctStandardRatePercent, gctEnabled }` |
| Type | [packages/platform-settings/src/types.ts:106](../packages/platform-settings/src/types.ts#L106) | `TaxSettings` |
| Default | [packages/platform-settings/src/defaults.ts:139](../packages/platform-settings/src/defaults.ts#L139) | `16.5`, enabled |
| Admin UI | [packages/admin-core/src/settings/GlobalPlatformSettingsPage.tsx:211-264](../packages/admin-core/src/settings/GlobalPlatformSettingsPage.tsx#L211-L264) | The card in the screenshot — **this is what gets deleted** |
| Server read | [supabase/functions/_shared/gctRate.ts](../supabase/functions/_shared/gctRate.ts) | `loadGlobalGctConfig()`, per-request KV read |
| Segment resolution | [supabase/functions/_fleet-server/platform_settings.ts](../supabase/functions/_fleet-server/platform_settings.ts) | `X-Roam-Settings-Segment` header → KV key |

### 1.2 Calculation — six implementations

| # | File | Role | Rate source | Health |
|---|---|---|---|---|
| 1 | [supabase/functions/_shared/gctRate.ts](../supabase/functions/_shared/gctRate.ts) | Rate **resolver** (server) — merchant registration + POS override + platform rate | KV, fallback `16.5` | ✅ Best-shaped piece. This is the seed of the engine. |
| 2 | [packages/dash-pricing/src/gct.ts](../packages/dash-pricing/src/gct.ts) | Multi-supply **split** — food vs platform base | Caller-supplied | ✅ Correct shape; no I/O; pure |
| 3 | [packages/dash-pricing/src/engine.ts:264-413](../packages/dash-pricing/src/engine.ts#L264) | Order pricing; calls `resolveOrderGct` | Caller; **throws** if absent (line 269) | ✅ Fail-closed — good |
| 4 | [supabase/functions/_shared/orderPricing.ts:42](../supabase/functions/_shared/orderPricing.ts#L42) | POS / merchant order pricing (server) | Caller; **throws** if absent | ✅ Fail-closed |
| 5 | [apps/dash-merchant/src/lib/order-pricing.ts](../apps/dash-merchant/src/lib/order-pricing.ts) and [apps/rush-command/src/lib/order-pricing.ts](../apps/rush-command/src/lib/order-pricing.ts) | Client mirrors of #4 — **byte-identical duplicates of each other** | Caller, no default | ⚠️ Silent 0% if caller passes 0; two copies of one file |
| 6 | [apps/dash-customer/src/lib/orderPricing.ts](../apps/dash-customer/src/lib/orderPricing.ts) | Customer cart estimate | Server quote, else `GCT_RATE_FALLBACK_PERCENT = 16.5` | ⚠️ Hardcoded client fallback |

Plus three **non-Rush** computations that never touch any of the above:

| File | What | Rate |
|---|---|---|
| [supabase/functions/freight/landedCost.ts:9](../supabase/functions/freight/landedCost.ts#L9) | Import GCT on CIF + duty + SCF + env levy (correctly follows s. 8(1) base) | `GCT_RATE = 0.15` hardcoded |
| [apps/enterprise/.../DutyPanel.tsx](../apps/enterprise/src/app/freight/os/packageDuty/DutyPanel.tsx) | Displays "GCT 15%" | Label hardcoded |
| [apps/fleet/src/utils/ReportGenerator.ts:90-113](../apps/fleet/src/utils/ReportGenerator.ts#L90) and [apps/admin/src/utils/ReportGenerator.ts](../apps/admin/src/utils/ReportGenerator.ts) | "GCT Liabilities" line on a financial report | `const gctRate = 0.15` with comment `// Example 15%` |

> The Fleet report labels a figure **"GCT Liabilities"** and computes it as `totalRevenue × 0.15`
> with an inline comment calling it an example. That is a made-up number on a document that reads
> like a tax figure. Either wire it to the engine or take the line off the report.

### 1.3 Data model

| Object | Where | Notes |
|---|---|---|
| `delivery.merchants.gct_registered` | [20260823150000](../supabase/migrations/20260823150000_merchant_gct_registered.sql) | boolean, default false, **backfilled from status — see F3** |
| `delivery.merchants.pos_tax_rate_percent` | [20260707120000](../supabase/migrations/20260707120000_restaurant_management.sql#L119) | numeric 0–100; per-merchant POS override; backfilled to `16.5` |
| `delivery.merchants.tax_id` | pre-existing | TRN. Not validated, not required for `gct_registered` |
| `delivery.orders.tax_food_jmd` / `tax_platform_jmd` | [20260827100000](../supabase/migrations/20260827100000_pricing_commission_rollout.sql) | ✅ Split is persisted per order |
| `tax_rate_percent` inside pricing-rules JSON | [20260823120000](../supabase/migrations/20260823120000_dash_pricing_engine.sql#L196), [20260828100000](../supabase/migrations/20260828100000_party_rules_namespaces.sql#L8), [20260829120000](../supabase/migrations/20260829120000_pricing_hierarchy_layers.sql#L84) | **Per-market copies of the statutory rate, persisted as `16.5` in DB rows.** The Pricing Hub form already labels it "Legacy tax rate in blob (%) — prefer Dominion GCT settings" |

**Nothing exists for:** rate history, supply classes, exempt/zero-rated items, input tax, tax
periods, remittance, or a GCT liability ledger.

### 1.4 UI touchpoints that already do the right thing

- Checkout shows **two separate GCT lines** (food, platform fees) plus a combined fallback —
  [CheckoutPage.tsx:651-664](../apps/dash-customer/src/pages/CheckoutPage.tsx#L651). Satisfies s. 22(b).
- POS cart shows `Tax (exempt)` when the merchant is unregistered —
  [PosActiveCart.tsx:236](../apps/rush-command/src/components/restaurant-mgmt/pos/PosActiveCart.tsx#L236).
- Merchant detail has a GCT registration toggle with a TRN warning —
  [MerchantDetailPage.tsx:867-895](../packages/dash-admin/src/pages/merchants/MerchantDetailPage.tsx#L867).
- Pricing Hub simulator has a GCT-registered switch and shows the food/platform split.

Keep all of it. It's the consumer layer the engine will feed.

---

## 2. F1/F2 — every place the rate is written down

Fixing the rate means touching all of these, not just the Dominion field.

### Hardcoded / defaulted `16.5`

| Location | Kind |
|---|---|
| [packages/platform-settings/src/defaults.ts:140](../packages/platform-settings/src/defaults.ts#L140) | `DEFAULT_TAX_SETTINGS` |
| [supabase/functions/_shared/gctRate.ts:6](../supabase/functions/_shared/gctRate.ts#L6) | `GCT_STANDARD_RATE_FALLBACK` |
| [supabase/functions/_shared/orderPricing.ts:35](../supabase/functions/_shared/orderPricing.ts#L35) | `GCT_STANDARD_RATE_FALLBACK` (second copy) |
| [apps/dash-customer/src/lib/orderPricing.ts:6](../apps/dash-customer/src/lib/orderPricing.ts#L6) | `GCT_RATE_FALLBACK_PERCENT` |
| [packages/dash-pricing/src/engine.ts:586](../packages/dash-pricing/src/engine.ts#L586) | `DEFAULTS.taxRatePercent` |
| [supabase/functions/delivery/pricingResolver.ts:334](../supabase/functions/delivery/pricingResolver.ts#L334) | **Literal `taxRatePercent: 16.5`** on the uncovered-address path |
| [GlobalPlatformSettingsPage.tsx:243, 250](../packages/admin-core/src/settings/GlobalPlatformSettingsPage.tsx#L243) | UI default + parse fallback |
| Migrations `20260823120000`, `20260828100000`, `20260829120000` | **Persisted into `pricing_rules` JSON in the database** |
| Migration `20260823150000` | **Persisted into `merchants.pos_tax_rate_percent`** |
| Live KV `platform:settings:global` | Current production value (per screenshot) |

### Hardcoded `0.15`

| Location |
|---|
| [supabase/functions/freight/landedCost.ts:9](../supabase/functions/freight/landedCost.ts#L9) |
| [apps/fleet/src/utils/ReportGenerator.ts:91](../apps/fleet/src/utils/ReportGenerator.ts#L91) |
| [apps/admin/src/utils/ReportGenerator.ts](../apps/admin/src/utils/ReportGenerator.ts) |
| [apps/enterprise/.../DutyPanel.tsx](../apps/enterprise/src/app/freight/os/packageDuty/DutyPanel.tsx), `mockData.ts` |

> **The DB rows are the trap.** Market pricing rules and merchant POS rates hold their own copies
> of `16.5` as *data*. A layered resolve (`resolvePricingLayers`) merges Default → Parish → Town
> blobs, so a stale `tax_rate_percent` in any layer can win over the Dominion value. Correcting the
> rate requires a data migration, not just a config edit.

---

## 3. F3 — the registration backfill is a legal exposure

```sql
UPDATE delivery.merchants SET gct_registered = true
WHERE gct_registered = false
  AND ( (tax_id IS NOT NULL AND trim(tax_id) <> '')
     OR operational_status = 'active'
     OR verification_status = 'approved' );
```

The first condition is defensible. The second and third are not — being *active* or *approved on
the platform* says nothing about whether a merchant is registered with TAJ. Under s. 27 the
threshold is J$15M of supplies over 12 months; plenty of small restaurants sit below it.

Consequences if a non-registered merchant is flagged true:

- The merchant collects GCT it may not lawfully collect — **s. 56(5)**, fine up to $5,000,000.
- The tax shown on the receipt is recoverable from the issuer regardless — **s. 49**.
- On COD orders Roam holds and remits that tax (per the locked policy), so **Roam is in the chain**.

**Action before anything else is built:** run a report of merchants where `gct_registered = true`
AND `tax_id` is null or blank, and treat that list as an ops task, not an engineering one.

```sql
SELECT id, business_name, operational_status, verification_status, tax_id
FROM delivery.merchants
WHERE gct_registered = true AND (tax_id IS NULL OR trim(tax_id) = '');
```

---

## 4. What a real GCT engine needs that today's code has none of

| Capability | Why (statute) | Today |
|---|---|---|
| **Effective-dated rates** | s. 4(2) — Minister amends by order, gazetted with a date | Single mutable number |
| **Supply classification** | s. 24/25, 1st Sch Pt II, 3rd Sch — zero-rated ≠ exempt ≠ standard; 10% tourism; 25% telephone | One rate for everything |
| **Tax point capture** | s. 6(1) — earliest of invoice / payment / delivery, decides which period the tax lands in | Implicit in order timestamps |
| **Output tax ledger** | s. 33, s. 36 — you must be able to produce the period's figure and support it for 6 years | `tax_food_jmd`/`tax_platform_jmd` on orders only; nothing aggregates |
| **Input tax capture** | s. 20(2) — tax payable is output *less* input | Nothing |
| **Reg-14 credit restrictions** | Entertainment, motor vehicles, capital goods ≤/> $100k, 5%/$100k de-minimis | Nothing |
| **Partly-exempt apportionment** | Exempt output (passenger transport) blocks input credit | Nothing |
| **Period close / lock** | Filed periods must not silently restate | Nothing |
| **Remittance report** | Form 4A shape; monthly, last working day of following month | Nothing |
| **Entity registration register** | s. 3(1) — GCT is per-entity liability, not platform-wide | One boolean on merchants; nothing for couriers or Roam's own entities |
| **Threshold monitoring** | s. 27 — J$15M rolling 12 months triggers a duty to register in 21 days | Nothing (you already hold the sales data) |
| **Credit-note tax reversal** | s. 49 — cancelled supply must reverse the tax, not delete the record | Not modelled |

---

## 5. Proposed architecture

### 5.1 Shape

```
                      ┌───────────────────────────────────────────┐
                      │  DOMINION (apps/admin) → Accounting        │
                      │  ┌─────────────────────────────────────┐  │
                      │  │ GCT Engine                          │  │
                      │  │  · Rates & effective dates          │  │
                      │  │  · Supply classes                   │  │
                      │  │  · Registered entities (TRN)        │  │
                      │  │  · Liability ledger & period close  │  │
                      │  │  · Remittance report (Form 4A)      │  │
                      │  │  · Calculator / simulator           │  │
                      │  └─────────────────────────────────────┘  │
                      └───────────────────┬───────────────────────┘
                                          │  writes
                                 ┌────────▼────────┐
                                 │  accounting.*   │   Postgres (source of truth)
                                 │  gct_* tables   │
                                 └────────┬────────┘
                                          │  reads
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
      ┌───────▼────────┐         ┌────────▼────────┐        ┌─────────▼────────┐
      │ @roam/gct-core │         │  GET /gct/config │        │ POST /gct/quote  │
      │ pure kernel    │         │  (cached, all    │        │ (server-side     │
      │ no I/O         │         │   apps)          │        │  authoritative)  │
      └───────┬────────┘         └────────┬────────┘        └─────────┬────────┘
              │                           │                           │
   ┌──────────┴──────┬────────────┬───────┴──────┬──────────┬─────────┴───┐
   │ dash-customer   │ dash-merch │ rush-command │ dash-    │ freight /   │
   │ (Rush customer) │ (partner)  │ (partner POS)│ courier  │ fleet /     │
   │                 │            │              │          │ enterprise  │
   └─────────────────┴────────────┴──────────────┴──────────┴─────────────┘
```

### 5.2 Runtime constraint you must design around

The repo runs **two runtimes**: Vite/React packages (`packages/*`, `apps/*`) and Deno edge
functions (`supabase/functions/*`). There is already a mirroring pattern —
`packages/dash-pricing` has a Deno twin at `supabase/functions/_shared/dashPricing.ts`, and
`GCT_STANDARD_RATE_FALLBACK` exists in two files as a result. That duplication is exactly how the
rate drifted.

Pick one and commit:

- **A. Single source, generated mirror** — author `packages/gct-core`, and generate the
  `_shared/gctCore.ts` Deno copy in the build with a CI check that fails if it drifts. Recommended.
- **B. Deno-first** — author in `supabase/functions/_shared/`, have the React packages import from
  there via path alias. Fewer moving parts; awkward for the Vite build.
- **C. Keep hand-mirroring.** This is what produced F1/F2. Don't.

### 5.3 Data model sketch

```sql
-- Rates, effective-dated. Never UPDATE a row; insert a new one.
accounting.gct_rates (
  id, supply_class, rate_percent, effective_from date, effective_to date null,
  authority text,          -- 's.4(1)(a)' / '1st Sch Pt V' / 'L.N. …'
  created_by, created_at
)

-- Supply classes: standard | tourism | telephone | zero_rated | exempt | out_of_scope
accounting.gct_supply_classes (code, label, taxable boolean, credit_allowed boolean, statute_ref)

-- Who is registered, and when — merchants, couriers, Roam's own entities
accounting.gct_entities (
  id, entity_type,          -- merchant | courier | partner | roam_entity
  entity_id, trn, registered boolean,
  registered_from date, registered_to date null,
  verified_by, verified_at, evidence_url
)

-- Output tax ledger — one row per taxable supply
accounting.gct_output_tax (
  id, tax_point timestamptz,     -- s.6, NOT created_at
  source_doc_type, source_doc_id,
  supplier_entity_id, recipient_ref,
  supply_class, base_amount_jmd, rate_percent, tax_amount_jmd,
  period_id, reversal_of_id null, created_at
)

-- Input tax the platform pays
accounting.gct_input_tax (
  id, tax_point, supplier_trn, base_amount_jmd, rate_percent, tax_amount_jmd,
  credit_restriction,       -- none | entertainment | motor_vehicle | capital_24m | apportioned
  creditable_amount_jmd, period_id, evidence_url
)

-- Monthly periods, lockable
accounting.gct_periods (
  id, period_start, period_end, status,   -- open | closed | filed
  output_total_jmd, input_total_jmd, net_payable_jmd,
  filed_at, filed_by, form_ref
)
```

Key properties: **`gct_rates` is append-only** (F5 solved), **`tax_point` is separate from
`created_at`** (period allocation survives late writes), **reversals are rows, not deletes**
(s. 49 / s. 36), and **periods lock** so a filed month cannot silently restate.

### 5.4 Dominion UI — new nav under Accounting

`ACCOUNTING_CHILDREN` in
[adminNavConfig.ts:131](../apps/admin/src/components/admin/adminNavConfig.ts#L131) currently holds
two entries. Add a GCT group:

```ts
export const ACCOUNTING_CHILDREN: NavChild[] = [
  { id: 'gct-engine',        label: 'GCT engine',          icon: Scale },
  { id: 'gct-rates',         label: 'Rates & classes',     icon: Percent },
  { id: 'gct-entities',      label: 'GCT registrations',   icon: BadgeCheck },
  { id: 'gct-ledger',        label: 'GCT ledger',          icon: BookOpen },
  { id: 'gct-remittance',    label: 'Remittance & filing', icon: Receipt },
  { id: 'vendor-database',   label: 'Vendors & categories', icon: Store },
  { id: 'pending-vendor-requests', label: 'Pending vendor requests', icon: Inbox },
];
```

Each new id must also be added to `SHARED_PLATFORM_PAGES` (line 184) or it will 404 for every
role, and routed in
[AdminPortal.tsx](../apps/admin/src/components/admin/AdminPortal.tsx) next to the existing
accounting imports at line 29-30. `AdminLayout` picks the children up automatically via
`filterChildren(ACCOUNTING_CHILDREN)` at line 158.

Page contents:

- **GCT engine** — the effective rate right now, per class; which apps last read it and when;
  health checks (any app still on a hardcoded rate, any merchant registered without a TRN, any
  unclosed period).
- **Rates & classes** — effective-dated rate table with an "add future rate" action. Never an
  in-place edit.
- **GCT registrations** — merchants, couriers, Roam entities; TRN, evidence, effective dates; plus
  the **threshold watchlist** (rolling 12-month supplies vs J$15M, flagging anyone approaching or
  over).
- **GCT ledger** — output and input tax rows, filterable by period/class/entity, drill-through to
  the source order.
- **Remittance & filing** — per-period output − input = net payable, in Form 4A shape; close and
  lock; export.

### 5.5 What the other apps consume

| Consumer | Reads | Notes |
|---|---|---|
| `dash-customer` | `POST /gct/quote` via the existing pricing quote | Already does this; delete the 16.5 client fallback, show "rate unavailable" instead of guessing |
| `dash-merchant`, `rush-command` | `GET /gct/config` for the merchant's own rate + class | Collapse the two identical `order-pricing.ts` files into one shared module |
| `dash-courier` | Nothing today | Needs courier `gct_registered` if company-couriers are ever registered — their delivery share is a supply to Roam |
| `freight` / `enterprise` | Import GCT at the s. 8 base | Same rate, **different base** — CIF + duty + SCF + env levy. The engine must expose the rate; the base stays freight's |
| `fleet` / `admin` reports | Rate + real ledger figures | Stop computing `revenue × 0.15` and calling it a liability |
| `rides` / `haul` | Exempt classification | Passenger transport is exempt — the engine should return `exempt`, not a rate |

---

## 6. What gets deleted

| Item | File | Action | Status |
|---|---|---|---|
| GCT settings card | [GlobalPlatformSettingsPage.tsx:211-264](../packages/admin-core/src/settings/GlobalPlatformSettingsPage.tsx#L211) | Delete the panel and the now-unused `Receipt` import (line 12) | ⏸ **V3** — blocked until `db_authoritative` flips |
| `TaxSettings` interface | [platform-settings/src/types.ts:105-111](../packages/platform-settings/src/types.ts#L105) | Delete; drop `tax?` from `GlobalPlatformSettings` (line 119) | ⏸ **V3** |
| `DEFAULT_TAX_SETTINGS` | [platform-settings/src/defaults.ts:139-142](../packages/platform-settings/src/defaults.ts#L139) | Delete; remove `tax` from `DEFAULT_GLOBAL_SETTINGS` (line 149) | ⏸ **V3** (value corrected to 15 in the interim) |
| Server default `tax` block | [_fleet-server/platform_settings.ts:139](../supabase/functions/_fleet-server/platform_settings.ts#L139) | Delete | ⏸ **V3** (value corrected to 15) |
| KV read path | [_shared/gctRate.ts](../supabase/functions/_shared/gctRate.ts) | **Rewrite, don't delete** — keep the function signatures, swap the KV read for the `accounting.gct_*` read. Every caller keeps working. | ✅ Rewritten as a dual-read; public API unchanged |
| Duplicate fallback constant | [_shared/orderPricing.ts:35](../supabase/functions/_shared/orderPricing.ts#L35) | Delete; import from the kernel | ✅ Now `SEED_STANDARD_RATE_PERCENT` from the kernel |
| Client fallback constant | [dash-customer/src/lib/orderPricing.ts:6](../apps/dash-customer/src/lib/orderPricing.ts#L6) | Delete; fail visibly instead | ✅ `Number.NaN` + explicit fail-visible branch |
| Hardcoded resolver rate | [pricingResolver.ts:334](../supabase/functions/delivery/pricingResolver.ts#L334) | Replace with the resolved config | ✅ |
| `DEFAULTS.taxRatePercent` | [engine.ts:586](../packages/dash-pricing/src/engine.ts#L586) | Delete — `buildOrderPricing` already throws without a rate (line 269), so the default only masks bugs | 🟡 **V5** — set to 15, not deleted; still consumed at line 528 |
| Per-market `tax_rate_percent` | pricing-rules JSON blobs + Pricing Hub field | Deprecate and strip in a migration. A single-country statutory tax has no business being a per-market override. | 🟡 DB stripped ✅, but **V4** re-injects `?? 16.5` in the admin path |
| Freight/Fleet/Enterprise `0.15` | §2 table | Point at the engine | ✅ Fleet line removed; Freight takes an engine rate — **V7** default constant remains |

> **Order matters.** Don't delete the KV path before the DB path reads. The live KV value is the
> only thing pricing every Rush order today.

---

## 7. Phasing

**Progress:** Phase 0 ⏸ (D1 outstanding) · Phase 1 ✅ · Phase 2 ✅ · Phase 3 🟡 (V2, V3, V4) ·
Phase 4 🟡 (output ledger done; V8, V9 open) · Phase 5 🟡 (Fleet/Freight/Rides done; Haul V6)

### Phase 0 — Stop the bleeding (do first, independently of the engine)

1. Confirm the correct rate with your accountant. Public sources say **15% since 1 April 2020**;
   the printed Act says 16.5%. Get this in writing before changing a customer-facing number.
2. Run the unregistered-merchant query in §3; work the list with ops.
3. Decide the treatment of past over-collection at 16.5% — forward-only correction versus
   restatement. **This is an accountant's call, not a code decision.**

### Phase 1 — Kernel and schema

4. Create `packages/gct-core` (or the Deno-first variant) with: rate resolution by class and date,
   supply classification, tax-point derivation, and the existing `resolveOrderGct` split moved in.
   Pure functions, full unit tests, zero I/O.
5. Land the `accounting.gct_*` tables. Seed rates: 15% standard, 10% tourism, 25% telephone, 0%
   zero-rated, exempt class — each with `effective_from` and a statute reference.
6. Migrate `merchants.gct_registered` / `tax_id` into `accounting.gct_entities` with effective
   dates. Keep the column as a generated view or sync for now so nothing breaks.

### Phase 2 — Dominion UI

7. Build the five Accounting pages (§5.4). Rates page first — it is what unblocks the rate fix.
8. Nav + routing + `SHARED_PLATFORM_PAGES` registration.

### Phase 3 — Cut Rush over

9. Rewrite `_shared/gctRate.ts` internals to read `accounting.gct_*`. Callers unchanged.
10. Data migration: strip `tax_rate_percent` from pricing-rules blobs at every layer; reset
    `merchants.pos_tax_rate_percent` for merchants that should follow the standard rate.
11. Delete the client fallbacks; collapse the duplicate `order-pricing.ts` files.
12. Delete the Global Settings GCT card and `TaxSettings`.
13. Verify the checkout, POS receipt and simulator all show the new rate and the food/platform split.

### Phase 4 — Ledger and remittance

14. Write `gct_output_tax` rows at order finalisation (tax point from s. 6, not `created_at`).
15. Reversal rows on cancellation/refund.
16. Period close + Form 4A-shaped report.
17. Input tax capture — start with the vendor/expense data Accounting already holds.

### Phase 5 — Other verticals

18. Freight/Enterprise read the rate, keep the s. 8 base.
19. Fleet report reads real ledger figures or drops the line.
20. Rides/Haul classified exempt; introduce input-tax apportionment once both exempt and taxable
    output exist.

---

## 8. Decisions you need to make

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Is the rate 15% or 16.5%?** | Accountant confirms. Everything downstream depends on this and it changes customer prices. |
| D2 | **Past over-collection at 16.5%** — correct forward only, or restate? | Forward-only, documented, with an accountant's note. Restating filed periods is their call. |
| D3 | **Is Roam Rush itself GCT-registered, and under which entity/TRN?** | Determines whether platform-fee GCT should be charged at all. The engine needs Roam's own entity row, not just merchants'. |
| D4 | **Passenger transport exemption for Rides/Haul** | Model it as `exempt` from day one, even before those apps connect — it also drives the apportionment obligation. See §16 of the GCT guide. |
| D5 | **Delivery/courier fee classification** | Moving goods is taxable; moving people is exempt. A platform doing both needs the split modelled per line. **Worth a written TAJ ruling (s. 18(5)) before scaling** — there is no published guidance on ride-hailing or delivery platforms. |
| D6 | **Per-market `tax_rate_percent` — keep or kill?** | Kill. Single-country statutory tax. |
| D7 | **Effective-dated rates or single value?** | Effective-dated. Cost is small now; retrofitting after a rate change is painful. |
| D8 | **Kernel location (§5.2 A/B/C)** | A — single source with a generated Deno mirror and a CI drift check. |
| D9 | **Merchant threshold monitoring** — advisory or enforcing? | Advisory first (watchlist + alert). Auto-flipping `gct_registered` on turnover would be making a legal determination on the merchant's behalf. |

---

## 9. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Rate corrected in Dominion only; DB blobs still 16.5 | Silent partial fix, two rates in production simultaneously | Data migration in the same change; add a health check that scans for any rate source disagreeing with the engine |
| Unregistered merchants collecting GCT | s. 56(5) up to $5M; s. 49 recovery; Roam in the chain on COD | §3 query, ops review, require TRN + evidence before `registered = true` |
| Deleting KV config before the DB path is live | Every Rush order prices with no rate; `buildOrderPricing` throws → checkout down | Strict ordering in Phase 3; dual-read window before the delete |
| Client `?? 16.5` fallbacks surviving the cutover | Cart shows one number, server charges another | Delete the constants; render "unavailable" and block checkout rather than guess |
| No period lock | Filed month silently restates when an old order is edited | `gct_periods.status` + reversal-row-only corrections |
| Tax point derived from `created_at` | Supplies land in the wrong period at month boundaries | Explicit `tax_point` per s. 6(1) |
| Fleet report's fabricated "GCT Liabilities" | A tax-shaped number on a document someone may rely on | Wire to the ledger or remove the line |

---

## 10. What I would explicitly avoid

- **Don't just change 16.5 → 15 in the Dominion field and call it done.** Ten other places hold the
  number, two of them in the database. You would end up with both rates live at once — worse than
  today, because it would look fixed.
- **Don't delete `_shared/gctRate.ts`.** Its interface is the seam every Rush caller already uses.
  Keep the signatures, swap the internals.
- **Don't build the ledger before the rate and registration are right.** A ledger built on a wrong
  rate and an unsound registration flag produces authoritative-looking wrong numbers, which is
  worse than no numbers.
- **Don't auto-register merchants from turnover.** Watchlist and notify; the registration decision
  is theirs.
- **Don't let per-market pricing rules keep a tax rate.** Every layer that can override the
  statutory rate is a future divergence.

---

## 11. Open questions for the accountant

1. Standard rate in force for the periods already traded — 15% or 16.5%?
2. Is Roam Rush a registered taxpayer? Under which entity and TRN?
3. Is the platform service fee and Roam's delivery-fee share correctly standard-rated? (Policy is
   locked in [dash-gct-fee-taxability.md](./dash-gct-fee-taxability.md) but predates the rate
   question.)
4. On COD orders Roam holds and remits the merchant's food GCT. Is that arrangement documented in
   the merchant agreement, and does Roam hold the s. 58-style separate-account discipline?
5. Courier delivery share — supply by the courier to Roam, or Roam's own supply to the customer?
   Determines whether courier registration status matters.
6. Parcel delivery vs passenger transport (3rd Sch. Pt II ¶2) on a single platform — is a written
   ruling warranted before scale?

---

## 12. Cutover runbook — flipping `db_authoritative`

Do not run this until **D1** is answered in writing.

1. **Confirm the seeded rate.** Dominion → Accounting → Rates & classes: standard class shows the
   confirmed rate with an `effective_from` and a statute reference.
2. **Clear V2 and V4 first.** Both are independent of the rate and both are wrong in production today.
3. **Check for disagreement noise.** Search edge logs for `gct_rate_source_disagreement`. Every
   entry shows `dbRatePercent` vs `kvRatePercent`; confirm the delta is only the intended change and
   not a stale market blob.
4. **Align KV to the engine** before flipping, so the transition is a no-op rather than a jump:
   set the Global Settings rate to the confirmed value and save.
5. **Flip the flag** — `POST /gct-admin/resolver-flags` with `db_authoritative: true`.
6. **Verify on a live quote:** `resolveOrderGctRates` returns `fromDb: true`,
   `sourceDisagreement: false`. Check a registered merchant, an unregistered merchant ($0 food GCT),
   and an uncovered-address quote.
7. **Verify the surfaces:** dash-customer checkout (both GCT lines), POS receipt, Pricing Hub
   simulator four-way split, COD trial balance.
8. **Then delete V3** — the Global Settings card, `TaxSettings`, `DEFAULT_TAX_SETTINGS`, and the
   server `tax` block. Only after the flag has been true through a full trading day.
9. **Close the first period** in Dominion → Remittance & filing and reconcile the total against
   `orders.tax_food_jmd + tax_platform_jmd` for the same window before anything is filed.

**Rollback:** set `db_authoritative: false`. Charging returns to KV immediately; ledger rows already
written keep their recorded `rate_percent`, which is why the rate is stored per row rather than
looked up at read time.

---

*Original audit 2026-08-29 (no code changed). Verification pass 2026-08-29 against the shipped
implementation — §0.5, §6 status column, §7 progress line and §12 added. Line references are as at
the verification pass.*
