# Toll Brain Cutover

## Deploy order

1. Apply migration `20260718120000_toll_brain_schema.sql`
2. Deploy Edge function `toll-brain` (`pnpm deploy:toll-brain`)
3. Set Edge secrets: `TOLL_BRAIN_ENABLED=1`, `TOLL_BRAIN_INTERNAL_SECRET=<shared>`
4. Deploy Dominion (Toll Brain page under Toll Management)
5. Deploy fleet edge (`pnpm deploy:edge`) — flags default consume ON unless `FLEET_USE_TOLL_BRAIN=0`
6. Enable rides: `RIDES_USE_TOLL_BRAIN=1` + same internal secret on rides edge env; `pnpm deploy:rides`
7. Confirm Dominion policy save → live detect radius / personal-use honored

## Rollback

| Surface | Action |
|---------|--------|
| Fleet recon | `VITE_FLEET_USE_TOLL_BRAIN=0` and/or Edge `FLEET_USE_TOLL_BRAIN=0` |
| Rides live | `RIDES_USE_TOLL_BRAIN=0` (falls back to local geofence) |
| Edge | `TOLL_BRAIN_ENABLED=0` (internal APIs return 503) |

## Shadow

With `VITE_TOLL_BRAIN_SHADOW_COMPARE=1` / `TOLL_BRAIN_SHADOW_COMPARE=1` and consumer off, fleet logs matchType deltas vs legacy constants.

## Repair

`POST …/bridge-rides` remains available as backfill for crossings that pre-date live materialize.

## Verify

- [ ] `GET …/toll-brain/health` → `brain_enabled: true`
- [ ] Dominion Toll Brain saves Detect + Match dials
- [ ] Live crossing appears in ride banners and `toll_ledger` without Import geofence
- [ ] Fleet Automation personal-use dials are read-only mirrors of Dominion
- [ ] Cash soft-match / Jan golden periods still classify correctly
- [ ] Kill-switch each surface independently
