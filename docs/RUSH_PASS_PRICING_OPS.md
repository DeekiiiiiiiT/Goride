# Rush Pass pricing ops

## Sell gate (Finding A + L)

Engineering checklist §1–4 and Finding L are **green**. **PO approved public Pass sales
2026-08-30.**

Manage live plan economics in **Pricing → Rush Pass** (price, billing days, max free km, monthly
subsidy budget, service-fee multiplier, free-delivery flag, eligible merchant tiers, and sales
on/off). Grant/revoke memberships on the same tab for support.

Customers subscribe in the app under **Account → Rush Pass**. **Sales on/off** on the plan is the
admin pause switch — turning it off stops new purchases; current members keep benefits until period end.

Re-hold marketing only if a new money defect opens (e.g. subsidy fail-open) — then restore a Hub
banner and pause campaigns until fixed.

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

Pricing Hub **Rush Pass** tab:

- `price_jmd`, `billing_period_days`, `max_free_delivery_km`, `monthly_subsidy_budget_jmd`,
  `service_fee_multiplier`, `free_delivery`, `eligible_tier_slugs`, `is_active`, display `name`
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
