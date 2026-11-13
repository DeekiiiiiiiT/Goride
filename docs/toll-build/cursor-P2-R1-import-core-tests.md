# Cursor prompt — Toll Phase 2, P2-R1: import core tests

Claude built `supabase/migrations/20261113001948_toll_v2_import_core.sql`. **Do not change any migration.** If a test shows it is wrong, report it and stop. Do not commit, branch or push.

Read it first, and read `docs/toll-architecture.md` → Part F → "Phase 2" (decisions 1–8). What it gives you:
- `public.toll_v2_command('import_batch', { command_id, kind, file_name, rows: [...] })` for owners / managers. `kind` is one of `tag_statement | topups | driver_cash | uber | indrive`.
  - The same batch again (same company + kind + the same rows in any order) returns the first report with `same_batch_as`, and writes nothing.
- `public.toll_sys_import(company, kind, rows, command_id, actor_job)`: the same for the system, service key only, repeat-safe per `command_id`.
- The answer is `{ kind, rows, counts: {status → n}, report: [{row, ref, status, id?, ...}], batch_hash, decision_id }`.
- **Row shapes (normalized, what the P2-R2 adapters will produce):**
  - charge rows (`tag_statement`, `driver_cash`): `source_ref, occurred_at, amount_minor, plaza_id, vehicle_id, driver_id, time_precision?, evidence?, evidence_status?`. Cash defaults to `unverified`.
  - `topups`: `source_ref, topped_up_on, amount_minor, provider, account_ref, vehicle_id?`.
  - `uber` / `indrive`:
    - `{row_type:'trip', platform_trip_id, driver_id, vehicle_id, request_at, pickup_at?, dropoff_at, time_precision?, payment_method, toll_payback_minor?}`;
    - `{row_type:'adjustment', reference, driver_id, paid_on, amount_minor (signed)}`.
- **Statuses:** `new`, `unchanged`, `corrected`, `correction_pending`, `after_seal`, `duplicate`, `review_pair`, `rejected`, `trip_only`, `payback_changed_needs_person`, `topup_changed_needs_person`, `refused_sealed_week`, `take_back_needs_person`.

## Write `supabase/tests/toll_v2_import.sql`
Same style as the other toll tests (2024 dates, `BEGIN … ROLLBACK`, act as the owner through `public.toll_v2_command`). Every case checks the exact rows written, the ledger rows (`metadata->>'toll_rule'`), and ends with `toll_system.nightly_checks` all ok.

1. **Tag statement:** two genuinely identical crossings (`…#1` and `…#2`) → both `new`, both P2. A row for a sealed week → `after_seal`, never posted, listed in `week_result.afterSeal`.
2. **Same batch again**, rows in a different order → `same_batch_as`, nothing new written, no new ledger rows.
3. **Corrections:**
   - changed amount, open week, no decisions → `corrected`, with P16 up or down for the difference and a `charge_changes` row;
   - changed amount when the charge has an allocation → `correction_pending` (a pending `charge_changes` row, amount unchanged);
   - changed amount when the charge's week is sealed → `correction_pending`.
4. **Cross-source duplicates within the window (10 minutes by default; set a `toll.plaza_rules` row to 5 to prove the plaza's own window is used):**
   - tag then driver cash → the cash row is `duplicate` (`duplicate_of` the tag row, never posted);
   - driver cash (verified) then tag → the cash row becomes `duplicate_of` the tag row and its P3 is reversed;
   - a Roam crossing (create one with `toll_system.native_ride_charge`, tolls_v2 on) then the tag row → the tag row is `duplicate`;
   - the loser already has an allocation → no automatic change; an open `duplicate_reviews` pair, and the status says `review_pair`.
5. **Review list:** a cross-source record for the same car and plaza on the same day but outside the window → `review_pair` (an open `duplicate_reviews` row). **Same source**, same car, same plaza, same day → **no** review pair (genuine).
6. **Top-ups:**
   - new → P1 at noon Jamaica on `topped_up_on`, and the tag account is created once per `(provider, account_ref)`;
   - the same `source_ref` again → `unchanged`; a different amount → `topup_changed_needs_person`;
   - a sealed week → `refused_sealed_week` (nothing stored).
7. **Uber:**
   - cash trip with a toll → payback `received_by 'driver'` (P5); card trip → `'fleet'` (P4); `payment_method` missing → `'fleet'`;
   - a trip without a toll → `trip_only`, and the `platform_trips` row is upserted (a second import updates the times);
   - positive adjustment → an `adjustment` payback, `'fleet'`;
   - **negative adjustment → `take_back_needs_person`, and nothing stored**;
   - the same trip again → `unchanged`; the trip's toll changed → `payback_changed_needs_person`.
8. **InDrive:** trips upsert as `platform 'indrive'`; a trip carrying `toll_payback_minor` becomes a `trip_line` payback; one without becomes `trip_only`.
9. **Bad rows → `rejected`**, and the rest of the batch still goes in: missing `source_ref`, amount 0, a bad `row_type`, a bad `kind` (that one raises `BAD_REQUEST` for the whole call).
10. **Who may import:** a fleet accountant / viewer → `FORBIDDEN`; another company's token can't see the rows. `public.toll_sys_import` is EXECUTE-able only by `service_role`; the same `command_id` twice → `replay`.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## Run (once; Docker Desktop open)
`pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
