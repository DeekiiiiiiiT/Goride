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
| Finding L accumulator | **Pass** | Shared `loadRushPassSubsidyUsed` — no top-level `promo_cost_jmd` select; fail-closed on query error; `delivery` redeployed. |

Do **not** enable/schedule live Growth Guarantee cron against real merchants until ≥1 Jamaica calendar month of **delivered/completed** Dominant volume exists. Claw-back hooks stay armed.
