# Give Cursor this — Toll disputes, Round D1 (Data only)

You are building **Round D1 only** of `docs/toll-architecture-gap-audit.md` (Rev 19). Read these parts of that file first; they are the spec:
- **Part F** (the "look-first" table F1–F4 and the rounds table). Where Part F and the rest of the document differ, **Part F wins**.
- **C1. Data** (every row).
- **A6** (charge states) and **L2.4** (state tables).

Build only the database structures below and their SQL tests. No commands, no matcher, no posting rules, no screens, no edge functions. Those are later rounds.

## What to build

### 1. One new migration
Create it with `npx supabase migration new toll_disputes_data` (real current UTC time; never pick or edit the date yourself). Follow the patterns already used in `supabase/migrations/20261112183806_toll_v2_foundations.sql`: company-scoped composite keys `(organization_id, id)`, composite foreign keys, RLS, read grants, append-only triggers, and `toll_write.refuse(...)` / named errors. In this order:

1. **Switches (L2.6 step 1).** Add to `toll.switch_state`: `toll_disputes`, `rider_pays_driver`, `logged_trips`, all `boolean NOT NULL DEFAULT false`. Add read helpers next to `public.toll_v2_enabled()`, same style and same grants: `public.toll_disputes_enabled()`, `public.toll_rider_pays_driver_enabled()`, `public.toll_logged_trips_enabled()`.
2. **`toll.platform_settings`** (C1, Part F F1):
   - Extend the `payback_mode` CHECK to `per_trip`, `adjustments`, `none`, `native`, `rider_pays_driver`.
   - Add `takes_disputes boolean NOT NULL DEFAULT false`, `dispute_window_days int`, `refund_periods int`, `no_report_fallback_days int` (each `> 0` when set).
   - CHECK: when `takes_disputes`, all three numbers are set.
   - CHECK (AA2): when `payback_mode = 'rider_pays_driver'`, then `auto_apply = false` and `takes_disputes = false`.
3. **`toll.plaza_rates`** (new, Part F note): `id`, `plaza_id` (FK → `toll.plaza_rules`), `rate_kind` (`tag_price` | `platform_refund`), `platform` (NULL for `tag_price`, required for `platform_refund`; CHECK both ways), `amount_minor > 0`, `valid_from date`, `created_by uuid`, `created_at`.
   - Unique on `(plaza_id, rate_kind, coalesce(platform, ''), valid_from)`.
   - Append-only: no UPDATE and no DELETE.
   - A read function `toll_system.plaza_rate(p_plaza text, p_kind text, p_platform text, p_on date)` returns the amount in force on that date, or NULL.
4. **`toll.dispute_policy`** (new, Part F F3): `organization_id` PK, `lost_bearer` (`fleet` | `driver`, default `fleet`), `expired_bearer` (`fleet` | `driver`, default `driver`), `changed_by`, `changed_at`.
5. **`toll.dispute_text_templates`** (C1):
   - Columns: `organization_id`, `platform`, `version int`, `body`, `created_by`, `created_at`, `retired_at`.
   - Key `(organization_id, platform, version)`.
   - Append-only, except that `retired_at` may be set once from NULL.
   - `body` uses only these placeholders: `{trip_date}`, `{trip_time}`, `{plaza}`, `{toll}`, `{paid}`, `{owed}`. A CHECK or trigger refuses any other `{...}`.
6. **`toll.disputes`** (C1, every field and rule):
   - `state` and `close_reason` CHECKs with exactly the values in C1.
   - `owed_minor > 0`; `0 ≤ recovered_minor ≤ owed_minor`.
   - Foreign keys to the charge and the platform trip; `text_version` → template `(organization_id, platform, version)`.
   - Partial unique index: at most one row per charge whose state is not `won` / `part_won` / `lost`.
   - Index on `(organization_id, charge_week_key)`.
   - **Trigger rules:**
     - identity fields (`organization_id`, `charge_id`, `charge_week_key`, `platform`, `platform_trip_id`, `driver_id`, `owed_minor`, `opened_late`, `deadline`, `reopens_id`) never change;
     - a row in `won` / `part_won` / `lost` never changes (Z1; reopening is a new row);
     - `recovered_minor` never goes down;
     - `version` goes up by 1 on every update;
     - no DELETE.
   - Named errors for each rule.
7. **`toll.dispute_links`** (C1): `id`, `organization_id`, `dispute_id`, `payback_id`, `amount_minor > 0`, `decision_id` (FK → decisions), `reversed_by`.
   - An **AFTER each row** check, like `allocations_caps`: Σ active links (where `reversed_by IS NULL`) ≤ the dispute's `owed_minor`.
   - Append-only, except setting `reversed_by` once.
