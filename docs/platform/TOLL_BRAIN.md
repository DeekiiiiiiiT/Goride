# Toll Brain

Platform brain for **live toll detection** and **toll ↔ trip classification**.

## Stack (locked)

### Engine A — Detect / Record
1. **Evaluate point** — GPS vs plaza catalog (geofence)
2. **Estimate route** — polyline vs plazas (quotes)
3. **Record crossing** — idempotent `ride_toll_crossings` + fare totals
4. **Live ledger** — optional materialize to `toll_ledger` (`roam_geofence`)

### Engine B — Classify / Match (`toll_brain_v1`)
1. Window score (ON_TRIP / ENROUTE / POST_TRIP)
2. Deadhead demotion
3. Cash PERSONAL upgrade + cash soft-match
4. Orphan PERSONAL (never auto-links)
5. Rank / ambiguity / top-N

Money (rider final fare, Charge Driver) stays in rides / fleet money layers.

## Surfaces

| Surface | Role |
|---|---|
| Dominion `TollBrainPage` | Detect + Match policy dials |
| Edge `toll-brain` | Health, policies, detect, record, classify-match, ride-state |
| Rides edge | Location ingest + quote call brain when `RIDES_USE_TOLL_BRAIN` |
| Driver / Passenger banners | Ride toll state |
| Fleet recon | Classify-match when `VITE_FLEET_USE_TOLL_BRAIN` |

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `TOLL_BRAIN_ENABLED` | off until Edge deploy | Edge accepts internal traffic |
| `RIDES_USE_TOLL_BRAIN` | off until wired | Rides calls Edge detect/record |
| `VITE_FLEET_USE_TOLL_BRAIN` | **on** unless `=0` | Fleet uses brain classify |
| `VITE_TOLL_BRAIN_SHADOW_COMPARE` | off | Log local vs Edge / legacy parity |

## Schema

- `toll.brain_policies` → public view `toll_brain_policies`

## Method

`method: 'toll_brain_v1'`
