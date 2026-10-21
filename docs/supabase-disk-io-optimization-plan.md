# Supabase Disk IO Optimization Plan — GoRide (`csfllzzastacofsvcdsc`)

**Rev 4 · 2026-10-20 · Owner implements from here. This doc is the handoff.**

## 0. Summary

Supabase warned that the project is using up its **Disk IO budget**. When the budget runs out, the database slows down and can stop responding.

The database is small (387 MB, fully cached in memory). The disk usage comes from **sorting**. A few app screens fetch big lists 1,000 rows at a time, and on every page the database re-sorts the whole list. The sort doesn't fit in the 2 MB of working memory, so it's written to disk and thrown away. That adds up to **1,376 GB written to disk since Nov 2025** for a 387 MB database.

The fix is to change those few queries so they don't need the big sort. Upgrading compute would hide the problem rather than fix it (see P7).

| Step | What | Status |
|---|---|---|
| P0 | Baseline numbers + find what's hot | ✅ Done |
| P1.1 | Raise working memory for API roles | ❌ **Caused a 26-min outage, reverted.** Don't retry without §1.3 |
| P1.2 | Nightly cleanup of cron history | ✅ Live |
| P1.3 | Slow down every-minute cron jobs | ✅ `rush-config-apply-pending` is every 5 minutes. Customer-facing jobs stay every minute |
| — | **Measure** (24 h after P0) | ⏳ Official row still due 2026-10-21 after 22:50 UTC. Early read is in §13 |
| P2 | Fix the ledger query (biggest offender) | ✅ Function is live and the app switch is published |
| P3 | KV prefix reads | ✅ Index, watermark, and the app switch are published |
| P4 | Driver trips/transactions reads | ✅ Transactions index is live. Keyset and name search are published |
| P5 | Write volume (API usage logging) | ✅ New tables, totals, nightly purge, and the logger switch are published |
| P6 | PostgREST schema reloads | ✅ No schema removed. Figma Make disconnect is an owner settings step (§10) |
| P7 | Upgrade compute or not | ⏳ Do not upgrade. Recheck the Disk IO chart 7 days after the app switch is published |

---

## 1. What is live in production right now

### 1.1 Objects that exist in prod

| Object | Created by | Effect today | Remove with |
|---|---|---|---|
| `private.io_baseline_20261020` (table, 4,780 rows) | P0 | None. Read-only snapshot for before/after | `drop table private.io_baseline_20261020;` (after P7) |
| cron job `purge-cron-run-details-7d` (jobid 33, daily **05:40 UTC**) | P1.2 | Deletes cron history older than 7 days. First run deletes ~359k rows at once | `select cron.unschedule('purge-cron-run-details-7d');` |
| Index `ledger.idx_ledger_entries_debit_eff` | P2 | Slightly larger writes on `ledger.entries`; not yet used by reads | `drop index ledger.idx_ledger_entries_debit_eff;` |
| Index `ledger.idx_ledger_entries_credit_eff` | P2 | Same | `drop index ledger.idx_ledger_entries_credit_eff;` |
| Function `public.ledger_entries_for_driver(...)` | P2 | Takes `p_skip_count`. Nothing in production calls it until fleet functions are published. Execute granted to `service_role` only | `drop function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int, boolean);` |

`pg_stat_statements` was reset at **2026-10-20 22:48:05 UTC**. `pg_stat_database.temp_bytes` at that moment was **1,477,770,294,817** (that counter was not reset).

### 1.2 Files added to your working tree (uncommitted; your call)

| File | Matches prod? | Notes |
|---|---|---|
| `supabase/migrations/20261020224911_db_io_p1_work_mem_cron_purge.sql` | ✅ version recorded in prod | Contains the work_mem lines that caused the outage, marked with a warning. The cron part is live |
| `supabase/migrations/20261020231225_db_io_p2_ledger_entries_for_driver.sql` | ✅ version recorded in prod | The P2 indexes + function |
| `supabase/migrations/20261020231600_db_io_p1_revert_work_mem.sql` | ✅ version recorded in prod | Safe to apply again (it only resets). Keep it so a fresh environment doesn't inherit the bad setting |

Nothing else in the repo was changed. No edge functions were built or deployed.

### 1.3 Incident: 2026-10-20 22:50–23:16 UTC

