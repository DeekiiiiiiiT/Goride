# Give Cursor this — Toll disputes, Round S1b (four-eyes, refuse to match without settings, toll other income)

You are building **Round S1b only** of `docs/toll-architecture-gap-audit.md` (Rev 21). Read these first; they are the spec:
- **START HERE** (the build table and "Things learned")
- **L2.2**: rows **B12**, **B14**, **B17**
- **L2.3** (role matrix) and **L2.6 step 0** (settings first)
- **C4**: test 13
- "Server still to build": the **Settings seed (S16)** row

D1, D2 and S1 are done: `20261117234730_toll_disputes_data.sql`, `20261118000711_toll_sealed_week_guard.sql`, `20261118001833_toll_dispute_commands.sql` (+ `supabase/tests/toll_dispute_commands_test.sql`).

**Not in this round:**
- the matcher's dispute-first logic, plaza-rate comparison, InDrive suggestions, nightly scheduling, `reverse_payback` on a disputed payback, the logged-trips adapter (S2);
- screen reads and screens (S3, UI1, UI2);
- the alert table and the "unallocated paybacks with age" list (B19);
- moving `MATCHER_CONFIG_V1` scoring constants out of code (they stay, versioned by `ENGINE_VERSION`).

**Goal (one sentence):** risky toll money commands need a second person, the matcher refuses to run on missing settings instead of guessing, and money kept with no toll ends in the fleet's toll income instead of waiting forever.

**One switch for all of it:** every new behaviour below applies **only when the company's `toll_disputes` switch is on** (`toll.switch_state.toll_disputes`). With it off, every existing command behaves exactly as today. The live company has `tolls_v2` on and `toll_disputes` off, so nothing live changes when this deploys. The two settings commands in part 2 (`change_toll_settings`, `approve_settings_seed`) work with the switch off too, because the settings must be seeded **before** switch-on (L2.6 step 0).

## Look first
- `toll_write.command` and the dispatch `CASE` (latest in S1), `toll_write.refuse`, `toll_system.user_can_manage_tolls` (`20261112185355_toll_v2_command_core.sql`).
- `toll.decisions` and its append-only trigger `toll.tg_append_only` (latest in `20261112185355`): only `response` may be set, once. So approval facts must be written **when the decision row is inserted**, never added later.
- The Week Recon approval pattern this copies: `prepared_by` / `approved_by` / `self_approved`, `pending_approval → approved | rejected | withdrawn`, the append-only status trigger and the `recon.self_approvals` view (`20261111043439_recon_decision_log.sql`, `20261111055734_recon_round2b_week_change.sql`).
- `intent_undo_decision` and `intent_undo_dispute_result`, `intent_correct_charge_amount`, `intent_correct_charge_week`, `intent_reopen_week`, `intent_settle_dispute` (the `p_system` flag), `intent_close_dispute_lost`.
- `toll_system.seed_dispute_setup` (D1), `toll.platform_settings`, `toll.plaza_rules`, `toll.plaza_rates`, `toll.dispute_policy`, `toll_system.set_plaza_rule` and `toll.audit_log`.
- `toll_system.match_claim` (`20261113011349_toll_v2_matcher.sql`) and `supabase/functions/_fleet-server/toll_v2_matcher_run.ts`. The sweep already records a per-company error and carries on, so a SQL refusal in `match_claim` is enough; **no TypeScript change is needed**.
- `intent_leave_payback_unlinked` (both paths: payback and carried P19 share, latest in `20261113031959_toll_v2_carry_forward.sql`), `toll.payback_unlinked_decisions`, `ensure_accounts` and `posting_rules` (latest in S1), and `toll_system.nightly_checks` (latest in S1), including every place that sums the `toll:payback_unallocated` flow per week.

## What to build: one new migration
Create it with `npx supabase migration new toll_four_eyes_settings_income`.

### 1. Four-eyes (B14)

