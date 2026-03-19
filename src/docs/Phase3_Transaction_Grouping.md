# Phase 3 - Transaction Grouping Logic

## Overview
The system automatically groups transactions with similar vendor names into a single unverified vendor entry using fuzzy matching.

## Grouping Algorithm

### Step 1: Normalize Vendor Name
- Convert to lowercase
- Remove special characters
- Trim and standardize spacing
- Example: "Shell   Gas!!" → "shell gas"

### Step 2: Check for Existing Vendor
When a new transaction is submitted, the system:
1. Fetches all pending unverified vendors
2. Uses `isSameVendor()` to find matches
3. Matches if:
   - Exact match after normalization
   - One name contains the other (with <30% length difference)
   - Similarity score ≥ 0.85 (Levenshtein distance)

### Step 3: Merge or Create
- **If match found:** Add transaction to existing vendor entry
- **If no match:** Create new vendor entry

## Benefits

1. **Automatic Deduplication**
   - "Shell", "shell", "Shell Gas" → Single vendor
   - Reduces manual work for super admins

2. **Smart Aggregation**
   - All transactions grouped by vendor
   - Total amount calculated automatically
   - Unique drivers and vehicles tracked

3. **Audit Trail**
   - First seen / last seen timestamps
   - Complete transaction history
   - Submission metadata preserved

## Implementation Details

### Fuzzy Matching Examples

| Transaction 1 | Transaction 2 | Match? | Reason |
|--------------|---------------|--------|---------|
| "Shell" | "Shell Gas Station" | ✅ Yes | Partial match (70%+ similarity) |
| "Texaco Kingston" | "Texaco" | ✅ Yes | One contains other |
| "Total" | "Rubis" | ❌ No | Different brands |
| "BP Portmore" | "BP Port More" | ✅ Yes | High similarity (>85%) |

### Vendor Metadata Structure

```json
{
  "id": "uuid-123",
  "name": "Shell Gas Station",
  "status": "pending",
  "transactionIds": ["tx-1", "tx-2", "tx-3"],
  "metadata": {
    "totalAmount": 15000,
    "transactionCount": 3,
    "firstSeen": "2026-03-15T10:00:00Z",
    "lastSeen": "2026-03-17T14:30:00Z",
    "submittedBy": ["driver-1", "driver-2"],
    "vehicles": ["vehicle-1", "vehicle-2"]
  }
}
```

## Testing Scenarios

### Scenario 1: Exact Match
- Transaction 1: vendor = "Shell"
- Transaction 2: vendor = "shell"
- **Result:** Both added to same vendor entry

### Scenario 2: Partial Match
- Transaction 1: vendor = "Total Gas"
- Transaction 2: vendor = "Total"
- **Result:** Both added to same vendor entry

### Scenario 3: Different Vendors
- Transaction 1: vendor = "Shell"
- Transaction 2: vendor = "Rubis"
- **Result:** Two separate vendor entries

### Scenario 4: Spelling Variations
- Transaction 1: vendor = "BP Portmore"
- Transaction 2: vendor = "BP Port More"
- **Result:** Both added to same vendor entry (>85% similarity)

---

**Status:** ✅ Implemented in `createOrUpdateUnverifiedVendor()`
**File:** `/supabase/functions/server/unverified_vendor_controller.tsx`
**Matching Logic:** `/supabase/functions/server/vendor_matcher.ts`
