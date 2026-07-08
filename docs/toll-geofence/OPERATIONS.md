# Toll Geofence — Operations Guide

## Feature flags (default OFF)

| Flag | Where | Purpose |
|------|-------|---------|
| `route_toll_estimation_enabled` | Dispatch settings / Matching Brain | Quote uses route polyline × plaza geofences instead of static fare-rule tolls |
| `toll_detection_enabled` | Dispatch settings / Matching Brain | Live GPS toll detection during trips |
| `toll_geofence_radius_m` | Dispatch settings | Plaza match radius (start 100m staging) |
| `toll_detect_enroute` | Dispatch settings | Detect tolls before pickup — **keep OFF** (deadhead = driver expense) |

## Staged rollout

1. **Staging:** Verify all Jamaica plazas in Toll Database (Class 1 rate, GPS, radius 100–150m) using Spatial Audit map.
2. Enable `route_toll_estimation_enabled` — confirm booking breakdown shows route-based toll lines.
3. Enable `toll_detection_enabled` with 100m radius — internal driver test trips only.
4. **Production:** Week 1 internal only → Week 2 ~10% product line → Week 3 100% if false-positive rate under 1%.

## Plaza maintenance

- Add or verify plazas in **Toll Database** (Roam Dominion / Fleet admin).
- Each plaza needs: coordinates, `geofenceRadius`, Class 1 (standard/car) rate, status active.
- Use **Toll Spatial Audit** to confirm geofence circles cover the roadway.

## Live monitoring

- **Live Toll Monitor** (Roam Dominion → Toll Management): active trips, GPS age, toll totals.
- **Ride Operations** (Rides admin): per-ride **Tolls** drawer with crossing list.

## Reconciliation

- Geofence-detected crossings sync to fleet ledger as `metadata.source = roam_geofence`.
- **Geofence confirmed** badge on toll detail when source is roam geofence; **Mismatch** when tag charge has trip link but no geofence record.

## Disputes

- Dispute/refund eligibility is unchanged — geofence badge is read-only context for ops.
