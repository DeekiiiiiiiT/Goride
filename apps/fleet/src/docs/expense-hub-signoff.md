# Expense Hub — verification & sign-off checklist

Date: 2026-07-21

## Automated

- [x] Unit: journal balance, lifecycle, self-approve, category mapping
- [x] Unit: 53-vehicle allocation without penny drift
- [x] Contract: Fuel/Toll writers untouched; ADR present
- [x] UI contract: 18 Stitch screens inventoried; hub components present; ≥44px nav
- [x] Full Fleet suite: **763/763** passed
- [x] Production build: OK

## Staged cutover (owner / accountant)

1. Deploy edge function containing `expense_hub_routes.ts`.
2. Dry-run migration for one org; review proposed rule groups.
3. Shadow-compare annual projections (delta ≈ 0).
4. Enable `expense_hub_v1` for that org only.
5. Apply migration with `confirm: true`.
6. Spot-check: create bulk rule for 50+ vehicles, approve one bill, partial then final payment, vehicle projection deep link, P&L / Cash & Bank totals.
7. Accountant signs one closed month control totals.
8. Enable flag for remaining orgs.

## Rollback

Disable `expense_hub_v1`. Vehicle Fixed Expenses editing returns. No ledger rewrite.
