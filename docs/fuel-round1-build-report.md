# Fuel Enterprise Audit — Round 1 build report

Branch: `fuel-f27-f31-f32a` (local, uncommitted). Plan file not modified.

## Data (D1–D6) — Done

| Item | Status | Artifacts |
|------|--------|-----------|
| D1 | Done | [20261122165018_fuel_week_lines.sql](../supabase/migrations/20261122165018_fuel_week_lines.sql), [fuel_d1_test.sql](../supabase/tests/fuel_d1_test.sql) |
| D2 | Done | [20261122165022_fuel_policy_versions.sql](../supabase/migrations/20261122165022_fuel_policy_versions.sql), [fuel_d2_test.sql](../supabase/tests/fuel_d2_test.sql) |
| D3 | Done | [20261122165023_fuel_entries_source.sql](../supabase/migrations/20261122165023_fuel_entries_source.sql), [fuel_d3_test.sql](../supabase/tests/fuel_d3_test.sql) |
| D4 | Done | [20261122165025_fuel_week_lines_sealed_guard.sql](../supabase/migrations/20261122165025_fuel_week_lines_sealed_guard.sql), [fuel_d4_test.sql](../supabase/tests/fuel_d4_test.sql) |
| D5 | Done | [20261122165026_fuel_nightly_checks.sql](../supabase/migrations/20261122165026_fuel_nightly_checks.sql), [fuel_d5_test.sql](../supabase/tests/fuel_d5_test.sql) |
| D6 | Done | [20261122165027_fuel_flag_disposition_codes.sql](../supabase/migrations/20261122165027_fuel_flag_disposition_codes.sql), [fuel_d6_test.sql](../supabase/tests/fuel_d6_test.sql) |

Runner: [run-fuel-tests.mjs](../scripts/run-fuel-tests.mjs), `pnpm test:fuel`. PostgREST `fuel` schema added in [config.toml](../supabase/config.toml).

## Server (S1–S9)

| Item | Status | Notes |
|------|--------|-------|
| S1 F-04 | Done | [evaluateFuelWeekClosable.ts](../packages/fuel-core/src/evaluateFuelWeekClosable.ts), [fuel_week_closable_gate.ts](../supabase/functions/_fleet-server/fuel_week_closable_gate.ts), [fuel_week_closable_gate_f04.test.ts](../supabase/functions/_fleet-server/fuel_week_closable_gate_f04.test.ts) |
| S2 F-09 | Done | Same gate + closable tests |
| S3 F-08 | Done | [possibleFillNotScanned.ts](../packages/fuel-core/src/possibleFillNotScanned.ts), gate wiring, [fuel_week_closable_f08.test.ts](../supabase/functions/_fleet-server/fuel_week_closable_f08.test.ts) (done-tests 2–3) |
| S4 F-13 | Done | [fuelEconomyByWeek.ts](../packages/fuel-core/src/fuelEconomyByWeek.ts), [fuel_vehicle_economy_weeks.ts](../supabase/functions/_fleet-server/fuel_vehicle_economy_weeks.ts), `GET .../fuel/vehicles/:vehicleId/economy-weeks` in [fuel_period_routes.ts](../supabase/functions/_fleet-server/fuel_period_routes.ts) |
| S5 F-11/F-18 | Done | [fuel_policy_versions_store.ts](../supabase/functions/_fleet-server/fuel_policy_versions_store.ts), [register_fuel_scenario_routes.ts](../supabase/functions/_fleet-server/register_fuel_scenario_routes.ts), snapshot `policy_version_id` in [fuel_week_compute.ts](../supabase/functions/_fleet-server/fuel_week_compute.ts), [fuel_scenario_org_f18.test.ts](../supabase/functions/_fleet-server/fuel_scenario_org_f18.test.ts) |
| S6 F-26 | Done | [fuel_flag_disposition_action.ts](../supabase/functions/_fleet-server/fuel_flag_disposition_action.ts) used by period route; Integrity desk uses same HTTP API. [fuel_flag_disposition_f26.test.ts](../supabase/functions/_fleet-server/fuel_flag_disposition_f26.test.ts) |
| S7 F-30 | Done | Brain stamp on snapshot (compute), `GET .../fuel/periods/:id/snapshot/brain`, [fuel_snapshot_brain_f30.test.ts](../supabase/functions/_fleet-server/fuel_snapshot_brain_f30.test.ts) |
| S8 F-21 | Done | Idempotency race handling on finalize insert ([fuel_period_routes.ts](../supabase/functions/_fleet-server/fuel_period_routes.ts)), [fuel_finalize_race.ts](../supabase/functions/_fleet-server/fuel_finalize_race.ts), [fuel_finalize_race.test.ts](../supabase/functions/_fleet-server/fuel_finalize_race.test.ts) |
| S9 F-14 | Done | [fuel_entry_source.ts](../supabase/functions/_fleet-server/fuel_entry_source.ts), stamps in [fuel_controller.tsx](../supabase/functions/_fleet-server/fuel_controller.tsx), [fuel_split_fill.ts](../supabase/functions/_fleet-server/fuel_split_fill.ts), [fuel_jaa_match.ts](../supabase/functions/_fleet-server/fuel_jaa_match.ts), column map in [fleet_domains.ts](../supabase/functions/_fleet-server/fleet_domains.ts), [fuel_entry_source.test.ts](../supabase/functions/_fleet-server/fuel_entry_source.test.ts) |

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @roam/fuel-core test` | **257 passed** |
| Deno fuel round-1 tests (see CI block) | **14 passed** (f04, f08, race, f26, f18, f30, entry_source) |
| `node scripts/edge-route-manifest.mjs --all` | OK (2 new fuel routes) |
| `pnpm check` | **4/4 passed** |
| `pnpm test:fuel` | **Not run** — Docker Desktop unavailable on this machine (`supabase_db_*` pipe missing). Run locally when Docker is up. |

CI: new Deno files appended under “Deno test fuel recon Rev 3 controls” in [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Out of scope (unchanged)

Pricing/writer (F-01, F-03 writer, F-07, F-24), fleet screens, Playwright, production deploy, weeks through 9 Nov 2026 data.