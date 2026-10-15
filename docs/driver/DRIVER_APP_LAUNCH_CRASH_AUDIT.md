# Roam Driver — "app opens and closes" audit

**Reported by:** Kenny Rattray (TECNO KI5q, Android 13, Play Store build 1.0.26)
**Cause:** the WebView gets killed on low-RAM phones and the app had no recovery. The camera handoff can also cause a restart.
**Rev 5 (2026-10-15):** Rev 4 open code item closed. Staff with `vehicles.view` get org-wide `/my` again; drivers stay assignment-scoped. `fleet-core` redeployed. AAB **1.0.27 (28)** uploaded to Play. Remaining = Play vitals note + live traffic verify + Kenny.

---

## 1. Regression: fleet managers lost their pending-catalog badges — Done 2026-10-15

`GET /vehicle-catalog-pending/my` now branches:

- Staff (`hasPermission(resolvedRole, "vehicles.view")`) → org-wide open requests; optional `fleet_vehicle_id` filter.
- Drivers → assigned vehicle only (unchanged).

Helper: `resolveMyPendingCatalogScope` in `_fleet-server/pending_catalog_my_scope.ts`. Deno 5/5. `fleet-core` redeployed (server-only; no AAB rebuild).

**Confirm in Fleet:** Vehicles page pending badges should be back for managers.

---

## 2. Ship

1. Upload `apps/driver/android/app/release/app-release.aab` to Play Console — **Done** (PO uploaded 2026-10-15).
2. **Play Console → Android vitals → Crashes & ANRs** for device **KI5q** (renderer kill vs camera) — **PO action:** note finding here when checked.

| Item | Status |
|---|---|
| Version on Play | 1.0.27 (28) uploaded |
| KI5q vitals note | Pending PO check |

---

## 3. Verify after the Play rollout

| Check | Expect | Status |
|---|---|---|
| `function_edge_logs` → `rides/.../active-ride` | `200`, not `500` | Re-check after drivers on 1.0.27 |
| `fleet-core/platform-status` | No 401s from the driver app | Baseline 401s at 20:11 UTC looked non-driver |
| Sentry | Events tagged release `1.0.27` | Pending device on 1.0.27 |
| Kill mid-photo (odometer, receipt, toll, check-in) | Right screen + photo applied | Pending device |
| Two drivers, same org, different vehicles | Each sees only own pending rows | Server live; confirm on device |
| Fleet manager catalog badges | Org badges visible | Server live; confirm in Fleet app |

---

## 4. Kenny

- **Send after the update is live on his phone:**
  > Please update Android System WebView and Chrome, then restart your phone. In Battery settings, set Roam Driver to "No restrictions." Turn off any TECNO auto-close / freeze for Roam Driver. Install the new app update when it appears. If it still opens and closes, clear Roam Driver's app storage and try again.
- **Product decision:** should Kenny take passenger trips? If yes, set `driver_profiles.dispatch_pilot = true`. If not, nothing to do; the app already hides Go Online for him.
  - **Decision recorded:** awaiting PO (default: do not flip `dispatch_pilot`).
