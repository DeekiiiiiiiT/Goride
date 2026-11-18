# Give Cursor this — Toll disputes, Round S1 (dispute commands and their money)

You are building **Round S1 only** of `docs/toll-architecture-gap-audit.md` (Rev 19). Read these first; they are the spec:
- **Part F**
- **C1**: the W1 allocation rules 1–5 and Y3
- **C2**: the rows `open_dispute`, `mark_dispute_sent`, `settle_dispute`, `close_dispute_lost`, `undo_decision` on a dispute result, `seal_week`, Dispute result after the seal, and `driver_pays` / `fleet_absorbs`
- **C4**: tests 1–5, 8, 11, 12, 14, 15, 17, 19
- **A6** (Y1 vocabulary) and **L2.4** (state tables)

D1 and D2 are done: `supabase/migrations/20261117234730_toll_disputes_data.sql` and `supabase/migrations/20261118000711_toll_sealed_week_guard.sql`.

**Not in this round:**
- the matcher, the nightly expire and auto-close jobs, and the logged-trips adapter (S2);
- four-eyes approval (B14), "refuse to match without settings" (B12) and `toll:other_income` (B17), which come in round S1b;
- screens and screen reads (S3).

Build the core functions so S2's jobs can call them, but don't schedule anything.

**Goal (one sentence):** a short-paid Uber toll becomes a dispute that keeps the week sealable, and every later result (refund, loss, expiry, undo) moves the money to the right person without ever touching a sealed week.

## Look first
- The command entry point `public.toll_v2_command`, how intents are listed, permissioned and dispatched (latest `CREATE OR REPLACE` in `supabase/migrations/`), and `toll_write.refuse`.
- `toll_system.post`, `toll_system.ensure_accounts`, `toll.posting_rules` (P1–P20) and the `reverse` metadata pattern.
- `toll_system.allocate`, `reverse_allocation` and `reduce_allocations`.
- `toll_write.do_bear` (driver_pays / fleet_absorbs) and the `apply_suggestion` `suggestion_id` checks in `20261113023100_toll_v2_decisions.sql`.
- The matcher's append-only `withdrawn` suggestion rows (`20261113011349_toll_v2_matcher.sql`).
- `toll_system.charge_state`, `seal_blockers` and `week_summary`; `intent_seal_week`, latest in D2.
- `toll.carried_facts` and `intent_carry_forward` (`20261113031959_toll_v2_carry_forward.sql`).
- `toll_system.week_is_sealed`, the D2 guard, and `toll.dispute_policy`.

## What to build: one new migration
Create it with `npx supabase migration new toll_dispute_commands`.

### 1. Accounts and posting rules
Add `toll:receivable_platform_dispute` to `ensure_accounts`, plus these rules. Use the same reverse pattern as the existing rules.

| Code | Debit | Credit | Refs | Meaning |
|---|---|---|---|---|
| `P21_dispute_open` | `toll:receivable_platform_dispute` | `toll:suspense` | charge_id, dispute_id | the provisional platform allocation (W1 rule 1) |
| `P22_dispute_refund` | `toll:payback_unallocated` | `toll:receivable_platform_dispute` | dispute_id, payback_id | a refund settles part or all of the dispute (rule 2) |
| `P23_dispute_to_driver` | `toll:receivable_driver` | `toll:receivable_platform_dispute` | dispute_id | lost / expired / part_won rest, driver bears (rule 3) |
| `P23_dispute_to_fleet` | `toll:expense` | `toll:receivable_platform_dispute` | dispute_id | the same, fleet bears |
| `P24_expired_refund_driver` | `toll:payback_unallocated` | `toll:receivable_driver` | dispute_id, payback_id | refund on an expired dispute the driver bore (rule 4) |
| `P24_expired_refund_fleet` | `toll:payback_unallocated` | `toll:expense` | dispute_id, payback_id | the same, fleet bore |

If, after looking, any debit or credit is wrong for how the existing P4–P8 money actually flows, **stop and report** before building. Don't invent a different chart.

