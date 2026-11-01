# RoamFleet Maintenance Logging — Audit

**Rev 11 · 1 Nov 2026 (05:26 UTC)** · S-01–S-03 **Done** in repo + live deploy. S-04 **Partial** (cron armed; first scheduled fire pending).
**Scope:** logging only. The full system is in `fleet-maintenance-enterprise-audit.md`.
**Checked:** working tree after audit fix pass, `fleet-ops` deploy smoke, live DB cron + `fleet.maintenance_job_runs`.

**Status:** Q-01/Q-02 unchanged. Open items from Rev 10 are closed in code except S-04 automatic cron proof (see below).

---

## Closed (Rev 11)

### S-01 · High · Odometer pre-check route — **Done**
- **Fix applied:** `npm run deploy:fleet-ops` (1 Nov 2026 ~05:24 UTC). Bundle rebuilt; smoke `fleet-ops: all checks passed`.
- **Verification:** Generated [`supabase/functions/fleet-ops/index.ts`](supabase/functions/fleet-ops/index.ts) includes `odometer/check` after esbuild. Step 1 calls `POST /maintenance/odometer/check` via [`apps/fleet/src/services/api.ts`](apps/fleet/src/services/api.ts).
- **Product check:** Log service → Roomy → Step 1 → **6 Jan 2026**, **1,230,000 km** → amber anomaly panel (requires fleet auth in browser).

### S-02 · High · Dialog copy visibility — **Done**
- **Fix:** All `text-secondary` → `text-stitch-secondary` in log-service wizard TSX (8 files under `maintenance-logging/log-service/`).
- **Guard:** `npm run check:log-service-text-tokens` ([`scripts/check-log-service-text-tokens.mjs`](scripts/check-log-service-text-tokens.mjs)).

### S-03 · Medium · OEM summary + mechanic note — **Done**
- **OEM bar:** [`logServiceOemMatchSummary.ts`](apps/fleet/src/components/vehicles/maintenance-logging/log-service/logServiceOemMatchSummary.ts) — `replace` lines need `partId` + `partConfirmedFit` (from compatible-parts `confirmedFit` at pick time). Shows `ALL OEM MATCH CRITERIA CLEARED` or amber `N LINES WITHOUT A VERIFIED PART` (non-blocking).
- **Note block:** Single Stitch card — label *Mechanic Note / Work Order Reference*, hint `Optional · {homeBase}`, placeholder `e.g., WO-…: what was done`. `homeBase` from hub vehicle row via [`FleetMaintenanceHub.tsx`](apps/fleet/src/components/vehicles/FleetMaintenanceHub.tsx).
- **Tests:** `logServiceOemMatchSummary.test.ts` (vitest).

### S-04 · Verify · Scheduled nightly run — **Partial**
- **Cron:** `fleet-maintenance-nightly` active, schedule `0 7 * * *` (verified in `cron.job`).
- **`cron.job_run_details`:** empty at Rev 11 verification (~05:26 UTC 1 Nov) — no scheduled execution logged yet (first window **07:00 UTC** same day not reached at check time).
- **`fleet.maintenance_job_runs`:** Latest successes at **03:29** and **04:50 UTC** remain **manual** (`nightly_check`).
- **Done when (still):** After **07:00 UTC**, confirm a new success row and matching `cron.job_run_details` success; hub [`MaintenanceNightlyStatusLine`](apps/fleet/src/components/vehicles/maintenance-logging/MaintenanceNightlyStatusLine.tsx) shows fresh nightly run via `maintenance-fleet-summary`.

---

## Visual pass (12 Stitch refs) — Rev 11

Reference PNGs: [`docs/stitch/roam-fleet-app/maintenance-logging/`](docs/stitch/roam-fleet-app/maintenance-logging/).

| Stitch screen | Rev 11 note |
|---------------|-------------|
| `fleet_maintenance_overview` | No code change this pass; already on `text-stitch-secondary` (Rev 9). Re-screenshot when signed in. |
| `fleet_maintenance_due_items_drawer` | Same. |
| `fleet_maintenance_service_history_tab` | Same. |
| `fleet_maintenance_log_odometer` | Same. |
| `fleet_maintenance_odometer_history_drawer` | Same. |
| `fleet_maintenance_log_service_which_car` | Same (`LogServiceWhichCarDialog` already stitch tokens). |
| `fleet_maintenance_log_service_step_1_date_mileage` | **Updated** typography + live anomaly once S-01 deployed. |
| `fleet_maintenance_log_service_step_2_what_was_done` | **Updated** typography. |
| `fleet_maintenance_log_service_step_3_line_details` | **Updated** typography, OEM bar logic, mechanic note card. |
| `fleet_maintenance_log_service_step_4_review_and_save` | **Updated** typography. |
| `fleet_maintenance_states_*` | No change; verify on next hub QA pass. |
| `fleet_maintenance_phone_390px_*` | Re-screenshot hub + wizard at 390px after sign-in. |

**New open items from pixel compare:** none filed without authenticated side-by-side captures. Next step: signed-in screenshot diff; any mismatch becomes Rev 12 line items.

---

## Open items

*(none for S-01–S-03)*

**Follow-up:** S-04 automatic cron proof after **07:00 UTC** (see above).
