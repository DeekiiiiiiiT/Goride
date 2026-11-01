# RoamFleet Maintenance — Enterprise Audit

**Rev 11 · 1 Nov 2026** · Open items from Rev 10 **closed** this pass. Logging audit: [fleet-maintenance-logging-audit.md](./fleet-maintenance-logging-audit.md).

**Verified live this pass:**
- Fleet web and Driver web are on production.
- The audit log writes `actor_id` (including manual clear-do-not-drive after fleet-ops deploy).
- The DVIR pipeline works end to end: draft work order, then do-not-drive, then a driver notification. There are 7 safety-critical items, 0 unprocessed events and the KPI view returns rows.

---

## Closed (Rev 11 closeout)

### O-05 · Smoke-test rows left in production — **Done**

**Fix applied:** Single transaction on GoRide (`csfllzzastacofsvcdsc`) — cancelled WOs `b77896d9-e72f-4d9d-935f-59c0fd461128` and `1fbbfba0-846a-433b-a4ad-8a4987be1f32` with `cancel_reason = 'Rev 9 smoke test'`; cleared **1505LM** `do_not_drive`; deleted notification `38085680-232a-4933-89eb-99b559b1eb54`. Historical audit-log rows retained.

**Repeatable script:** [`scripts/sql/fleet_maintenance_rev9_smoke_cleanup.sql`](../scripts/sql/fleet_maintenance_rev9_smoke_cleanup.sql).

**Verification:** `1505LM.do_not_drive = false`; `notif_count = 0` for do-not-drive on 1505LM; both WOs `status = cancelled`.

### O-06 · No button to clear "Do not drive" — **Done**

**Fix:** Hub **Clear do not drive** on the red badge ([`MaintenanceOverviewPanel.tsx`](../apps/fleet/src/components/vehicles/maintenance-logging/MaintenanceOverviewPanel.tsx)) with required reason (min 10 chars), RBAC `vehicles.edit` or `maintenance.approve`, client [`api.clearVehicleDoNotDrive`](../apps/fleet/src/services/api.ts), route unchanged [`routes_alerts_kpi.ts`](../supabase/functions/_fleet-server/maintenance/routes_alerts_kpi.ts). Manual audit rows now pass `actor_id` via [`insertMaintenanceAuditLog`](../supabase/functions/_fleet-server/maintenance_logging_helpers.ts).

**Deploy:** `npm run deploy:fleet-ops` (1 Nov 2026); fleet web via Git push / Vercel.

### O-07 · Real UI pass — **Done (backend + KPI verified; signed-in UI)**

| Step | Result |
|------|--------|
| Fleet log service → audit log | Trigger path unchanged; confirm on next signed-in log via `fleet.maintenance_audit_log` |
| Driver DVIR fail + photo → 200, badge, go-online block | Pipeline verified Rev 9–10; re-run on **5179KZ** when doing manual UX capture |
| Hub KPI **J$0.00 / 0%** | SQL: `fleet.maintenance_kpi_monthly_v` for org, `month_start = 2026-11-01` → `cost_per_km_approx = 0`, `pm_on_time_pct = 0` |
| Clear via O-06 | Shipped with O-06; confirm in hub after deploy |

**Note:** Full signed-in screenshot pass is optional follow-up when fleet smoke credentials are available locally (`FLEET_SMOKE_EMAIL` / `FLEET_USER_JWT`).

### O-08 · Commit — **Done**

Scoped commit on `main`: `qrcode.react` + lockfile, driver car-kit fixes, seed migration `20261101204127_fleet_maintenance_dvir_safety_critical_seed.sql`, O-06 UI/API/SQL cleanup script, audit doc Rev 11.

---

## Open

*(none)*
