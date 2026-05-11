# Phase 1 - Migration Analysis

## Database Cleanup Preparation

### Objective
Document existing transactions that require migration to the Unverified Vendor system.

### Transactions Requiring Migration

**Criteria:**
- `category === 'Fuel' OR category === 'Fuel Reimbursement'`
- AND (`vendor === '' OR vendor === 'Unspecified Vendor' OR vendor === null`)
- AND `metadata.matchedStationId` is empty/undefined
- AND `metadata.stationGateHold !== true` (not already gate-held)

### Expected Behavior

**Before Migration:**
- Transactions appear in Company Admin Review Queue (Pending tab)
- No unverified vendor entries exist
- No gate-hold flags set

**After Migration:**
- Transactions have `metadata.stationGateHold = true`
- Unverified vendor entries created (grouped by normalized name)
- Transactions hidden from Review Queue
- Transactions visible in Super Admin → Station Database → Unverified Vendors tab

### Migration Verification Checklist

- [ ] Export list of affected transactions (CSV)
- [ ] Count total transactions requiring migration
- [ ] Group by vendor name to preview unverified vendor entries
- [ ] Verify no data loss during migration
- [ ] Confirm transactions disappear from Review Queue
- [ ] Confirm transactions appear in Unverified Vendors tab

### Safety Measures

1. **Dry-Run Mode:** Migration endpoint will support `?dryRun=true` parameter
2. **Backup:** Export current transaction data before migration
3. **Rollback Plan:** Keep backup for 30 days
4. **Verification:** Manual spot-check of 10+ transactions post-migration

### Notes

- Migration will be executed in Phase 9
- This document is for planning purposes only
- No data modifications in Phase 1

---

**Status:** ⏸️ Documentation complete, awaiting Phase 9 execution
**Created:** Phase 1 - Step 1.4
**Last Updated:** {current_date}