### 2. Helpers (`toll_system`, SECURITY DEFINER, no grants to authenticated)
- **`posting_week(company)`**: the week a result posts in when the charge's week is sealed. It is the Monday after the latest sealed `toll_week` statement for the company (T1).
- **`dispute_deadline(trip_date, window_days)`**: the end of the Nth Jamaica calendar day after the trip date, as a `timestamptz` (S5).
- **`dispute_apply(...)`**: one internal function that every command and S2's jobs call to move a dispute's money. Per W1 rules 1–5:
  - always in one transaction, reversal first, then inserts (Y3);
  - whole-row reversal only;
  - `dispute_id` on every allocation it writes;
  - `decision_id` on every row;
  - stamps `posted_in_week_key` when a result posts.
  - **Where it writes:** if the charge's counted week is open, it writes allocation rows on the charge. If the week is sealed, the charge's allocations stay frozen. It writes a `carried_facts` row (`kind = 'dispute_result'`, `from_week` = charge week, `to_week = posting_week(company)`, `dispute_id`) and the matching postings in that week.

### 3. Commands
Each command:
- is a new intent through `public.toll_v2_command`, with `command_id` and the expected versions;
- writes a decision;
- is refused with `DISPUTES_OFF` unless `toll_disputes_enabled` is true for the company.