- **What broke:** every API request as `service_role`/`authenticated` returned 400 for ~26 min. Customers couldn't load fuel logs, and everything else that goes through the API failed too.
- **Cause:** P1.1 set `work_mem = '8MB'` on those roles. PostgREST passes role settings to Postgres in lowercase (`'8mb'`), and Postgres rejects that spelling: `invalid value for parameter "work_mem"` (1,367 log lines).
- **Data:** none lost. `fleet.fuel_entries` = 548 rows before and after.
- **Fix:** both roles reset at ~23:16. After 23:16:30: 148 OK responses, 0 errors.
- **If you ever retry P1.1:**
  1. Use a unitless value (`work_mem = 8192`, meaning kB), never `'8MB'`.
  2. Try it on a Supabase **branch** first, not prod.
  3. Have the revert ready: `alter role service_role reset work_mem; alter role authenticated reset work_mem; notify pgrst, 'reload config';`
  4. Within 60 s, load a real screen and check the API logs for 4xx/5xx. Reading `pg_roles` back is **not** a test.

---

## 2. Diagnosis (measured 2026-10-20)

| Fact | Value | Meaning |
|---|---|---|
| Database size | 387 MB | Fits in RAM |
| Cache hit rate | 100.00% | Table data is almost never read from disk |
| **Temp files written since 2025-11-21** | **1,376 GB, 413,494 files** (~4 GB/day) | **This is the Disk IO** |
| `work_mem` | 2,184 kB | Sorts over ~2 MB spill to disk |
| Write log (WAL) | 10.7 GB | Secondary: KV upserts |
| `cron.job_run_details` | 420k rows, 79 MB | Secondary: never purged (now fixed by P1.2) |
| Live speed | 2.2 s for a 1,000-row read; ledger requests avg **1.7 s** | Already throttled |

**The bad pattern** (every big offender has it):

```
SELECT *                         ← wide rows (metadata / payload_json / value jsonb)
WHERE a IN (…) OR b IN (…)       ← or another filter no ordered index can serve
ORDER BY col
LIMIT 1000 OFFSET n              ← looped page after page
(+ count: "exact" = a 2nd full scan)
```

### Top offenders (ranked by temp blocks written; 1 block = 8 kB)

