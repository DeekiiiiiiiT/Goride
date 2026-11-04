# Maintenance Master Data (Dominion → RoamFleet): Enterprise Audit

**Rev 5 · 2026-11-04** · Audit only. Nothing has been built. **Approved to build Phase 1** (third external review: "ship it").

- **Rev 5:** W1 checked in code and found real, so it is now finding **M-14**. W2 answered from the live unique indexes. W3 close gate fixed to checks 1–8. Minor notes N-a to N-e folded in. See §0.2.
- **Rev 4:** the 12 clarifications from the Rev 3 review. Each is listed in §0.1 with where it was written in.
- **Rev 3:** closes the external review of Rev 2 (B1–B7, S1–S10, N1–N8). Every open question is now answered from the live database or code, not assumed. The reviewer has no app access, so this file is self-contained: the facts it relies on are quoted in **Appendix A**, and table/term meanings are in **Appendix B**.
- **Rev 2:** moved scope to Maintenance templates. **Rev 1:** car record (kept as §7).

**Apps:**
- **Roam Dominion** (`apps/admin`): the master reference database. The owner sets service rules here.
- **RoamFleet** (`apps/fleet`): customer fleets. Turns those rules into each car's due list and alerts.
- **Server:** Supabase Edge Function `fleet-core` (source in `supabase/functions/_fleet-server/`) on Postgres.

**Out of scope:** RoamFleet work orders, inspections, inventory and kits (closed in their own audits). They only read what this audit governs.

**Goal (one sentence):** *every RoamFleet car gets a service schedule that comes from a named, evidenced rule in Dominion for that exact car, platform or engine, and when Dominion corrects a rule every affected car's due dates and alerts follow.*

**Test for every item:** *every schedule rule is a claim by someone, on some evidence, for some cars, with a status and a full history. The app uses the best current rule and the owner resolves the rest.*

---

## 0. Response to the Rev 2 review

| Review item | Outcome | Where |
|---|---|---|
| B1 parts without their own interval | **Accepted, count corrected:** packages contain **16** distinct parts, **8** have no own interval (not 29). All 16 become global `Roam policy` rules carrying today's effective interval | M-01, A.3 |
| B2 precedence as a decision rule | Accepted. Truth table written | §2.2 |
| B3 schedule state | Accepted. Full schema with existing vs new columns | §3.2 |
| B4 propagation on add / retire / reactivate | Accepted. One rule: any rule change recomputes every car whose winning rule changes | M-04 |
| B5 units | **Resolved by evidence:** stored values are already **km**. Rename only, no conversion | M-10, A.5 |
| B6 conflict scope | Accepted option (b): same-scope conflicts + an "Overrides" report | M-12, §2.3 |
| B7 alert lifecycle | Accepted. Today alerts are daily rows with no status | M-13, A.6 |
| S1 permission matrix | Accepted. There is no `catalog.read` today; reads are platform-staff | §4 |
| S2 year windows | Accepted | §2.2, §3.1 |
| S3 bootstrap with draft / retired / needs_checking / conflict | Accepted | §2.2 |
| S4 flag semantics | Accepted | §5 |
| S5 odometer source and rollback | Accepted. Source / anomaly / voided columns already exist and are reused | M-09 |
| S6 km vs months | Accepted. Whichever comes first | §2.2 |
| S7 access pattern | Accepted | §3.4 |
| S8 status vs confidence | Accepted. Two columns | §3.1 |
| S9 revision schema | `platform_revision` exists. Real schema quoted | §3.3, A.4 |
| S10 dependency graph, M-04 into Phase 1 | Accepted | §6 |
| N1–N8 | All accepted. N2: it's **31 foreign keys from 28 tables**, listed in A.7. N8: "Keep both" removed | inline |

### 0.1 Rev 3 review clarifications

