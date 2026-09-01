# RoamFleet × Rush — Program Tracker

Maps audit findings to remediation waves. Source: [ROAMFLEET_RUSH_INTEGRATION_AUDIT.md](../ROAMFLEET_RUSH_INTEGRATION_AUDIT.md).

## Wave 0 — Setup

| Item | Owner | Status |
|------|-------|--------|
| Rollout runbook | Architect | Done — [rush-fleet-rollout.md](./rush-fleet-rollout.md) |
| Decision log | PO | Done — [rush-fleet-decision-log.md](./rush-fleet-decision-log.md) |
| V21 scope review | Architect | Done — [rush-fleet-v21-scope-review.md](./rush-fleet-v21-scope-review.md) |

## Wave 1 — Security

| ID | Finding | Exit criterion |
|----|---------|----------------|
| V1 | Unauthenticated invite accept | 401 without token; active courier not downgraded |
| V7 | Wrong RLS JWT claim | SELECT returns rows for fleet org |
| V18 | Enterprise backfill | Fleet-only orgs get rush_delivery backfill |
| V24/V25 | Client + audit fixes | No render-phase state update; created_by = user |

## Wave 2 — Data bridge

| ID | Finding | Exit criterion |
|----|---------|----------------|
| V2 | courier_fleet_id on one path | All accept paths stamp fleet id |
| V11 | No synthetic batch on live path | Batch row exists for live trips |
| V10/V13/V14/V17 | Projection bugs | Correct COD, Jamaica week, trimmed PII |
| V8/V15 | Recon + cron | Daily job; filtered comparison |

## Wave 3 — Entitlement / UX

| ID | Finding | Exit criterion |
|----|---------|----------------|
| V6 | Kill switch bypass | Platform-off disables Rush |
| V4/V5 | Nav gating | Three shapes see correct nav |
| V9/G20/V23 | Scope + vocabulary | Switcher filters data; namespaced storage |

## Wave 4 — Money

| ID | Finding | Exit criterion |
|----|---------|----------------|
| V3/V26 | COD route | 200, correct JMD |
| G14/V12 | Combined settlement | One statement per person |
| G16 | Cost allocation | service_line written on new entries |
| G13 | Synthetic batch tooling | Documented or safe delete |

## Wave 5 — CI / QA

| ID | Finding | Exit criterion |
|----|---------|----------------|
| V16/V19/V20 | CI + tests | deno check; real handler tests; E2E shapes |

## Wave 6 — Self-serve

| ID | Finding | Exit criterion |
|----|---------|----------------|
| G23 | Signup plan step | Entitlement in wizard |
| Settings | Add/remove lines | Post-signup without data loss |
| Billing | Rush add-on | enabled_modules update |

## Pilot

Enable flags per [rush-fleet-rollout.md](./rush-fleet-rollout.md); 7-day zero drift; manual week reconcile.
