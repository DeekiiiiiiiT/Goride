# Expense Hub — verification & sign-off checklist

Date: 2026-07-22 (IA restructure)

## Automated

- [x] Unit: journal balance, lifecycle, self-approve, category mapping
- [x] Unit: 53-vehicle allocation without penny drift
- [x] Contract: Fuel/Toll writers untouched; ADR present
- [x] UI contract: Expense Hub shell (Overview/Register/Approvals/Recurring expenses); ≥44px nav
- [x] Full Fleet suite: **763/763** passed (pre-restructure baseline)
- [x] Production build: OK (pre-restructure baseline)

## Platform catalog (Super Admin)

1. Deploy edge function with `platform_vendor_routes.ts` registered.
2. Super Admin → Accounting → Vendor Database: add a verified vendor; bulk import.
3. Super Admin → Expense categories: confirm built-ins + add one custom.
4. Run **Migrate dry-run** then **Migrate apply** for legacy org vendors.
5. Fleet app: Register wizard lists verified vendors; Request vendor creates Pending.
6. Super Admin → Pending vendor requests: approve / merge / reject.

## Staged cutover (owner / accountant)

1. Deploy edge function containing `expense_hub_routes.ts` + platform vendor routes.
2. Dry-run migration for one org; review proposed rule groups.
3. Shadow-compare annual projections (delta ≈ 0).
4. Enable `expense_hub_v1` for that org only.
5. Apply migration with `confirm: true`.
6. Spot-check: Accounting rules for 50+ vehicles, Register one bill with pending vendor, Approvals, P&L / Cash & Bank totals.
7. Accountant signs one closed month control totals.
8. Enable flag for remaining orgs.

## Rollback

Disable `expense_hub_v1`. Vehicle Fixed Expenses editing returns. No ledger rewrite.
Platform vendors remain (safe); fleet pickers still read verified catalog.
