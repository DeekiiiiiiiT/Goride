# Platform Matching Brain — Phase 8 Cleanup Checklist

This document tracks the cleanup tasks to be completed AFTER the matching brain has been running stably in production for 2+ weeks.

## Pre-Cleanup Verification

Before starting cleanup, verify:

- [ ] `MATCHING_BRAIN_ENABLED=1` for 2+ weeks
- [ ] `RIDES_USE_MATCHING_BRAIN=1` for 2+ weeks
- [ ] Zero rollbacks in the period
- [ ] Matching success rate > 85%
- [ ] No accept race conditions

## Cleanup Tasks

### 1. Remove Legacy Matching Code from Rides Edge Function

**Files to clean:**

- [ ] `supabase/functions/rides/index.ts`
  - Remove inline `startMatchingForRide()` legacy path
  - Remove inline `reconcileMatching()` legacy path
  - Remove inline `runMatchingWave()` legacy path
  - Keep only delegation to matching brain

**After cleanup, rides should:**
- Always delegate to matching brain
- Return error if brain is unavailable (vs. falling back)

### 2. Remove Dual-Write to rides.dispatch_settings

**Files to clean:**

- [ ] `supabase/functions/rides/index.ts`
  - Remove PATCH handler for `/admin/dispatch-settings` that writes to `rides.dispatch_settings`
  - Redirect to matching brain `/admin/policies` API

**After cleanup:**
- `rides.dispatch_settings` becomes read-only (frozen at last value)
- All config changes go through `matching.policies`

### 3. Remove Debug Logging

**Search for and remove:**

```typescript
// Remove these patterns:
logLine({ event: "..._debug", ... })
console.log("DEBUG: ...")
// Log entries with "_diag" suffix that were added for parity testing
```

**Keep:**
- Error logs
- Audit logs
- Key metric logs (success/failure/timeout)

### 4. Deprecate Old Tables

**Mark as deprecated (do not drop yet):**

```sql
COMMENT ON TABLE rides.dispatch_settings IS 'DEPRECATED: Use matching.policies';
```

**In 6 months, consider:**
- Dropping `rides.dispatch_settings`
- Removing migration seed logic

### 5. Update Documentation

- [ ] Update README.md with matching brain architecture
- [ ] Update CONTRIBUTING.md with matching module guidelines
- [ ] Archive old matching flow diagrams
- [ ] Update API documentation

### 6. Clean Up Feature Flags

After full adoption, simplify flags:

```bash
# Remove these (matching brain becomes the only path):
RIDES_USE_MATCHING_BRAIN  # Remove - always use brain

# Keep these (still useful for feature control):
MATCHING_BRAIN_ENABLED    # Keep - master kill switch
MATCHING_SERIAL_DISPATCH  # Keep - feature toggle
MATCHING_H3_SUPPLY        # Keep - feature toggle
MATCHING_H3_SURGE         # Keep - feature toggle
```

## Code Patterns to Remove

### Legacy startMatchingForRide

```typescript
// REMOVE: Legacy in-process matching
async function startMatchingForRide(ride: RideSnapshot) {
  // ... 50+ lines of legacy code ...
}

// KEEP: Delegation only
async function startMatchingForRide(ride: RideSnapshot) {
  return delegateStartMatching(ride);
}
```

### Legacy reconcileMatching

```typescript
// REMOVE: Legacy reconcile loop
async function reconcileMatching(rideId: string) {
  // ... 100+ lines of legacy code ...
}

// KEEP: Delegation only
async function reconcileMatching(rideId: string) {
  return delegateReconcile(rideId);
}
```

### Legacy runMatchingWave

```typescript
// REMOVE: Legacy wave runner
async function runMatchingWave(ride: RideSnapshot, wave: number) {
  // ... 200+ lines of legacy code ...
}

// This function is fully handled by matching brain
```

## Verification After Cleanup

1. Deploy cleaned rides Edge function
2. Run integration tests
3. Book test rides in staging
4. Monitor for 24 hours
5. Deploy to production

## Rollback Plan

If cleanup causes issues:

1. Revert rides Edge function to pre-cleanup version
2. Redeploy previous version
3. Document issue for investigation

## Sign-Off

| Step | Completed | Date | Engineer |
|------|-----------|------|----------|
| Pre-cleanup verification | | | |
| Legacy code removal | | | |
| Dual-write removal | | | |
| Debug log cleanup | | | |
| Table deprecation | | | |
| Documentation update | | | |
| Feature flag cleanup | | | |
| Final verification | | | |