**Data**
- `toll.decisions` gains: `approval_id uuid`, `approved_by uuid`, `self_approved boolean NOT NULL DEFAULT false`, `self_approval_reason text`. Check: `self_approved` ⇒ reason is at least 8 characters after trim; `approved_by` is never the same as `actor_user_id`.
- New table **`toll.approval_requests`**: `id`, `organization_id`, `created_at`, `intent`, `body jsonb` (the full command body as sent), `amount_minor bigint` (null for "always" intents), `prepared_by uuid`, `status` (`pending`, `approved`, `rejected`, `withdrawn`), `decided_by uuid`, `decided_at`, `executed_decision_id uuid`, `note`. Append-only like `recon.run_events`: only `status`, `decided_by`, `decided_at`, `executed_decision_id` may change, and only out of `pending`. RLS on; read for the company's toll managers; no direct writes.
- View **`toll.self_approvals`** (security invoker): decisions with `self_approved = true`, for the monthly review.

**Which commands need a second person** (`toll_write.approval_amount(company, intent, body)` returns the amount, or `-1` for "always", or null for "not gated"):

| Intent | Needs a second person when | Amount compared |
|---|---|---|
| `undo_decision` (any target, dispute results included) | amount > 500000 (J$5,000.00) | Σ the target decision's active allocation and unlinked amounts (the money the undo moves) |
| `correct_charge_amount` | amount > 500000 | \|new amount − current amount\| |
| `correct_charge_week` | amount > 500000 | the charge's amount |
| `close_dispute_lost` | amount > 500000 | owed − recovered (what moves to the bearer) |
| `settle_dispute` by a person (not the system path) | amount > 500000 | the amount it links |
| `change_toll_settings`, `approve_settings_seed` | **always** | none (a settings change has no J$ amount, so it always needs one; this is the chosen rule) |
| `reopen_week` | **always** | none |

**Rule, checked in `toll_write.command` before dispatch, only when `toll_disputes` is on (except the two settings intents, which are always gated):**
- Not gated, or under the threshold → runs as today.
- Gated and the body has **no** `self_approval_reason` → refused **`NEEDS_APPROVAL`** with `{intent, amount_minor, threshold_minor: 500000, sole_manager: true|false}`. Nothing is written (the refusal rolls back the decision row too).
- Gated with `self_approval_reason`:
  - allowed only when `toll_system.manage_seat_count(company)` = 1 at that moment (S15): count **distinct** users who pass `user_can_manage_tolls` (the organization owner plus active, unexpired `fleet_owner` / `fleet_manager` seats; the owner counted once even if they also hold a seat). Use the same tables as `user_can_manage_tolls`; don't invent another role source.
  - reason shorter than 8 characters → `BAD_REQUEST`; more than one seat → **`SELF_APPROVAL_NOT_ALLOWED`**.
  - otherwise it runs, and its decision row is inserted with `self_approved = true` and the reason.

**New intents** (all `toll.manage`):
- **`request_approval`**: body `{intent, body, note}`. Refused unless `intent` is gated and needs approval right now. Stores a `pending` request with `amount_minor` and `prepared_by`. Changes no money.
- **`approve_request`**: body `{request_id}`. Refused **`SAME_PERSON`** if the caller prepared it; `WRONG_STATE` unless `pending`. In one transaction: re-checks everything the stored command checks (versions, sealed weeks, amounts) by running it through the **same dispatch** as a direct call. Factor the dispatch `CASE` into `toll_write.dispatch(intent, company, decision, command_id, body)` so both paths share it. The executed command gets its **own** decision row: `intent` = the stored intent, `command_id` = `'approval:' || request_id`, `actor_user_id` = the preparer, `approved_by` = the caller, `approval_id` = the request. Then the request becomes `approved` with `executed_decision_id`. If the stored command is refused now (e.g. a version moved), the whole call is refused and the request stays `pending`; the preparer withdraws it and asks again.
- **`reject_request`** (anyone but the preparer) and **`withdraw_request`** (the preparer only): `pending` → `rejected` / `withdrawn`.
- Undo of an approved command is itself `undo_decision`, gated by its own amount. Undo still finds the right rows, because the executed decision row has the stored intent.

### 2. Settings: one owner, loud when missing (B12, S16)

