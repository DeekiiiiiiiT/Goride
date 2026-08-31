# Rush v2 order reconcile checklist (audit Finding A + L)

Run after Waves 1–2 are deployed. GoRide ledger is out of scope.

## 1. Baseline order (no Pass)

1. Sign in as a customer in dash-customer (staging/prod as appropriate).
2. Order from a **Growth** merchant with real store + dropoff pins.
3. Pay with WiPay sandbox (or demo pay while `WIPAY_DEMO` is on).
4. Confirm on the order row:
   - `distance_km` populated
   - `pricing_snapshot` JSON present
   - `contribution_jmd` set
   - `promo_funded_by` set
5. Run [`supabase/scripts/reconcile_v2_money_split.sql`](../supabase/scripts/reconcile_v2_money_split.sql) — expect zero drift for that order.

## 2. Rush Pass within free-delivery distance

1. Admin: Pricing Hub → Overview → grant Rush Pass to the test customer UUID (30 days).
2. Place another Growth order with road distance **≤ 8 km** (and unused budget).
3. Expect: delivery **FREE**, service fee halved, snapshot `rush_pass_applied: true`, `free_delivery_applied: true`.

## 3. Rush Pass beyond distance cap

1. Same Pass member, dropoff such that road km **>** plan `max_free_delivery_km` (default 8).
2. Expect: delivery **charged**, lower service fee, UI “outside free-delivery distance”, `rush_pass_free_delivery_denied_reason: distance`.

## 4. Budget exhaustion (required to close Finding L)

1. Keep plan `monthly_subsidy_budget_jmd` at the **real** value (J$1,500). Do **not** force budget=0.
2. Place Pass free-delivery orders until cumulative `platform_delivery_subsidy_jmd` for the membership ≥ budget.
3. Next ≤8 km order: delivery charged, reason `budget`, snapshot `rush_pass_subsidy_used_jmd` reflecting prior spend.

Schema guard: [`supabase/scripts/assert_rush_pass_subsidy_select_columns.sql`](../supabase/scripts/assert_rush_pass_subsidy_select_columns.sql).

## Sign-off

**Date:** 2026-08-30  
**Environment:** local customer `5174` + live Supabase `csfllzzastacofsvcdsc`  
**Test customer:** `2b684b07-6e32-4083-acfb-32cb97eafcee`  
**Growth merchant:** The Burger Spot `39b283c8-951c-4c94-bef7-291049b08350`  
**Pass membership:** `1fc65898-ca13-407b-8ec8-3ccd2b9196b2`

| Check | Pass? | Evidence |
|-------|-------|----------|
| Baseline reconcile clean | **Pass** | `RD-2026-000001`: `distance_km` 7.07, `contribution_jmd` 792.75, reconcile delta **0.00**. |
| Pass ≤8 km free delivery | **Pass** | Cart/UI free delivery + halved service fee (membership admin grant). |
| Pass distance deny (persisted) | **Pass** | `RD-2026-000007` paid: `deny=distance`, `delivery_fee=930`, `free_del=false`. (Smoke used temp `max_free_delivery_km=5` so 7.07 km exceeded the cap; plan restored to **8**.) |
| Economy merchant unchanged by Pass | **N/A** | 0 Economy merchants live. |
| Budget exhaustion (real budget) | **Pass** | After Finding L fix: cart showed “monthly free-delivery credit used” with prior used ≈ J$2,520. Persisted `RD-2026-000006` paid: `deny=budget`, `used_snap=2520`, `delivery_fee=930`, `free_del=false`. **Do not** treat forced `budget=0` as valid proof. |
| Finding L accumulator | **Pass** | Shared `loadRushPassSubsidyUsed` → `delivery.sum_rush_pass_subsidy_used` RPC (Finding R); fail-closed; `delivery` redeployed 2026-08-31. |

Do **not** re-enable Growth Guarantee in the live profile (`growth_guarantee.enabled`) or run
`workflow_dispatch` → `growth_guarantee` against real merchants until ≥1 Jamaica calendar month of
**delivered/completed** Dominant volume exists. The scheduled GG cron is removed (Finding P);
Pass renew stays on the daily schedule. Claw-back hooks stay armed.

## 5. Settlement proof — delivered / completed (Finding O)

Pricing at place-time is proven above. Settlement and Growth Guarantee still need one order that
reaches a terminal success status.

### Engineering prep (2026-08-31) — ready for PO/QA

| Prep | Status |
|------|--------|
| Finding R subsidy RPCs live + `delivery` redeployed | **Done** |
| Finding T insert-then-deactivate profile writes shipped | **Done** |
| Lifecycle script | [`roam-rush-order-lifecycle-smoke-test.md`](roam-rush-order-lifecycle-smoke-test.md) |
| Reconcile script | [`reconcile_v2_money_split.sql`](../supabase/scripts/reconcile_v2_money_split.sql) |
| Live `delivered`/`completed` count before this run | **0** |

### PO/QA steps

1. Place a **new** paid Growth (or Dominant) order with real pins (`WIPAY_DEMO` ok — note capture method).
2. Advance through: `accepted` → `preparing` → `ready` → `assigned` → `picked_up` → `in_transit` → **`delivered`**
   (merchant + courier apps, or admin status updates following `ORDER_STATUS_TRANSITIONS`).
3. Prefer customer review → **`completed`** (or admin force-complete).
4. Re-run [`supabase/scripts/reconcile_v2_money_split.sql`](../supabase/scripts/reconcile_v2_money_split.sql).
5. Record: order id / `RD-…` code, final status, capture method (real WiPay webhook vs demo/SQL-sim).
6. Optional: one Pass order with road km **>** live `max_free_delivery_km` (8) while doing this —
   persists genuine beyond-cap evidence (not a temporary plan change).

Do **not** un-cancel historical rows or invent `delivered` via raw SQL — that skips
`handleOrderDelivered` (GCT / COD ledger) and does not close Finding O.

| Check | Pass? | Evidence |
|-------|-------|----------|
| Engineering prep (R/T deploy + scripts) | **Pass** | 2026-08-31 closeout |
| Order reached `delivered` / `completed` | **Pass** | **`RD-2026-000010`** / `033d7cd1-73a9-47b7-83bb-e62334dc06c9` Island Grill → **`delivered`** via full UI path |
| Reconcile clean after delivery | **Pass** | money-split **delta 0.00**; merchant receivable 900; fee 510; `contribution_jmd` 535; capture J$2,002.16 |
| Capture note (webhook vs demo) | **Pass** | **WIPAY_DEMO** capture on place |

**Smoke notes (2026-08-31, proper Island Grill UI):** Customer place+pay → Partner accept/prepare/ready → Courier go-online (fixed `delivery.delivery_courier_upsert_presence`) → accept → pickup → in_transit → delivered. Playwright + real sessions. Earlier `RD-2026-000009` cancelled mid-courier by accident; `RD-2026-000008` Burger Spot was imperfect (SQL status). Island Grill map pin restored after smoke. GG left disabled.
