# Earnings Policy Configuration — Manual Test Checklist

## Rules Tab
- [ ] Create policy via 5-step wizard (Basics → Tiers → Quotas → Allowance → Review)
- [ ] Cannot reach Create without completing each gated step
- [ ] Leaving weekly quota / PA off requires confirm checkbox
- [ ] Edit uses same wizard; Save Changes only on Review
- [ ] Clone / Make default / Delete guards work
- [ ] Empty state offers Create Default Policy

## Schedule Tab
- [ ] Add version freezes Rules (optional name only — no shared date range on the card)
- [ ] Assign two drivers on one version with different start Mondays
- [ ] Edit / remove a single driver’s period without recreating the version
- [ ] Same driver cannot overlap assignments across versions/policies
- [ ] Unassigned drivers still use Default
- [ ] Existing legacy version (shared dates + driver list) still loads after auto-migrate

## Runtime
- [ ] Empty library → prefs fallback until Default exists
- [ ] Assigned driver-week → version bundle
- [ ] Unassigned → Default policy latest version
- [ ] Driver Earnings History: assign driver to Average Performer → share % / tier / quota target match that policy (not old global prefs)
- [ ] Move same driver to High Performer → refresh Earnings → numbers update
- [ ] Same week on Payout matches Earnings share $ and %
- [ ] Unassigned driver Earnings uses Default policy ladder
- [ ] Drivers list tier badge matches that driver’s policy for current week
- [ ] Driver portal projected share / tier matches fleet office for that driver

## Nav
- [ ] Only Earnings Policy Configuration under Driver Ops (no Legacy Tier Settings)
- [ ] Old tier-config bookmarks redirect to earnings-policy
