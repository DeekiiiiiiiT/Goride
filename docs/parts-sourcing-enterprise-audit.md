# Parts Sourcing — Audit (open items only)

**Rev 3 · 2026-10-13** · Closed findings are removed; this lists only what's left.

**Re-check (2026-10-13, later):** no parts changes found. No commit, no new parts migration, no file edits since the 18:14 deploy build. Prod import function unchanged (O-2 still reproduces), and catalog counts still 0. All items below remain open.

**Status:** Rev 2 fixes are deployed (fleet-ops v249, fleet-core v44) and migration `20261013220000` is applied, but **none of it is committed**. The CSV import fails on every row, so the catalog is still empty (0 parts, 0 rules, 0 offers). `parts_tiered_search` is off.

**Scope:** Roam Dominion builds the catalog (Vehicle Database → Parts sourcing). The fleet app, driver app and other Roam apps read it.

---

## What's left — in order

| # | Task | Finding |
|---|---|---|
| 1 | **Commit** all Rev 2 work, migration included | O-1 |
| 2 | Fix the import function (rename plpgsql variables) + an SQL test that imports one row | O-2 |
| 3 | Fix the CSV vitest fixture; run vitest in CI | O-3 |
| 4 | **Seed the catalog** | O-4 |
| 5 | Platform-family editor; group the 299 chassis codes once | O-5 |
| 6 | Admin **Review** tab for the queues that nothing reads | O-5 |
| 7 | Make usage side effects idempotent and reversible; only for completed jobs; sync lines on edit | O-6 |
| 8 | SQL-level tests for the four parts functions | O-7 |
| 9 | Set-based coverage; refresh repeat alerts after completion | O-8 |
| 10 | Turn on `parts_tiered_search` for one org at ≥ 60% coverage, compare with legacy, then widen | O-9 |
| 11 | Small items | O-10 |

---

## Open findings

### O-1 — High — Production runs uncommitted code

The Rev 2 migration, routes, UI, tests and `ci.yml` are deployed but not in git. A redeploy from any other checkout brings back the old save order, where a failed parts step after the ledger post leads to a **double-posted** maintenance cost on retry.

**Fix:** commit now, before any other deploy.

### O-2 — High — CSV import fails on every row

`import_parts_catalog_rows` (`20261013220000_parts_sourcing_rev2.sql:512`, `:592-597`) declares a variable `category_id` and then runs:

```sql
UPDATE public.part_master SET category_id = category_id, …
```

Production has `plpgsql.variable_conflict = error`, so Postgres raises `42702 column reference "category_id" is ambiguous`. I reproduced this read-only in prod. The row's exception handler catches it and rolls the row back. Every import returns `applied: 0`.

**Fix:**
- In a new migration, prefix the locals (`v_category_id`, `v_part_id`, `v_group_id`, …), or add `#variable_conflict use_variable`.
- Add an SQL test that imports one row and asserts `applied = 1`. Run it on a branch.

### O-3 — Medium — CSV test is red; CI doesn't run vitest

`category_slug` is now required, but `apps/admin/src/utils/partsCatalogCsvImport.test.ts` still uses the old header, so both rows are rejected.

**Fix:**
- Add `category_slug` to the fixture, plus a `supersedes` case.
- Run this vitest in CI.

### O-4 — High (data) — Catalog is empty

Every tier, badge, price and coverage feature returns nothing until there's data. After O-2, seed in this order:

1. **Top engines' consumables:** `1NZ-FE`, `2ZR-FXE`, `1KR-FE`, `HR15DE`, `2AZ-FE`, `L15B`, `1NZ-FXE`, `R06A`. Seed oil filter, air filter, plugs, belt, thermostat, water pump, O2 sensors and coils, each with `fit_scope=powertrain` and one rule per engine.
2. **Platform wear parts:** pads, rotors, shocks, wipers, cabin filter, bulbs. These are `chassis`/`body` scope with one rule per platform; do O-5 first so siblings share them.
3. **Aftermarket cross-references** in the same interchange groups.
4. **Back-fill** from the free-text `part_number` on past work-order lines.

Measure progress with the coverage figure in admin (the % of active vehicles with a Tier 1–3 match on each component).

### O-5 — Medium — Queues nothing reads; actions with no button

| Item | State |
|---|---|
| `vehicle_platform.parent_id` | No endpoint or UI writes it (0 rows). 299 platforms = 1 per chassis code, so `NZE141`/`NZE141G`, `ZRR80G`/`ZRR80W`/`ZWR80G` etc. don't share platform rules |
| `part_rule_review` ("didn't fit") | Written, never read |
| `part_rule_proposal` (3 fits → suggested rule) | Written, never read; no approve/reject |
| Link reviews, alert dismiss, quote reply → offer, warranty claim status, part search | Endpoint exists, no UI |
| Fleet warranty claims / repeat alerts | Org-scoped GETs exist; fleet UI only shows the cores summary |

