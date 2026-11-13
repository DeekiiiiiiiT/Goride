# Cursor prompt — Toll Phase 2, P2-R4c: carry_forward tests

Claude built `supabase/migrations/20261113031959_toll_v2_carry_forward.sql`. **Do not change the migration.** If a test shows it is wrong, report it and stop. Do not commit, branch or push.

Read the migration first. Its header has the five kinds and the four design choices. Then read `docs/toll-architecture.md` → G2 ("carrying a late fact"), B5 P18 / P19 and their notes, and B6 ("A down correction to a sealed week"). Claude's smoke run is `docs/toll-build/p2_r4c_carry_forward_smoke.sql`; it passes. Use it as the skeleton.

What it gives you: `public.toll_v2_command('carry_forward', body)`.
- **Every kind:** `from_week` (sealed, with a posted `pay` or `write_off` settlement movement for it), `kind`, `to_week?` (default: the current week; must be open and later).
- **`charge`:** `charge_id` + `expected_charge_version`, for an `after_seal` charge.
  - It counts in `to_week` through `charge_counted_week`; its `week_key` stays the fact's week.
  - P2 / P3 post at **`toll_system.charge_post_at`**: noon on Monday of the counted week. Every later posting of that charge lands there too.
- **`payback`:** `payback_id` + `expected_payback_version`, for an `after_seal` payback. Its `week_key` **becomes** `to_week`; P4 / P5 post there.
- **`take_back`:** `payback_id` (active, in `from_week`), `expected_payback_version`, `reference`, `paid_on`, `bearer` (`fleet` | `driver`).
  - P18a for the leftover; P18b for the covered part, borne by `bearer`.
  - One carried row each; `bearer` NULL = the leftover.
  - The payback and its slices don't change.
- **`correction_down`:** `charge_id`, version, `amount_minor` (the right, lower amount), `reason_code`.
  - The difference is split by bearer (C3 rounding), one carried row and one P19 row per share; platform share = `bearer` NULL.
  - Pending import `charge_changes` rows for the charge become not pending. The charge's own amount doesn't change.
- **`correction_up`:** same body, higher amount. A new charge for the difference (`adjusts_charge_id`, `source_ref` `…:up:<decision>`), counted in `to_week`, P2 / P3, pending.

**Also new:**
- `leave_payback_unlinked` with `carried_fact_id` + `expected_carried_version` decides a P19 platform share.
- `undo_decision` reverses that decision. `expected_versions` then includes the carried row.
- `seal_blockers` lists an undecided platform share as `kind 'carried'`.
- `week_result`:
  - drivers' lines carry the money: `owesFleetMinor` + P18b driver + cash P19; `fleetOwesMinor` + P19 driver shares; `recoveredInPassengerCashMinor` − cash-trip take-backs;
  - `carriedMoney` appears **only** in weeks that have carried P18 / P19 rows, so every other week's facts hash is unchanged.
- Nightly check 3 counts P18 / P19 legs in the carried row's `to_week` (`toll_system.carried_sum`).

## 1. Write `supabase/tests/toll_v2_carry_forward.sql`
Same style as `toll_v2_fact_corrections.sql`: 2024 dates for the paid week; pass `to_week` explicitly (a 2024 week after it) so the test never depends on today. `BEGIN … ROLLBACK`, data through `toll_sys_import`, decisions through the command, **nightly after every section**, any hand-made probe in a block that undoes itself, and never DELETE money rows.

For every section, also check that the paid week's `toll_system.week_hash` is unchanged (frozen before the section, compared after).

1. **Refusals:**
   - `from_week` open → `WEEK_NOT_SEALED`;
   - sealed but unpaid → `REOPEN_INSTEAD`;
   - `to_week` sealed → `WEEK_SEALED`;
   - `to_week` ≤ `from_week` → `BAD_REQUEST`;
   - an unknown `kind` → `BAD_REQUEST`;
   - a record not in `from_week` → `WRONG_STATE not_in_from_week`;
   - a stale version → `VERSION_CHANGED`.
2. **Late charge:**
   - tag (P2 at noon Monday of `to_week`) and verified cash (P3);
   - an unverified cash one carries with no posting, then `verify_cash_receipt` posts P3 **in `to_week`** (`charge_post_at`);
   - then `link_payback` to an open-week payback, and `driver_pays`: every P6 / P7 row is dated in `to_week`;
   - not after_seal → `not_after_seal`; a duplicate → `duplicate`.
3. **Late payback:**
   - card (P4) and cash trip (P5);
   - `week_key` = `to_week`; `week_result(to_week)` counts it; `week_result(from_week)` doesn't, and its `afterSeal` no longer lists it;
   - a reversing or native payback → `WRONG_STATE`.
4. **take_back (P18):**
   - full leftover (nothing allocated) → P18a only;
   - fully covered → P18b only;
   - mixed → both;
   - card → `receivable_platform`; cash trip → `recovered_in_driver_cash`;
   - bearer `driver` → the driver's `owesFleetMinor` in `to_week`; a cash-trip take-back lowers `recoveredInPassengerCashMinor`;
   - no bearer → `BAD_REQUEST`; a second take-back → `already_taken_back`; a reversed payback → `not_an_active_payback`; a different `amount_minor` → `PARTIAL_TAKE_BACK`.
5. **correction_down (P19):**
   - tag and cash charges, split to the cent on three cases, including a rounding case (spare cents driver → fleet → platform);
   - a cash correction raises the driver's `owesFleetMinor` by the full difference, and `fleetOwesMinor` by the driver's share;
   - a pending import correction becomes not pending;
   - not lower → `BAD_REQUEST`; an unverified / duplicate charge → `WRONG_STATE`.
6. **The platform share:**
   - `seal_blockers(to_week)` lists it;
   - decide it with `leave_payback_unlinked` + `carried_fact_id` (part, then the rest) and it's gone;
   - `undo_decision` brings it back;
   - a stale `expected_carried_version` → `VERSION_CHANGED`;
   - a non-platform carried row → `not_a_platform_share`;
   - deciding more than is open → `AMOUNT_TOO_LARGE`.
7. **correction_up:**
   - the new charge's amount, `adjusts_charge_id`, counted week = `to_week`, P2 / P3 in `to_week`, pending, then decided;
   - not higher → `BAD_REQUEST`.
8. **Seal the open week** after deciding everything in it, then check:
   - nightly check 4 holds for **both** sealed weeks;
   - `week_result(to_week)`: `carriedIn` lists every carried row and `carriedMoney` its totals;
   - a week with no carried rows has no `carriedMoney` key.
9. **Replay:** the same `command_id` → the first answer with `replay: true`, and nothing new written.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).

## Run (once; Docker Desktop open)
`pnpm --filter @roam/toll-core test` and `pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
