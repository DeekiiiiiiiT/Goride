# RoamFleet Maintenance — Enterprise Audit

**Rev 12 · 1 Nov 2026 · CLOSED.** No open maintenance findings. Logging audit is separate: [fleet-maintenance-logging-audit.md](./fleet-maintenance-logging-audit.md).

**Verified live this pass:**
- Production data:
  - No vehicle is flagged Do not drive.
  - Both smoke-test work orders are cancelled with a reason.
  - There are 0 stray notifications and 0 unprocessed events.
  - The audit log has 4 rows, and every one has `actor_id`.
- **Clear do not drive** is wired: badge → reason dialog (min 10 chars) → `api.clearVehicleDoNotDrive`. It shows only to `vehicles.edit` / `maintenance.approve`.
- Everything is committed and pushed (`main` = `origin/main`).

## Outside this audit — migration drift (blocks the next `db push`)

Two of the newest local migration files carry different versions than production. Neither is a maintenance file:

| Production | Local file |
|---|---|
| `20261101213237` fleet_inventory_r16_gap_writes | `20261101210200_…` |
| `20261101213434` catalog_trusted_source_blocked_at | `20261101221500_…` |

**Fix:** rename both local files to the production version numbers, then commit. This is tracked in the inventory and find-parts audits, and is noted here only because it stops any future maintenance migration from pushing.

## Only follow-up

The next time a real service is logged in Fleet, or a driver fails a real DVIR item, check that the new row has `actor_id` and that the hub badge appears. No action is needed until then.
