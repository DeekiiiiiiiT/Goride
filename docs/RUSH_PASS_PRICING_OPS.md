# Rush Pass pricing ops

## Sell gate (Findings A + L + M + R + T + O)

Engineering checklist §1–5, Finding L, Finding M, Finding R, Finding T, and Finding O
(`RD-2026-000008` completed + reconcile 0.00) are **green**. **Pass marketing and `FREEDEL`
remain PO product decisions** — turn on when you choose; engineering money gates are clear.

Manage live plan economics in **Pricing → Rush Pass** (price, billing days, max free km, monthly
subsidy budget, service-fee multiplier, free-delivery flag, eligible merchant tiers, and sales
on/off). Grant/revoke memberships on the same tab for support.

Customers subscribe in the app under **Account → Rush Pass**. **Sales on/off** on the plan is the
admin pause switch — turning it off stops new purchases; current members keep benefits until period end.

Re-hold marketing if a new money defect opens (e.g. subsidy fail-open) — then restore a Hub
banner and pause campaigns until fixed.

## Subsidy budget denominators (Finding S)

| Config block | Key | Scope | Live default |
|---|---|---|---|
| `rush_pass` / plan row | `monthly_subsidy_budget_jmd` | **Per member, per billing period** | J$1,500 |
| `promo_free_delivery` | `monthly_subsidy_budget_jmd` | **Entire platform, per Jamaica calendar month** | J$1,500 |

Do **not** raise the promo field as if it were a per-customer Pass budget. At ~J$630 courier cost
per free trip, J$1,500 platform-wide ≈ **2** free-delivery promo trips for all of Roam Rush that month.

Spend is summed in Postgres (`delivery.sum_promo_fd_subsidy_used` /
`delivery.sum_rush_pass_subsidy_used`) — never by row-transport under PostgREST `max_rows` (Finding R).

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
- Save is rejected if km or monthly budget ≤ 0, **or** if `validatePricingConfig` fails when the
proposed caps are overlaid on the live pricing profile (Finding M). Client Save pre-gates the same way.
- Profile mirror uses **insert-then-deactivate** (Finding T). Mirror failure returns **409**
  (`pass_profile_mirror_failed`) — plan row may have saved; retry Save so caps resync.
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

## Growth Guarantee hold (Finding P)

Math and claw-back hooks are green. **Growth Guarantee is disabled in the active pricing profile
(`growth_guarantee.enabled = false`) until ≥1 Jamaica calendar month of delivered/completed
Dominant volume exists.** The scheduled GG cron job is also removed — run only via GitHub Actions
`workflow_dispatch` (job: `growth_guarantee`) after PO re-enables the profile flag.

Keep claw-back armed so late cancels stay safe when GG is eventually turned on.

## Concurrent Pass budget race (Finding Q) — accepted / won’t-fix

**Status: accepted (not closed).** No membership lock or subsidy ledger is implemented.

`loadRushPassSubsidyUsed` (Postgres RPC) reads spend at quote/place time; the order row that records
that spend is inserted afterwards. Two concurrent Pass free-delivery checkouts on one membership can
both observe the same `used` figure and both clear the gate. Worst case: ~one extra free trip over
the monthly **per-member** budget.

Promo free delivery has the **same race** with a **platform-wide** budget (Finding S) — slightly
worse blast radius, still acceptable pre-launch.

Revisit when Pass or promo FD volume is material: membership advisory lock or atomic spend RPC.

## FREEDEL / promo free delivery (Finding N)

Live `FREEDEL` stays **paused** until Finding O (delivered settlement) is signed and PO re-enables.
Promo FD caps (distance + platform-wide monthly budget) are live; place-order gate uses the Postgres
sum RPC (Finding R). Do not re-activate free-delivery promos without PO sign-off.
