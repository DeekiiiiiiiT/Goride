# Earnings Policy Configuration — Manual Test Checklist

## Rules Tab
- [ ] Create policy via 5-step wizard (Basics → Tiers → Quotas → Allowance → Review)
- [ ] Cannot reach Create without completing each gated step
- [ ] Leaving weekly quota / PA off requires confirm checkbox
- [ ] Edit uses same wizard; Save Changes only on Review
- [ ] Clone / Make default / Delete guards work
- [ ] Empty state offers Create Default Policy

## Schedule Tab
- [ ] Policy picker + Add version (Monday window + drivers)
- [ ] Edit version does not pull live template (frozen snapshot)
- [ ] Driver window collision blocked across policies

## Runtime
- [ ] Empty library → prefs fallback until Default exists
- [ ] Assigned driver-week → version bundle
- [ ] Unassigned → Default policy

## Nav
- [ ] Only Earnings Policy Configuration under Driver Ops (no Legacy Tier Settings)
- [ ] Old tier-config bookmarks redirect to earnings-policy
