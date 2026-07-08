# Toll Geofence — Production Launch Checklist

No automated tests required. Follow this order.

## 1. Deploy database

Apply migrations on production Supabase (if not already):

```bash
npx supabase db push --project-ref csfllzzastacofsvcdsc
```

Required columns on `rides.dispatch_settings`:

- `route_toll_estimation_enabled` (default `false`)
- `toll_detect_enroute` (default `false`)
- Existing: `toll_detection_enabled`, `toll_geofence_radius_m`

## 2. Deploy edge functions

```bash
pnpm deploy:rides
```

This ships: route toll estimation, live toll detection, `GET /v1/requests/:id/toll-crossings`, and admin dispatch PATCH for new flags.

## 3. Deploy frontends

Deploy as you normally do:

- **Roam Rides** (`apps/rides-passenger`) — booking breakdown, live banner, receipt
- **Roam Driver** (`apps/driver`) — toll toast, on-trip banner, cash card
- **Roam Dominion** (`apps/admin`) — Live Toll Monitor
- **Roam Fleet** (`apps/fleet`) — geofence badge on reconciliation

Run `pnpm install` at repo root before building (new `@roam/toll-ui` package).

## 4. Verify toll plaza data (blocking)

In **Roam Dominion → Toll Management → Toll Database**:

- Every Jamaica highway plaza you bill for must be **verified/active**
- Each plaza needs: GPS pin, `geofenceRadius` 100–150m, **Class 1** rate (standard/car)
- Use **Toll Spatial Audit** map — circles must cover the roadway, not parallel streets

Without correct plazas, estimates and live detection silently return $0.

## 5. Enable flags (staging first)

**Rides Admin → Dispatch Settings → Toll detection** (or SQL on `rides.dispatch_settings`):

| Step | Flag | Value |
|------|------|-------|
| 1 | `route_toll_estimation_enabled` | `true` |
| 2 | Book a toll route in staging | Confirm “View fare breakdown” shows toll line |
| 3 | `toll_detection_enabled` | `true` |
| 4 | `toll_geofence_radius_m` | `100` (raise to 150 only if misses) |
| 5 | `toll_detect_enroute` | **`false`** (keep off — deadhead is driver cost) |

Repeat on production only after one clean staging trip through a real plaza.

## 6. Smoke one real trip (manual)

1. Book Kingston → Spanish Town (or any known toll route)
2. Driver accepts; GPS on during `on_trip`
3. Driver passes plaza — rider banner + driver toast should appear
4. Complete cash trip — receipt shows base + tolls
5. **Dominion → Live Toll Monitor** — trip shows toll total while active
6. **Ride Operations → Tolls** — crossing list with plaza name

## 7. Production rollout pace

- **Week 1:** Staging + internal drivers only
- **Week 2:** Production flags on; monitor Live Toll Monitor daily for false positives
- **Week 3:** Full rollout if wrong toll rate &lt; 1% of trips

## 8. Rollback (instant)

Turn off in dispatch settings — no redeploy needed:

```sql
UPDATE rides.dispatch_settings
SET toll_detection_enabled = false,
    route_toll_estimation_enabled = false
WHERE id = 1;
```

Existing trips keep recorded crossings; new trips stop detecting and quotes revert to static fare-rule tolls.

## 9. Known limits (v1)

- Matching Brain UI does not yet expose `route_toll_estimation_enabled` — use **Rides Admin dispatch settings**
- Fleet **Live Toll Monitor** nav links to Dominion; monitor lives in `apps/admin`
- Quote shows estimated tolls; rider is charged **actual GPS crossings only** at trip end
