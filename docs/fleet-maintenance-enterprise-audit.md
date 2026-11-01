# RoamFleet Maintenance — Enterprise Audit

**Rev 7 · 1 Nov 2026** · Open items only. Logging: [fleet-maintenance-logging-audit.md](./fleet-maintenance-logging-audit.md).
**Checked:** live DB after `20261101190100`–`190300` push; migration list clean; vendor picker in Fleet UI.

## Done

- **O-02 · Migrations:** History synced (prod mirror files, dupes archived, enterprise renamed `190100`–`190300`). `supabase db push` applied three enterprise releases only.
- **O-01 · Production schema:** `updated_by`, `vendor_id`, vehicle `do_not_drive`, `safety_critical`, `fleet.maintenance_kpi_monthly_v`, `fleet.driver_maintenance_notifications`, `fleet-maintenance-events` cron (every 5 min). Roomy dup WOs `f3763a08…` / `fc02dfb7…` **voided**. Events backlog drained (**0** unprocessed).
- **O-04 · Vendor picker:** Work orders board uses searchable vendor combobox + “Add vendor” ([`MaintenanceWorkOrderVendorPicker.tsx`](../apps/fleet/src/components/vehicles/maintenance-logging/MaintenanceWorkOrderVendorPicker.tsx)) via Expense Hub catalog APIs.
- **Logging S-04:** Nightly `drift_rows` — see logging audit (unchanged).

## Open · O-03 product smoke (manual)

Run signed-in on **Fleet** + **Driver** after `pnpm deploy:fleet-ops` and Fleet web ship:

1. Log one service → `fleet.maintenance_audit_log` rows with `actor_id` populated.
2. Roomy schedule — LR/RR last done **14 Oct 2025** (est. odometer); no Tire Change row with `position IS NULL` (SQL void check already passed).
3. Driver DVIR safety-critical fail → 200, draft WO, hub **Do not drive**, driver blocked online.
4. KPI strip loads without error (view returns data; cost/km may show `0` if fleet km in month is zero).

## Deploy

- **`pnpm deploy:fleet-ops`** — run after local maintenance routes match prod DB (done post-push).
- **Fleet web / Driver app** — promote when ready so hub + DVIR UI match API.
- **Git commit** — maintenance + migration files still uncommitted on `main`; commit when you want a snapshot.

---

*Product maintenance audit — Notion Supabase audit tracker not required.*
