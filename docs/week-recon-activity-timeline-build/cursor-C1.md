# Cursor — round C1: activity timeline data + server

Read `docs/week-recon-activity-timeline-audit.md` first. This round builds **D1–D4, S1–S5 and U1–U3** exactly as written there. Do not build any screen (UI1–UI3 are not yours). Do not touch the driver's share, tiers, settlement or any money table.

## Already done (don't redo)

- `apps/fleet/src/utils/uberActivityTimelineParse.ts` already reads the owner layout: `splitUberTimelineCsvWithDriverColumns`, `uberTimelinePasteFromDriverColumns`, `extractUberTimelineDriverIdentity`.
- `apps/fleet/src/components/imports/UberActivityTimelineImportPanel.tsx` already finds the driver from the file only. For S3, only add `uberDriverUuid` (from `fileIdentity.uberUuid`) to its `api.importUberActivityTimeline` call, and update `apps/fleet/src/services/api.ts` to send it.

## Work, in this order

1. **Migration (D1, D2, D3).** Create it with `npx supabase migration new week_recon_activity_timeline`, which gives the real current UTC time. Never type a date yourself.
   - `toll_system.driver_status_at(...)` exactly per D1. Take `approach_minutes` / `post_trip_minutes` from `MATCHER_CONFIG_V1` in `packages/toll-core/src/v2/matcher/engine.ts`.
   - `toll_system.week_desk`: copy the latest body from `supabase/migrations/20261113162537_toll_v2_screen_reads.sql`, add only `driverStatus`, `offlineFlag` and the two summary numbers (D2), and change nothing else.
   - `recon.compute_source_coverage` and `recon._day_has_daily_rows`: copy their latest bodies (`20261111044221_recon_coverage_per_week.sql` and wherever `_day_has_daily_rows` was last defined), then add `uber_activity_timeline` (D3).
   - Keep every existing grant as it is. Add no grants to `anon` / `authenticated` for the new function.
2. **SQL check (D4):** `supabase/tests/week_recon_activity_timeline_checks.sql`. Use made-up rows only, in one transaction ending in `ROLLBACK`, with one `PASS`/`FAIL` line per check.
3. **Server (S1–S5):** `recon_activity_timeline.ts` + test, the activity route's new `timeline` field, the import route changes (S2 flag removal, S3 `uberDriverUuid` → 409 `uber_id_mismatch`), and the manifest row in both `packages/finance-core/src/reconSources.ts` and `supabase/functions/_fleet-server/recon_sources_mirror.ts`. Keep the existing fields of the activity route.
4. **Upload path (U1–U3):** the detection rule in `apps/fleet/src/utils/csvHelpers.ts`, the new `apps/fleet/src/utils/importUberTimelinesForWeek.ts` + unit tests, and wire it into the step 1 Uber dialog's commit (`CloseWeekUberReimportDialog`). Only the data call goes in the dialog, with no layout change. Show its result in the dialog's existing result text.
5. **Mirrors.** If any server file you change has a "Keep in sync" mirror, update the mirror in the same round.

## Tests to run (each once; report pass or fail, never fix-and-rerun in a loop)

- From PowerShell in `C:\Roam\Goride\apps\fleet`: `npx vitest run src/utils/uberActivityTimelineParse.test.ts src/utils/importUberTimelinesForWeek.test.ts src/utils/csvHelpers.test.ts src/components/imports/UberActivityTimelineImportPanel.test.tsx` (leave out any file that doesn't exist).
- From `C:\Roam\Goride`: `deno test --allow-env --allow-read supabase/functions/_fleet-server/recon_activity_timeline.test.ts supabase/functions/_fleet-server/recon_sources_mirror.drift.test.ts` plus your route test. Deno writes `node_modules/.deno`, so delete that folder after the run.
- `pnpm --filter fleet exec tsc --noEmit -p .`: report only errors in files you changed (the app already has old errors elsewhere).
- The SQL check against the local Docker copy, only if it's already running (`npx supabase status`). Don't start it yourself.

## Rules

- Don't create, switch or push branches. Don't commit. Don't run anything against production.
- Don't change files outside this round's list, except tests for the code you change.
- No browser pop-ups (`window.confirm/alert/prompt`) anywhere.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents or full SQL. I'll read the files.