**Fix:**
- A platform-family editor: pick child codes → parent.
- One admin **Review** tab listing every queue above, each with its action.
- A fleet panel for alerts and claims.

### O-6 — Low-Medium — Usage side effects

The usage RPC is idempotent for the usage row and the core return, but not for the **stock decrement**.

- **Retry after a later failure** (WO-complete path): stock is decremented again.
- **Log-create rollback:** if the record insert fails, the work order is deleted. Stock stays decremented, and the core return is orphaned (`work_order_line_id ON DELETE SET NULL`).
- **Jobs that aren't completed:**
  - The log-create path inserts its work order as `completed` regardless of the log's status.
  - The edit path commits usage for in-progress logs.
  - So *Scheduled* jobs decrement stock and can open core returns.
- **Edits:** when a log already has a `workOrderId`, the edit path runs usage against the old lines and never writes the edited ones.

**Fix:**
- Run stock and core side effects only when the usage insert actually inserted a row.
- Clean up core returns and restore stock on rollback.
- Gate usage on the job being completed.
- Sync lines by id before calling the RPC on edit.

### O-7 — Medium — The SQL isn't tested

The tier, scope, repeat-alert, usage and import rules exist twice, in TS and SQL, and only the TS copies are tested. O-2 shipped for that reason.

**Fix:** add branch-based SQL tests for:
- `parts_for_vehicle`: fixture platform/engine/groups/rules → expected tiers, plus a vehicle-year case.
- `refresh_repeat_part_alerts`: consecutive pair, dismiss sticks.
- `apply_parts_usage_for_work_order`: idempotent retry.
- `import_parts_catalog_rows`.

### O-8 — Low — Performance and timing

- **Coverage is N+1:** `GET /admin/parts-coverage` makes up to 400 vehicles × 10 components sequential RPCs. That's instant only because the catalog is empty. Replace it with a set-based SQL function or a nightly snapshot. It should also use the 10 named op codes, not the first 10 components that have parts.
- **Repeat alerts lag a day on the main save path:** the WO-complete path runs the usage RPC before marking the work order `completed`, so the per-vehicle refresh misses the current job until the 06:15 UTC cron. Call the refresh after the status update.

### O-9 — Low — Turn-on gate isn't enforced

`tieredSearchReady()` (≥ 60% coverage) is defined but never called, so the flag can be turned on at 0% coverage. Show it next to the flag in admin, or remove it.

### O-10 — Low — Small items

- **Fit-feedback line link:** new dialog lines have no `id`, so fit feedback has no `workOrderLineId`. Return the saved line ids from create/complete.
- **Raw-UUID inputs:** admin "Add part" / "Add rule" take raw UUIDs for group and component. Use pickers.
- **Decoder engine prefix:** `enginePrefix` isn't matched to an `engine_family`.
- **Decode-confirm org check:** it allows a write to a vehicle that has no `organizationId`.
- **Supplier adapter:** it's a cache-only stub behind `parts_supplier_api` (off). Build a real one only after a Jamaican or JDM vendor feed is confirmed.

---

## Design rules to keep (for the open work)

- **Tiers:**
  - **1** OEM part on its exact variant, or on its platform or engine when the manufacturer = the vehicle's make.
  - **2** same platform, other nameplate.
  - **3** same engine, `fit_scope` powertrain/universal only.
  - **4** OE-supplier, aftermarket, reman or used part in the same interchange group.
  - **0** in your stock.
- **Scope guard:** an engine-family rule is allowed only for `powertrain`/`universal` groups. Enforced by a DB trigger; keep it there.
- **Sister fit message:** body/chassis parts say "check trim, year and photos". Show "Confirmed fit" only from install feedback on the same variant / platform / engine.
- **Money:** core deposits are a supplier receivable. Report them; don't post them into driver settlement or fleet finance engines.
- **Skip:** Neo4j, Redis, microservices. Postgres handles this size.

---

## Checks to re-run next review

- `git status`: Rev 2 migration and routes committed.
- Prod: part/rule/offer counts; platforms with `parent_id`; coverage %.
- fleet-ops / fleet-core deploy time vs. local bundle mtime.
- A read-only plpgsql probe for variable/column clashes in any new function.
- `deno test supabase/functions/_fleet-server/parts_resolution.test.ts` (11 passing) and the CSV vitest.
- fleet `tsc` = 501, with no errors in parts files.
