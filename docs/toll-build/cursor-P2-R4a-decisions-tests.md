# Cursor prompt — Toll Phase 2, P2-R4a: everyday decisions tests

Claude built `supabase/migrations/20261113023100_toll_v2_decisions.sql` and added the new refusal codes to `supabase/functions/_fleet-server/toll_v2_command_errors.ts`. **Do not change the migration.** If a test shows it is wrong, report it and stop. Do not commit, branch or push.

Read the migration first (its header lists every intent and the B3 order), then `docs/toll-architecture.md` → B3 (intents table), B5 (P3, P6–P9, P15), B0 (I4, I6, I7).

What it gives you, all through `public.toll_v2_command(intent, body)` as an owner or manager:

| Intent | Body | Writes / posts |
|---|---|---|
| `link_payback` | `charge_id, payback_id, expected_charge_version, expected_payback_version, amount_minor?` | platform allocation, P6. No amount → the smaller of the two open amounts |
| `driver_pays` / `fleet_absorbs` | `charge_id, expected_charge_version, amount_minor?, reason_code?` | driver P7 / fleet P8 allocation. `driver_pays` needs a charge with a driver |
| `leave_payback_unlinked` | `payback_id, expected_payback_version, reason_code (required), amount_minor?` | an unlinked row, **no posting**. `carried_fact_id` → `INTENT_NOT_BUILT` (P2-R4b) |
| `undo_decision` | `decision_id, expected_versions: {"<id>": version}` for **every** charge and payback the decision touched | reverses its allocations (exact reverse rows) and its unlinked rows. Only for `link_payback`, `driver_pays`, `fleet_absorbs`, `leave_payback_unlinked`, `apply_suggestion` |
| `apply_suggestion` | `suggestion_id, expected_charge_version, expected_payback_version` | `link_payback` for the suggestion's pair; answer adds `suggestion_id, engine_version, score` |
| `verify_cash_receipt` | `charge_id, expected_charge_version` | `evidence_status = verified`, P3 now |
| `reject_cash_receipt` | `charge_id, expected_charge_version, reason_code (required)` | `rejected`, never posted, final |
| `confirm_duplicate` | `charge_id` (the copy), `other_charge_id` (kept), `expected_charge_version, expected_other_version` | reverses the copy's allocations and its arrival (P2 / P3 net of P16), sets `duplicate_of`, closes the pair `confirmed` |
| `release_duplicate` | same body | pair `released`, no money; both versions go up |

- **Answer:** `{ decision_id, charge_version?, payback_version?, amount_minor?, weeks: [{ week_key, week_version, delta }] }`. `undo_decision` answers `versions: {id: version}` and `undone_decision_id`.
- **Refusals** (the whole command rolls back, its decision row included):
  - `VERSION_CHANGED`, `WEEK_SEALED` (`sealed_weeks`), `NOT_FOUND`, `BAD_REQUEST` (`need`);
  - `WRONG_STATE` (`state`: `decided`, `unverified`, `rejected`, `duplicate`, `no_driver`, `nothing_left`, `reversed`, `reversing_payback`, `roam_native`, `not_undoable`, `already_undone`, `suggestion_stale`, `no_review_pair`, `not_cash`);
  - `AFTER_SEAL`, `AMOUNT_TOO_LARGE`;
  - `ALLOCATIONS_EXCEED_AMOUNT`: the new I4 database guard. It fires on any write that would take a charge's active allocations, or a payback's active allocations plus unlinked amounts, above its amount.
- Each decision takes the week lock that seal / reopen take, then locks records payback-first, then checks versions, then states, then sealed weeks.

## 1. Fix the three files the new guard and intents broke
`pnpm test:toll` fails in three files today. None of these is a code bug:
1. **`toll_v2_commands.sql`:** it expects `link_payback` to answer `INTENT_NOT_BUILT`. Point that check at an intent that is still not built: `reverse_payback`, `correct_charge_amount`, `correct_charge_week` or `carry_forward` past its refusals (P2-R4b).
2. **`toll_v2_week_result.sql` ~line 354:** charge `t2` is fully allocated to the driver, and the test then adds a platform slice of `v_pb_link` on top. That's an impossible state. Give the platform slice its own charge, or make `t2` big enough for both slices. Keep every week_result expectation true: work the numbers through, and change an expectation only if the data change really moves it, saying why in a comment.
3. **`toll_v2_settlement_lines.sql` ~line 248:** a fleet slice of 50 is added to a charge that is already fully covered, only to fire the outbox. Use a charge that still has 50 open, or put that probe in a block that undoes itself (`RAISE` a sentinel and catch it).