| # | Where | Calls | Temp written | Speed |
|---|---|---|---|---|
| 1 | `listEntriesForDriver`, [queries.ts:266-329](../supabase/functions/_shared/unifiedLedger/queries.ts#L266-L329) | ~41k | **~85 GB** | 145–302 ms (1.7 s in recent logs) |
| 2 | `getByPrefix`, [kv_store.tsx:231-258](../supabase/functions/_fleet-server/kv_store.tsx#L231-L258) | ~516k | ~37 GB | 8–33 ms |
| 3 | `fleet_trips` / `fleet_transactions` by `driver_id` + `order(date)` + OFFSET | ~8k | ~34 GB | 275–1,128 ms |
| 4 | KV JSON search `value->>x = … OR value->>y ilike …` | ~1.9k | ~5 GB | 31–252 ms |
| 5 | PostgREST schema-cache reloads (13 exposed schemas) | ~4.2k | ~15 GB | 174–691 ms |
| 6 | `ledger_entries` by `product`, `order(effective_at)` | ~1k | ~5 GB | 38–82 ms |

### What the last 24 h of API logs show

| API path | Requests/day | Avg ms | Note |
|---|---|---|---|
| `kv_store_37f42386` | 15,275 | 176 | |
| `fleet_trips` | 2,722 | **964** | 3–5 pages per screen load, so OFFSET loops |
| `fleet_transactions` | 2,622 | **952** | same |
| `ledger_accounts` | 915 | 359 | Account lookup before each ledger read (P2 folds this in) |
| `ledger_entries` | 693 | **1,665** | 590 of them are offender #1 |

| KV prefix scanned | Calls/day | Avg ms |
|---|---|---|
| `driver_audit:` | **1,438** | 61 |
| `dispute-refund:` | 325 | 467 |
| `finalized_report:` | 230 | **1,038** |
| `jaa_program:` | 197 | 293 |
| `fuel_scenario:` | 147 | **1,348** |

### Other findings

- **Repeated `CREATE INDEX` on the KV table (632 runs):** not your code. It's setup SQL from an outside tool, sent as `postgres` with the comment `-- apply sql from post body`, matching the Figma Make `make-server-37f42386` template. **Action:** if you no longer use Figma Make with this project, disconnect it in Figma Make's Supabase settings.
- **Not the cause (don't chase):** table reads (100% cached), table bloat, millions of tiny-table scans (`auth.mfa_amr_claims`, `platform.user_roles`: CPU, not disk), advisor lints.
- **Unrelated, noticed in passing:** `anon` holds INSERT/UPDATE/DELETE/SELECT grants on the `public.ledger_entries` view. The view is security-invoker, so the underlying table's permissions still apply. Still worth revoking; see the RLS exposure audit.

---

## 3. Targets

| Metric | Now | Target |
|---|---|---|
| Temp written per day | ~4 GB | **< 200 MB** |
| Temp written by offenders #1–#3 | GBs | **0** |
| Disk IO % in the Supabase dashboard | depleting | < 50% of baseline |
| Ledger request time | 1.7 s | < 100 ms |
| `cron.job_run_details` rows | 420k | < 60k |

---

## 4. P1.3: every-minute cron jobs (your decision)

Each job below runs 1,440 times a day and writes 2 history rows per run, even when there's nothing to do. Mark each one **keep** or **every 5 min**:

| Job | Schedule | What it does (by name) | Can it lag 5 min? |
|---|---|---|---|
| `rides-matching-hygiene` | every min | cleans up ride matching | ? |
| `delivery_refresh_surge_now` | every min | delivery surge pricing | probably not |
| `fleet-activity-presence-sweep` | every min | marks stale presence offline | ? |
| `fleet-activity-ingest` | every min | ingests fleet activity | ? |
| `rush-in-house-sweep` | every min | Rush in-house order sweep | probably not |
| `rush-config-apply-pending` | every min | applies scheduled Rush config | likely yes |
| `delivery_courier_stale_offline` | every 5 min | already 5 min | — |

To change one: `select cron.alter_job(<jobid>, schedule := '*/5 * * * *');` (get the jobid from `select jobid, jobname from cron.job;`).

---

## 5. Measure (2026-10-21, after 22:50 UTC)

P1.1 was reverted, so this measures the **unchanged** baseline plus the cron purge. That's still worth doing: it's your clean "before" number for P2.

```sql
-- temp written since the P0 reset (target after all phases: < 200 MB/day)
select pg_size_pretty(temp_bytes - 1477770294817) temp_written_since_reset,
       now() - '2026-10-20 22:48:05+00'::timestamptz as window
from pg_stat_database where datname = current_database();

-- top temp writers since the reset
select calls, temp_blks_written, round(mean_exec_time::numeric,1) mean_ms,
       left(regexp_replace(query,'\s+',' ','g'),160) q
from extensions.pg_stat_statements
where temp_blks_written > 0 order by temp_blks_written desc limit 10;

-- cron purge ran? (expect ~60k)
select count(*) from cron.job_run_details;
```

Write the results into §13 (Measurements log).

---

## 6. P2: ledger query (offender #1). Do this first.

**Goal:** a driver's ledger list reads only that driver's rows through an index, instead of scanning and sorting the whole ledger on every page.

**Already done in prod (§1.1):**
- Two indexes, `(debit_account_id, effective_at desc, id desc)` and `(credit_account_id, …)`.
- Function `public.ledger_entries_for_driver(p_driver_id, p_org, p_products, p_entry_types, p_from, p_to, p_limit, p_offset)`. It returns the same 16 columns as `public.ledger_entries` plus `total_count`.

What the function does:
1. Finds the driver's accounts (`account_key` starts with `user:<id>:driver:`). This replaces the separate `ledger_accounts` call.
2. Fetches entries where the account is the debit **or** the credit side, each through its own index. `UNION` removes duplicates, so the rows match what the old `OR` returned.
3. Applies the same optional filters as today: org, products, entry types, from/to.
4. Sorts by `effective_at desc, id desc`. Adding `id` makes page order stable; the old order was arbitrary when two entries had the same timestamp.
5. Returns the page plus the total.

### Step 6.1: parity test (read-only; run in the Supabase SQL Editor)

This compares old vs new for every driver, across three product filters. **Every row must show `ids_match = true` and `new_total = old_n`.** If any row is false, stop and don't do 6.2.

```sql
with drivers as (
  select distinct split_part(account_key, ':', 2) d
  from public.ledger_accounts where account_key like 'user:%:driver:%'
), cases as (
  select d, null::text[] prods from drivers
  union all select d, array['roam_driver','roam_fleet'] from drivers
  union all select d, array['roam_rides','roam_driver'] from drivers
), cmp as (
  select c.d, c.prods,
    (select array_agg(e.id order by e.id) from public.ledger_entries e
      where (e.debit_account_id  in (select id from public.ledger_accounts where account_key like 'user:'||c.d||':driver:%')
          or e.credit_account_id in (select id from public.ledger_accounts where account_key like 'user:'||c.d||':driver:%'))
        and (c.prods is null or e.product = any(c.prods))) old_ids,
    (select array_agg(r.id order by r.id)
       from public.ledger_entries_for_driver(c.d, null, c.prods, null, null, null, 1000, 0) r) new_ids,
    (select max(r.total_count)
       from public.ledger_entries_for_driver(c.d, null, c.prods, null, null, null, 1, 0) r) new_total
  from cases c
)
select left(d, 8) driver, coalesce(array_to_string(prods, ','), '(all)') products,
       coalesce(cardinality(old_ids), 0) old_n, coalesce(cardinality(new_ids), 0) new_n,
       coalesce(new_total, 0) new_total, old_ids is not distinct from new_ids ids_match
from cmp order by 1, 2;
```

(Only 6 drivers have ledger accounts today, so this runs in about a second. None of the driver IDs contain `%` or `_`, so the function's exact prefix match finds the same accounts as the old `LIKE`.)

Then confirm the speed-up:

```sql
explain (analyze, buffers)
select * from public.ledger_entries_for_driver(
  (select split_part(account_key, ':', 2) from public.ledger_accounts
    where account_key like 'user:%:driver:%' limit 1),
  null, array['roam_driver','roam_fleet'], null, null, null, 1000, 0);
```

Expect index scans on `idx_ledger_entries_debit_eff` / `_credit_eff`, **no** `Seq Scan on entries`, **no** `external merge`, and a time in milliseconds.

### Step 6.2: code switch (one function)

File: [queries.ts:266-329](../supabase/functions/_shared/unifiedLedger/queries.ts#L266-L329) (`listEntriesForDriver`). Replace the account lookup (lines 281–295) and the query (lines 299–321) with one RPC call. Keep the function signature and return shape exactly the same:

```ts
  const limit = Math.min(opts.limit ?? 50, 1000);
  const offset = opts.offset ?? 0;
  const products = opts.products && opts.products.length > 0
    ? opts.products
    : opts.product ? [opts.product] : null;

  const callRpc = (pLimit: number, pOffset: number) =>
    client.rpc("ledger_entries_for_driver", {
      p_driver_id: opts.driverId,
      p_org: opts.organizationId ?? null,
      p_products: products,
      p_entry_types: opts.entryTypes && opts.entryTypes.length > 0 ? opts.entryTypes : null,
      p_from: opts.from ?? null,
      p_to: opts.to ?? null,
      p_limit: pLimit,
      p_offset: pOffset,
    });

  const { data, error } = await callRpc(limit, offset);
  if (error) {
    console.error("[unifiedLedger] list entries for driver:", error.message);
    throw new Error(`ledger_entries driver list failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  let total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
  // Page past the end returns no rows, so no total; fetch it when the caller wants a count.
  if (!opts.skipCount && rows.length === 0 && offset > 0) {
    const { data: head } = await callRpc(1, 0);
    total = head && head.length > 0 ? Number((head[0] as Record<string, unknown>).total_count ?? 0) : 0;
  }
  const entries = rows.map(({ total_count: _t, ...e }) => e);
  return { entries, total: opts.skipCount ? 0 : total };
```

Notes:
- The old code returned `total: count ?? 0`, which was `0` when `skipCount` was set. The last line keeps that.
- Nothing else changes. Callers: [platformLedger.ts:64](../supabase/functions/rides/admin/platformLedger.ts#L64), [unifiedLedger.ts:39](../supabase/functions/rides/admin/unifiedLedger.ts#L39), and the busiest one, `listAllUnifiedCanonicalEvents` at [queries.ts:449](../supabase/functions/_shared/unifiedLedger/queries.ts#L449). They all keep working unchanged.
- `queries.ts` is shared, so it ships in **`rides`**, **`delivery`**, and the **fleet bundles** (`fleet-core` etc. via `npm run deploy:edge`). The fleet bundle build packs **everything on disk**, including your other uncommitted work. Commit or stash that first, or deploy from a clean branch.

### Step 6.3: verify after deploy

1. Open a driver's ledger/earnings screen. It should load, with the same entries as before.
2. Within 5 minutes, check the API logs for 4xx/5xx on `/rest/v1/rpc/ledger_entries_for_driver`.
3. Next day:
   ```sql
   select calls, temp_blks_written, round(mean_exec_time::numeric,1) mean_ms
   from extensions.pg_stat_statements where query ilike '%ledger_entries_for_driver%';
   ```
   Expect `temp_blks_written = 0`. `mean_ms` should be in the tens, not hundreds.

**Rollback:** revert the `queries.ts` change and redeploy. The DB objects can stay; they're harmless.

### Step 6.4: optional follow-ups (after 6.3 is green)

- Drop the now-redundant single-column indexes `ledger.idx_ledger_entries_debit` and `ledger.idx_ledger_entries_credit`. Check first that nothing else uses them: `idx_scan` in `pg_stat_user_indexes` should stop growing.
- The non-driver branch of `listUnifiedLedgerEntries` ([queries.ts:220](../supabase/functions/_shared/unifiedLedger/queries.ts#L220), offender #6): pass `skipCount: true` from any caller that doesn't display `total`.

---

## 7. P3: KV prefix reads (offender #2)

The logs show every prefix scan fits on one page, so the cost is **how often** these run and **how wide** the rows are. Paging is not the issue here.

1. **`driver_audit:` (1,438/day):** find the callers (`getByPrefix("driver_audit:`). If a screen reads it on every load, or inside a loop, cache the result per request or for 30–60 s.
2. **`finalized_report:` (~1 s each, ~6 kB rows) and `fuel_scenario:` (~1.3 s):**
   - When the caller needs one week, read that one key with `kv.get(key)` instead of scanning the prefix.
   - When it needs a list, store a small index row (ids + dates) and read full rows only on demand.
3. **`api_usage:{day}:` scans** in `api_command_center.tsx` (lines 187, 220): use the `api_usage_agg:` rows that already exist.
4. **`fleet_kv_backup:` (5,527 rows, the largest prefix):** make sure nothing reads it in normal use.
5. **KV JSON search (offender #4):** find the `.or("value->>…")` caller and move it to a real table lookup.
6. *(Defensive, later)* swap `.range()` in `getByPrefix` for key-based paging.

**Verify:** KV requests per day (from the API logs) drop by at least 5×.

---

## 8. P4: driver trips / transactions (offender #3)

1. **Find the exact caller.** The query is `select *` from `fleet_trips` / `fleet_transactions`, `driver_id in (…)`, `order(date asc)`, paged with OFFSET. Near matches: [driver_operational_periods.ts:102-106](../supabase/functions/_fleet-server/driver_operational_periods.ts#L102-L106) and `drivers_reconciliation.ts:86`. The `select *` version is likely a shared loader (`fleet_table_read_thru.ts` / `fleet_select.ts`).
2. **Add the missing index** (`fleet.transactions` has none on `driver_id`):
   ```sql
   create index if not exists fleet_transactions_driver_date_idx
     on fleet.transactions (driver_id, date, id);
   ```
3. **Select only needed columns.** Leave out `payload_json` wherever only amount/status/date are used. That column is what makes rows too wide.
4. **Page by `(date, id)`** instead of OFFSET.

**Verify:** both paths average under 100 ms in the API logs (from ~960 ms), with zero temp written.

---

## 9. P5: write volume

1. **`api_usage_logger.ts`** writes one KV row per external API call, plus a read-modify-write of the `api_usage_agg:` totals (~6 GB of write log so far). Move it to a narrow table with a 90-day purge, or keep only the aggregates, updated atomically.
2. **Bulk KV upserts** (4.5k calls, 150 ms avg): find the caller (likely `fleet_kv_backup:`) and confirm it's still needed.
3. **Add purge jobs** for `error-log:` and `stats:` KV keys.

---

## 10. P6: PostgREST schema reloads

Each schema reload costs 0.2–0.7 s of heavy introspection across **13 exposed schemas**.
- Reload only on deploy. Check what sends `notify pgrst`.
- Remove schemas from `pgrst.db_schemas` that no client calls over REST. This is also a security improvement. **Test on a branch first:** removing a schema a client uses breaks that client.

---

## 11. P7: upgrade compute?

Seven days after P2–P4 are live, look at the Disk IO chart:
- **Under 50% of budget:** stay as you are.
- **Still near the limit:** upgrade one compute size.

Upgrading first would only hide the waste until the data grows.

---

## 12. Rules to keep it fixed

1. **Weekly check:** run the second query in §5. Investigate any query whose `temp_blks_written / calls` exceeds 100.
2. **Query rules:**
   - Don't page through growing lists with OFFSET loops.
   - Don't `select *` on tables with big jsonb columns in list screens.
   - Use `count: "exact"` only when the screen shows the total.
   - Don't use `.or()` across two indexed columns on hot paths.
3. **Every new log-style table or KV prefix gets a purge job** on day one.
4. **Database setting changes:**
   - Branch first.
   - Have the revert ready.
   - Load a real screen within 60 s.
   - Use unitless values on API roles (§1.3).

---

## 13. Measurements log

| When (UTC) | Temp written since 22:48:05 reset | Top temp writer | Notes |
|---|---|---|---|
| 2026-10-20 22:48 | 0 (reset) | — | Baseline in `private.io_baseline_20261020`. Counter at reset: 1,477,770,294,817 |
| 2026-10-21 ~02:00 | 191 MB | Driver trip read (`fleet_trips` by driver), about 1.2 s, ~11,060 temp blocks | About 3 hours after the reset. `temp_bytes` 1,477,970,766,838. This is the early picture, not the official 24-hour row |
| 2026-10-21 during this change | Still 191 MB (`temp_bytes` unchanged at 1,477,970,766,838) | Same counter, no new temp since the early read | Ledger read for one driver uses the debit and credit indexes and an in-memory top-50 sort (30 kB, no disk sort). Wall time was about a minute because vacuum was cleaning the old backup rows, not because the sort spilled |
| 2026-10-21 ≥ 22:50 | | | Official 24-hour row. Not due yet |
| after the app switch + 1 day | | | Ledger temp for `ledger_entries_for_driver` should be 0 |
| after the app switch + 7 days | | | P7 decision. Stay on this size if Disk IO is under half the budget |

### 13.1 What is live, and what is waiting on publish

Live in the database, screens unchanged until publish:

- Working memory stays at the reset value. The bad unit-suffixed setting is not in use.
- `fleet.transactions (driver_id, date, id)` index.
- Rush config cron every 5 minutes. Ride cleanup, delivery surge, presence, and Rush in-house claims stay every minute.
- Anonymous and public access removed from `public.ledger_entries`. The edge function still reads it.
- `ledger_entries_for_driver` skips the full count when asked. Explain shows index scans on `idx_ledger_entries_debit` and `idx_ledger_entries_credit`, a 931-row in-memory sort, and no full scan of the ledger. That driver’s row count matches the old read (931).
- Thin index for finalized fuel reports and dispute refunds, plus the driver-audit “since last time” read.
- API call log tables, 2,591 old detail rows copied, day and month totals rebuilt (day totals add up to 2,591). Nightly 90-day purge is scheduled at 05:50 UTC. Old key-value detail rows stay until that purge. `config:cache_version:stats` is not deleted.
- Unused `fleet_kv_backup:` rows were deleted in batches. A vacuum of that table was still running at the end of this change.

Published with this release:

- Driver ledger reads call the new function and keep the same `{ entries, total }` shape.
- Admin activity remembers the last audit time.
- Fuel and refund lists read the thin index. Fuel catalogs cache for 60 seconds.
- Expenses rebuild pages by date and id. Trip search uses the driver column and the drivers table for names.
- API Command Center reads the new totals and a date-bounded call log.

Published 2026-10-21. Open one driver’s earnings and the settlement ledger and confirm they load. The API log for `ledger_entries_for_driver` should show no errors.

Schemas exposed to the API stay as they are (13 names, including `accounting`, `rush_config`, and `recon`). `recon` and `rush_config` are used. `accounting` stays until a branch loads the real screens. Do not guess.

Do not change compute size. Seven days after the ledger and trip reads are actually published, read the Disk IO chart. Under half the budget: stay. Still near the limit: move up one size.

Figma Make is the outside tool that reloads the schema list and has been running setup SQL. If it is no longer used with this project, disconnect it in Figma Make’s Supabase settings. That is not a code change.
