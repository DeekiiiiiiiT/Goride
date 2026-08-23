# GCT on Platform Fees — Accountant Review

Status: **pending accountant sign-off** (2026-08-23). Do not implement fee GCT in code until confirmed.

Related: [dash-gct-centralization-audit.md](./dash-gct-centralization-audit.md), [dash-service-fee-strategy.md](./dash-service-fee-strategy.md)

## Implemented (food GCT)

- Standard rate **16.5%** configured in Dominion → Global Settings → GCT panel (`platform:settings:global.tax`)
- Food subtotal GCT resolved server-side via `supabase/functions/_shared/gctRate.ts`
- Merchant `gct_registered` flag — unregistered merchants charge **$0** food GCT
- Service fee, delivery fee, and tips are **not** taxed in code today

## Questions for accountant

1. Is Roam Rush's **platform service fee** a separate taxable supply requiring GCT at the standard rate?
2. Is the **delivery fee** (platform portion) separately taxable from the merchant's food GCT?
3. Are **tips** ever taxable in this marketplace context?
4. Should Roam Rush issue a single consolidated tax invoice to the customer, or separate merchant vs platform tax lines?

## If approved — implementation notes

- Extend `buildOrderPricing` in `packages/dash-pricing/src/engine.ts` to apply GCT to `serviceFee` and `deliveryFeePlatformAmount` as separate taxable supplies
- Add distinct receipt lines: merchant food GCT vs platform fee GCT
- Do **not** fold platform GCT into merchant food GCT on receipts (s.22(b) clarity)

## Verification after food GCT rollout

- [ ] Dominion Global Settings shows 16.5% / enabled
- [ ] dash-customer cart shows `Tax (GCT X%)` from API quote
- [ ] POS receipt payload includes `tax` and `taxRatePercent` separately from subtotal
- [ ] Unregistered merchant orders show $0 food GCT
- [ ] Registered merchant with unset POS rate uses global rate (not 0%)
