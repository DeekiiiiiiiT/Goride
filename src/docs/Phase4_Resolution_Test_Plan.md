# Phase 4 - Resolution API Test Plan

## Test Environment Setup

**Base URL:** `https://{projectId}.supabase.co/functions/v1/make-server-37f42386`

**Authentication:**
```
Authorization: Bearer {publicAnonKey}
```

---

## Test 1: Resolve Vendor to Existing Station

### Pre-requisites
- Vendor exists with status = "pending"
- Vendor has at least 1 linked transaction
- Target station exists and is verified

### Request
```bash
PUT /unverified-vendors/{vendorId}/resolve
Content-Type: application/json

{
  "stationId": "existing-station-uuid",
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (200)
```json
{
  "success": true,
  "vendor": {
    "id": "vendor-uuid",
    "name": "Shell Gas",
    "status": "resolved",
    "resolvedAt": "2026-03-17T...",
    "resolvedBy": "admin-user-id",
    "resolvedStationId": "existing-station-uuid"
  },
  "station": {
    "id": "existing-station-uuid",
    "name": "Shell - Half Way Tree",
    "brand": "Shell"
  },
  "updatedTransactions": [
    {
      "id": "tx-1",
      "stationId": "existing-station-uuid",
      "station": "Shell - Half Way Tree",
      "metadata": {
        "resolvedVendorId": "vendor-uuid",
        "resolvedStationId": "existing-station-uuid",
        "resolvedAt": "2026-03-17T...",
        "resolvedBy": "admin-user-id",
        "locationStatus": "verified",
        "verificationMethod": "manual_vendor_resolution"
      }
    }
  ],
  "summary": {
    "transactionsUpdated": 1,
    "totalAmount": 5000,
    "resolvedAt": "2026-03-17T..."
  }
}
```

### Test Validations
- ✅ Vendor status changed to "resolved"
- ✅ Vendor has `resolvedAt`, `resolvedBy`, `resolvedStationId` fields
- ✅ All transactions updated with station reference
- ✅ Transaction metadata contains resolution details
- ✅ `locationStatus` set to "verified"
- ✅ Transaction count in summary is correct

---

## Test 2: Create New Station from Vendor

### Pre-requisites
- Vendor exists with status = "pending"
- Vendor has linked transactions
- Station name doesn't exist yet

### Request
```bash
POST /unverified-vendors/{vendorId}/create-station
Content-Type: application/json

