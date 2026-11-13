# Cursor prompt — Toll Phase 3, P3-R1: tests for the screen reads

Claude built `supabase/migrations/20261113162537_toll_v2_screen_reads.sql`. **Do not change the migration.** If a test shows it is wrong, report it and stop. Do not commit, branch or push.

Read the migration's header first: it lists the three reads, the section rules and the confidence rules. Then read `docs/toll-phase3-screens-audit.md` → "What each button does" and Screens 2, 3, 9 and 11.

**What it gives you** (all `authenticated`, company from the token, `toll.view`):
- **`public.toll_v2_week_desk(week)`:**
  - the week's `charges`, each with `section` (`suggested` / `pick` / `no_trip` / `receipts` / `duplicates` / `awaiting_cash` / `decided`), `confidence` (`sure` / `likely` / `two_trips`), `suggestions[]` (trip, payback version, `alsoFits`), and `decision` (kind, who, when, `undo`; `undo` is null when the week is sealed or the decision can't be undone);
  - `paybacks` (open, with no current suggestion), `kept` (left unlinked, with undo), `reviewPairs` (both charge versions), `late` (`late_charge` / `late_payback` / `correction`), `blockers`, and `result` (= `week_result`);
  - `sealed`, `paid`, `openWeek`, `matcherBusy`.
- **`public.toll_v2_weeks()`:** `weeks[]` (`toDecide` = charges only, `paybacksOpen`, `reviewPairs`, `late`), `nightly` (last run), and `takeBacks[]` (unrecorded Uber take-backs with `candidates`).
- **`public.toll_v2_import_reports(week)`:** the imports that touched the week (charges, paybacks or top-ups of the week), newest first.
- **Also:**
  - `toll.reported_take_backs`: an Uber negative adjustment is now stored when imported (the report row also gains `driver_id` and `paid_on`);
  - `fleet.vehicles.plate_aliases text[]`.

Claude's smoke run used the real week of 24 Aug 2026: 12 tag tolls, 1 top-up and 11 Uber paybacks through the real matcher. Its results:
- 5 `sure`, 4 `likely`, 2 `pick` (`two_trips`), 1 `no_trip`;
- after deciding and sealing: 12 `decided` (11 matched, 1 driver pays), and 0 undo offered;
- a take-back import gave 1 `takeBacks` entry with candidates;
- nightly checks ok.

## 1. Write `supabase/tests/toll_v2_screen_reads.sql`
Same style as `toll_v2_matcher.sql` and `toll_v2_decisions.sql`:
- `BEGIN … ROLLBACK`;
- 2024 dates;
- data through `toll_sys_import`, suggestions through `toll_sys_match_store`, as `toll_v2_matcher.sql` does (hand-made engine results are fine there), decisions through `toll_v2_command`;
- the nightly checks after every section;
- any hand-made probe in a block that undoes itself; never DELETE money rows.

Sections:
1. **Access:**
   - anon and `service_role` can't execute the three `public.toll_v2_*` reads;
   - a user without `toll.view` → `FORBIDDEN`;
   - no company in the token → `NO_COMPANY`;
   - a non-Monday week → `BAD_REQUEST`;
   - company B's user never sees company A's rows (B gets an empty desk for A's week).
2. **Sections and confidence** (one week, set up so each case exists):
   - a sole on-trip suggestion → `suggested` + `sure`;
   - a charge with a higher and a lower suggestion → `suggested` + `likely`, the top one first;
   - two suggestions at the same top score → `pick` + `two_trips`;
   - no suggestion → `no_trip`;
   - an unverified cash charge → `receipts`, with `receipt.receipt_url`;
   - a charge in an open review pair → `duplicates`, and `reviewPairs` has both versions;
   - one payback suggested for two charges → each suggestion's `alsoFits` names the other charge.
3. **Decided rows:**
   - `apply_suggestion` → kind `matched` with the trip;
   - `driver_pays` / `fleet_absorbs` → `driver_pays` / `fleet_pays`;
   - `reject_cash_receipt` → `receipt_rejected` with `undo` null;
   - `confirm_duplicate` → `duplicate` with `undo` null.
   - For each decision with `undo`: **send exactly that `undo` body to `undo_decision`, and it must succeed.** The charge goes back to its section.
4. **Paybacks:**
   - a payback no pending charge is suggested for → in `paybacks` with `openMinor`;
   - after `leave_payback_unlinked` it leaves `paybacks` and appears in `kept` with `undo`;
   - sending that `undo` restores it.
5. **The numbers agree:** `result` equals `toll_system.week_result` for the week; `blockers` equals `seal_blockers`; the sum of `amountMinor` over non-rejected, non-duplicate charges equals `result.spend.totalMinor`.
6. **Seal:** after deciding everything, `seal_week`. Then the desk has `sealed` true and every `decision.undo` null. `toll_v2_weeks()` shows the week `sealed` with `toDecide` 0.
7. **Late items:** after the seal, import a charge and a payback for the sealed week (they arrive `after_seal`) and an amount change of a sealed charge (a pending `charge_changes` row). The desk's `late` lists all three with the right `kind` (`late_charge`, `late_payback`, `correction` with `direction`).
8. **Take-backs:**
   - import an Uber adjustment with a negative amount → a `reported_take_backs` row (positive amount, driver, date), and its report row has `driver_id` and `paid_on`;
   - `toll_v2_weeks().takeBacks` lists it with candidates (same driver, amount ≥);
   - importing the same reference again adds no row;
   - after a `carry_forward` `take_back` with that `reference` (pay the week first, as `toll_v2_carry_forward.sql` does), it's no longer listed.
9. **Import reports:** the week's tag, top-up and Uber imports are all listed. An import for another week isn't.
10. **Weeks:** `toDecide` counts charges only (not paybacks); `paybacksOpen` and `reviewPairs` are counted on their own.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step). `pnpm test:toll` picks up every `toll_v2_*.sql` file on its own.

## Run (once; Docker Desktop open; nothing else may be using the local database)
`pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
