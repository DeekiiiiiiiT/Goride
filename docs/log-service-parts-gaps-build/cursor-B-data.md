# Give Cursor this — Log service parts gaps, Slice B, Round B-Data

You are building **Slice B, Data layer only** of `docs/log-service-parts-gaps-audit.md` (Rev 3.1). Read these parts first; they are the spec:
- the status block at the top (Rev 3.0 / 3.1)
- section 1 (facts), especially "Find parts → Dominion path", "The merge key (v1)", "Research worker", "Unknown parts in Log service"
- section 2, Slice B table (LS-09 … LS-18, LS-21 … LS-23)
- section 3.1 Data, the Slice B bullet
- section 4 (Gates) and section 5 (Done-tests 8–21)

Slice A is finished. Do **not** build the Slice B server work (the completion step, the `parts-sourcing-drain` edge function, the work-order read's send state, the Pending parts read, moving TypeScript to key v2) or any screen. Those are later rounds. Do not change any TypeScript in this round.

The working tree has many uncommitted changes. Keep them: never revert, reformat or stash anything.

**Why so much is SQL:** every rule that must hold under retries and two drains at once (sent once, merge, count, daily limit, cancel, retry times) lives in SQL functions here, so the Server round only calls them and the checks file can prove them.

## What to build

### 1. One new migration
Create it with `npx supabase migration new log_service_parts_outbox`. That gives it the real current UTC time; never pick or edit the date yourself. Shipped migration files are never edited. In this order:

**1a. Other item can hold a part number (LS-09).** On `public.maintenance_work_order_line_item` (table in `20261113171047_service_items_logging_core.sql:9-72`):
- drop `maintenance_work_order_line_item_part_number_kind_check` and add it back as `CHECK (part_number IS NULL OR item_kind IN ('part_type', 'other'))`;
- add `maintenance_work_order_line_item_other_part_number_check`: `CHECK (item_kind <> 'other' OR part_number IS NULL OR part_number ~ '^[A-Za-z0-9-]{1,80}$')` (the same cleaning as `old_part_number`; the server cleans before saving, in the Server round). No Other item has a part number today, so it validates at once;
- `part_id_kind_check` stays exactly as it is (`part_id` only on `part_type`).

**1b. Where a request came from.** `public.parts_sourcing_requests.origin text NOT NULL DEFAULT 'find_parts'`, CHECK `origin IN ('find_parts', 'service_log')`, with a `COMMENT`. Every existing row is a Find parts request, so the default is right for them.

**1c. What was asked, on the research job (LS-21).** `public.catalog_research_job.requested_name text NULL` and `requested_part_number text NULL`, each with a `COMMENT` ("Set when the job is created; on a merge filled only where empty; the first request wins").

**1d. Key v2 (LS-14).** `public.catalog_research_research_group_key_v2(p_vehicle_catalog_id uuid, p_component_id uuid, p_fit_descriptor text, p_install_side text, p_match_type text, p_position_scheme text, p_position_codes text[], p_part_number text, p_name text) RETURNS text`, IMMUTABLE, `SET search_path = ''`.
- Remove every `|` from every text input (and from each position code) before using it.
- The result is `'v2'` and seven more segments joined with `|` (always 8 segments, empty ones kept):
  1. the catalogue car id, or `''`;
  2. the part type (component) id, or `''`;
  3. fit-or-side: trimmed `p_fit_descriptor` when not blank, else trimmed `p_install_side`, else `''` (same rule as v1);
  4. trimmed match type, or `''`;
  5. position scheme: trimmed scheme, but `''` when there are no position codes;
  6. position codes: distinct, sorted, joined with `,`, or `''`;
  7. identity:
     - if the part number cleaned as `upper(left(regexp_replace(p_part_number, '[^A-Za-z0-9-]', '', 'g'), 80))` is not empty → `'pn:'` + that;
     - otherwise, if the name made lower case, trimmed and single-spaced (`lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g')))`) is not empty → `'nm:'` + `md5(` that `)`;
     - otherwise `''` (old rows only).
- Upper-casing the number means `89467-b1040` and `89467-B1040` are the same part.
- `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role`.
- Leave both v1 functions (`catalog_research_research_group_key`, `parts_sourcing_research_group_key`) exactly as they are. There is no backfill *function* to replace: the old backfill (`20261101163028_…`) was a one-time `DO` block. Nothing in SQL calls v1 after this migration.

**1e. Rewrite the open keys to v2 (LS-15).** Recompute from columns, never parse the old key:
- every open job (`state IN ('queued','researching','checking','needs_review','auto_added')`) whose `group_key` doesn't start with `v2|` → v2 from its own `vehicle_catalog_id`, `maintenance_component_id`, `fit_descriptor`, `match_type`, with `install_side` taken from its earliest open request (`catalog_research_job_id = job.id`, `status IN ('open','in_progress')`, oldest `created_at`), and the four new inputs NULL;
- every open `add_part_info` request (`status IN ('open','in_progress')`) linked to an open job → `research_group_key` = that job's new `group_key` (so they are equal by construction);
- every other open `add_part_info` request → v2 from its own columns, the four new inputs NULL;
- then a `DO` block that raises if any open job or open `add_part_info` request has a key that doesn't start with `v2|`, or any open request's key differs from its open job's key.

The unique index `catalog_research_job_open_group_key` stays. v1 → v2 is one-to-one, so the rewrite can't make two open jobs collide.

**1f. The outbox (LS-12).** `public.parts_sourcing_outbox`:
- `id uuid PK DEFAULT gen_random_uuid()`
- `organization_id text NOT NULL`
- `work_order_id uuid NOT NULL REFERENCES public.maintenance_work_orders(id) ON DELETE CASCADE`
- `line_item_id uuid NOT NULL UNIQUE REFERENCES public.maintenance_work_order_line_item(id) ON DELETE CASCADE`
- `state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','merged','not_sent','cancelled'))`
- `reason_code text NULL CHECK (reason_code IN ('car_not_linked','daily_limit','error'))`
- `tries integer NOT NULL DEFAULT 0` (counts failed sends only)
- `next_try_at timestamptz NOT NULL DEFAULT now()`
- `claimed_at timestamptz NULL`
- `request_id uuid NULL REFERENCES public.parts_sourcing_requests(id) ON DELETE SET NULL`
- `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`
- CHECK `(state IN ('sent','merged')) = (request_id IS NOT NULL)`
- index `(state, next_try_at)`
- `COMMENT` on the table and on `state` / `reason_code`
- `ENABLE ROW LEVEL SECURITY` with no policies; `REVOKE ALL ON TABLE … FROM PUBLIC, anon, authenticated`; `GRANT ALL … TO service_role`.

**1g. Queue: `public.parts_sourcing_outbox_queue(p_work_order_id uuid) RETURNS integer`** (VOLATILE, SECURITY DEFINER, `SET search_path = public, pg_temp`). This is what the completion step `queue_unknown_parts` will call (LS-10, LS-11).
- One row per **eligible item** of that work order. An item is eligible when:
  - `item_kind = 'other'`, OR (`item_kind = 'part_type'` AND `part_id IS NULL`); never a `supply` item;
  - and its line has `recommended = false`, `declined = false` and `voided_at IS NULL`.
- `organization_id` comes from the work order.
- `INSERT … ON CONFLICT (line_item_id) DO UPDATE SET state = 'pending', reason_code = NULL, next_try_at = now(), claimed_at = NULL, updated_at = now() WHERE parts_sourcing_outbox.state = 'cancelled'`. A replay changes nothing for rows that are pending, sent, merged or not_sent.
- It returns the number of rows inserted or revived. It talks to nothing outside the database (gate 1).

**1h. Claim: `public.parts_sourcing_outbox_claim(p_limit integer DEFAULT 25) RETURNS SETOF public.parts_sourcing_outbox`** (VOLATILE, SECURITY DEFINER).
- In one statement: pick rows with `state = 'pending' AND next_try_at <= now() AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')`, oldest `next_try_at` first, `LIMIT p_limit`, `FOR UPDATE SKIP LOCKED`.
- Set `claimed_at = now()`, `updated_at = now()`, and `RETURNING` them.
- Two drains at once never get the same row.

**1i. Send: `public.parts_sourcing_outbox_send(p_outbox_id uuid, p_row jsonb) RETURNS jsonb`** (VOLATILE, SECURITY DEFINER), all in one transaction. `p_row` is what the existing `buildPartsSourcingInsert` returns (its keys are the request columns), plus `item_name`. Steps, in order:
1. **Lock the outbox row** (`FOR UPDATE`).
   - Missing → `RAISE EXCEPTION 'outbox_not_found'`.
   - Already `sent` / `merged` → return `{ result: <state>, requestId }` and change nothing (sent once, gate 2).
   - `not_sent` / `cancelled` → return `{ result: <state> }`.
   - `pending` with `claimed_at IS NULL` → `RAISE EXCEPTION 'outbox_not_claimed'`.
2. **Re-check the service (LS-13).**
   - The item, its line or its work order is gone or voided → `state = 'cancelled'`, `claimed_at = NULL`; return `{ result: 'cancelled' }`.
   - The work order isn't `completed`: if the outbox row is over 7 days old → `cancelled` as above; otherwise `claimed_at = NULL`, `next_try_at = now() + interval '5 minutes'`, still `pending`; return `{ result: 'not_completed' }`.
3. **Guards.**
   - `p_row->>'organization_id'` must equal the outbox row's `organization_id`, else `RAISE EXCEPTION 'outbox_org_mismatch'`.
   - `p_row->>'vehicle_catalog_id'` blank → do what `parts_sourcing_outbox_retry` does for `car_not_linked` (step 1j) and return its result with `result: 'car_not_linked'`.
4. **Key:** `catalog_research_research_group_key_v2(vehicle_catalog_id, maintenance_component_id, fit_descriptor, install_side, match_type, position_scheme, position_codes, old_part_number, item_name)`, all from `p_row`. Read `position_codes` with `jsonb_array_elements_text`; a missing key or JSON null means no codes.
5. **Dedupe, org-scoped and open-only,** exactly like `findDedupedOpenRequest` (`catalog_research_intake.ts:44-61`): this company's newest `add_part_info` request with `research_group_key` = key and `status IN ('open','in_progress')`. If found → `state = 'merged'`, `request_id` = that request, `reason_code = NULL`, `claimed_at = NULL`; no new request, no count; return `{ result: 'merged', requestId }`.
6. **Daily limit (30 per company, `catalog_research_intake.ts:7`):** count this company's `add_part_info` requests with `created_at >=` the start of today in Jamaica (`(date_trunc('day', now() AT TIME ZONE 'America/Jamaica')) AT TIME ZONE 'America/Jamaica'`). If 30 or more → `pending`, `reason_code = 'daily_limit'`, `next_try_at` = next Jamaica day 00:05 (`(date_trunc('day', now() AT TIME ZONE 'America/Jamaica') + interval '1 day 5 minutes') AT TIME ZONE 'America/Jamaica'`), `claimed_at = NULL`; return `{ result: 'daily_limit', nextTryAt }`.
7. **Job, shared across companies:**
   - `INSERT INTO catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id, fit_descriptor, match_type, fleet_count, state, requested_name, requested_part_number) VALUES ('part', key, …, 1, 'queued', item_name, cleaned number) ON CONFLICT (group_key) WHERE state IN ('queued','researching','checking','needs_review','auto_added') DO NOTHING RETURNING id`.
   - If that inserted a row: `PERFORM catalog_research_enqueue_job(id)` and `catalog_research_log_event(id, 'enqueue', 'queued', jsonb_build_object('groupKey', key, 'origin', 'service_log'))`, the same as `ensureCatalogResearchJob`.
   - If not: select the open job with that key and `UPDATE … SET fleet_count = fleet_count + 1, requested_name = coalesce(nullif(requested_name, ''), item_name), requested_part_number = coalesce(nullif(requested_part_number, ''), cleaned number), updated_at = now()`.
   - `fleet_count` goes up only here, i.e. only for a new request.
   - The cleaned number is the same cleaning as the key (step 1d); empty → NULL.
8. **Insert the request.** Columns from `p_row`, typed: every column `buildPartsSourcingInsert` returns (`organization_id, vehicle_id, need_text, created_by, maintenance_component_id, vehicle_catalog_id, platform_id, engine_family_id, urgency, reply_due_at, qty, photo_url, install_side, install_position, fit_descriptor, match_type, sent_at, old_part_number, position_scheme, position_codes`). These are forced: `status = 'open'`, `kind = 'add_part_info'`, `origin = 'service_log'`, `research_group_key = key`, `catalog_research_job_id` = the job.
9. **Mark the outbox row:** `state = 'sent'`, `request_id`, `reason_code = NULL`, `claimed_at = NULL`. Return `{ result: 'sent', requestId, jobId, newJob: true|false }`.

**1j. Retry later: `public.parts_sourcing_outbox_retry(p_outbox_id uuid, p_reason text) RETURNS jsonb`** (VOLATILE, SECURITY DEFINER). The drain calls it when it couldn't send. Only for a `pending` row; any other state → return `{ state }` unchanged. Always `claimed_at = NULL`.
- `'car_not_linked'`:
  - row older than 30 days → `not_sent`, reason `car_not_linked`;
  - otherwise `pending`, reason `car_not_linked`, `next_try_at = now() + interval '24 hours'`.
- `'error'`: `tries = tries + 1`.
  - New `tries` 1, 2, 3, 4 → `pending`, reason `error`, `next_try_at = now()` + 1, 5, 30, 120 minutes.
  - 5 or more → `not_sent`, reason `error`.
- Anything else → `RAISE EXCEPTION 'retry_reason_invalid'`.
- Returns `{ state, reason, nextTryAt }`.

**1k. Grants.** For 1g–1j: `REVOKE ALL … FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE … TO service_role`. `node scripts/assert-public-fn-revoke-anon.mjs` must pass.

**1l. The cron (LS-12), never behind `catalog_research_claim`.**
- `private.invoke_parts_sourcing_drain() RETURNS bigint`, SECURITY DEFINER, `OWNER TO postgres`, the same shape as `private.invoke_vehicle_picture_worker()` in `20261117050423_vehicle_picture_cron_relay.sql`:
  - returns NULL and calls nothing when no row is `pending` with `next_try_at <= now()`;
  - reads its **own** secret, `private.fleet_ops_secrets` name `parts_sourcing_drain_secret`. Missing or shorter than 8 → `RAISE NOTICE` and return NULL (not an exception: the secret and the edge function only exist after go-live);
  - otherwise `net.http_post` to `private.vehicle_picture_functions_url('parts-sourcing-drain')` with header `X-Parts-Sourcing-Drain-Secret`, body `{}`, timeout 60000.
  - `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`; `GRANT EXECUTE … TO postgres`.
- In a `DO` block guarded by `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')` (copy `20261101143000_catalog_research_pipeline.sql:566-587`): unschedule any `parts-sourcing-outbox-drain`, then `cron.schedule('parts-sourcing-outbox-drain', '* * * * *', $cron$SELECT private.invoke_parts_sourcing_drain();$cron$)`.

Every business error is `RAISE EXCEPTION '<code>'` with exactly the codes above.

### 2. Checks file `supabase/tests/log_service_parts_outbox_checks.sql`
Follow the pattern of `supabase/tests/log_service_positions_checks.sql` and `inspection_findings_db_test.sql`.

**Invariants** first, each in a `DO $$ … RAISE EXCEPTION … $$` block. Each must be 0:
- open jobs or open `add_part_info` requests whose key doesn't start with `v2|`;
- open requests whose key differs from their open job's key;
- outbox rows on a `supply` item, on a `part_type` item with a `part_id`, or on a line that is `recommended`, `declined` or voided;
- Other items with a part number that breaks the cleaning rule.

**Behaviour**, inside `BEGIN … ROLLBACK`, with made-up companies, car, catalogue car and names that can never match real data. Insert a made-up `vehicle_catalog` row for the catalogue car. Make each service with `fleet_save_work_order` using the **same JSON shape the server sends** (copy it from `inspection_findings_db_test.sql`), and complete it the same way that file does. Catch expected errors by code in `SQLERRM`; `RAISE EXCEPTION` if the wrong thing happens. Build `p_row` the way `buildPartsSourcingInsert` would (all its keys present) plus `item_name`.

Each check names the done-test or gate it proves:
1. **Eligible items, done-test 10:** a completed service with one Oxygen-sensor-style line holding `{before_cat}`, carrying:
   - an Other item "Front oxygen sensor" with part number `89467-TEST1`;
   - a typed-in `part_type` item with no `part_id` and no number;
   - a `supply` item.

   Also add, with direct INSERTs: a `part_type` item that has a `part_id`, and an item on a `declined` line and on a `recommended` line.

   `parts_sourcing_outbox_queue` → exactly 2 rows (the Other item and the typed-in part). Call it again → returns 0 and still 2 rows.
2. **Key, LS-14:**
   - a name with `:` and `|` in it gives a key starting `v2|` with exactly 8 `|`-separated segments;
   - the same inputs give the same key;
   - `89467-test1` and `89467-TEST1` give the same key;
   - part number vs no part number give different keys (done-test 18's negative);
   - two different names with no number give different keys (done-test 17);
   - codes `{after_cat,before_cat}` and `{before_cat,after_cat}` give the same key.
3. **Claim:** `parts_sourcing_outbox_claim()` returns both rows; a second call returns none.
4. **Send, done-test 8:** sending the Other item → `sent`. The request has:
   - `origin = 'service_log'`, a v2 key, `position_codes = {before_cat}`;
   - its job has `requested_name = 'Front oxygen sensor'`, `requested_part_number = '89467-TEST1'` and `fleet_count = 1`.

   Sending the same outbox row again → `{ result: 'sent' }`, still one request (gate 2).
5. **Second company, done-tests 11 + 19:** company B, same catalogue car and number → its own new request, the **same** job, `fleet_count = 2`, and `requested_name` unchanged (first request wins).
6. **Same company again → merged:** company A logs the same part on a second service → `merged`, `request_id` = the first request, no new request, `fleet_count` still 2.
7. **Both sources, done-test 18:** a Find parts request (`origin = 'find_parts'`, same v2 key) already open for company C, and company D logs the same part → one job; its requests' origins are `{find_parts, service_log}`.
8. **Voided, done-test 14:** void a finished service before its send → `cancelled`, no request. Set a row's state to `cancelled` by hand and call the queue again → it is `pending` again.
9. **Not completed, done-test 15:** an outbox row for a service that isn't completed → `not_completed`, still `pending`, `claimed_at` NULL. Backdate its `created_at` 8 days and send again → `cancelled`.
10. **Daily limit, done-test 13:** 30 `add_part_info` requests for company E created today → send → `daily_limit`, and `next_try_at` = next Jamaica day 00:05. Backdate the 30 by two days, claim, send → `sent`.
11. **Car not linked, done-test 12:**
    - blank `vehicle_catalog_id` → `car_not_linked`, `pending`, `next_try_at` about 24 hours ahead;
    - `parts_sourcing_outbox_retry(…, 'car_not_linked')` on a row whose `created_at` is 31 days ago → `not_sent`.
12. **Errors, LS-13:** `parts_sourcing_outbox_retry(…, 'error')` five times → `next_try_at` +1, +5, +30, +120 minutes, then `not_sent` with `tries = 5`. A bad reason → `retry_reason_invalid`.
13. **Guards:** `p_row` with another company's id → `outbox_org_mismatch`; sending an unclaimed `pending` row → `outbox_not_claimed`.
14. **LS-09:** an Other item saved through `fleet_save_work_order` with `part_number = '89467-TEST1'` saves; a direct INSERT of an Other item with `part_number = 'bad number!'` fails its check; a `supply` item with a part number still fails.

End with `RAISE NOTICE 'log_service_parts_outbox_checks: ok';`.

Add the file to `.github/workflows/parts-sql-checks.yml`:
- to both `paths` lists (`pull_request` and `push`), next to `log_service_positions_checks.sql`;
- its `docker cp … && docker exec … psql -v ON_ERROR_STOP=1 -f …` lines right after the `log_service_positions_checks.sql` lines, in the same style.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only (once more if it fails with `DbSetupError`). It must finish with no error.
2. Run the new file **and** these existing ones the way CI does:
   - `log_service_positions_checks`, `catalog_research_claim_checks`
   - `inspection_findings_checks`, `inspection_findings_db_test`
   - `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `service_items_completion_db_test`, `service_items_part_source_db_test`
   - `maintenance_discount_checks`, `maintenance_discount_db_test`

   ```
   export MSYS_NO_PATHCONV=1
   docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/<f>.sql
   docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<f>.sql
   ```
   All must pass. If an existing test expects the old `:` key format, say which one and why in your report; don't change its meaning.
3. Run `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

Known and expected in this round: Find parts still builds v1 keys in TypeScript, so a Find parts request made locally after this migration won't merge with the rewritten v2 jobs. The Server round moves TypeScript to key v2, and Data and Server go live together.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit, stash or push.
- Change only: the new migration, the new checks file and `parts-sql-checks.yml`. No TypeScript, no screens, no other migration.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183). If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL; I'll read the files.