## 2. Write `supabase/tests/toll_v2_decisions.sql`
Same style as `toll_v2_import.sql`: 2024 dates, `BEGIN … ROLLBACK`, data through `toll_sys_import`, decisions through `public.toll_v2_command` as the owner. Claude's smoke run is the skeleton; it's at the end of this prompt. Every section checks:
- the exact rows written (allocations, unlinked rows, `reversed_by`, versions);
- the ledger rows by `metadata->>'toll_rule'` and `reverse`;
- the answer's `weeks`;
- that `toll_system.nightly_checks` is all ok afterwards.

1. **link_payback:** full; partial with `amount_minor`; a second link fills the rest of a part-allocated charge from another payback; more than either side is open → `AMOUNT_TOO_LARGE`; a `native`, reversing or reversed payback → `WRONG_STATE`; a stale charge or payback version → `VERSION_CHANGED`, with nothing written.
2. **driver_pays / fleet_absorbs:** part, then the rest; on a decided charge → `WRONG_STATE decided`; `driver_pays` on a charge with no driver → `no_driver`; an unverified cash charge → `WRONG_STATE unverified`.
3. **leave_payback_unlinked:** no reason → `BAD_REQUEST`; full; the leftover after a part link; no ledger row is written; a later link on that payback → `nothing_left`.
4. **undo_decision:**
   - undo each undoable intent; the reverse rows are the exact reverse (same rule, amount and week);
   - the charge goes back to pending and the payback reopens;
   - a version missing from `expected_versions` → `BAD_REQUEST`; a stale version → `VERSION_CHANGED`;
   - twice → `already_undone`;
   - a `seal_week`, `verify_cash_receipt` or `confirm_duplicate` decision → `not_undoable` with its `use` hint;
   - another company's decision id → `NOT_FOUND`.
5. **apply_suggestion:** run the real matcher store with a hand-written result, as `toll_v2_matcher.sql` does, then apply the current suggestion → a P6 equal to `link_payback`'s. Then:
   - a superseded or withdrawn suggestion → `suggestion_stale`;
   - a suggestion whose charge is an unverified receipt → `WRONG_STATE unverified`;
   - after applying, the allocation has queued the pair for the matcher.
6. **Receipts:**
   - verify → P3 for the amount, at the crossing time, and the state becomes pending;
   - verify twice → `WRONG_STATE`;
   - a tag charge → `not_cash`;
   - reject: no reason → `BAD_REQUEST`; with a reason → `rejected`, no ledger row; then verify → `WRONG_STATE rejected`.
7. **Duplicates:**
   - confirm a copy that was verified and decided: its allocation reversed, P3 reversed, `duplicate_of` set, the pair `confirmed`, nightly ok;
   - confirm a tag copy that had a P16 up correction: the reversal equals P2 + P16;
   - release → `released`, no ledger rows, both versions + 1;
   - no open pair → `no_review_pair`;
   - either side already a duplicate → `WRONG_STATE duplicate`.
8. **Sealed weeks:** after `seal_week`, each intent on that week → `WEEK_SEALED` with `sealed_weeks`. An `after_seal` charge → `AFTER_SEAL`.
9. **I4 guard:**
   - a raw over-allocation insert, a raw over-unlink insert, and lowering a charge's or a payback's `amount_minor` below its allocations → `ALLOCATIONS_EXCEED_AMOUNT`;
   - wrap each in a block that undoes itself; never DELETE money rows.
10. **Replay and isolation:**
    - the same `command_id` → the first answer with `replay: true`, and nothing new is written;
    - the same `command_id` with another intent → `COMMAND_ID_REUSED`;
    - org B's token can't decide org A's records (`NOT_FOUND`);
    - a viewer / accountant → `FORBIDDEN`.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## 3. Server error map — `toll_v2_command_errors.test.ts`
Add cases:
- `NOT_FOUND` → 404;
- `WRONG_STATE`, `AFTER_SEAL`, `AMOUNT_TOO_LARGE`, `ALLOCATIONS_EXCEED_AMOUNT` → 409, with the DETAIL JSON passed through as `current_state`.

## Run (once; Docker Desktop open)
`pnpm --filter @roam/toll-core test` and `pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.

## Claude's smoke run (passes; use it as the skeleton)
`docs/toll-build/p2_r4a_decisions_smoke.sql` (a rolled-back local run; it writes nothing). It covers:
- link, replay and a stale version;
- driver part + fleet rest, and too much;
- verify, then decide;
- reject;
- unlinked;
- undo twice;
- apply, then a stale suggestion;
- confirm a duplicate;
- seal, then `WEEK_SEALED`;
- the I4 guard;
- nightly checks ok.
