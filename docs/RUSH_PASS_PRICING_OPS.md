# Rush Pass pricing ops

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