| Intent | Who | Rules |
|---|---|---|
| `open_dispute` | `toll.manage` (S2's matcher will call the same core as system) | Body: `charge_id`, `payback_id` (the trip payback that left the remainder). Refused:<br>• `charge_sealed` if the charge's week is sealed (W2, C4.12);<br>• when the platform's `takes_disputes` is false;<br>• when the remainder ≤ 0.<br>Remainder = amount − Σ active allocations. Sets `charge_week_key`, `deadline`, `text_version` (the newest unretired template) and `driver_id` / `platform_trip_id` from the payback's trip. **Late branch (S4, X12):** if the deadline has passed, the dispute opens as `expired` with `opened_late`, `close_reason = opened_late`, and a fleet allocation is written (P8) in the same transaction. If under 2 days are left, it opens `to_send` with `opened_late = true`. Otherwise it opens `to_send`, with the provisional platform allocation and P21. |
| `mark_dispute_sent` | `toll.manage`, or the dispute's own driver | `to_send` → `sent`. Sets `sent_at`, and `clock_from = sent_at`. Refused with `window_closed` after the deadline (S3). |
| `settle_dispute` | `toll.manage` (the accountant can't, U8) | Body: `dispute_id`, `payback_id`, `amount_minor` (optional; default = the least of the payback's open amount and what is still owed).<br>• At most owed − Σ active links (S7, N4).<br>• On `to_send` / `sent`: rule 2.<br>• On `expired`: rule 4. Only an `adjustment` payback can settle an expired dispute (U14); refuse `WRONG_PAYBACK_KIND` otherwise.<br>• No Refund received on `expired` by a person (N3): refuse `EXPIRED_SYSTEM_ONLY` unless called by the system path.<br>Full → `won` (`refund`); part → stays open (`sent`), or `part_won` for `expired` (T2). |
| `close_dispute_lost` | `toll.manage` | `sent` only. `lost`, or `part_won` if something was recovered; `close_reason = platform_said_no`. The rest goes to `dispute_policy.lost_bearer` (rule 3, P23). |
| `driver_pays` / `fleet_absorbs` (changed, AG1) | as today | Optional `suggestion_id`, checked like `apply_suggestion` checks it today. Stored on the decision. In the same transaction, insert a `withdrawn` suggestion row superseding it. Without `suggestion_id`, behaviour is unchanged. |
| `undo_decision` on a dispute result (R10) | as today | Reverses exactly the allocations and postings the undone step wrote (found by `decision_id`). Writes a new dispute row (`reopens_id`; the old one gets `close_reason = undo`) in the state before the result, and restores that state's allocation (rule 5). If the charge's week is sealed, this goes through a `dispute_result` carried fact in `posting_week`. **No four-eyes yet** (S1b adds it). |

Expiry and auto-close are **functions only** in this round. S2 schedules them:
- `toll_system.dispute_expire(company, dispute_id, decision_id)`: `to_send` past the deadline → `expired` (`window_closed`). The bearer is `dispute_policy.expired_bearer`, or the fleet if `opened_late` (rule 3).
- `toll_system.dispute_auto_close(company, dispute_id, decision_id, reason)`: `sent` → `lost` / `part_won`, with reason `no_refund_two_periods`, `partial_refund_two_periods` or `no_report`. The rest goes to the lost bearer; `no_report` always goes to the fleet (R3).

### 4. Seal and blockers
- **`seal_blockers` gains a `part` column (AD3, AG4).** First matching rule wins:
  - `unverified` charge → 5;
  - `short_paid` charge → 5;
  - `review_pair` → 5;
  - `payback` / `carried` → 5;
  - `pending` charge with 2 or more live candidate trips → 2;
  - `pending` charge with a live suggestion → 1;
  - any other `pending` charge → 4.
- **`short_paid`** (charge state, B8): not decided, a platform payback covers part, no non-final dispute, and the platform has `takes_disputes = false`. It blocks the seal. A charge with an open dispute is `decided` (provisional) and does not block (C4.3, C4.14).
- **`intent_seal_week`** (copy the D2 body, keep its guard bypass):
  - the `PENDING_NOT_RESOLVED` `blocking` items carry `part`;
  - `week_summary` gains `disputed_minor` = Σ active provisional dispute allocations of the week's charges (R9).
- `resolveTollInputs` / driver statements must ignore provisional dispute allocations. Check how they read today. If they would count them, change them so they don't, and say so in the report.

## SQL tests
- **`supabase/tests/toll_dispute_commands_test.sql`**: behaviour, `BEGIN … ROLLBACK`, made-up company and amounts. Use the real commands through `public.toll_v2_command` acting as a manager, like the other toll tests do. One block per done-test. After each block, check that charge allocations, dispute fields and ledger balances all add up (C4.1, C4.4, C4.5, C4.11, C4.15). Prove:
  1. **J$390 toll, Uber pays J$370:** `open_dispute` makes a `to_send` J$20 dispute with a provisional allocation and P21. The charge is `decided`, the week **seals**, and the statement shows `disputed_minor` = 2000 (D-tests 1–2).
  2. `mark_dispute_sent`; then a J$20 adjustment → `settle_dispute` → `won`. `receivable_platform_dispute` is back to 0. The charge week is sealed, so it posts as a `dispute_result` carried fact in `posting_week` and the sealed week's ledger is unchanged (C4.8).
  3. **Part refund J$10, then `close_dispute_lost`:** `part_won`. J$10 goes to the lost bearer (fleet by default).
  4. **`dispute_expire` on `to_send` past the deadline** → driver bears J$20 (`opened_late = false`). Then an adjustment refund → `won` (T2). The driver allocation is transferred to platform (rule 4), not added alongside.
  5. **Late open:** deadline already passed → `expired` with `opened_late`, fleet bears, all in one call.
  6. `open_dispute` on a sealed-week charge → `charge_sealed`. `mark_dispute_sent` after the deadline → `window_closed`. A second `open_dispute` on the same charge is refused. `DISPUTES_OFF` when the switch is off.
  7. `settle_dispute` above what is owed is capped. Two refunds in one transaction never over-pay.
  8. `undo_decision` on the `won` result from block 2: a new dispute row in `sent` with the provisional allocation back, posted through `posting_week`; the sealed week is unchanged.
  9. `driver_pays` with `suggestion_id` writes the decision with it and a `withdrawn` row; `apply_suggestion` is never written (C4.19).
  10. `seal_week` refused with blockers, each with the right `part` per the table above (C4.17).
- **Every existing toll SQL test** (all 19 files: `toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`) still passes. If one fails, fix your code, not the test. If you believe the test is wrong, stop and report.

## CI
Add the migration and the test to `.github/workflows/parts-sql-checks.yml`, same style as D1 / D2.

## How to check your work (local only)
1. Start Docker yourself (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, wait for `docker info`).
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every toll test file. In Git Bash set `MSYS_NO_PATHCONV=1` first, or `/tmp/...` paths break.
4. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. Run `npx supabase stop`.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code beyond the new intents' permission entries.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change any existing migration or existing test file.
- Change only: the new migration, the new test, the workflow file, and (only if step 4 needs it) the settlement reader, named in your report.
- Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183) and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text). Don't paste file contents or full SQL — I'll read the files.
