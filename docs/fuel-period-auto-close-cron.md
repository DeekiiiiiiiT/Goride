# Fuel period auto-close cron

Daily job locks eligible Consumption Reconciliation weeks. Uses the same server finalize job as the UI (inherits NEW-7 partial-fail honesty). Preferences are **per organization** (`preferences:org:{orgId}` with fallback to `preferences:general`).

## Endpoint

`POST /make-server-37f42386/fuel/periods/auto-close?orgId=all`

Headers:
- `X-Fleet-Cron-Secret: <FLEET_CRON_SECRET>` (or `CRON_SECRET`)

Related:
- `POST /make-server-37f42386/fuel/periods/:id/build-snapshots` — full week engine (scenario shares + settledEntries); set `FUEL_BUILD_SNAPSHOTS_ENGINE=entries` for legacy entry-only assembler.

## Schedule

GitHub Actions: [`.github/workflows/fuel-period-auto-close-cron.yml`](../.github/workflows/fuel-period-auto-close-cron.yml) — daily 14:00 UTC (~09:00 Jamaica). Also `workflow_dispatch` for dry runs.

## Org preferences

| Pref | Values | Default |
|---|---|---|
| `fuelSecondApproverThreshold` | JMD number (`0` = off) | `50000` |
| `fuelAutoCloseDualApprovalMode` | `skip` \| `service_approve` | `skip` |
| `fuelDualApprovalUiMode` | `human` \| `service_only` | `human` |

### Dual-approval modes

- **`skip` (default):** spend above threshold → `skip_needs_approval` (human second approve in app first).
- **`service_approve`:** insert `second_approve` audit as `FUEL_AUTO_CLOSE_APPROVER_ID`, enqueue finalize with `created_by: FUEL_AUTO_CLOSE_FINALIZER_ID` (must differ).

UI `service_only`: wizard skips human second-approve CTA; finalize enqueue stamps system `second_approve` (`source: ui_service_approve`) while `created_by` is the logged-in human.

## Eligibility matrix

| Gate | Skip result |
|---|---|
| Unexplained ≤ epsilon **or** `leakage_reviewed_at` set | `skip_leakage` |
| Sum of `counts.*.actionable` is 0 | `skip_actionables` |
| No existing autoclose job for this period version | `skip_existing_*` |
| Spend > threshold and mode=`skip` | `skip_needs_approval` |
| Mode=`service_approve` but approver UUID = finalizer UUID | `skip_service_actor_misconfigured` |
| Snapshot build fails / no settleable entries | `skip_build_failed` / `skip_missing_snapshots` |

Zero-spend weeks may lock with an empty snapshot set. Money weeks call `buildFuelPeriodSnapshots` (full engine) when KV snaps are absent.

## Env actors

- `FUEL_AUTO_CLOSE_APPROVER_ID` — system second approver
- `FUEL_AUTO_CLOSE_FINALIZER_ID` — system finalizer (auto-close only)
- Defaults are distinct placeholder UUIDs when unset (override in production)

## Response shape

Includes `enqueued`, `skipped`, `skipByReason`, and per-period `details` (threshold/mode are per-org inside the loop).

## Notifications

Per-period `auto_close` audit + `alert:fuel-autoclose:…`, plus daily digest `alert:fuel-autoclose-digest:YYYY-MM-DD`.

## E2E

- Fleet wizard: `e2e/fuel-recon-wizard.spec.ts` — `E2E_FLEET_EMAIL` / `E2E_FLEET_PASSWORD` (+ optional `E2E_FUEL_WEEK`, `E2E_FUEL_ALLOW_FINALIZE=1`)
- Customer / partner critical paths: `rush-*-ui-critical.spec.ts`