{
  "stationData": {
    "name": "Total - New Kingston",
    "brand": "Total",
    "address": "456 Hope Rd, Kingston",
    "location": {
      "lat": 18.0179,
      "lng": -76.8099
    },
    "phone": "876-555-5678",
    "services": ["Fuel", "Car Wash"]
  },
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (200)
```json
{
  "success": true,
  "newStationCreated": true,
  "vendor": {
    "id": "vendor-uuid",
    "status": "resolved",
    "resolvedStationId": "new-station-uuid"
  },
  "station": {
    "id": "new-station-uuid",
    "name": "Total - New Kingston",
    "brand": "Total",
    "address": "456 Hope Rd, Kingston",
    "location": { "lat": 18.0179, "lng": -76.8099 },
    "phone": "876-555-5678",
    "services": ["Fuel", "Car Wash"],
    "status": "verified",
    "createdAt": "2026-03-17T...",
    "createdBy": "admin-user-id",
    "createdFrom": "unverified_vendor",
    "sourceVendorId": "vendor-uuid",
    "metadata": {
      "needsGPSUpdate": false,
      "needsAddressUpdate": false
    }
  },
  "updatedTransactions": [...],
  "summary": {
    "transactionsUpdated": 3
  }
}
```

### Test Validations
- ✅ New station created with correct data
- ✅ Station has `createdFrom: "unverified_vendor"`
- ✅ Station has `sourceVendorId` linking to vendor
- ✅ Vendor resolved to new station
- ✅ All transactions linked to new station
- ✅ Station status is "verified"
- ✅ Metadata flags set correctly

---

## Test 3: Create Station with Missing GPS

### Request
```bash
POST /unverified-vendors/{vendorId}/create-station
Content-Type: application/json

{
  "stationData": {
    "name": "Rubis - Unknown Location",
    "brand": "Rubis",
    "address": "Address to be updated"
  },
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (200)
```json
{
  "success": true,
  "newStationCreated": true,
  "station": {
    "name": "Rubis - Unknown Location",
    "location": { "lat": 0, "lng": 0 },
    "address": "Address to be updated",
    "metadata": {
      "needsGPSUpdate": true,
      "needsAddressUpdate": true
    }
  }
}
```

### Test Validations
- ✅ Station created despite missing data
- ✅ `needsGPSUpdate` flag set to true
- ✅ `needsAddressUpdate` flag set to true
- ✅ Default values applied (lat/lng = 0)
- ✅ Transactions still linked successfully

---

## Test 4: Reject Vendor - Flag Transactions

### Pre-requisites
- Vendor exists with status = "pending"
- Vendor has linked transactions

### Request
```bash
DELETE /unverified-vendors/{vendorId}
Content-Type: application/json

{
  "rejectedBy": "admin-user-id",
  "reason": "Not a fuel vendor - restaurant",
  "action": "flag"
}
```

### Expected Response (200)
```json
{
  "success": true,
  "vendor": {
    "id": "vendor-uuid",
    "status": "resolved",
    "rejectedAt": "2026-03-17T...",
    "rejectedBy": "admin-user-id",
    "rejectionReason": "Not a fuel vendor - restaurant",
    "rejectionAction": "flag"
  },
  "updatedTransactions": [
    {
      "id": "tx-1",
      "metadata": {
        "vendorRejectedAt": "2026-03-17T...",
        "vendorRejectedBy": "admin-user-id",
        "vendorRejectionReason": "Not a fuel vendor - restaurant",
        "flagged": true,
        "flagReason": "Unverified vendor rejected: Not a fuel vendor - restaurant"
      }
    }
  ],
  "summary": {
    "transactionsAffected": 2,
    "action": "flag",
    "rejectedAt": "2026-03-17T..."
  }
}
```

### Test Validations
- ✅ Vendor status changed to "resolved"
- ✅ Vendor has rejection metadata
- ✅ All transactions flagged
- ✅ Flag reason includes rejection reason
- ✅ No station created

---

## Test 5: Reject Vendor - Dismiss Transactions

### Request
```bash
DELETE /unverified-vendors/{vendorId}
Content-Type: application/json

{
  "rejectedBy": "admin-user-id",
  "reason": "Duplicate entry",
  "action": "dismiss"
}
```

### Expected Response (200)
```json
{
  "success": true,
  "updatedTransactions": [
    {
      "id": "tx-1",
      "metadata": {
        "dismissed": true,
        "dismissReason": "Vendor rejected: Duplicate entry"
      }
    }
  ],
  "summary": {
    "action": "dismiss"
  }
}
```

### Test Validations
- ✅ Transactions dismissed (not flagged)
- ✅ `dismissed: true` set on transactions
- ✅ Dismiss reason includes rejection reason

---

## Test 6: Error - Vendor Not Found

### Request
```bash
PUT /unverified-vendors/non-existent-uuid/resolve
Content-Type: application/json

{
  "stationId": "station-uuid",
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (500)
```json
{
  "error": "Failed to resolve vendor: Vendor not found: non-existent-uuid"
}
```

---

## Test 7: Error - Station Not Found

### Request
```bash
PUT /unverified-vendors/{vendorId}/resolve
Content-Type: application/json

{
  "stationId": "non-existent-station",
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (500)
```json
{
  "error": "Failed to resolve vendor: Station not found: non-existent-station"
}
```

---

## Test 8: Error - Already Resolved

### Pre-requisites
- Vendor already has status = "resolved"

### Request
```bash
PUT /unverified-vendors/{vendorId}/resolve
Content-Type: application/json

{
  "stationId": "station-uuid",
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (500)
```json
{
  "error": "Failed to resolve vendor: Vendor {vendorId} is already resolved"
}
```

---

## Test 9: Error - Missing Required Fields (Resolve)

### Request
```bash
PUT /unverified-vendors/{vendorId}/resolve
Content-Type: application/json

{
  "stationId": "station-uuid"
}
```

### Expected Response (400)
```json
{
  "error": "Station ID and resolvedBy are required"
}
```

---

## Test 10: Error - Missing Station Name (Create)

### Request
```bash
POST /unverified-vendors/{vendorId}/create-station
Content-Type: application/json

{
  "stationData": {
    "brand": "Shell"
  },
  "resolvedBy": "admin-user-id"
}
```

### Expected Response (400)
```json
{
  "error": "Station data with name is required"
}
```

---

## Test 11: Error - Invalid Action (Reject)

### Request
```bash
DELETE /unverified-vendors/{vendorId}
Content-Type: application/json

{
  "rejectedBy": "admin-user-id",
  "reason": "Test",
  "action": "invalid"
}
```

### Expected Response (400)
```json
{
  "error": "action must be \"flag\" or \"dismiss\""
}
```

---

## Manual Testing Checklist

### Pre-Test Setup
- [ ] Create test vendor with pending status
- [ ] Create 2-3 test transactions linked to vendor
- [ ] Create verified test station for resolution
- [ ] Note all UUIDs for testing

### Resolution Tests
- [ ] Test 1 - Resolve to existing station
- [ ] Verify all transactions updated
- [ ] Check vendor status changed
- [ ] Verify audit trail complete

### Station Creation Tests
- [ ] Test 2 - Create station with full data
- [ ] Verify new station in KV store
- [ ] Test 3 - Create station with missing GPS
- [ ] Verify metadata flags set correctly

### Rejection Tests
- [ ] Test 4 - Reject with flag action
- [ ] Verify transactions flagged
- [ ] Test 5 - Reject with dismiss action
- [ ] Verify transactions dismissed

### Error Handling Tests
- [ ] Tests 6-11 - All error scenarios
- [ ] Verify appropriate status codes
- [ ] Verify error messages are descriptive

### Post-Test Validation
- [ ] Check transaction count in summary matches actual
- [ ] Verify no orphaned data
- [ ] Confirm audit trail completeness
- [ ] Verify vendor cannot be resolved twice

---

## Success Criteria

✅ **All resolution methods work correctly**
✅ **Transaction metadata updated properly**
✅ **Vendor status changes correctly**
✅ **Station creation works with/without GPS**
✅ **Rejection preserves audit trail**
✅ **Error handling is robust**
✅ **No data corruption or loss**
✅ **Idempotency checks work (already resolved)**

---

**Status:** Ready for manual testing
**Next Step:** Execute tests in development environment
**Estimated Time:** 45 minutes