| # | Question | Answer | Where |
|---|---|---|---|
| 1 | Which parts does bootstrap iterate? | Only parts that resolve to a rule (16 today). The other 33 get no row | §2.0 |
| 2 | Does recompute create missing rows? | Yes. It creates, updates and moves rows | §2.0, M-04 |
| 3 | Can a `needs_checking` rule beat an `active` one at another scope? | No. Per-car: weak rules are used only when no active rule resolves at any rank | §2.2 |
| 4 | Two active rules with different class sets | One trigger guards overlap on part + scope + target + years + **classes**. The exclusion constraint is dropped | §2.3, §3.1 |
| 5 | Alerts on `manual_override` rows | Yes, against the custom due | M-13 |
| 6 | Alert migration vs recompute order | Migration runs first, then recompute, then the nightly job | §5, M-13 |
| 7 | How a conflicting save avoids the constraint | A `BEFORE INSERT/UPDATE` trigger demotes it to `needs_checking` and opens the conflict | §2.3 |
| 8 | "car" vs "variant" | Screens and this audit say **car**; schema value stays `variant` | §2.2, Appendix B |
| 9 | V-14 "owner only" vs §4 | Fixed: owner + superadmin | §7 |
| 10 | The 5 tables with no FK to a car | Listed with all 19 FK tables | A.10 |
| 11 | Severe duty on a rule without a severe interval | Falls back to the normal interval, no warning | §2.2 step 3 |
| 12 | Empty `applicable_vehicle_classes` | Empty = all classes; null not allowed (backfilled to `{car}`, today's behaviour) | §2.2 step 1, §3.1 |

### 0.2 Rev 4 review items

| # | Answer | Where |
|---|---|---|
| W1 old code reading the 16 new part rules | **Verified: risk is real.** `schedule_for_variant` has no `component_id` filter. Schedule rows would be unaffected (old bootstrap reads parts only through package links, and part rules have none), but the 16 rules would leak as extra "services" into the catalog API and 13 other read sites | **M-14** |
| W2 `no_rule` → active without duplicates | Verified: unique indexes exist on (org, vehicle, part) where position is null and (org, vehicle, part, position) where not null. Recompute updates the row in place | §2.0, A.11 |
| W3 close gate | Now checks 1–8 | §8 |
| N-a a deliberately weak rule overlapping an active one | Still opens a conflict (they compete for the same cars) | §2.3 |
| N-b impact of a draft | Returns the "if made active" count, labelled so | §3.5 |
| N-c position of new rows | Same derivation as today | §2.0 |
| N-d interrupted switch-on | Every step is re-runnable | §5 |
| N-e A.10 check depends on column names | Limitation stated | A.10 |

---

## 1. How it works today

```
DOMINION (owner edits)                         ROAMFLEET (per customer car)
maintenance_service_categories                 car added → bootstrap
  49 part types, 8 with an own interval           │
maintenance_task_templates                        ├─ schedule_for_variant(car): picks templates by
  5 packages, all scope=global                    │    variant > platform/family > engine > global
maintenance_package_categories                    ├─ for each part listed in those packages:
  37 part↔package links (16 distinct parts)       │    interval = pickTightestInterval(all its packages)   ← M-01
                                                  ▼
                                               vehicle_component_schedule (one row per car+part+position;
                                                  next due computed ONCE, never revisited)   ← M-04
                                                  ▼
                                               cron 07:00 UTC → fleet.maintenance_alerts
                                                  (a new row per car+part+position per DAY, no status)   ← M-13
```

| Fact (live, 2026-11-04) | Value |
|---|---|
| Rules for one car / platform / engine | **0 / 0 / 0**. The scope ladder exists in code but is empty |
| Source or evidence on rules | **No column exists.** 0 of 49 part types have a reference note |
| History of rule / package / part-type edits | **None** |
| RoamFleet cars on schedules | 2 (`1505LM`, `5179KZ`), 40 schedule rows |
| Schedule rows with neither a due km nor a due date | **8** (brake fluid, coolant flush, fluids, tyre pressure, 4× tyre rotation on `5179KZ`) |
| Alerts | 34 rows: 9 parts on `5179KZ` written on several days (one row per day). There is no open/resolved state |
| Units | Columns are named `*_miles`. Dominion screens say km. **The stored values are km** (A.5) |

---

## 2. The rules model

### 2.1 What a rule is
- **A part rule** is a `maintenance_task_templates` row **with `component_id` set**. It holds one part's interval for a set of cars.
- **A package** is a row **without `component_id`**. It only lists which parts are done together at a visit (Basic, Intermediate…). It never sets any part's interval.
- A CHECK constraint and a trigger enforce the split (N6). Today 0 rows break it.

### 2.0 Which schedule rows a car has (clarifications 1, 2)
- **Bootstrap iterates parts, not packages.** For a RoamFleet car it walks every part type that has at least one non-`draft`, non-`retired` part rule. It creates a row only where `schedule_rule_for_part` returns a rule. Parts with no rule get **no row** (16 rules after migration → at most 16 rows per car, same as today; the other 33 part types get none).
- **`no_rule` exists only for a row that already exists** and whose rule has disappeared (retired with nothing below it). A part that never had a rule is never a `no_rule` row. The health card counts `no_rule` rows, and separately "part types with no rule at all".
- **Recompute creates as well as updates.** `recompute_component_schedules_for_car(car)` runs the resolver for every part with a rule. It **creates** rows for parts that now resolve and didn't before, **updates** rows whose winning rule or revision changed, and sets rows that no longer resolve to `no_rule`. `recompute_component_schedules_for_rule(rule)` does the same, but only for the cars `maintenance_rule_impact` says the change affects.
- **Rows are updated in place, never duplicated (W2).** A row that went `no_rule` and whose part resolves again is updated back to `active` with the new rule. The live unique indexes guarantee one row per car + part + position (A.11), so recompute upserts on them.
  - **Test:** retire the only rule for a part on a fixture car, then add a new rule. The row goes `active → no_rule → active` and the count stays 1.
- **Positions (N-c):** a new row's position follows today's bootstrap. A part type with `position_aware = true` gets one row per position (`LF`, `RF`, `LR`, `RR`); every other part type gets one row with position null.

### 2.2 Which rule a car gets (decision rule)

**Naming (clarification 8):** this audit and every screen say **car**. The schema value stays `template_scope = 'variant'` with `vehicle_catalog_id` (existing code and `schedule_for_variant` use it). Don't rename the column or the value.

Function `schedule_rule_for_part(fleet_vehicle_id, component_id)` returns exactly one rule or none. It runs in three steps.

**Step 1: Eligible rules.** A rule is eligible when all of these hold:
1. `status` is `active` or `needs_checking`. `draft` and `retired` are never eligible. Weak rules never beat strong ones, **per car** (clarification 3): step 2 runs first over `active` rules only, and over `needs_checking` rules only when no `active` rule resolves for this car + part at **any** rank.
2. The year window covers the car. It uses the car's model year from RoamFleet, or the catalog row's `production_start_year` when the car has none. `year_from`/`year_to` null means open-ended.
3. `applicable_vehicle_classes` includes the car's class. **An empty array means all classes** (clarification 12). The column is NOT NULL; today's nulls are backfilled to `{car}`, which is what the code treats null as now.
4. The part is **not** marked "not on this car" at car, platform or engine scope (M-07).

**Step 2: Most specific wins.** The first rank that has an eligible rule wins. Tightest-interval-wins is never used.

| Rank | Scope | Matches when |
|---|---|---|
| 1 | car | `vehicle_catalog_id` = the car's catalog row |
| 2 | platform | `platform_id` = the car's platform (in this app one platform = one chassis code, e.g. `M900A`) |
| 3 | platform family | `platform_id` = the parent of the car's platform (e.g. `M900` covering Roomy/Thor/Justy) |
| 4 | engine family | `engine_family_id` = the car's engine family |
| 5 | global | always |

Platform ranks above engine because a chassis code identifies one model built with a known engine set, while an engine family spans many models. Within one rank there can be at most one eligible `active` rule for a car: the overlap trigger (§2.3) never lets two `active` rules share part + scope + target with overlapping years **and** overlapping classes.

**Step 3: The interval actually used.**
1. If the schedule row has a customer custom interval, that is used (`schedule_status = manual_override`) and recompute skips the row.
2. Otherwise, if the car has `severe_duty` on and the winning rule has a severe interval, the severe interval is used.
3. Otherwise the rule's normal interval is used. This includes a severe-duty car whose winning rule has no severe interval (clarification 11): it silently falls back, with no warning and no check, whatever the rule's status.

**Truth table (each row is a done-test):**

| Eligible rules for this car + part | Winner |
|---|---|
| car only | car |
| car + platform + engine + global | car |
| platform + platform family | platform |
| platform family + engine | platform family |
| platform + engine | platform |
| engine + global | engine |
| global only | global |
| active global + needs_checking global (same target) | active one |
| active global + needs_checking engine | **active global** (weak never beats strong) |
| active platform + needs_checking car | **active platform** |
| needs_checking engine only | that rule; the due line shows "Needs checking" |
| needs_checking engine + needs_checking global | engine (most specific among weak) |
| active global for `{car}` + active global for `{motorcycle}`, car class = car | the `{car}` rule |
| severe-duty car, winning rule has no severe interval | normal interval |
| platform rule with years 2016–2020, car year 2014, + global | global |
| draft or retired only | none → bootstrap creates no row; an existing row becomes `no_rule` |

**When it's due:** `next_due_km = reference_odometer + interval_km` and `next_due_date = reference_date + interval_months`. The reference is the last time it was performed, otherwise the baseline. The part is due at **whichever comes first** (S6). Alerts fire on either.

### 2.3 Conflicts and overrides (B6, N7, N8)
- **Conflict:** someone saves an `active` rule for the same part + scope + target, with overlapping years **and overlapping classes** (array `&&`), while another active one exists. Nothing is rejected (capture, never gate).
- **Mechanism (clarifications 4, 7):** a `BEFORE INSERT OR UPDATE` trigger on `maintenance_task_templates` handles it, so imports and direct writes are covered too. The trigger:
  1. takes `pg_advisory_xact_lock` on (part, scope, target) so two saves can't race;
  2. looks for an overlapping active rule;
  3. if it finds one, sets the new row's `status = 'needs_checking'` and inserts the `maintenance_rule_conflict` row.

  A rule saved directly as `needs_checking` that overlaps an active one also opens a conflict (N-a), because both compete for the same cars until one is picked. Rules on the same target with **disjoint** class sets are legitimate and don't conflict. There is no exclusion constraint, because Postgres can't express array overlap in one; SQL check 8 (§3.6) is the backstop. Resolution is **Pick A** or **Pick B**, and the loser becomes `retired`. There is no "Keep both", because a schedule needs exactly one interval.
- **Override (information, not a conflict):** a more specific rule wins over a less specific one with a different interval. Example: the platform rule says 30,000 and the global rule says 40,000. The car preview and the health card list these as "Overrides" so the owner can check them. Nightly computed, nothing blocked.

---

## 3. Data

### 3.1 `maintenance_task_templates`: full column list after migration (N5)

| Column | Existing / new | Notes |
|---|---|---|
| `id`, `task_name`, `description`, `task_code`, `icon_key`, `priority`, `sort_order`, `frequency_kind`, `frequency_label`, `due_kind`, `is_mandatory`, `created_at`, `updated_at` | existing | unchanged |
| `applicable_vehicle_classes` | existing, now NOT NULL | empty = all classes; nulls backfilled to `{car}` |
| `template_scope` (`global` / `variant` / `platform` / `engine_family`), `vehicle_catalog_id`, `platform_id`, `engine_family_id` | existing | CHECK: the target column matching the scope is set, the others null |
| `component_id` | existing | null = package, set = part rule (CHECK + trigger) |
| `interval_km`, `interval_km_max`, `interval_months` | **renamed** from `interval_miles*` | values unchanged (already km) |
| `severe_interval_km`, `severe_interval_km_max`, `severe_interval_months` | new | M-08 |
| `year_from`, `year_to` | new | S2, null = open |
| `status` (`draft` / `active` / `needs_checking` / `retired`) | new | replaces `archived_at` (archived rows → `retired`; `archived_at` kept as the retire time) |
| `confidence` (`confirmed` / `likely` / `uncertain`) | new | S8. Status = "is it in use"; confidence = "how strong is the source" |
| `source_type` (`maker_manual` / `part_maker` / `roam_policy`), `evidence_url` | new | evidence required unless `roam_policy` |
| `verified_by`, `verified_at`, `created_by`, `updated_by` | new | |
| `revision_no` | new | +1 by trigger on any change to interval, severe, years, scope, target or status |

**Overlap guard:** the §2.3 trigger, not an exclusion constraint. Classes must be part of the overlap test, and a gist exclusion constraint can't compare `text[]` overlap.

**Data migration (one transaction):** create 16 `global` part rules, `source_type = roam_policy`, `status = active`, `confidence = uncertain`, from A.3:
- the 8 parts that have an own interval use it;
- the 8 that don't use the interval they effectively get today, i.e. their tightest package.

Then drop `maintenance_service_categories.default_interval_*`.

### 3.2 `vehicle_component_schedule`: full column list (B3)

| Column | Existing / new | Meaning |
|---|---|---|
| `id`, `organization_id`, `vehicle_id`, `category_id`, `position`, `created_at`, `updated_at` | existing | one row per car + part + position |
| `baseline_odometer`, `baseline_date` | existing | reading/date the schedule started from |
| `baseline_source` | existing, values fixed | `bootstrap` / `first_reading` / `manual` / `work_order` |
| `last_performed_km` (renamed from `_miles`), `last_performed_date` | existing | written by the service ledger when the job is logged |
| `last_performed_source` | new | `work_order` / `service_log` / `manual` |
| `next_due_km`, `next_due_km_max` (renamed), `next_due_date` | existing | |
| `rule_id` | new, replaces `source_template_id` | the winning part rule |
| `rule_revision_no` | new | the rule's `revision_no` when due was computed |
| `interval_km_used`, `interval_months_used`, `interval_basis` (`rule` / `severe` / `custom`) | new | what was actually applied |
| `custom_interval_km`, `custom_interval_months`, `custom_reason`, `custom_set_by`, `custom_set_at` | new | customer override, set in RoamFleet (`vehicles.edit`, reason required). Must be ≤ Roam's interval on both km and months (§9.3 F3). If Roam later sets a schedule shorter than the custom one, recompute clears the custom interval, returns the row to Roam's schedule and shows "Updated by Roam" |
| `schedule_status` | existing, values extended | `active` / `fulfilled` (one-off task done) / `odometer_needed` / `no_rule` / `manual_override` / `retired` (part type retired) |
| `computed_at` | new | |

FK `category_id → maintenance_service_categories` changes from CASCADE to RESTRICT (M-02).

### 3.3 History: `platform_revision` (S9)
It already exists and logs platforms and parts groups. Its live schema is: `id uuid, entity_table text, entity_id uuid, old_row jsonb, new_row jsonb, actor uuid, created_at timestamptz, created_by uuid, import_batch_id uuid`. RLS is on and `anon`/`authenticated` have no grants. It is written by trigger function `trg_platform_revision`.
- **Change:** attach the same trigger (INSERT/UPDATE/DELETE) to `maintenance_task_templates`, `maintenance_package_categories`, `maintenance_service_categories`, `vehicle_catalog`, `engine_family` and `catalog_spec_value`.
- **Actor:** taken from `updated_by`/`created_by`, because the edge function writes with the service role.
- **Reading and retention:** read through `GET …/history` routes, never directly. Kept indefinitely; the table is append-only and small.

### 3.4 New tables and access (S7)

| Table | Columns |
|---|---|
| `maintenance_rule_conflict` | `id, component_id, rule_id_a, rule_id_b, status (open / resolved / superseded), picked_rule_id, resolution_note, resolved_by, resolved_at, detail jsonb, created_at` |
| `fleet.maintenance_alerts` (changed, M-13) | adds `component_schedule_id, due_km, due_date, status (open / resolved / superseded), resolved_at, resolved_by, resolution_reason (performed / rule_changed / schedule_retired / migrated_daily_row / manual)`; `alert_key` drops the date |
| `vehicle_merge_log`, `vehicle_alias`, `vehicle_market` | §7 |

**Access pattern for every new or changed table** (same as the parts work):
- RLS on, with a policy of `false`.
- `REVOKE ALL FROM anon, authenticated`.
- Reached only through the edge API or `SECURITY DEFINER` functions with `SET search_path = ''`.
- Test: as `authenticated`, `select * from maintenance_rule_conflict` fails, while the route succeeds.

### 3.5 Functions
- `schedule_rule_for_part(fleet_vehicle_id, component_id)` (§2.2)
- `recompute_component_schedules_for_rule(rule_id)` and `recompute_component_schedules_for_car(fleet_vehicle_id)` (M-04)
- `maintenance_rule_impact(draft_rule jsonb)`: returns how many schedule rows would change, and how. It's used before saving. For a `draft` or `needs_checking` rule it returns the **"if made active"** count, which the screen labels "If you make this active: N cars change" (N-b)
- `maintenance_part_type_dependents(id)`: builds its list from `pg_constraint` at run time, so a new referencing table is never missed (N2)
- `vehicle_master_health()` (M-11)

### 3.6 SQL checks (run in CI, fail on non-zero)
1. Schedule rows with no due km and no due date whose status is `active`.
2. Rows whose `interval_*_used` ≠ what `schedule_rule_for_part` returns now (excluding `manual_override`).
3. Rows whose `rule_revision_no` < the rule's `revision_no`.
4. Active part rules with `source_type` ≠ `roam_policy` and no `evidence_url`.
5. Packages that have a `component_id`, or part rules that have package links.
6. More than one `open` alert per car + part + position.
7. Any `anon` / `authenticated` grant on the tables in §3.1–3.4.
8. Two `active` part rules with the same part + scope + target, overlapping years and overlapping classes.

---

## 4. Permissions (S1)

Today Dominion has no `catalog.read` action. Reads are allowed for any platform staff role (owner, support, analyst). Writes check `catalog.write`, which owner, superadmin and support hold.

| Action | Needs | Who |
|---|---|---|
| View rules, packages, part types, previews, history, health | platform staff (unchanged) | owner, support, analyst |
| Create or edit a `draft` rule; add package parts; resolve a conflict | `catalog.write` | owner, superadmin, support |
| Make a rule `active`, edit an active rule, retire / reactivate a rule, retire a part type (anything that recomputes live RoamFleet cars) | new `catalog.govern` | owner, superadmin. Support's attempt is stored as a proposal for the owner |
| Delete a part type with 0 dependents; delete a draft rule | `catalog.govern` | owner, superadmin |
| Set a custom interval on one car | RoamFleet `vehicles.edit` | fleet's own staff |
| Purge catalog / force delete | removed | nobody |

**Route sweep (N4):** `maintenance_routes.ts` has 15 and `catalog_routes.ts` has 53 routes guarded only by `assertPlatformStaffResponse`. Every `POST/PUT/PATCH/DELETE` among them moves to `catalog.write` or `catalog.govern` per this table; `GET` stays staff. A route-list test fails if any write route under `/admin/maintenance*`, `/admin/vehicle-catalog*` or `/admin/catalog*` has only the staff guard.

---

## 5. Feature flag (S4)

The flag is a row `maintenance_master_governance` in `platform_feature_flags (name, enabled)`.

**Not behind the flag (safety fixes, ship as soon as proven):**
- M-02, M-03, V-01 to V-06.
- The M-10 rename. It ships in the same release as every reader's code change.

**Behind the flag:**
- the new bootstrap path (§2.2)
- recompute on rule save
- the new alert lifecycle
- the new Dominion screens

**While the flag is off:**
- bootstrap and the nightly job run the old code;
- the 16 migrated part rules exist but nothing reads them;
- rule edits still write history.

**Switching it on runs, once, in this order (clarification 6):**
1. the alert migration (M-13), which turns daily rows into one `open` row per car + part + position;
2. `recompute_component_schedules_for_car` for every RoamFleet car, which supersedes the open rows whose due changed;
3. the nightly job, run immediately, which opens fresh rows for anything still due.

The expected result is that most migrated rows end `superseded` and step 3 rebuilds the correct set. The builder must not try to keep migrated rows open across step 2.

**Re-runnable (N-d):** if the sequence stops partway, run it again from step 1. Each step is idempotent:
- step 1 only touches rows that have no `status` yet;
- step 2 gives the same rows when run twice;
- step 3 updates the open row instead of inserting.

**M-14 is not behind the flag.** The `component_id IS NULL` filter ships in the same release as, and before, the migration that inserts the 16 part rules.

---

## 6. Findings: maintenance (one fix each)

Severity: **Critical** = wrong due dates or data loss now. **High** = wrong or untraceable. **Medium** = needed for enterprise.

### M-01 · Critical · A part's interval comes from the shortest package it's in
`bootstrapVehicleComponentSchedules` (`maintenance_service_ledger_core.ts:336`) applies `pickTightestInterval` across every package that lists the part (code in A.2). Packages are visit groupings, so long-life parts inherit short package intervals:
- Basic Service (5,000 km / 3 mo) lists brake fluid (own interval 40,000 / 24) and coolant flush (100,000 / 60).
- Inspection (5,000 / 3) lists tyre change (40,000 / 36).

**Proven live:** `5179KZ` brake fluid and coolant flush have **no due at all** (they will never alert). `1505LM` tyre change is due at **10,000** instead of 40,000.
**Fix:** bootstrap creates one schedule row per part that `schedule_rule_for_part` resolves for the car, using that rule's interval only (§2.2). Packages are read only to show "due at this visit". The 16 global `Roam policy` rules come from the §3.1 migration.

### M-02 · Critical · Deleting a part type wipes every customer car's schedule for it
`DELETE /admin/maintenance-categories/:id` (`maintenance_routes.ts:1076`) hard-deletes. Six tables cascade, including `vehicle_component_schedule` (A.7).
**Fix:** replace with **Retire** (part type hidden from new rules, existing schedule rows set to `retired`, alerts superseded). Hard delete only when `maintenance_part_type_dependents(id)` = 0. FK from `vehicle_component_schedule` → RESTRICT.

### M-03 · High · A look-only analyst can change rules and delete part types
All maintenance writes use `assertPlatformStaffResponse` (owner, support **and analyst**). Dominion's permission file says the analyst "can look and cannot save".
**Fix:** the §4 table and route sweep.

### M-04 · High · Rule changes never reach cars already set up
`PATCH /admin/maintenance-templates/:id` saves the new interval only. The due on existing rows was computed once.
**Fix (one principle, B4):** every rule change recomputes every RoamFleet car whose **winning rule** for that part changes. That covers:
- **adding** a rule (a new car rule takes over from a platform rule; the impact function finds those cars);
- **editing** a rule;
- **retiring** one (cars fall to the next rank, or `no_rule`);
- **reactivating** one (`retired` → `active` is allowed and recomputes the same way).

It runs in the same transaction as the save. Recompute:
- rewrites `rule_id`, `rule_revision_no`, `interval_*_used` and the due from the reference point;
- skips `manual_override` rows;
- supersedes the row's open alert (M-13).

The save screen shows the `maintenance_rule_impact` count first. Bootstrap after a retire never sees the retired rule (§2.2 step 1).

### M-05 · High · No rule says where its interval came from
**Fix:** `source_type`, `evidence_url`, `confidence`, `verified_*` (§3.1). The 16 migrated rules are `roam_policy` / `uncertain`. RoamFleet shows the source chip on each due line: "Toyota manual", "Part maker" or "Roam policy".

### M-06 · High · No history of rule, package or part-type edits
**Fix:** §3.3.

### M-07 · Medium · "Not on this car" is never applied
Neither `schedule_for_variant` nor the package expansion reads `catalog_component_applicability` (0 rows today). A diesel would get spark plugs.
**Fix:** §2.2 step 1, rule 4. Package screens grey that part out for that car with the reason.

### M-08 · Medium · No severe-duty interval
Rideshare and delivery in Jamaican heat and traffic is "severe service" in maker manuals.
**Fix:** severe interval columns (§3.1), plus a `severe_duty` flag on the RoamFleet car, on by default for the rideshare and delivery service lines (§2.2 step 3).

### M-09 · Medium · Bootstrapping at odometer 0 makes up a due km
`1505LM` started at `baseline_odometer = 0`.
**Fix:**
- **Missing reading:** when the car has no valid reading, bootstrap writes date-only dues with `schedule_status = odometer_needed`.
- **Readings already have source and quality flags.** `fleet.odometer_readings` has `source`, `is_verified`, `is_voided` and `is_anomaly` (+ `anomaly_reason`) (A.8).
- **First reading:** the first reading that is not voided and not an anomaly sets `baseline_source = first_reading` and recomputes that car's `odometer_needed` rows.
- **Rollback (S5):** a reading lower than the car's highest valid reading is saved with `is_anomaly = true`, `anomaly_reason = 'lower_than_previous'` (capture, never gate). It is never used as a baseline or a performed-at reading.

### M-10 · Medium · Columns say miles, everything else means km
A.5 shows the stored values are km, so this is a rename only, with no value conversion.
**Fix:**
- Rename `interval_miles*` → `interval_km*`, `next_due_miles*` → `next_due_km*` and `last_performed_miles` → `last_performed_km`.
- Update every reader in the same release: Dominion forms, `schedule_for_variant`, bootstrap, ledger, nightly job and `packages/finance-core/src/maintenanceScheduleEngine.ts`, whose header calls the fields "unit-agnostic (km or mi)".
- **Done-test:** Basic Service's oil rule reads 5,000 km in Dominion, RoamFleet and the database.

### M-11 · Medium · No health view for maintenance data (N1)
**Fix:** `vehicle_master_health()` returns these, each linking to a filtered list. An **in-use car** is a `vehicle_catalog` row referenced by at least one `fleet.vehicles` row.
- in-use cars with no car/platform/family/engine part rule for any part
- active rules by `source_type` and by `confidence`
- schedule rows by `schedule_status` (`no_rule` and `odometer_needed` shown, not failed)
- rows behind their rule revision (check 3)
- open conflicts and their age
- Overrides (§2.3)
- part types retired but still on schedule rows
- open alerts per car

### M-12 · Medium · Two rules for the same cars have no resolution path
**Fix:** §2.3 conflict table and Pick A / Pick B on the Review list.

### M-13 · High · Alerts are daily rows with no state, so corrected dues leave stale alerts
The nightly job inserts a new row per car + part + position **per day** (`alert_key` ends in the date). Nothing closes a row. RoamFleet's alert list reads the latest 100 rows by time (`maintenance/routes_alerts_kpi.ts:25`), so old days show alongside new ones. A recompute today would not remove any of the 34 existing rows.
**Fix:**
- **One row per due cycle:** one alert row per car + part + position + due cycle, with `status` (§3.4).
- **Nightly job:** opens a row when a part becomes due soon or overdue, and updates `severity` and `due_*` on the open row instead of inserting a new one.
- **Recompute** supersedes the open row (`rule_changed`); the next nightly run opens a fresh one if still due.
- **Logging the service** resolves it (`performed`). A schedule going `retired`, `no_rule` or `odometer_needed` supersedes it.
- **`manual_override` rows (clarification 5)** get alerts like any other row, against their custom due. Recompute skips them, so their alert is only superseded when the customer changes the custom interval or logs the service.
- **Migration of today's 34 rows (N3):** for each car + part + position, the newest row stays `open` and the rest become `superseded` / `migrated_daily_row`. This runs **before** the first recompute (§5).
- **Done-test:** after the flag is switched on, `5179KZ` has at most one open alert per part + position, none of which refers to a due that no longer exists.

### M-14 · High · Old code would treat the 16 new part rules as service packages (W1)
`schedule_for_variant` (A.2) selects every non-archived template whose scope matches. It doesn't filter `component_id IS NULL`, and it de-duplicates by task code or task name. Once the §3.1 migration inserts 16 `global` part rules, old code that reads templates sees **21 "services" instead of 5**.

Bootstrap's schedule rows are **not** affected. `bootstrapVehicleComponentSchedules` reads parts only through `maintenance_package_categories` links, and part rules have none, so `pickTightestInterval` never sees them. But these 14 read sites would show or return the part rules as packages:

| Read site | Location |
|---|---|
| Catalog API that other Roam apps read | `catalog_api.ts:488` |
| Bootstrap (both paths) | `maintenance_bootstrap_core.ts:86/95/102/113` |
| Service-logging context | `maintenance_log_service_context.ts:74` |
| Dominion lists and the per-car template list | `maintenance_routes.ts:542/570/806` |
| Work-order template lookups | `maintenance_routes.ts:1334/2352` |
| Ledger lookups | `maintenance_service_ledger_core.ts:67/571` |
| Catalog enterprise panel | `vehicle_catalog_enterprise.ts:81/109` |

**Fix:** in Phase 1, unflagged, before the migration:
- add `AND t.component_id IS NULL` to `schedule_for_variant`;
- add `.is("component_id", null)` to every package read above.

Part rules are read only through the new `/admin/maintenance/rules` routes and `schedule_rule_for_part`.

**Test (flag off):** run bootstrap and the catalog API for a fixture car with and without the 16 rules present. The schedule rows and the API response must be identical. The Dominion package list must show 5 entries.

---

## 7. Foundation: the car record (Rev 1, unchanged)

Rules attach to `vehicle_catalog` (car), `vehicle_platform` (chassis code, with an optional `parent_id` family) and `engine_family`.

| Fact | Live |
|---|---|
| Cars | 937, ~90 columns, market empty on all, **no status**, **no edit history** |
| Platforms | 732, effectively one per chassis code; only 6 have a parent; Roomy `M900A` / Thor `M900S` / Justy `M900F` are unlinked |
| Deleting a car | cascades into 10 tables; 5 other tables point at cars with no foreign key (RoamFleet cars among them) |

| ID | Sev | Finding → fix |
|---|---|---|
| **V-01** | Critical | `POST /admin/vehicle-catalog/purge` deletes the whole catalog (support can use it), cascading fits, OE numbers, specs and maintenance rules. → Remove the route, client call and button |
| **V-02** | Critical | Car DELETE checks only 2 of 24 dependents, cascades the rest and orphans RoamFleet cars. → **Retire** instead; delete only a `draft` with 0 dependents (`catalog_car_dependents(id)`, built from `pg_constraint` at run time plus the 5 unlinked tables in A.10) |
| **V-03** | Critical | No history of car edits. → §3.3 trigger |
| **V-04** | High | Undo-import deletes rows the owner later corrected. → Skip edited rows (`kept_edited`), retire rows with dependents, remove `force` |
| **V-05** | High | Saves silently drop fields via legacy "strip columns" retries. → Remove the fallbacks; return the error |
| **V-06** | High | `anon`/`authenticated` hold TRUNCATE on car tables (RLS doesn't cover TRUNCATE). → Revoke all; CI grant check |
| **V-07** | High | 25 suspected duplicate groups, no merge. → `merge_vehicle_catalog` / `unmerge` in one transaction with a log, moving every dependent incl. maintenance rules and RoamFleet links |
| **V-08** | High | No car status. → `draft / active / needs_checking / retired`; the existing 937 → `active`; imports → `draft` |
| **V-09** | Medium | Market empty. → `vehicle_market` lookup + `market_code` (default `unknown`) |
| **V-10** | Medium | Badge twins unlinked. → Set `vehicle_platform.parent_id` with maker evidence; rank-3 rules then cover the family |
| **V-11** | Medium | Car identity index spans 26 columns incl. tyre size. → Keep it; add `vehicle_catalog_suspected_duplicates()` |
| **V-12** | Medium | Demio ↔ Mazda 2 not searchable. → `vehicle_alias` |
| **V-13** | Medium | Spec values have no source / status / current rule. → Add `source_type`, `status`, `catalog_spec_current()`; keep the ~90 columns |
| **V-14** | Medium | Support can do owner-level actions. → New action `catalog.govern`, held by **owner and superadmin** (§4); support's attempts become proposals |
| **V-15** | Medium | No catalog health number. → `vehicle_master_health()` (incl. M-11) |
| **V-16** | Low | Legacy `year` and free-text `market`. → Backfill and drop |

---

## 8. Build order, dependencies and done-tests

### Dependencies (S10)
```
M-14 filter ─► §3.1 data migration (16 part rules)
M-10 rename ─┐
§3.1 schema ─┼─► M-01 resolver ─► M-04 recompute ─► M-13 alerts ─► flag on
§3.2 schema ─┘        ▲                 ▲
V-03/M-06 history ────┴── revision_no ──┘
V-14 catalog.govern ─► M-03 route sweep, M-04 "make active"
V-08 car status, V-10 families ─► rank 1–3 rules are meaningful (Phase 3 data)
M-11 health ─► needs M-12, M-13, V-13
```

Each phase is proven on the local Docker copy of the database through the real API path, with made-up fixture cars that can't match real records.

**Phase 0: done.** The units question is resolved as km (A.5). Nothing to run.

**Phase 1: correct schedules and stop data loss.** M-14 (first), M-01, M-02, M-03, M-04, M-10, M-13, §3.1–3.3 schema, V-01 to V-06, V-14.
1. Every truth-table row in §2.2 passes as a fixture test.
2. A fixture car whose Basic Service lists brake fluid gets brake fluid at 40,000 km / 24 mo.
3. A fixture part with no own interval (e.g. belt) gets a `Roam policy` rule at its old effective interval (40,000 / 24), not an empty row.
4. A fixture car driving 1,000 km/month gets oil due by date at 3 months, not at 5,000 km.
5. Adding a fixture car rule over a platform rule moves that car's row; editing the platform rule afterwards doesn't touch it.
6. Retiring a rule moves existing rows to the next rank. A car added afterwards never gets the retired rule.
7. A row with a custom interval doesn't move on recompute.
8. After the flag is on:
   - `5179KZ` brake fluid and coolant flush have a due km and date;
   - `1505LM` tyre change shows 40,000;
   - check 1 = 0, check 2 = 0, check 3 = 0, check 6 = 0.
9. Retiring a fixture part type leaves its schedule rows (`retired`). DELETE on a used part type returns 409.
10. The analyst gets 403 on every maintenance and catalog write route. The route-list test passes.
11. Purge returns 404. Deleting a car with one OE number returns 409. A car edit creates one revision row.
12. As `authenticated`, selecting from any new table fails.

**Phase 2: sources, odometer, governance.** M-05, M-06 UI, M-09, M-12, V-08.
- Every rule shows a source chip in Dominion and RoamFleet.
- A car bootstrapped with no reading is `odometer_needed`. Its first valid reading sets the baseline. A lower reading is saved as an anomaly and changes nothing.
- A second active rule for the same target opens one conflict. Pick B retires A and recomputes.
- Support's "make active" becomes a proposal; the owner's approval applies it once.

**Phase 3: precision per car.** M-07, M-08, V-07, V-09, V-10, V-12.
- A fixture diesel marked "no spark plugs" never gets a spark-plug row.
- With severe duty on, oil uses the rule's severe interval.
- An `M900` family rule reaches the Roomy, Thor and Justy fixtures.

**Phase 4: health.** M-11, V-13, V-15.
- Every number on the health card equals a hand-run SQL query on the same data.

**Numeric close gate (prod):**
- SQL checks 1–8 all 0.
- 0 rule / part-type / car writes without a revision row.
- 0 analyst write routes.
- Purge returns 404.
- 16 global part rules exist.
- 8 → 0 schedule rows without a due.
- 34 daily alert rows → at most one open per car + part + position.

### Screens (Dominion → Vehicles → Maintenance templates; the owner designs them in Stitch)

| ID | Screen | Buttons and what each must do |
|---|---|---|
| MT-S1 | Maintenance home | Tabs **Part schedules** (per part: global rule, number of specific rules, source mix) and **Service packages** · **Add rule** |
| MT-S2 | Rule editor | part · scope + target (with car search) · years · interval km / km max / months · severe interval · source type · evidence URL · confidence · **Save draft** · **Make active** (opens MT-S4) · **Retire** / **Reactivate** (opens MT-S4) |
| MT-S3 | "What will this car get?" | pick a catalog car (and optionally severe duty) → each part's winning rule, rank, interval, source, any override and any "not on this car" |
| MT-S4 | Impact before save | "Changes the due date on N RoamFleet cars" (anonymised count) · **Save and update cars** · **Cancel** |
| MT-S5 | Package editor | add / remove parts, mark required; shows each part's interval read-only |
| MT-S6 | Part types | **Retire** (shows dependents) in place of Delete · history |
| MT-S7 | History tab | who, when, old → new, recompute count |
| MT-S8 | Review list | conflicts (**Pick A** / **Pick B**) · support proposals (**Approve** / **Reject** with reason) |
| MT-S9 | Health card (on Data quality) | M-11 numbers, each linking to its list |

**Stitch prompts (written 2026-11-04):**
- Dominion: `docs/stitch/dominion-maintenance-templates-prompt.txt`. Screen 1 = MT-S1 Part schedules home · 2 = MT-S1 Service packages tab · 3 = MT-S2/MT-S3 one part's ladder · 4 = MT-S2 editor drawer · 5 = MT-S4 impact · 6 = MT-S5 · 7 = MT-S6 · 8 = MT-S8 · 9 = MT-S3 preview a car · 10 = MT-S7 · 11 = MT-S9 · 12 states · 13 phone.
- RoamFleet: `docs/stitch/fleet-maintenance-schedule-source-prompt.txt`. Screen 1 = updated due-items drawer · 2 = "Why this schedule?" · 3 = custom schedule · 4 = `odometer_needed` · 5 = one-alert-per-part bell (M-13) · 6 = Overview rows · 7 = hard use (M-08) · 8 states · 9 phone.

RoamFleet gets no new pages, only changes to existing ones:
- the due line shows the source chip, "Needs checking" and "updated by Roam on <date>";
- the car's schedule shows `odometer_needed`;
- a **Custom interval** action per line needs `vehicles.edit` and a reason.

Dominion shows only anonymised counts of RoamFleet cars, never plates or fleet names.

### Data work after the build (the owner)
| Item | Now | Target |
|---|---|---|
| Maker-sourced part rules | 0 | every part for the in-use cars (Roomy M900A/M910A, Fit GP5), then by platform family |
| "Not on this car" marks | 0 | spark plugs on diesels, timing belt on chain engines |
| Badge-twin families | 6 | M900/M910 and every in-use car's twins |
| `Roam policy` rules with `uncertain` confidence | 16 | replaced or confirmed one by one |

Sources: the car maker's manual or catalogue, or the part maker's own catalogue only.

---

## 9. Stitch review, round 1 (2026-11-04)

**Exports checked:**
- Dominion: `Downloads/maintenanace dominion/stitch_roam_dominion_3`, 13 of 13 screens.
- RoamFleet: `Downloads/Maintenance fleet/stitch_roam_fleet_3`, 9 of 9 screens.

Every `screen.png` was viewed. Two Dominion images are cut off; their `code.html` was read for the hidden parts.

**Verdict:**
- The core design is right on both sides and matches §2–§6: the ladder, the package cards showing each part's own schedule, the impact dialog, the conflict cards, preview a car, the due drawer chips, the custom schedule dialog and the one-alert-per-part bell.
- **4 screens must be remade**, because their images don't show the screen (R1–R4).
- Everything else is built from the design. The builder applies the fixes in 9.2 and 9.3.

### 9.1 Screens to remake in Stitch (the image doesn't show the screen)
| # | Screen | Problem | Tell Stitch |
|---|---|---|---|
| R1 | Dominion 6, Edit service package drawer | Image shows only the title and footer. The parts list exists only in code | "Redraw Screen 6 at full height: Basic Service, 6 parts listed with checkbox, own schedule in mono, 'Required at this visit' switch, add-part search at top" |
| R2 | Dominion 7, Part types tab | The table is blurred behind the Retire dialog; the tab itself was never drawn | "Draw Screen 7 without any dialog: the part types table (icon, name, trade term, area, has a schedule, on Roam Fleet cars, status, overflow Edit / Retire). Then a second frame with the Retire dialog" |
| R3 | RoamFleet 4, Car waiting for odometer | The drawer is covered by the toast and empty; the background has invented KPI cards | "Redraw Screen 4: drawer for 1505LM · Honda Fit GP5 with the slate banner, 'Log odometer' button and 4 date-only due lines with 'Waiting for odometer'. Toast as a separate small frame" |
| R4 | RoamFleet 7, Mark as hard use | The dialog top (title, plate) is cut off | "Redraw Screen 7 so the whole dialog fits, title 'Hard use · 5179KZ' visible" |

### 9.2 Fixes across all screens (the builder applies these; no remake needed)
1. **Shell:** use each app's existing shell, not the one drawn.
   - **Dominion sidebar:** the item is **"Vehicles"**. "Vehicles active" in the prompt meant its highlighted state. Maintenance templates is reached from the Vehicles modules list, not as a new sidebar item. "Remittance" stays under Back office.
   - **RoamFleet:** the white nav row, then the navy sub-bar, then the Fleet Maintenance tabs (Overview · Service history · Find parts), as in the live app.
2. **Never built (invented chrome or false claims):**
   - **Status and system chrome:** "NODE: OK · PROD-US-EAST", "ENGINE: … V4.2", "REV 4.8.21", sync countdowns, "Ledger anchor KGN-01-SYDNEY", "cryptographically signed", "DB replica", ids such as `SCH-ENG-091A` / `TAX-ID PT-00192` / `PKG-001`, and footer version strings.
   - **Telematics:** "OBD-II / CAN-bus", "Telemetry", "Gateway", "Telematics auto-sync", "Fleet health index 98.4%", hubs and VINs. RoamFleet has no telematics, and people are the only source of odometer readings, so building these would show invented data.
3. **No percentages:** remove "100% Match", "Catalogue match 100%", "Maker sync confidence 62%" and "Match confidence 98.4%". Confidence is the word chip only.
4. **Real data, not sample text:**
   - **Package contents:** from `maintenance_package_categories`. The drawn contents are wrong; the real ones are in A.3.
   - **Part codes:** the category `code`, e.g. `brake_fluid`, not `TYPE-BRK-04`.
   - **Roam Fleet car models:** from the linked catalogue cars (today Toyota Roomy and Honda Fit), with counts only in Dominion.
   - **"Catalogue parts" count** in the Retire dialog: real (0 today, not 40).
5. **Nightly time:** say "tonight (2:00 AM Jamaica time)". The cron is 07:00 UTC; the drawn "02:00 UTC" is wrong.

### 9.3 Fixes per screen
| Screen | Keep as drawn | Change |
|---|---|---|
| D1 Part schedules home | Summary cards, filters, grouped table | **Tabs:** use the set from Screens 8/10 (Part schedules · Service packages · Part types · Review list · History); "Exception Matrix" is dropped. **Card 3:** "2 Roam Fleet cars", not "2 models". **The 3 bottom cards:** keep as static help text with true copy; "Source Verification Engine" becomes "Where numbers come from" (no engine exists) |
| D2 Service packages | Package cards, parts with their own schedule, runtime note | **Tabs:** same set as D1. **"Cadence rules" button** dropped (part schedules are the cadence rules; it links to D1). **"Check only" tag: build it, derived:** shown on a part whose own interval is longer than the package's visit rhythm (e.g. brake fluid in Basic). It needs no new data |
| D3 One part's ladder | Ladder, used-by card, Example frame | "One car · Specific VIN" becomes "One car version" (no VIN rules). The description and the "Inspection vs Replacement" card come from the part type's `description` / `fleet_tip` / `overdue_effect`, hidden when empty. The DOT 4 spec block is removed (spec values belong to a car, not a part type) |
| D4 Schedule drawer | Sections 1–4, severe toggle, source radios (from code) | Platform scope lists **only** cars on that chassis code (M900A → Roomy, Tank), never the family. The family list appears only under "Platform family". "ISO/JIS matched" and "100% Match" removed |
| D5 Impact dialog | All | "02:00 UTC maintenance sync" becomes "tonight". Due dates update at once; only the reminders wait for tonight |
| D8 Review list | Conflict card, Keep A / Keep B, approval card | **"Blocking overnight engine" becomes "Not blocking: the active schedule keeps working"** (capture, never gate). **"Retire both and fall back to Everyone":** build it (retire both, then recompute). The sample person, bulletin and URL are illustration only |
| D9 Preview a car | Search, hard-use toggle, table, excluded parts | Remove the invented second lines under intervals ("inspect/replace at 20k", "initial 160k then every 100k"), since one rule has one interval. **"Export breakdown": build it** (CSV of this table) |
| D10 History | Timeline, filters, before/after | **"Export CSV": build it.** "Load older" works as pagination |
| D11 Health card | The "Service schedules" card's 7 rows | **Port only this card into the existing Data quality page** (preserve existing UI). Fix the overlapping "Schedules by source" row. The other panels (Position clean-up, Audit run summary, Auto-match health, integrity gate %) are not part of this work |
| D12 States | Analyst banner, empty state, saving, error, missing link, retired + Reactivate | **Source radios:** "Car maker / Part maker / Roam policy". "Dominion fleet telemetry consensus" is removed. **"Import OEM Defaults" becomes "Load Roam policy starter set"**, which inserts the 16 global rules from §3.1 (no OEM data source exists). **Error copy:** "Couldn't save. Nothing was changed." with no consensus or RAFT text. **Toast:** "Saved · 2 Roam Fleet cars updated" |
| D13 Phone | Ladder, read-only note | Drop the Parts-database header (Find parts / Full database / Import). Use the D13 layout under the normal Dominion phone header |
| F1 Due drawer | All chips, groups and lines | — |
| F2 Why this schedule? | The popover | **Port only the popover into F1.** The left list and the "Fleet Policy Context" panel (148 vehicles, 12 exceptions) are not built. The "Other available origins" line is removed |
| F3 Custom schedule | Dialog and reset dialog | **New rule taken from the design:** a custom interval must be **tighter than or equal to** Roam's (both km and months). The server rejects a looser one with "Custom schedules can only be shorter than Roam's". Added to §3.2 |
| F5 Alerts bell | The dropdown (Open / Closed, one row per part) | Port only the dropdown. The "Closed Alerts Ledger" and "Telemetry Diagnostics" panels are not built. Row badges use the spec chips only |
| F6 Overview rows | "Dominion schedule status" column, filter chips (Overdue · Roam updated · Waiting for odometer) | **Add these to the existing Overview tab;** don't replace it. The KPI cards, info banner wording ("Telemetry Engine") and bottom cards (OBD-II, Compliance Engine, Auto Audit) are not built. The banner reads "Service schedules now come from Roam" |
| F8 States | Updated-by-Roam toast, retired line, error, look-only menu | "Maker sync confidence 62%" removed. "View differences" opens F2 with the before/after from history. Fake error codes removed |
| F9 Phone | Cards, chips, sticky Log odometer / Log service | The "OBD-II CANbus Health" card and the custom bottom tab bar are not built; use the existing responsive layout |

### 9.4 Round 2: the 4 remakes (2026-11-04) — ACCEPTED

**Exports:**
- Dominion: `Downloads/dominion maintanance redo/stitch_roam_dominion_3`, 3 frames.
- RoamFleet: `Downloads/fleet maintainance 2 redo/stitch_roam_fleet_3`, 2 exports covering 4 frames.

The round-1 folders for these 4 screens were deleted at the owner's request.

**Why the images were cut off:**
- Stitch drew each drawer or dialog as a `fixed` overlay with `h-screen` / `overflow-hidden`, and its own screenshot window is short. The content was complete in `code.html` both rounds.
- The 3 clipped exports were re-rendered at 1600×2000 with headless Edge and saved beside each export as **`screen_full.png`**. Those files, together with the `screen.png` header, are the spec for these screens.
- **Rule for future Stitch reviews:** when a drawer or dialog image is cut off, check `code.html` and re-render it before asking for a remake.

| Remake | Spec image | Result | Builder fixes |
|---|---|---|---|
| R1 Edit service package | `maintenance_templates_edit_service_package_drawer/screen_full.png` | Pass: visit rhythm, info box, add-part search, the 6 real parts with own schedules, Required switches, "Check only" on brake fluid and coolant, note, sticky footer | Part names must not truncate ("Brak…", "Coo…"); the row wraps instead. The line "Work order scope assembled for this service cycle" is dropped |
| R2 Part types table | `maintenance_templates_part_types_tab_table/screen.png` | Pass: grouped table, both overflow menus (Edit / Retire, and Delete only on Fuel filter), retired Fog light row, pagination | Tabs are drawn twice; build one row. "ROAM SPEC V3.42 READY" is not built |
| R2b Retire dialog | `maintenance_templates_part_types_retire_dialog/screen.png` | Pass: real counts (1 schedule, Long-Term Service, 0 inspections, 0 catalogue parts) | "Unassigned SKU list" becomes "None" |
| R3 1505LM waiting for odometer + 1B | `fleet_maintenance_due_items_drawer_post_reading_1505lm/screen.png` (drawer header) + `screen_full.png` (body) | Pass: banner with Log odometer, 4 date-only lines (27 Nov 2026, 27 Feb 2027, 27 Aug 2029, 27 Aug 2028) matching §2 rules, footer; 1B toast + updated oil line | The "Telemetry event simulation" / "Specification state" labels are frame annotations and are not built. Numbers and plates use the app's mono font, not the serif fallback in the render |
| R4 Hard use + 2B | `fleet_maintenance_mark_as_hard_use_dialog_5179kz_2b_example/screen_full.png` | Pass: both dialogs whole, title + plate visible, 4 rows "No severe schedule yet", 2B shows Engine oil 10,000 → 5,000 with "Shorter for hard use" + "Car maker" | Same mono-font note |

**Screen set complete:** Dominion 13 of 13, RoamFleet 9 of 9. The builder takes round-1 screens from the first export folders and these 4 from the redo folders.

**Done-test for the port:** each built screen is screenshotted next to its `screen.png` (or `screen_full.png`) and compared with a rendered click-sweep of every button in §8's screen table. A text-only fidelity check is not proof.

## Appendix A: Evidence (live database and code, 2026-11-04)

**A.1 Templates today**

| task_name | scope | interval km / max / months | component_id |
|---|---|---|---|
| Inspection | global | 5,000 / 8,000 / 3 | null |
| Basic Service | global | 5,000 / 8,000 / 3 | null |
| Intermediate Service | global | 10,000 / 12,500 / 6 | null |
| Major Service | global | 40,000 / 45,000 / 24 | null |
| Long-Term Service | global | 100,000 / – / 60 | null |

**A.2 The bug** (`_fleet-server/maintenance_service_ledger_core.ts`)
```ts
// for each part (category) listed in the selected packages:
const template = acc.templates.length ? pickTightestInterval(acc.templates) : acc.defaults;
// pickTightestInterval: returns the package with the smallest interval_miles > 0
```
`schedule_for_variant` (SQL) already ranks `variant=1, platform=2 (own or parent), engine_family=3, global=4` and keeps one template per task name. Ranking happens per **package**, though, not per part.

**A.3 The 16 parts in packages** (own interval → today's effective interval when none)

| Part | Own interval | Packages listing it | Migrated global rule |
|---|---|---|---|
| air_filter | 10,000 / 6 | Intermediate, Major | 10,000 / 6 |
| brake_fluid | 40,000 / 24 | **Basic**, Major | 40,000 / 24 |
| cabin_filter | 10,000 / 6 | Intermediate, Major | 10,000 / 6 |
| coolant_flush | 100,000 / 60 | **Basic**, Long-Term | 100,000 / 60 |
| fluids | 10,000 / 6 | Basic, Inspection, Intermediate, Major | 10,000 / 6 |
| rotate_tires | 10,000 / 6 | Basic, Intermediate, Major | 10,000 / 6 |
| tire_pressure | 10,000 / 6 | Inspection, Basic, Intermediate, Major | 10,000 / 6 |
| tires | 40,000 / 36 | **Inspection**, Intermediate, Major | 40,000 / 36 |
| oil | none | Basic, Inspection, Intermediate, Major | 5,000 / 3 |
| lights | none | Inspection, Intermediate, Major | 5,000 / 3 |
| brakes | none | Intermediate, Major | 10,000 / 6 |
| wipers | none | Intermediate, Major | 10,000 / 6 |
| belt | none | Major | 40,000 / 24 |
| suspension | none | Major | 40,000 / 24 |
| transmission | none | Major | 40,000 / 24 |
| spark_plugs | none | Long-Term | 100,000 / 60 |

The other 33 part types are in no package and get no schedule today. That doesn't change.

**A.4 `platform_revision`:** columns as in §3.3. It has 426 rows for `vehicle_platform` and 17 for `part_interchange_group`. It is written by triggers `vehicle_platform_revision` and `platform_component_link_revision`, function `trg_platform_revision`.

**A.5 Units**
- **Readings are km.** RoamFleet odometer readings are km: `5179KZ` last service is at 121,952, and the odometer screen warns when a value looks like it was "entered in Miles".
- **Nothing converts.** No maintenance code converts units; `maintenanceScheduleEngine.ts` adds the interval to the odometer as-is.
- **Dominion saves what it shows.** The Dominion template form labels the field "km" and saves it unchanged into `interval_miles`.
- **Conclusion:** stored values are km, and the rename is vocabulary only.

**A.6 Alerts:** `fleet.maintenance_alerts(id, organization_id, alert_key UNIQUE, vehicle_id, category_id, position, alert_date, severity, payload, created_at)`. Example key: `maint:<org>:5179KZ:<part>:LF:2026-11-04`. Cron `fleet-maintenance-nightly` runs at 07:00 UTC. The 34 rows break down as tyres 14, oil 4, cabin filter 4, air filter 4, rotation 4, and 1 each for fluids, brake fluid, coolant flush and tyre pressure.

**A.7 Foreign keys into `maintenance_service_categories`:** 31 FKs from 28 tables.

| On delete | Tables |
|---|---|
| CASCADE | `component_related_supply`, `maintenance_inspection_templates`, `maintenance_package_categories`, `maintenance_service_categories` (parent), `part_symptom_component`, `part_type_spec_field`, `vehicle_component_schedule` |
| RESTRICT | `platform_component_link`, `vehicle_oe_number` |
| NO ACTION | `catalog_component_applicability`, `catalog_task`, `maintenance_task_templates`, `part_category`, `part_import_batch`, `part_import_row`, `part_import_template`, `part_type_request`, `spec_key` |
| SET NULL | `catalog_research_job`, `maintenance_inspection_findings`, `maintenance_inspection_items`, `maintenance_service_ledger`, `maintenance_work_order_lines`, `part_master`, `part_quote_request`, `part_repeat_alert`, `part_term_synonym`, `parts_sourcing_requests` |

**A.8 Odometer readings:** `fleet.odometer_readings(id, organization_id, vehicle_id, reading, reading_date, source, reference_id, reference_type, recorded_at, is_hard, is_verified, is_voided, is_anomaly, anomaly_reason, void_reason, driver_id, verified_by, verified_at, …)`.

**A.9 Permissions:** `packages/auth-client/src/dominionPermissions.ts`:
- owner/superadmin can do everything;
- `platform_support` gets the master-edit set, which includes `catalog.write`;
- analyst gets nothing.

`assertPlatformStaffResponse` lets owner, support and analyst through.

**A.10 Everything that points at a car (`vehicle_catalog`)**

19 tables have a foreign key:

| On delete | Tables |
|---|---|
| CASCADE | `catalog_component_applicability`, `catalog_spec_value`, `catalog_variant_demand`, `maintenance_task_templates`, `part_fit_derived`, `part_fitment`, `part_listing`, `part_listing_exclusion`, `part_match_conflict`, `vehicle_oe_number` |
| NO ACTION | `catalog_task`, `interchange_fitment_rule`, `part_import_row` |
| SET NULL | `catalog_research_job`, `part_fit_feedback`, `part_match_recompute_log`, `part_rule_review`, `parts_sourcing_requests`, `vehicle_catalog_pending_requests` |

**5 tables hold a car id with no foreign key.** The database won't protect them, so `catalog_car_dependents` lists them by name:

| Table | Column | Live rows linked |
|---|---|---|
| `fleet.vehicles` | `vehicle_catalog_id` | 2 of 2 |
| `public.fleet_vehicles` | `vehicle_catalog_id` | 2 of 2 |
| `explorer.user_vehicle` | `catalog_variant_id` | 0 |
| `places.plug_price_report` | `catalog_variant_id` | 0 |
| `places.usage_count` | `catalog_variant_id` | not counted |

A CI check fails if any column named `vehicle_catalog_id`, `catalog_variant_id` or `catalog_id` that refers to cars appears outside this list without a foreign key. `delivery.vendor_price_history`, `delivery.purchase_order_lines` and `freight.intake_claim_requests` have a `catalog_id` that is **not** a car and are allow-listed.

**Limitation (N-e):** this check finds car references by column name only. A new column that points at a car must use one of the three names, or be added to the check's pattern list in the same change. Code review enforces this, not the database.

**A.11 Unique keys on `vehicle_component_schedule` (live):**
- `uq_vcs_org_vehicle_cat_null_pos` UNIQUE (`organization_id, vehicle_id, category_id`) WHERE `position IS NULL`
- `uq_vcs_org_vehicle_cat_pos` UNIQUE (`organization_id, vehicle_id, category_id, position`) WHERE `position IS NOT NULL`

## Appendix B: Glossary
- **Part type / component / category:** a row in `maintenance_service_categories` (e.g. Brake Fluid). 49 exist.
- **Package:** a `maintenance_task_templates` row without `component_id` (e.g. Basic Service).
- **Part rule:** a `maintenance_task_templates` row with `component_id`.
- **Car / variant:** a `vehicle_catalog` row (make, model, chassis code, engine, years). Called **car** in this audit and on screens; the schema keeps `variant` (`template_scope = 'variant'`, `schedule_for_variant`).
- **Platform:** a `vehicle_platform` row, in practice one per chassis code. Its `parent_id` points to a platform family.
- **RoamFleet car:** a customer vehicle in `fleet.vehicles`, linked to a car by `vehicle_catalog_id`.
- **Schedule row:** a `vehicle_component_schedule` row, one per RoamFleet car + part + position.
- **Bootstrap:** creating a RoamFleet car's schedule rows when it is linked to a car.
