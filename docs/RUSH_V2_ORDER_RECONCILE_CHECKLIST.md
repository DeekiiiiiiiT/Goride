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
5. Run [`supabase/scripts/reconcile_v2_money_split.sql`](../scripts/reconcile_v2_money_split.sql) — expect zero drift for that order.

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

| Check | Pass? |
|-------|-------|
| Baseline reconcile clean | |
| Pass ≤8 km free delivery | |
| Pass >8 km delivery charged | |
| Economy merchant unchanged by Pass | |

Do **not** run Growth Guarantee cron against live merchants until Finding F/G tests are green (already in `@roam/dash-pricing` auditRemediation suite).
