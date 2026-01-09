# Date Filter Timezone Fix

## Phase 1: Implement Local Date Parsing Utility
- [ ] Create a helper function `parseLocalDate` in `TripLogsPage.tsx`
  - Input: `YYYY-MM-DD` string
  - Output: `Date` object set to local midnight (00:00:00)
  - Logic: Split string by `-`, use `new Date(year, monthIndex, day)` constructor to avoid UTC conversion issues.

## Phase 2: Update Date Filtering Logic
- [ ] Locate the `filteredTrips` useMemo hook in `TripLogsPage.tsx`.
- [ ] Update the `filters.dateRange === 'custom'` block.
- [ ] Replace `new Date(filters.dateStart)` with `parseLocalDate(filters.dateStart)`.
- [ ] Replace `new Date(filters.dateEnd)` with `parseLocalDate(filters.dateEnd)`.
- [ ] Ensure `startOfDay` and `endOfDay` wrappers are maintained or adjusted as needed to cover the full day range.

## Phase 3: Verification
- [ ] Verify that selecting a date range (e.g., Jan 5 - Jan 9) includes trips from Jan 5 00:00 to Jan 9 23:59:59.
- [ ] Verify that trips from Jan 4 are excluded.
