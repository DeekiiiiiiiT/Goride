# Platform Matching Brain

The Matching Brain is a centralized rider-driver dispatch engine that serves all Roam products through a dedicated Supabase Edge function.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    roamdominion.co (Super Admin)                │
│                    ┌──────────────────────┐                     │
│                    │ Matching Brain Panel │                     │
│                    └──────────┬───────────┘                     │
└───────────────────────────────┼─────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   matching Edge fn     │
                    │  /admin/* /v1/internal │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  rides Edge   │     │  fleet Edge   │     │  dash Edge    │
│   (proxy)     │     │   (future)    │     │   (future)    │
└───────┬───────┘     └───────────────┘     └───────────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
roam-s.co  roamdriver.co
```

## Feature Flags

| Flag | Purpose | Default |
|------|---------|---------|
| `MATCHING_BRAIN_ENABLED` | Master kill-switch for matching Edge | `0` |
| `RIDES_USE_MATCHING_BRAIN` | Rides delegates to brain vs legacy | `0` |
| `MATCHING_SERIAL_DISPATCH` | Serial 1-to-1 offers | `0` |
| `MATCHING_H3_SUPPLY` | H3-indexed driver lookup | `0` |
| `MATCHING_H3_SURGE` | H3 surge cells | `0` |

## Database Schema

### `matching.policies`

Central dispatch configuration. Migrated from `rides.dispatch_settings` with extensions.

```sql
CREATE TABLE matching.policies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  
  -- Wave dispatch
  max_match_waves INTEGER,
  wave_radius_km NUMERIC[],
  max_offers_per_wave INTEGER,
  default_driver_offer_timeout_seconds INTEGER,
  
  -- Serial dispatch
  serial_dispatch_enabled BOOLEAN,
  
  -- H3 indexing
  h3_resolution INTEGER,
  h3_supply_enabled BOOLEAN,
  h3_surge_enabled BOOLEAN,
  wave_h3_k_rings INTEGER[],
  
  -- Audit
  updated_at TIMESTAMPTZ,
  updated_by UUID
);
```

### `matching.product_profiles`

Maps products to policies with optional overrides.

```sql
CREATE TABLE matching.product_profiles (
  id UUID PRIMARY KEY,
  product_key TEXT,  -- 'rides', 'fleet', 'dash', 'enterprise'
  surface_key TEXT,  -- 'rider', 'driver', 'default'
  policy_id UUID REFERENCES matching.policies(id),
  overrides JSONB,
  is_active BOOLEAN
);
```

## Edge Function API

### Admin Endpoints

Require platform admin JWT (`platform_owner`, `superadmin`, `rides_admin`).

```
GET  /admin/policies           # List all policies
GET  /admin/policies/:id       # Get policy details
PATCH /admin/policies/:id      # Update policy

GET  /admin/product-profiles   # List product profiles
POST /admin/product-profiles   # Create profile
PATCH /admin/product-profiles/:id  # Update profile
```

### Internal Endpoints

Require service role + `X-Matching-Internal-Secret` header.

```
POST /v1/internal/start-matching    # Start matching for a ride
POST /v1/internal/reconcile         # Advance matching state
POST /v1/internal/run-wave          # Run specific wave
POST /v1/internal/accept-offer      # Atomic accept
POST /v1/internal/decline-offer     # Decline and reconcile
POST /v1/internal/reconcile-all     # Cron: batch reconcile
```

### Public Endpoints

```
GET  /health                   # Health check with flag status
GET  /v1/policy                # Query resolved policy (auth required)
```

## Integration Guide

### For New Products

1. Create a product profile:
   ```typescript
   await supabase.from('matching_product_profiles').insert({
     product_key: 'my_product',
     surface_key: 'default',
     policy_id: defaultPolicyId,
     is_active: true,
   });
   ```

2. Set environment variables:
   ```bash
   MATCHING_INTERNAL_SECRET=your_secret
   MATCHING_BRAIN_ENABLED=1
   ```

3. Call matching brain from your Edge function:
   ```typescript
   const response = await fetch(`${SUPABASE_URL}/functions/v1/matching/v1/internal/start-matching`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
       'X-Matching-Internal-Secret': MATCHING_INTERNAL_SECRET,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       product_key: 'my_product',
       ride_request_id: rideId,
       ride_snapshot: {
         pickup_lat,
         pickup_lng,
         vehicle_option,
         rider_user_id,
       },
     }),
   });
   ```

### For Rides (Already Integrated)

The rides Edge function automatically delegates to matching brain when `RIDES_USE_MATCHING_BRAIN=1`. No code changes required.

## H3 Spatial Indexing

### Resolution

Default resolution: 7 (~1.2km edge length)

| Resolution | Edge Length | Use Case |
|------------|-------------|----------|
| 6 | ~3.2km | Regional |
| 7 | ~1.2km | Urban (default) |
| 8 | ~460m | Dense urban |
| 9 | ~175m | Very precise |

### Wave K-Rings

The `wave_h3_k_rings` array maps wave numbers to H3 k-ring values:

```json
{
  "wave_radius_km": [5, 15, 35],
  "wave_h3_k_rings": [4, 13, 29]
}
```

Calibrate per market using actual driver data.

### Jamaica Calibration

Reference point: Kingston (17.9714, -76.7932)

| Wave | Radius (km) | K-Ring |
|------|-------------|--------|
| 1 | 5 | 4 |
| 2 | 15 | 13 |
| 3 | 35 | 29 |

## Serial Dispatch

When `serial_dispatch_enabled=true`:

1. Offers sent one driver at a time
2. Declines retry same wave (same radius) until exhausted
3. Only then advances to next wave
4. Reduces driver churn and "accept races"

## Atomic Accept

The `matching_accept_driver_offer` RPC function ensures race-free assignment:

1. Locks offer and ride rows
2. Validates state (pending, not expired, ride matching)
3. Atomically updates both tables
4. Supersedes other offers
5. Returns updated ride

## Rollback

To disable matching brain and revert to legacy:

1. Set `RIDES_USE_MATCHING_BRAIN=0`
2. Rides Edge immediately uses in-process matching
3. No data migration required

## Monitoring

Key metrics to watch:

- `accept_race_lost` - Should be zero with atomic accept
- `no_drivers_available` - Supply issues
- `matching_timeout` - Configuration issues
- `match_wave_diag.supply_source` - `h3` vs `legacy`