- **`change_toll_settings`** (new intent, `toll.manage`, always four-eyes): body is an **options object**. A **missing key means "leave it"**; a present key, even `null` where allowed, means "set this" (playbook golden rule 10). Keys:
  - `platform_settings: { <platform>: { pays_tolls_back, payback_mode, takes_disputes, dispute_window_days, refund_periods, no_report_fallback_days, auto_apply } }`
  - `dispute_policy: { lost_bearer, expired_bearer }`
  - `plaza_rates_add: [ { plaza_id, platform, rate_minor, effective_from } ]` (append-only; never edits a past rate)
  
  Refuses an unknown key, an unknown platform, and any value the table's checks would refuse (name the field). Stores `before` and `after` of every changed row on the decision response, and writes one `toll.audit_log` row per changed row (actor, before, after). The `reason_code` (or `note`) is required.
- **`approve_settings_seed`** (new intent, `toll.manage`, always four-eyes): runs `toll_system.seed_dispute_setup(company, true)` and `(company, false)` in the same transaction and stores the dry-run rows (the values the owner approved) on the decision response. **Extend the seed** so it also proposes a `plaza_rules` row (`auto_duplicate_window_minutes = 10`, `review_duplicate_window = 'same_day'`) for every `plaza_id` in the company's charges that has no rule, shown in the dry-run, written with an `audit_log` row. Existing rows are shown as "kept" and never changed. Running it twice changes nothing the second time.
- **Refuse to match without settings:** in `toll_system.match_claim`, when the company's `toll_disputes` switch is on, before claiming anything, refuse **`SETTINGS_MISSING`** with the list of what is missing:
  - a `platform_settings` row for any platform of a payback or trip in the claim scope;
  - a `dispute_policy` row for the company;
  - a `plaza_rules` row for any `plaza_id` of a charge in the scope.
  
  The queue is left untouched, so the same work runs once the seed is approved. With the switch off, `match_claim` behaves exactly as today.
- Write an ADR, **`docs/adr/` next number, "Toll settings have one owner"**: the v2 matcher reads `toll.platform_settings`, `toll.plaza_rules`, `toll.plaza_rates` and `toll.dispute_policy`; `toll.brain_policies` stays owned by `toll-brain` for Roam ride geofence detection and quotes only; scoring constants stay versioned in code (`MATCHER_CONFIG_V1` / `ENGINE_VERSION`). Check `docs/adr/` for the numbering and format first.

### 3. Kept-with-no-toll money ends in toll income (B17, C4.13)

- Add `toll:other_income` (class **`revenue`**, which `ledger.accounts` allows) to `ensure_accounts`, and posting rule **`P25_kept_to_income`**: debit `toll:payback_unallocated`, credit `toll:other_income`. Refs: `payback_id` or `carried_fact_id` (one of them). Same reverse pattern as P1–P24.
- **`leave_payback_unlinked`**, when `toll_disputes` is on: in the same transaction as the `payback_unlinked_decisions` row, post P25 for the kept amount, in the payback's week (or the carried fact's `to_week`), with the decision's `decision_id`. Both paths (payback and carried P19 share). With the switch off: unchanged (no posting, P9 as today).
- **Undo** of a `leave_payback_unlinked` decision reverses its P25 posting together with the unlinked row (reversal first, Y3).
- **Legacy carve-out (S14):** new table `toll.legacy_carve_outs` (`organization_id`, `account_suffix`, `amount_minor`, `recorded_at`, `decision_id`; one row per company and account; append-only). New system function `toll_system.record_legacy_kept(company)`: sums the company's **active** unlinked rows that have **no** P25 posting and stores it once for `toll:payback_unallocated`. A second call is refused. It doesn't run itself: the owner runs it at switch-on, and on the live company it must come to **120000** (J$1,200.00). For a company with no row, the carve-out is 0.
- After the carve-out is recorded, **`undo_decision` on a pre-switch keep** (a `leave_payback_unlinked` decision with no P25 posting) is refused **`LEGACY_KEEP_FINAL`**, so the fixed carve-out stays true.
- **Nightly checks:** the `toll:payback_unallocated` record total subtracts P25 amounts and adds the carve-out. In words: ledger = undecided open paybacks + P19 − P18a − P22 − P24 + carve-out. Kept rows with a P25 posting are no longer "in" the account. Add a check **`account:toll:other_income`** = Σ active P25 amounts. Update every per-week flow check that sums `payback_unallocated` (+P4 +P5 −P6 …) to also subtract P25.
- `week_summary`, `week_result_live`, statements and driver settlement figures must **not** change: P25 only moves money between two fleet ledger accounts. Check how they read, and say in the report that they're unchanged (or what you had to fix).

