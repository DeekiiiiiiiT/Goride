# Phase 3 - API Test Plan

## Test Environment Setup

**Base URL:** `https://{projectId}.supabase.co/functions/v1/make-server-37f42386`

**Authentication:**
```
Authorization: Bearer {publicAnonKey}
```

---

## Test 1: Create Single Unverified Vendor

### Request
```bash
POST /unverified-vendors
Content-Type: application/json

{
  "transactionId": "existing-transaction-id",
  "vendorName": "Shell Gas Station",
  "sourceType": "manual_entry"
}
```

### Expected Response (201)
```json
{
  "success": true,
  "vendor": {
    "id": "uuid-generated",
    "name": "Shell Gas Station",
    "createdAt": "2026-03-17T...",
    "status": "pending",
    "transactionIds": ["existing-transaction-id"],
    "sourceType": "manual_entry",
    "metadata": {
      "totalAmount": 5000,
      "transactionCount": 1,
      "firstSeen": "2026-03-17T...",
      "lastSeen": "2026-03-17T...",
      "submittedBy": ["driver-id"],
      "vehicles": ["vehicle-id"]
    }
  }
}
```

### Test Validations
- ✅ Vendor entry created in KV store with key `unverified_vendor:{id}`
- ✅ Transaction ID added to vendor's transactionIds array
- ✅ Total amount matches transaction amount
- ✅ Driver and vehicle extracted from transaction
- ✅ Status set to "pending"

---

## Test 2: Add Transaction to Existing Vendor (Fuzzy Match)

### Request
```bash
POST /unverified-vendors
Content-Type: application/json

{
  "transactionId": "new-transaction-id",
  "vendorName": "shell gas",
  "sourceType": "no_gps"
}
```

### Expected Behavior
- System finds existing "Shell Gas Station" vendor
- Adds new transaction to existing vendor
- Updates metadata (totalAmount, transactionCount, lastSeen)

### Expected Response (201)
```json
{
  "success": true,
  "vendor": {
    "id": "same-uuid-as-test-1",
    "name": "Shell Gas Station",
    "transactionIds": ["existing-transaction-id", "new-transaction-id"],
    "metadata": {
      "totalAmount": 10000,
      "transactionCount": 2,
      "lastSeen": "2026-03-17T..." 
    }
  }
}
```

### Test Validations
- ✅ No duplicate vendor created
- ✅ Transaction count incremented
- ✅ Total amount updated correctly
- ✅ lastSeen timestamp updated

---

## Test 3: Bulk Create Vendors

### Request
```bash
POST /unverified-vendors/bulk
Content-Type: application/json

{
  "transactions": [
    {
      "id": "tx-1",
      "vendor": "Rubis Gas Station",
      "sourceType": "no_gps"
    },
    {
      "id": "tx-2",
      "vendor": "Rubis",
      "sourceType": "manual_entry"
    },
    {
      "id": "tx-3",
      "vendor": "Total Energy",
      "sourceType": "unmatched_name"
    }
  ]
}
```

### Expected Response (201)
```json
{
  "success": true,
  "vendors": [
    {
      "id": "rubis-vendor-id",
      "name": "Rubis Gas Station",
      "transactionIds": ["tx-1", "tx-2"]
    },
    {
      "id": "total-vendor-id",
      "name": "Total Energy",
      "transactionIds": ["tx-3"]
    }
  ],
  "summary": {
    "processedTransactions": 3,
    "uniqueVendors": 2
  }
}
```

### Test Validations
- ✅ "Rubis" and "Rubis Gas Station" grouped together
- ✅ "Total Energy" created as separate vendor
- ✅ Transaction counts correct
- ✅ Summary statistics accurate

---

## Test 4: Error Handling - Missing Fields

### Request
```bash
POST /unverified-vendors
Content-Type: application/json

{
  "transactionId": "tx-123"
}
```

### Expected Response (400)
```json
{
  "error": "Transaction ID and vendor name are required"
}
```

---

## Test 5: Error Handling - Invalid Source Type

### Request
```bash
POST /unverified-vendors
Content-Type: application/json

{
  "transactionId": "tx-123",
  "vendorName": "Shell",
  "sourceType": "invalid_type"
}
```

### Expected Response (400)
```json
{
  "error": "Invalid sourceType. Must be: no_gps, unmatched_name, or manual_entry"
}
```

---

## Test 6: Error Handling - Transaction Not Found

### Request
```bash
POST /unverified-vendors
Content-Type: application/json

{
  "transactionId": "non-existent-tx",
  "vendorName": "Shell",
  "sourceType": "manual_entry"
}
```

### Expected Response (500)
```json
{
  "error": "Failed to create vendor: Transaction not found: non-existent-tx"
}
```

---

## Test 7: Fetch All Unverified Vendors

### Request
```bash
GET /unverified-vendors
```

### Expected Response (200)
```json
{
  "vendors": [
    {
      "id": "vendor-1",
      "name": "Shell Gas Station",
      "status": "pending",
      "transactionIds": ["tx-1", "tx-2"],
      "metadata": { ... }
    },
    {
      "id": "vendor-2",
      "name": "Rubis",
      "status": "pending",
      "metadata": { ... }
    }
  ],
  "summary": {
    "total": 2,
    "pending": 2,
    "resolved": 0,
    "totalAmountAtRisk": 15000
  }
}
```

---

## Test 8: Fetch Vendors by Status

### Request
```bash
GET /unverified-vendors?status=pending
```

### Expected Behavior
- Returns only vendors with status = "pending"
- Excludes resolved vendors

---

## Test 9: Fetch Single Vendor Details

### Request
```bash
GET /unverified-vendors/{vendorId}
```

### Expected Response (200)
```json
{
  "vendor": { ... },
  "transactions": [ ... ],
  "drivers": [ ... ],
  "vehicles": [ ... ],
  "suggestedMatches": [
    {
      "stationId": "station-123",
      "stationName": "Shell - Half Way Tree",
      "brand": "Shell",
      "address": "123 Main St",
      "confidence": 0.92,
      "reason": "Near-exact match"
    }
  ]
}
```

### Test Validations
- ✅ Vendor details returned
- ✅ All linked transactions fetched
- ✅ Driver/vehicle details populated
- ✅ Station suggestions provided (if matching stations exist)

---

## Manual Testing Checklist

### Pre-Test Setup
- [ ] Create test transaction in database
- [ ] Note transaction ID for testing
- [ ] Ensure transaction has vendor field
- [ ] Verify no existing unverified vendors

### Test Execution
- [ ] Run Test 1 - Create single vendor
- [ ] Verify vendor in KV store (`unverified_vendor:*`)
- [ ] Run Test 2 - Add to existing vendor
- [ ] Verify no duplicate created
- [ ] Run Test 3 - Bulk creation
- [ ] Verify grouping logic worked
- [ ] Run Tests 4-6 - Error handling
- [ ] Verify appropriate error responses
- [ ] Run Tests 7-9 - Retrieval endpoints
- [ ] Verify data completeness

### Post-Test Cleanup
- [ ] Delete test vendors
- [ ] Delete test transactions
- [ ] Reset KV store to clean state

---

## Success Criteria

✅ **All endpoints return correct HTTP status codes**
✅ **Vendor creation works for single and bulk requests**
✅ **Fuzzy matching groups similar vendor names**
✅ **Error handling returns meaningful messages**
✅ **Retrieval endpoints return complete data**
✅ **Suggested matches calculated correctly**
✅ **No data loss or corruption**

---

**Status:** Ready for manual testing
**Next Step:** Execute tests in development environment
**Estimated Time:** 30 minutes