8. **`toll.allocations`** (W1, Part F F2):
   - Add `dispute_id uuid` with a composite FK to `toll.disputes`.
   - Replace CHECK `allocations_platform_bearer_payback` with: a `platform` row has a `payback_id`, **or** has `provisional = true` and a `dispute_id`; a non-platform row has no `payback_id`.
   - Every existing row must still pass. Prove it in the test.
9. **`toll.carried_facts`**: add `'dispute_result'` to the `kind` CHECK; add `dispute_id uuid` (composite FK, NULL for other kinds; required when `kind = 'dispute_result'`).
10. **Seed function, not run by the migration** (L2.6 step 0): `toll_system.seed_dispute_setup(p_company uuid, p_dry_run boolean DEFAULT true)`.
    - It returns one row per value it would write: table, key, column, current value, new value.
    - When `p_dry_run = false`, it writes:
      - **Uber:** `per_trip`, `takes_disputes` true, window 9, refund periods 2, fallback 23, `auto_apply` false.
      - **InDrive:** `rider_pays_driver`, `takes_disputes` false, `auto_apply` false.
      - **Roam:** `native`.
      - **`dispute_policy`:** fleet / driver.
      - **Uber template version 1** with this body: `Hi, on {trip_date} at {trip_time} I drove through the {plaza} toll during this trip. The toll cost {toll} and I was refunded {paid}, so {owed} is still owed. Please refund the remaining {owed}. Thank you.`
    - It never overwrites a value that already exists; it reports it as "kept".
    - It runs with `service_role` only.
    - It does **not** seed plaza rates. Those come from a separate, checked file later.
11. **RLS and grants:** RLS on every new table. Signed-in members of the company may SELECT their own company's rows (copy the existing toll read policy). Writes only through `service_role` / later commands.

### 2. SQL tests
Follow the style of `supabase/tests/toll_v2_schema_checks.sql` and `supabase/tests/toll_v2_decisions.sql`.

- **`supabase/tests/toll_disputes_schema_checks.sql`**: invariant counts that must be 0:
  - platform rows on `allocations` with neither a payback nor (provisional + dispute);
  - non-platform rows with a payback;
  - two non-final disputes on one charge;
  - `recovered_minor > owed_minor`;
  - Σ active links > owed;
  - a `rider_pays_driver` setting with `auto_apply` or `takes_disputes` on;
  - a `dispute_result` carried fact with no dispute.
- **`supabase/tests/toll_disputes_data_test.sql`**: behaviour, inside `BEGIN … ROLLBACK`, with made-up companies, drivers and amounts that can never match real data. Catch each expected error by its code and `RAISE EXCEPTION` if the wrong thing happens. Prove:
  - a provisional platform allocation with a `dispute_id` and no payback is accepted; a platform allocation with neither is refused;
  - a second non-final dispute on the same charge is refused; after the first is `lost`, a new row with `reopens_id` is accepted;
  - changing `owed_minor`, `charge_id` or `deadline` is refused; changing a `won` row is refused; lowering `recovered_minor` is refused; DELETE is refused;
  - two links that together exceed `owed_minor` are refused on the second insert;
  - `rider_pays_driver` with `auto_apply = true` is refused;
  - a template with `{driver_name}` is refused; retiring a template twice is refused;
  - `plaza_rate` returns the rate in force on a date when two `valid_from` rows exist;
  - `seed_dispute_setup(company, true)` writes nothing; with `false` it writes the values above; run a second time, it reports everything as "kept";
  - every existing toll SQL test still passes: run `toll_v2_schema_checks.sql`, `toll_v2_decisions.sql`, `toll_v2_commands.sql`, `toll_v2_carry_forward.sql`, `toll_v2_matcher.sql` and `toll_v2_roam_native.sql` after the reset.

  End with `RAISE NOTICE 'toll_disputes_data_test: ok';`.

### 3. CI
In `.github/workflows/parts-sql-checks.yml`:
- add the new migration and both test files to the `paths` lists for `pull_request` and `push`;
- add the two run lines right after the existing toll test lines, in the same style.

If `scripts/check-before-push.mjs` has a toll check list, add the two files there too.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset` on the **local** database only. It must finish with no error.
2. Run the two new test files and the six existing toll test files above against the local database, the same way CI does. All must pass.
3. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`. Both must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change files outside this round's list: the migration, the two test files, the workflow file, and `scripts/check-before-push.mjs` if needed.
- Do not change any existing migration file.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL — I'll read the files.
