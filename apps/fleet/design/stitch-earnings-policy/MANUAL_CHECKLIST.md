# Earnings Policy Configuration — Manual Test Checklist

## Rules Tab
- [ ] Can create new policy with name, tiers, quotas, and PA bands
- [ ] Can edit existing policy bundle (tiers/quotas/PA)
- [ ] Clone creates new policy with copied config
- [ ] Make default clears isDefault from other policies
- [ ] Delete blocked when: isDefault, last policy, or drivers on versions
- [ ] Delete allowed when no assigned drivers and not default/last

## Schedule Tab
- [ ] Policies listed in sidebar, can select
- [ ] Add version: Monday picker, driver multi-select
- [ ] Edit version: dates and drivers update, frozen bundle unchanged
- [ ] Delete version blocked when only one version exists
- [ ] Driver collision detected across policies

## Dual-Read
- [ ] Empty library → legacy prefs used
- [ ] Driver on version → version bundle used
- [ ] Unassigned driver → Default policy used

## Legacy Tier Settings
- [ ] Still accessible at tier-config-legacy page
- [ ] Independent of earnings policies
