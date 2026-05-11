# Phase 4 - Transaction Release Logic

## Overview
When a vendor is resolved (either to existing station or new station), all gate-held transactions are automatically released and updated with the verified station information.

## Release Process

### Step 1: Fetch All Linked Transactions
```typescript
const transactions = await getUnverifiedVendorTransactions(vendorId);
```

Retrieves all transactions with IDs in the vendor's `transactionIds` array.

### Step 2: Update Each Transaction
For each transaction:

1. **Add Resolution Metadata**
   ```typescript
   tx.metadata.resolvedVendorId = vendorId;
   tx.metadata.resolvedStationId = stationId;
   tx.metadata.resolvedAt = now;
   tx.metadata.resolvedBy = adminUserId;
   tx.metadata.locationStatus = 'verified';
   tx.metadata.verificationMethod = 'manual_vendor_resolution';
   ```

2. **Update Station Reference**
   ```typescript
   tx.stationId = stationId;
   tx.station = station.name;
   ```

3. **Save Transaction**
   ```typescript
   await kv.set(`transaction:${tx.id}`, tx);
   ```

### Step 3: Mark Vendor as Resolved
```typescript
vendor.status = 'resolved';
vendor.resolvedAt = now;
vendor.resolvedBy = adminUserId;
vendor.resolvedStationId = stationId;
```

## Resolution Methods

### Method 1: Resolve to Existing Station
**Endpoint:** `PUT /unverified-vendors/:id/resolve`

**Use Case:** Vendor name matches an existing verified station

**Example:**
```json
{
  "stationId": "existing-station-uuid",
  "resolvedBy": "admin-user-id"
}
```

**Result:**
- All transactions linked to verified station
- Vendor marked as resolved
- Transactions no longer in review queue

### Method 2: Create New Station
**Endpoint:** `POST /unverified-vendors/:id/create-station`

**Use Case:** Vendor is a new, unknown station

**Example:**
```json
{
  "stationData": {
    "name": "Shell - Half Way Tree",
    "brand": "Shell",
    "address": "123 Main St, Kingston",
    "location": { "lat": 18.0179, "lng": -76.8099 },
    "phone": "876-555-1234",
    "services": ["Fuel", "Convenience Store"]
  },
  "resolvedBy": "admin-user-id"
}
```

**Result:**
- New verified station created
- All transactions linked to new station
- Vendor marked as resolved
- Station metadata flags if GPS/address needs update

### Method 3: Reject Vendor
**Endpoint:** `DELETE /unverified-vendors/:id`

**Use Case:** Vendor is invalid or fraudulent

**Example:**
```json
{
  "rejectedBy": "admin-user-id",
  "reason": "Not a fuel vendor",
  "action": "flag"
}
```

**Result:**
- Vendor marked as resolved
- Transactions flagged or dismissed
- No station created
- Audit trail preserved

## Transaction Metadata Fields

### Before Resolution
```json
{
  "id": "tx-123",
  "vendor": "Shell Gas",
  "amount": 5000,
  "metadata": {
    "unverifiedVendorId": "vendor-uuid",
    "locationStatus": "unverified"
  }
}
```

### After Resolution
```json
{
  "id": "tx-123",
  "vendor": "Shell Gas",
  "station": "Shell - Half Way Tree",
  "stationId": "station-uuid",
  "amount": 5000,
  "metadata": {
    "unverifiedVendorId": "vendor-uuid",
    "resolvedVendorId": "vendor-uuid",
    "resolvedStationId": "station-uuid",
    "resolvedAt": "2026-03-17T14:30:00Z",
    "resolvedBy": "admin-123",
    "locationStatus": "verified",
    "verificationMethod": "manual_vendor_resolution"
  }
}
```

## Audit Trail

Every resolution creates a complete audit trail:

1. **Vendor Record**
   - `resolvedAt` - When resolved
   - `resolvedBy` - Admin who resolved
   - `resolvedStationId` - Station ID (if resolved)
   - `rejectedAt` - When rejected (if rejected)
   - `rejectionReason` - Why rejected (if rejected)

2. **Transaction Records**
   - Original vendor name preserved
   - Resolution timestamp
   - Admin who performed resolution
   - Verification method

3. **Station Record** (if created)
   - `createdFrom: 'unverified_vendor'`
   - `sourceVendorId` - Original vendor ID
   - `createdBy` - Admin who created
   - Flags for incomplete data

## Error Handling

### Vendor Not Found
```json
{
  "error": "Vendor not found: vendor-uuid"
}
```

### Station Not Found
```json
{
  "error": "Station not found: station-uuid"
}
```

### Already Resolved
```json
{
  "error": "Vendor vendor-uuid is already resolved"
}
```

### Missing Required Fields
```json
{
  "error": "Station ID and resolvedBy are required"
}
```

## Performance Considerations

1. **Batch Updates**
   - Transactions updated sequentially to ensure data consistency
   - Each transaction update logged individually

2. **No Rollback**
   - Resolution is final and cannot be undone
   - Admin should verify decision before resolving

3. **Transaction Count**
   - Typical vendor has 1-10 transactions
   - Max observed: ~50 transactions per vendor
   - Update time: ~50-500ms per vendor

## Testing Scenarios

### Scenario 1: Resolve 3 Transactions to Existing Station
- **Input:** Vendor with 3 transactions, existing station ID
- **Expected:** All 3 transactions updated with station reference
- **Validation:** `SELECT * FROM transactions WHERE resolvedVendorId = 'vendor-uuid'`

### Scenario 2: Create Station and Resolve
- **Input:** Vendor with 5 transactions, new station data
- **Expected:** New station created, all 5 transactions linked
- **Validation:** Station exists, all transactions have `stationId`

### Scenario 3: Reject Vendor with Flag Action
- **Input:** Vendor with 2 transactions, rejection reason
- **Expected:** Vendor resolved, transactions flagged
- **Validation:** Transactions have `flagged: true`

---

**Status:** ✅ Implemented in Phase 4
**Functions:** `resolveVendorToStation()`, `createStationFromVendor()`, `rejectUnverifiedVendor()`
**Endpoints:** 3 endpoints created (PUT, POST, DELETE)
