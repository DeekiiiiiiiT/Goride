# Fleet Integrity: Full Geofencing Implementation Blueprint

This document outlines the transition from static coordinate matching to an **Event-Driven Circular Geofencing** architecture, triggered by the Odometer Scan.

---

## 1. Data Schema Enhancements

### Station Profile (`/types/station.ts`)
Add a `radius` field to the Master Ledger to allow for adaptive spatial boundaries.
```typescript
export interface StationProfile {
  // ... existing fields
  location: {
    lat: number;
    lng: number;
    radius: number; // Default: 75m. Urban: 30-50m. Enterprise: 100-150m.
    accuracy?: number;
  };
}
```

### Fuel Entry Metadata (`/types/fuel.ts`)
Capture the spatial proof-of-work during the Odometer trigger.
```typescript
export interface FuelEntry {
  // ... existing fields
  geofenceMetadata?: {
    isInside: boolean;
    distanceMeters: number;
    timestamp: string;
    radiusAtTrigger: number;
  };
}
```

---

## 2. Driver Portal Implementation (Frontend)

The **Odometer Scan** acts as the primary arming trigger for the Evidence Bridge.

### Step A: The Scan Trigger
When `onScanSuccess` is called, the app immediately captures a high-accuracy location snapshot.
```typescript
// Location Trigger Logic
const handleOdometerScan = async (scannedValue: number) => {
  const position = await getCurrentHighAccuracyPosition(); // Captures lat/lng
  
  // Find nearest station from Master Ledger
  const nearestStation = findNearestStation(position.lat, position.lng, stations);
  const distance = calculateDistance(
    position.lat, 
    position.lng, 
    nearestStation.location.lat, 
    nearestStation.location.lng
  );

  const isVerified = distance <= (nearestStation.location.radius || 75);

  setFormState({
    odometer: scannedValue,
    matchedStationId: isVerified ? nearestStation.id : null,
    geofenceMetadata: {
      isInside: isVerified,
      distanceMeters: distance,
      timestamp: new Date().toISOString(),
      radiusAtTrigger: nearestStation.location.radius || 75
    }
  });
};
```

### Step B: UI Feedback
- **Verified**: Show a green "Evidence Bridge Connected" badge with the station name.
- **Unverified**: Show a warning "Out of Range: Odometer scan detected outside known station perimeter."

---

## 3. Server Implementation (Backend)

The server verifies the spatial proof provided by the frontend and incorporates it into the **Audit Confidence Score**.

### Step A: Forensic Verification (`/supabase/functions/server/fuel_logic.ts`)
The server re-calculates the distance using its own copy of the Master Ledger to prevent frontend spoofing.

```typescript
export function calculateConfidenceScore(entry: any, station?: any) {
  let score = 0;
  
  // 1. Evidence Bridge: Spatial Verification (35 pts)
  const distance = entry.geofenceMetadata?.distanceMeters || 999;
  const radius = station?.location?.radius || 75;

  if (distance <= radius) {
    if (distance < 20) {
      score += 35; // Perfect "At-the-Pump" match
    } else if (distance < 50) {
      score += 25; // Standard station match
    } else {
      score += 15; // Perimeter match (likely truck stop)
    }
  }

  // ... 2. Cryptographic Handshake (25 pts)
  // ... 3. Physical Integrity (20 pts)
  // ... 4. Behavioral Integrity (20 pts)
  
  return {
    score: Math.min(100, score),
    isHighlyTrusted: score >= 90,
    requiresReview: score < 70
  };
}
```

### Step B: Immutable Ledger Locking
If `geofenceMetadata.isInside` is true and `score >= 90`, the server triggers the **Locked** state. The transaction is immediately promoted to the Master Ledger as "Verified" with the distance proof saved in the metadata for forensic audits.

---

## 4. Integration Logic: The "Evidence Bridge" Flow

1.  **Driver** opens the Fuel Log Form.
2.  **Driver** scans the Odometer (Event Start).
3.  **App** captures GPS + Performs distance check against local Master Ledger cache.
4.  **App** locks the Station ID and shows "Verified" status.
5.  **Driver** enters fuel volume and submits.
6.  **Server** re-verifies the Distance + Odometer Sequence.
7.  **Server** signs the record with SHA-256 and promotes to the Master Ledger if Confidence ≥ 90.