## SQL tests
New file **`supabase/tests/toll_four_eyes_settings_income_test.sql`**: `BEGIN … ROLLBACK`, made-up companies, users and amounts, real commands through `public.toll_v2_command` acting as a manager (same harness as the other toll tests). Set up a company with **two** manager seats and a company with **one**. Prove:
1. **Switch off:** `reopen_week`, a J$6,000 `undo_decision` and `leave_payback_unlinked` behave exactly as today (no `NEEDS_APPROVAL`, no P25). `match_claim` with missing settings claims as today.
2. **Threshold:** a J$5,000.00 `correct_charge_amount` change (exactly 500000) runs; J$5,000.01 → `NEEDS_APPROVAL` with `amount_minor` and `sole_manager = false`. The same for `undo_decision`, `correct_charge_week`, `close_dispute_lost` and a person's `settle_dispute`. The system path of `settle_dispute` is never gated.
3. **Always:** `reopen_week` for J$0 → `NEEDS_APPROVAL`; `change_toll_settings` → `NEEDS_APPROVAL`.
4. **Prepare + approve:** manager A `request_approval` → B `approve_request` → the command runs; its decision row has `actor_user_id = A`, `approved_by = B`, `approval_id`, intent = the stored intent; the request is `approved` with `executed_decision_id`. A approving their own → `SAME_PERSON`. Approving twice → `WRONG_STATE`. `reject_request` / `withdraw_request` work and change no money. A stored command whose version moved → refused; the request stays `pending`.
5. **Sole manager:** in the one-seat company, the command with a 12-character reason runs with `self_approved = true` and shows in `toll.self_approvals`; a 5-character reason → `BAD_REQUEST`. In the two-seat company → `SELF_APPROVAL_NOT_ALLOWED`. An owner who also holds a `fleet_manager` seat counts once.
6. **Settings:** `change_toll_settings` with only `dispute_policy.lost_bearer` changes that field and nothing else (a missing key leaves the value); before / after are on the response and in `audit_log`; an unknown key → refused; `plaza_rates_add` never edits a past rate. `approve_settings_seed` on an empty company writes the Uber / InDrive / Roam rows, the policy, the template and a `plaza_rules` row for each plaza in its charges; the second run changes nothing.
7. **Refuse to match:** switch on, no settings → `match_claim` refused `SETTINGS_MISSING` listing the missing rows, queue unchanged; after `approve_settings_seed` → it claims.
8. **Toll income:** switch on, a J$350 payback kept → P25 posted, `toll:other_income` = 35000, the payback leaves `payback_unallocated`; `nightly_checks` all pass. Undo → P25 reversed, both accounts back, checks pass. Carried P19 share path → the same.
9. **Carve-out:** keep J$700 with the switch off, then switch on, `record_legacy_kept` → 70000; second call refused; `nightly_checks` pass with the carve-out; `undo_decision` on that pre-switch keep → `LEGACY_KEEP_FINAL`. A new keep after switch-on still posts P25 and the checks still pass.

**Every existing toll SQL test** (all 20 files: `toll_v2_*`, `toll_disputes_*`, `toll_sealed_week_guard_test`, `toll_dispute_commands_test`) must still pass. If one fails, fix your code, not the test. If you believe a test is wrong, stop and report.

## CI
Add the migration and the new test to `.github/workflows/parts-sql-checks.yml`, in the same style as D1 / D2 / S1.

## How to check your work (local only)
1. Start Docker yourself (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, wait for `docker info`).
2. Run `npx supabase start`, then `npx supabase db reset`.
3. Run every toll test file (21 with the new one). In Git Bash set `MSYS_NO_PATHCONV=1` first, then `docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/` and `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/<f>.sql`.
4. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`.
5. Run `npx supabase stop`.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code beyond the new intents' permission entries.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change any existing migration or existing test file.
- Change only: the new migration, the new test, the workflow file and the new ADR. If you find you need to change anything else, stop and report.
- Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183) and the local Supabase stack.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail per test file and any error text). Don't paste file contents or full SQL — I'll read the files.
