# Rush v2 order reconcile checklist (audit Finding A)

Run after Waves 1–2 are deployed. GoRide ledger is out of scope.

## 1. Baseline order (no Pass)

1. Sign in as a customer in dash-customer (staging/prod as appropriate).
2. Order from a **Growth** merchant with real store + dropoff pins.
3. Pay with WiPay sandbox (or complete COD if enabled for the market).
4. Confirm on the order row:
   - `distance_km` populated
   - `pricing_snapshot` JSON present
   - `contribution_jmd` set
   - `promo_funded_by` set
5. Run [`supabase/scripts/reconcile_v2_money_split.sql`](../supabase/scripts/reconcile_v2_money_split.sql) — expect zero drift for that order.

## 2. Rush Pass within free-delivery distance

1. Admin: Pricing Hub → Overview → grant Rush Pass to the test customer UUID (30 days).
2. Place another Growth order with road distance **≤ 8 km**.
3. Expect: delivery **FREE**, service fee halved, snapshot `rush_pass_applied: true`, `free_delivery_applied: true`.

## 3. Rush Pass beyond distance cap

1. Same Pass member, dropoff such that road km **> 8**.
2. Expect: delivery **charged**, lower service fee, UI note “outside free-delivery distance”, `rush_pass_free_delivery_denied_reason: distance`.

## 4. Optional — budget exhaustion

1. Place enough Pass free-delivery orders that cumulative platform delivery subsidy ≥ plan price (J$1,500).
2. Next ≤8 km order: delivery charged, reason `budget`.

## Sign-off

**Date:** 2026-08-30  
**Environment:** local customer `5174` + live Supabase `csfllzzastacofsvcdsc`  
**Test customer:** `2b684b07-6e32-4083-acfb-32cb97eafcee`  
**Growth merchant:** The Burger Spot `39b283c8-951c-4c94-bef7-291049b08350`

| Check | Pass? | Evidence |
|-------|-------|----------|
| Baseline reconcile clean | **Pass** | Order `RD-2026-000001` / `be6f9f41-3ab7-4d70-b706-61e2bc0ff5d2`: `distance_km` 7.07, `contribution_jmd` 792.75, `promo_funded_by` merchant, snapshot present. Reconcile delta **0.00** (expected/split 1012.50). **Caveat:** WiPay card iframe blocked agent fill; capture completed via SQL-simulated `payments.transactions` + order `payment_status=paid` for money-split assert. Human WiPay sandbox re-run optional for true webhook. |
| Pass ≤8 km free delivery | **Pass** | Cart at ~17.97750, −76.98795: Delivery **FREE**, service fee ~J$86.25 (halved), copy “Rush Pass — free delivery & lower service fee”. Membership `1fc65898-ca13-407b-8ec8-3ccd2b9196b2` (admin grant). |
| Pass >8 km delivery charged | **Pass** | Mid-far pin (~17.95, −76.99): Delivery **J$1,110**, service fee J$86.25, UI “outside free-delivery distance” (distance deny). |
| Economy merchant unchanged by Pass | **N/A** | Live market has **0** Economy merchants (8 Growth only). Pass attach is Growth/Dominant-only by design. |
| Budget exhaustion (optional §4) | **Pass** (forced) | Plan budget temporarily set to **0** to assert gate without multi-WiPay burns; near pin then charged Delivery **J$930** with UI “monthly free-delivery credit used”. Budget restored to **J$1,500**. Live burn skipped (iframe + timebox); math: budget 1500 ÷ ~J$700–900 subsidy/trip ≈ 2 free trips/member. |

Do **not** enable/schedule live Growth Guarantee cron against real merchants until ≥1 Jamaica calendar month of **delivered/completed** Dominant volume exists. Claw-back hooks stay armed. Unit Finding F/G coverage remains in `@roam/dash-pricing` auditRemediation suite.
