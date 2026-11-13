# Cursor prompt — Toll Phase 2, P2-R4b: take-backs and corrections tests

Claude built `supabase/migrations/20261113030328_toll_v2_fact_corrections.sql`. **Do not change the migration.** If a test shows it is wrong, report it and stop. Do not commit, branch or push.

Read the migration first. Its header lists each decision and the four design choices made. Then read `docs/toll-architecture.md` → B5 (P15, P16, P17, "Notes on the postings" → P17), PB2, PB4, and the C3 rounding rule in P19. Claude's smoke run is `docs/toll-build/p2_r4b_fact_corrections_smoke.sql`; it passes. Use it as the skeleton.

What it gives you, through `public.toll_v2_command(intent, body)` as an owner:

| Intent | Body | What happens |
|---|---|---|
| `reverse_payback` | `payback_id, expected_payback_version, reference, paid_on, amount_minor?` | A reversing payback (`reversal_of`) dated `paid_on`, counted in **that** week. The original's slices are reversed (`reversed_by` = **the reversing payback's id**) with P6 reversed. Its unlinked rows are reversed. Its P4 / P5 is reversed for the full amount. Every P17 row carries `reversing_payback_id`. `amount_minor` ≠ the payback's amount → `PARTIAL_TAKE_BACK` |
| `correct_charge_amount` | `charge_id, expected_charge_version, amount_minor, reason_code` | **Up:** P16 up; the charge is pending for the difference. **Down to ≥ its slices:** P16 down. **Down below its slices:** the slices shrink first in proportion by bearer (each share rounded down; spare cents go driver → fleet → platform; the newest slice shrinks first), then P16 down. A shrunk platform slice leaves a leftover on its payback. Unverified charges change without posting. A `charge_changes` row is written |
| `correct_charge_week` | `charge_id, expected_charge_version, occurred_at, reason_code` | The charge's P2 / P3 (net of P16) and its P6–P8 are reversed at the old time, the charge moves, then all are posted again at the new time. The slices stay the same rows. Both weeks must be open. A carried charge → `WRONG_STATE carried` |

The nightly check 3 line for `payback_unallocated` was corrected. For a take-back in a **later** week of a payback with a leftover, the original week keeps its figures (PB4).

## 1. Write `supabase/tests/toll_v2_fact_corrections.sql`
Same style as `toll_v2_decisions.sql`: 2024 dates, `BEGIN … ROLLBACK`, data through `toll_sys_import`, decisions through the command. **Run `toll_system.nightly_checks` after every section.** Any hand-made probe goes in a block that undoes itself; never DELETE money rows.

1. **reverse_payback, same week:**
   - fully allocated; part allocated + left unlinked; allocated across two charges;
   - check every row: the reversing payback, `reversed_by` on slices and unlinked rows, P6 reverse per slice with `reversing_payback_id`, and P4 reverse (card) / P5 reverse (cash trip) for the full amount;
   - the charges go back to pending, and their versions move;
   - `week_result` for the week shows `takenBackMinor` and the charges pending.
2. **reverse_payback, later week (PB4):**
   - with and without a leftover;
   - nightly check 3 ok in **both** weeks;
   - the original week's `week_result` keeps its payback figures, and the take-back week shows `takenBackMinor`;
   - prove the check-3 correction: compute the old formula (`v_active_paybacks` only) for the original week in the test and show it would have disagreed with the flow by the leftover.
3. **reverse_payback refusals:**
   - `PARTIAL_TAKE_BACK`;
   - a reference already used → `WRONG_STATE reference_used`;
   - reversing a reversed payback or a reversing payback → `WRONG_STATE`;
   - a `native` payback → `roam_native`;
   - missing `reference` / `paid_on` → `BAD_REQUEST`;
   - the original's week, a slice's charge week, or the take-back week sealed → `WEEK_SEALED` naming it;
   - a stale version → `VERSION_CHANGED`.
4. **After a take-back:** the original can't be linked (`reversed`); the reversing payback can't be linked or left unlinked (`reversing_payback`); the uncovered charges can be decided again and the week then seals.
5. **correct_charge_amount, up:** on a pending, a decided and an unverified charge. P16 up for tag (`P16_up_tag`) and cash (`P16_up_cash`); none for unverified; the charge is pending for the difference.
6. **correct_charge_amount, down:**
   - (a) down to ≥ its slices → P16 down only;
   - (b) below its slices, the split checked to the cent on three cases: driver 300 + fleet 200 → 300 (driver 180, fleet 120); fleet 300 + platform 200 → 250 (fleet 150, platform 100); and a rounding case where the spare cents land on the driver, then the fleet;
   - (c) two platform slices from two paybacks: the newest shrinks first, and the leftover appears on that payback;
   - (d) the payback's week sealed and a platform slice must shrink → `WEEK_SEALED`; the same correction that doesn't touch the slices goes through.
7. **correct_charge_amount refusals:** no `reason_code` or `amount_minor` → `BAD_REQUEST`; the same amount → `BAD_REQUEST`; a duplicate or rejected charge → `WRONG_STATE`; `after_seal` → `AFTER_SEAL`; the charge's week sealed → `WEEK_SEALED`.
8. **correct_charge_week:**
   - a decided charge with a platform, a driver and a fleet slice moves W → W+1;
   - every reverse row is at the old time and every new row at the new time;
   - the slices keep their ids; nightly check 3 ok for both weeks;
   - `week_result` moves the amount between the weeks;
   - a tag charge with an earlier P16 up correction: the reversal and re-post equal P2 + P16;
   - an unverified charge moves with no ledger rows;
   - the matcher queue gets the charge;
   - refusals: either week sealed → `WEEK_SEALED` naming it; the same time → `BAD_REQUEST`; a stale version → `VERSION_CHANGED`.
9. **Replay:** each intent with the same `command_id` → the first answer with `replay: true`, and nothing new written.
10. **The I4 guard holds throughout:** for every charge and payback touched, active slices ≤ amount.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## 2. Server error map — `toll_v2_command_errors.ts` and its test
Add `PARTIAL_TAKE_BACK` to the 409 set, plus a test case for it. That is the only allowed change outside the test files.

## Run (once; Docker Desktop open)
`pnpm --filter @roam/toll-core test` and `pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
