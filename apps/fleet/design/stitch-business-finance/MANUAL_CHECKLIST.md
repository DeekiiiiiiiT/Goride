# Business Finance — Manual QA checklist

## Guardrails
- [ ] Settlement math unchanged (spot-check 1 driver week)
- [ ] Bank Deposits confirm / unconfirm / PDF+CSV still work
- [ ] Fuel finalize unchanged
- [ ] Toll reconciliation unchanged
- [ ] Old Financial Analytics still opens

## Business Finance UI
- [ ] Nav item visible when permitted; hidden when not
- [ ] Period chips: This week / Last week / This month / Clear
- [ ] Overview KPIs load or show Incomplete data (never fake)
- [ ] P&L waterfall matches sample week ledger sums
- [ ] Cash & Bank shows three separate totals (not blended)
- [ ] Open Bank Deposits deep-link works
- [ ] Expenses deep-links to Fuel / Toll / Maintenance
- [ ] Maintenance shows honest “not tracked” when no $
- [ ] Driver balances search/sort; row opens driver
- [ ] Desktop + mobile (~390) layouts usable

## Cleanup
- [ ] Mock fixtures removed after live tabs
- [ ] No regressions on money desks after cleanup
