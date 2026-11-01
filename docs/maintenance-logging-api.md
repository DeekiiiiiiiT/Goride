# Maintenance logging API (fleet-ops)

Contract for the maintenance logging program ([fleet-maintenance-logging-audit.md](./fleet-maintenance-logging-audit.md)).

Base: `POST/GET ${fleetOps}/…` with normal fleet auth headers unless noted.

## Reads

### `GET /maintenance-fleet-summary`

Org-scoped fleet maintenance overview. Sources: `fleet.vehicles`, `fleet.vehicle_current_odometer_v`, `fleet.maintenance_due_v`, `fleet.maintenance_job_runs` (latest success).

Per vehicle:

- `vehicleId`, `licensePlate`, `make`, `model`, `year`, `fleetUnitId`, `homeBase`
- `odometer`: `{ reading, recordedAt, source, ageLabel } | null` (null → **Odometer needed**)
- `fleetStatus`: `overdue | odometer_needed | due_soon | ok`
- `nextDueSummary`, `dueItemCounts`, `lastService`, `servicesAttention[]`

Top-level: `nightlyRun`, `orgDueSoonKm`, `orgDueSoonDays`.

### `GET /maintenance-due/:vehicleId`

Rows from `maintenance_due_v` for due-items drawer.

### `GET /maintenance-job-runs/latest`

Latest successful nightly run for org (for header strip).

### `GET /maintenance-alerts`

Recent `fleet.maintenance_alerts` for notification bell (paginated).

### `GET /maintenance-service-history`

Completed, non-voided work-order lines (ledger view). Filters: `vehicleId`, `categoryId`, `from`, `to`, `q`.

### `POST /maintenance-log-number/reserve`

Returns `{ logNumber: "LOG-2026-000123" }` for open dialog session.

## Writes

### `POST /maintenance-work-orders`

Create draft / in-progress WO (legacy). **Requires** `odometer > 0` when `performedAtDate` set.

Body includes optional:

- `completeNow: true` — atomic log (see below)
- `idempotencyKey: string` — required with `completeNow`

Errors: `400 { code: "odometer_required" }`.

### `POST /maintenance-work-orders` with `completeNow: true`

Single atomic service log. Same body as create + complete combined.

1. Idempotent on `(organization_id, idempotency_key)`
2. Validates odometer, assesses anomaly
3. Creates completed WO + lines
4. Odometer reading `source=service`
5. `fleet.recompute_maintenance_schedule(vehicle_id)`
6. Finance posting (edge, once)
7. `fleet.maintenance_events` → `service.logged`

Response: `{ item, ledgerPosted, odometerAnomaly?, anomalyReason?, neighbors? }`

### `POST /maintenance-work-orders/:id/void`

Body: `{ reason: string }`. Void completed WO; reverses finance; recomputes schedule; audit log.

### `POST /maintenance-odometer`

Manual odometer log (Screen 8). Required reading > 0; anomaly assessment.

### `POST /maintenance-odometer/:id/verify`

Clear anomaly (`is_anomaly=false`, verifier fields).

### `POST /maintenance-odometer/:id/void`

Void reading with reason.

### `POST /maintenance/nightly-run`

Cron secret or admin. Runs `fleet.run_maintenance_nightly_check()`.

## Migration sequence (deploy order)

1. Columns + sequences + new tables
2. Views + assess + recompute functions
3. Edge routes switch reads to views
4. `completeNow` + idempotency
5. pg_cron nightly job
6. Immutability triggers + void RPC

## Alerts

Relational `fleet.maintenance_alerts` keyed `maint:{org}:{vehicle}:{category}:{position}:{yyyy-mm-dd}`. Bell merges with existing fleet alert feeds via `GET /maintenance-alerts`.

## Org settings

`fleet.organization_settings.due_soon_km` (default 1000), `due_soon_days` (default 14).
