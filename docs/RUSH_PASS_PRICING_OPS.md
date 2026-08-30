# Rush Pass pricing ops

## Sell gate (Finding A)

**Do not market or push Rush Pass publicly** until
[RUSH_V2_ORDER_RECONCILE_CHECKLIST.md](./RUSH_V2_ORDER_RECONCILE_CHECKLIST.md) checks **§1–3 are green**
(baseline reconcile, Pass ≤8 km free, Pass >8 km charged). §4 (budget exhaustion) is preferred but
**not** a marketing blocker once 1–3 pass.

Internal admin grants / test accounts are fine before the gate. No public CTA push, deals, or
campaigns that sell Pass until the checklist is signed.

Pricing Hub shows a sell-gate banner on the Rush Pass panel until ops remove it after sign-off.

## WiPay demo pay (until merchant is live)

WiPay hosted checkout is **not** ready for real sandbox cards on this account. While
`WIPAY_ENV` is sandbox (default), **`WIPAY_DEMO` defaults on**: Place Order / Pass subscribe
complete paid immediately through the same capture path as a webhook — no WiPay redirect.

- Turn off demo and use real WiPay: set secret `WIPAY_DEMO=0` and configure live/sandbox credentials.
- Live/production (`WIPAY_ENV=live`) never uses demo pay.

## Rule

Do **not** change the live Pass price until there is meaningful volume, then change it only with a human approval using Pricing Hub numbers.

Suggested gate: **≥50 Pass-paid orders in the last 30 days** (or your own threshold), plus review of:

- Pass subscription revenue (30d)
- Pass cost = delivery subsidy + estimated service-fee discount (30d)
- Break-even free-delivery trips per member ≈ `price / avg_cost_per_pass_order`

## Where to look

Pricing Hub overview cards + **Rush Pass plan** editor:

- `price_jmd`, `max_free_delivery_km`, `monthly_subsidy_budget_jmd`, `service_fee_multiplier`
- Calculator line: “At last 30d avg subsidy X, J$Y funds ~N trips/member”
- Save is rejected if km or monthly budget ≤ 0
- Save warns (does not block) if proposed price &lt; trailing 30d avg cost per active member
- Every save writes `pricing_change_log` (`scope: rush_pass_plan`)

Customer Account → Rush Pass always reads price from the active plan — no hard-coded J$1,500 in UI copy for the CTA.

## Process

1. Wait for volume gate.
2. Open Hub, compare subscription revenue vs Pass cost.
3. Use the break-even calculator; propose a new price/caps.
4. Second person (or PO) approves; admin with write permission saves.
5. Spot-check a cart quote after save.

Live price stays until you decide — nothing auto-reprices.

## Growth Guarantee cron hold

Math and claw-back hooks are green. **Do not** enable or schedule live GG cron against real
merchants until ≥1 Jamaica calendar month of **delivered/completed** Dominant volume exists.
Keep claw-back armed so late cancels stay safe when cron is eventually turned on.
