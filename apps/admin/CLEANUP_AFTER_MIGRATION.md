# Post-Migration Cleanup

This file tracks components and services that can be removed from `apps/admin` after the distributed product admin architecture is fully deployed and verified.

## Prerequisites

Before removing any files, verify:
1. `roamdash.co/admin` is working with full merchant management
2. `roam-s.co/admin` is working with fare rules and surge management  
3. `roamdriver.co/admin` is working with driver management
4. The overview cards in Dominion are fetching data correctly

## Components to Remove

Once verified, these can be safely deleted (they have been moved to product apps):

### Roam Dash Components
- `src/components/admin/roam-dash/MerchantVerificationManager.tsx` → moved to `apps/dash-merchant/src/admin/`
- `src/components/admin/roam-dash/MerchantDetailModal.tsx` → moved to `apps/dash-merchant/src/admin/`
- `src/components/admin/roam-dash/MerchantActionDialog.tsx` → moved to `apps/dash-merchant/src/admin/`
- `src/components/admin/roam-dash/MerchantStatusBadge.tsx` → moved to `apps/dash-merchant/src/admin/`

### Roam Rides Components  
- `src/components/admin/roam-rides/FareRulesManager.tsx` → moved to `apps/rides-passenger/src/admin/`
- `src/components/admin/roam-rides/SurgeCellsManager.tsx` → moved to `apps/rides-passenger/src/admin/`

## Services to Keep

These services are still used by the overview cards and should NOT be deleted:
- `src/services/dashMerchantVerificationService.ts` - used by DashOverviewCard
- `src/services/ridesAdminService.ts` - used by RidesOverviewCard

## Cleanup Command

Once verified, run:
```bash
# Remove Roam Dash components (keep service for overview)
rm -rf apps/admin/src/components/admin/roam-dash/

# Remove Roam Rides components (keep service for overview)
rm -rf apps/admin/src/components/admin/roam-rides/
```

Then update imports if needed and verify the build passes.
