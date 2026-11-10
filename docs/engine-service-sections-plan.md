# Engine service sections — plan

**Status (10 Nov 2026):** Rev 5 — PLAN CLOSED. **Layer 1 + 2 LIVE** (migrations 20261110001951 + 20261110011234 applied with logbook; fleet-ops deployed). **Dominion Jobs screens (DM1–DM4) built + checked on live data** (dark-mode chip fix done). **Fleet screens (F1–F7) built** (24 tests). Engine group icon → gears. Not deployed: Dominion + Fleet sites. Service packages / Review list / History remade (S43e–g) and ported incl. DM5 History sentences + working Approve/Reject (server routes deployed 10 Nov). Fleet data fully removed from Dominion maintenance (KPI tile, save toast, before-saving box + its car-count fetch, History car counts, lock wording, "Fleet" wording). Code complete: all layers. Not yet: commit + Dominion/Fleet website deploy (owner decides).

**One sentence:** The owner manages every maintenance job, group, section and "also do" link in Dominion, and when logging engine work in Fleet finds every job sorted the way a mechanic thinks about the engine — outside parts, top end, bottom end — each job exactly once, nothing combined, with "also do" suggestions.

Sources: owner's engine grouping list (9 Nov); review of Rev 1 (9 Nov); review of Rev 2 (9 Nov); owner: "Dominion feeds the rest of the apps" (9 Nov).

---

## What exists today (looked first, 9 Nov, live data)

**Data**
- 60 active jobs across all groups, 0 retired (9 Nov).
- Jobs live in `public.maintenance_service_categories`: `kind='system'` = group (Engine, Filters…), `kind='component'` = job, linked by `parent_id`. `is_part=false` = service (short cost-only form in Fleet), `is_part=true` = part (full form; also a part type in Find parts / Parts catalog). `op_code` = the short job code already shown in Dominion's Part types list (unique among parts).
- **31 tables** hold a foreign key to `maintenance_service_categories`; `parent_id` is read by 18 server files (Find parts, parts catalog, research worker, schedules). **This plan never changes `parent_id`.**
- Engine has **21** active jobs. Air filter (home Filters), Drive / Serpentine Belt (home Belts & hoses), Radiator Coolant Flush (home Fluids) belong in engine sections.
- "Piston Rings & Engine Bearings" and "Cylinder Head Reconditioning" each combine several jobs; **0 rows** in all 31 referencing tables point at either.
- Saved job lines have an `action` (DB check: `inspect, replace, rotate, balance, flush, top_up, repair, other`). Live saved lines: tires `replace` ×4, wheel_balancing `balance` ×1, **wheel_alignment `other` ×1** (should be `adjust`), 10 older lines with no job code (`replace`). The app guesses service-job actions from the job code (`defaultActionForCategory`); it was right except Wheel Alignment.
- Jobs are created by: Dominion's parts tools via DB functions (`upsert_self_serve_part_type` confirmed; 10 more functions mention the table with an insert — `promote_part_proposal`, `part_import_route_review_rows`, `save_self_serve_part`, `save_self_serve_part_in_batch`, `save_guided_part`, `save_self_serve_catalog_page`, `save_self_serve_fluid_bundle`, `save_related_supply`, `save_component_applicability`, `maintenance_rule_impact` — each must be checked), the server route `POST /admin/maintenance-categories`, and migrations.
- Dominion change history: the trigger `trg_master_revision` writes every insert/update/delete on `maintenance_service_categories` (and schedules, packages, catalog tables) into `public.platform_revision` (`entity_table, entity_id, old_row, new_row, actor`). Dominion's **History** tab reads `platform_revision` for **one** table only (default `maintenance_task_templates`) and its sentence builder (`historyPlainSentence`) only describes schedule changes (name + interval). Job edits are recorded but never shown. (`fleet.master_change_log` is a separate parts-data log, not used here.)

**Dominion today** — Master data → Maintenance → tabs Part schedules · Service packages · **Part types** · Review list · History.
- Part types lists every job (services too, labelled "part types"), grouped by area, with **Retire** shown as a text link.
- **"+ Add part type" adds nothing** — it shows a toast "Use Parts catalog to add part types." Service jobs cannot be added anywhere in Dominion.
- No way to edit a job's name, description, icon or action; no groups-within-a-group; no "also do" links. Every job added on 9 Nov was added by migration.

**Fleet today**
- Log service → Engine = one flat grid. `handleContinueFromSystem` uses the opened group as every job's system (wrong for a job listed from another group). Tooltips are hover-only. Wrong `oil` icon on Oxygen sensor, Thermostat, Water pump, Ignition coil.

## Review decisions

**Rev 1 review**

| Item | Decision | Why |
|---|---|---|
| `operation_type` | Merged into the existing action list as `default_action` | One list — no drift between job type and saved action. |
| New action values | `clean, adjust, machine, rebuild` added | `diagnose` left out: no job uses it; `inspect` covers checks until a diagnostic job exists. |
| `access_levels` | Not this round | Logging doesn't use it; the generic seed is wrong for the owner's Roomy. Section tooltips explain access. |
| Relations | `recommended_with` only | Other types would be unused options. |
| "Also do" chips, tap-to-show info, search label with action, seeded section text, wider rename guard | Taken | — |

**Rev 2 review**

| Item | Decision | Why |
|---|---|---|
| DC5 reads as "must be moved" | **Fixed** — DC5 counts ★ jobs NOT in their home group (must be 0) and ★ jobs under Engine (must be 0) | Wording was ambiguous. |
| `default_action` NOT NULL | **Taken, as a rule on jobs only** (`kind='component'` must have it; groups don't) **plus every job-creation path updated** | A plain NOT NULL would also hit group rows, and would break every creator that doesn't send it (11 DB functions + 1 server route). |
| DC7 both ends | Taken | — |
| `homeSystemName` on chips | Taken | — |
| S2 on every save path incl. chips | Taken | — |
| P4 "10" vs D3 "8" | Clarified: 10 = 8 new + 2 that arrive by renaming | Engine count after = 21 + 8 = **29**; the migration fails if not 29. |
| `op_code` context | Added (see "Data") | — |
| `system_id` copied onto members | Kept, **set by a trigger**; a section can't change group | Dominion edits sections now, so it must be enforced, not assumed. |
| Audit of old guessed actions | Done (see "Data"): only Wheel Alignment was wrong | Old lines untouched. |
| `group_name` repeated on sections | **Taken: `maintenance_job_section_groups` table** | Dominion will create groups; free text would drift. |

**Rev 3 review**

| Item | Decision | Why |
|---|---|---|
| DC1 fails CI on normal use (a new unsectioned job is allowed) | **Taken** — DC1 and DC9 run once after the migration; DC2–DC8 run in CI | "Other engine jobs" is a designed state, not an error. |
| `sort_order` ties | **One rule: every save renumbers the whole list 10, 20, 30… in one transaction; every read orders by `sort_order, name`** | No ties from Dominion; deterministic even if a tie sneaks in. No unique index, so no temp-value reorder dance. |
| Section group `system_id` immutable | Taken (trigger) | Same rule as sections. |
| Build order | **Taken, with a correction**: the rename guard must run **before** the rename, not after (the reviewer's order had it after) | A guard after the change protects nothing. |
| Change-log entity types | **Corrected**: History comes from `platform_revision` via `trg_master_revision`, not `fleet.master_change_log`. New tables get the same trigger; History tab reads all job tables and describes each change in a plain sentence | Rev 3 named the wrong log. |
| V2 "used" check speed | Taken: one query per request builds the used set | Not per job. |
| Empty section group / section | Taken: hidden in Fleet; shown in Dominion with "0 sections" / "0 jobs" | Owner sees what to fill. |
| op_code clash | Server makes op_codes, adding a number on a clash; never a 500 | — |
| Client fallback for missing `default_action` | Kept and logged as a warning | Means a server bug if it ever fires. |
| Restore wording, delete rules, incoming links, DC4 members, F3 wording | Taken (DM1, DM3, DM2, DC4, F3) | — |

**Rev 4 review**

| Item | Decision | Why |
|---|---|---|
| Layer 2 still named `fleet.master_change_log` | Fixed | Stale line from Rev 3. |
| Which `default_action` retired jobs get | Fixed: a numbered step sets `replace` on any job still empty, before the rule is added | Live: 0 retired jobs (60 active) today, but the step keeps the rule safe. |
| `historyPlainSentence` must learn the new changes | Fixed (V8 lists every case) | Otherwise DM5 shows blank sentences. |
| "Used" set must not be hard-coded | **Taken, built as a database function** `maintenance_job_used_ids()` that reads the link list from `pg_constraint`, **excluding setup links** (a job's `parent_id`, section members, also-do links) | The server's database API can't run a query built on the fly, so it has to be a function. Being in a section is setup, not use — counting it would lock every sectioned job. |
| Code clash as well as op_code clash | Fixed | — |
| What "N links" counts in DM4 | Fixed: links in both directions, matching V5 | — |
| "Other <group> jobs" only with an active job | Fixed (F1) | — |

## Problems found (one fix each)

| # | Problem | Fix |
|---|---|---|
| P1 | Engine is one flat grid. | Section groups + sections (D1–D2, D4) shown as headings in Fleet (F1) and managed in Dominion (M3). |
| P2 | Air filter, Drive belt, Coolant flush not findable under Engine. | Section members can list a job from another group; `parent_id` never changes. |
| P3 | Two combined jobs. | Rename + add split-out jobs (D3). |
| P4 | 10 jobs missing (8 new + 2 via rename). | D3. |
| P5 | Job listed under Engine but owned elsewhere would save with the wrong group. | Home group on every save path (F2). |
| P6 | Wrong icons on 4 engine jobs. | Icons per section (D4). |
| P7 | Search shows only the group. | `Group · Section · Action` (F3). |
| P8 | Unsectioned Engine job would vanish. | "Other engine jobs" fallback (F1); DC1. |
| P9 | Service-job action guessed from code. | `default_action` on every job (D5), used when saving (F7). |
| P10 | Rename guard checked 2 of 31 tables. | Guard loops every foreign key (D3a). |
| P11 | Work that goes together isn't suggested. | Relations (D6) + chips (F5). |
| P12 | Tooltips don't work on touch. | Info button (F6). |
| P13 | Dominion can't add a service job; "+ Add part type" only shows a toast. | Dominion **Jobs** screen with Add / Edit job (M1–M2). |
| P14 | Dominion can't edit sections or "also do" links — only migrations can. | Dominion section editor (M3) and links editor (M2). |
| P15 | Job creators would break once `default_action` is required. | Every creation path sends it (V7); DB rule rejects a job without it. |
| P16 | Retire in Part types is a text link. | Real button (M4), owner's buttons rule. |
| P17 | Retiring a job would leave it in sections and links (DC2/DC7 would fail). | Retire removes the job's section memberships and links in the same step (V5). |
| P18 | Dominion History only shows schedule changes; job edits are recorded but invisible. | History reads every job table and describes each change in plain words (V8, DM5). |
| P19 | Equal `sort_order` values give a random order. | Saves renumber the whole list; reads order by `sort_order, name`. |

## Layer 1 — Data

**Build order inside the one migration (never reorder):** D5a (add `default_action` column + new action list) → D1 → D1b → D2 (tables + triggers) → **D3a rename guard** → D3 (renames + new jobs, with `default_action`) → D3b count guard → D5 seed the rest → D5c fill any job still empty (incl. retired) with `replace` → D5 required-rule → D4 (sections, members, icons) → D5b (creator functions) → D6 (relations) → D7 (used-jobs function; after D2 + D6 so it can skip them) → reload.

**Order rule (all three tables):** whenever a list is saved, the server renumbers it 10, 20, 30… in one transaction; every read orders by `sort_order, name`.

**History:** each new table gets the existing `trg_master_revision` trigger, so every change lands in `platform_revision` like job edits do.

**D1. `public.maintenance_job_section_groups`** — `id uuid pk`, `system_id uuid not null` (FK, must be `kind='system'`; **can't be changed** — trigger), `code text unique not null`, `name text not null`, `sort_order int not null`, timestamps. Unique `(system_id, name)`.

**D1b. `public.maintenance_job_sections`** — `id uuid pk`, `group_id uuid not null` (FK → section groups), `system_id uuid not null` (set by trigger from the group; can't be changed), `code text unique not null`, `name text not null`, `description text not null`, `icon_key text not null`, `sort_order int not null`, timestamps. Unique `(group_id, name)`.

**D2. `public.maintenance_job_section_members`** — `section_id` (FK, cascade), `category_id` (FK, must be `kind='component'`), `system_id uuid not null` (set by trigger from the section), `sort_order int`. PK `(section_id, category_id)`; unique `(system_id, category_id)` = a job at most once in one group's sections.

All three: RLS on, no policies (service_role only), same as `maintenance_service_categories`. Changes recorded in `platform_revision` by `trg_master_revision`.

**D3. Jobs.** Services copy `throttle_body_cleaning` (`is_part=false`, fields labor + material, `default_fit_mode` NULL). Parts copy `spark_plugs` (`is_part=true`, `default_fit_mode='engine'`, fields qty / unit_price / labor). All under `sys_engine`, one-sentence plain-English `description` each.
- **D3a. Rename guard:** loop every foreign key referencing `maintenance_service_categories` (from `pg_constraint`); `RAISE EXCEPTION` if any row points at `piston_rings_bearings` or `cylinder_head_recondition`.
- **D3b. Count guard:** after D3, `RAISE EXCEPTION` unless active Engine-home jobs = **29**.

| Change | Code | Name | Type |
|---|---|---|---|
| name only | `fuel_induction_service` (code unchanged) | Fuel Injector Cleaning / Induction Service | service |
| rename | `piston_rings_bearings` → `piston_rings` (op_code `ENG-PRING`) | Piston Ring Replacement | part |
| rename | `cylinder_head_recondition` → `cylinder_head_machining` (op_code `ENG-CHM`) | Cylinder Head Machining / Resurfacing | service |
| new | `fuel_injector` | Fuel Injector Replacement | part |
| new | `valve_stem_seals` | Valve Stem Seal Replacement | part |
| new | `valve_grinding_seating` | Valve Grinding & Seating | service |
| new | `piston_replacement` | Piston Replacement | part |
| new | `cylinder_honing` | Cylinder Honing / Boring | service |
| new | `rod_bearings` | Connecting Rod Bearing Replacement | part |
| new | `main_bearings` | Main Bearing Replacement | part |
| new | `crankshaft_machining` | Crankshaft Machining / Polishing | service |

**D4. Engine section groups, sections, members.** Order = table order. ★ = home group is not Engine (listed, never moved).

Section groups (system Engine): `eng_g_external` External bolt-on & induction · `eng_g_top_end` Top end (cylinder head) · `eng_g_bottom_end` Bottom end (engine block) · `eng_g_whole` Whole engine.

| Group | Section (code · icon) | Tooltip text | Jobs |
|---|---|---|---|
| External | Air Intake & Induction (`eng_air_intake` · wind) | Parts that bring clean air into the engine. All on the outside — nothing is taken apart. | Engine Air Filter ★, Throttle Body Cleaning, Intake Manifold Gasket |
| | Fuel System (`eng_fuel` · droplet) | Parts that spray fuel into the engine. Worked on from the outside. | Fuel Injector Cleaning / Induction Service, Fuel Injector Replacement |
| | Ignition System (`eng_ignition` · spark) | Parts that make the spark that burns the fuel. | Spark Plugs, Ignition coil, Spark Plug Wires |
| | Accessory & Timing Drive (`eng_drive` · belt) | Belts and chains at the front of the engine that drive its parts and keep the valves in time. | Drive / Serpentine Belt ★, Timing Belt, Timing Chain & Tensioner |
| | Fluids & Emissions (`eng_fluids` · oil) | Oil, coolant and the parts that keep fumes and leaks under control. | Engine oil & filter, Radiator Coolant Flush ★, PCV Valve, Oxygen sensor, Leak Inspection |
| | Cooling System (`eng_cooling` · thermometer) | Parts that move coolant around the engine so it doesn't overheat. | Thermostat, Water pump |
| Top end | Cylinder Head (`eng_top_end` · gears) | Everything from the head gasket up. The valve cover comes off at minimum; most head work means the head comes off. | Valve Cover Gasket, Valve Clearance Adjustment, Valve Stem Seal Replacement, Valve Grinding & Seating, Cylinder Head Machining / Resurfacing, Head Gasket |
| Bottom end | Pistons & Compression (`eng_pistons` · gears) | Done by pulling the pistons out the top after the head is removed. Restores compression and stops oil burning. | Piston Ring Replacement, Piston Replacement, Cylinder Honing / Boring |
| | Crankshaft & Rotating Assembly (`eng_crank` · gears) | Done from underneath after the oil pan comes off. Restores oil pressure and fixes knocking. | Connecting Rod Bearing Replacement, Main Bearing Replacement, Crankshaft Machining / Polishing, Oil Pan Gasket |
| Whole engine | Whole Engine (`eng_whole` · wrench) | The engine comes out and is taken apart completely. | Engine Overhaul / Rebuild |

Kept although not in the owner's list (so no job disappears): Oxygen sensor + Leak Inspection, Cooling System, Whole Engine. Each Engine-home job's `icon_key` = its section's icon; ★ jobs keep theirs.

**D5. One action list + `default_action`.**
- One list everywhere (DB check on `maintenance_work_order_lines.action`, server `WO_LINE_ACTIONS`, Fleet + Dominion action lists): `inspect, clean, adjust, replace, rotate, balance, flush, top_up, repair, machine, rebuild, other`.
- Column `maintenance_service_categories.default_action text`, check against the list, **and** check `kind <> 'component' OR default_action IS NOT NULL` (added after the seed). Seed every active job:

| default_action | Jobs (codes) |
|---|---|
| replace | belt; brakes, brake_shoes_drums, brake_rotor, brake_caliper, brake_drum, brake_wheel_cylinder, brake_hose, brake_master_cylinder, handbrake_cable, abs_wheel_sensor; ELEC-BATT, ELEC-START, ELEC-ALT; oil, spark_plugs, fuel_injector, spark_plug_wires, pcv_valve, timing_belt, timing_chain, valve_cover_gasket, oil_pan_gasket, intake_manifold_gasket, head_gasket, valve_stem_seals, piston_rings, piston_replacement, rod_bearings, main_bearings, oxygen_sensor, thermostat, water_pump, ignition_coil; air_filter, fuel_filter; cabin_filter; LGT-IND, LGT-TAIL, LGT-HEAD, fog_light_bulb, wipers; suspension, shock_absorber; tires |
| clean | throttle_body_cleaning, fuel_induction_service |
| inspect | leak_inspection, lights |
| adjust | valve_clearance_adjustment, wheel_alignment, tire_pressure |
| machine | cylinder_head_machining, valve_grinding_seating, cylinder_honing, crankshaft_machining |
| rebuild | engine_overhaul |
| flush | brake_fluid, coolant_flush, transmission |
| top_up | fluids, engine_oil_part, coolant_part, washer_fluid_part |
| rotate | rotate_tires |
| balance | wheel_balancing |
| repair | puncture_repair, wheel_straightening |

- **D5c.** After the seed: `UPDATE maintenance_service_categories SET default_action = 'replace' WHERE kind = 'component' AND default_action IS NULL` (covers retired jobs; 0 on 9 Nov). **Then** add the required-rule. Old saved lines keep their action.
- **D7. `public.maintenance_job_used_ids()`** (returns the set of job ids that have been used; service_role only). Built at call time from `pg_constraint`: every foreign key that references `maintenance_service_categories`, **except** setup links — `maintenance_service_categories.parent_id`, `maintenance_job_section_members.category_id`, `maintenance_job_relations.*`. A new linking table added later is picked up automatically. Deno/SQL test: a job only in a section is **not** used; a job with one work-order line **is**.
- **D5b. Creation paths:** every DB function that inserts a job sets `default_action = 'replace'` (they all create parts — a part type is a part that gets replaced). The list of 11 functions above is checked one by one; any that does not insert into `maintenance_service_categories` is left alone and noted.

**D6. `public.maintenance_job_relations`** — `id uuid pk`, `from_category_id`, `to_category_id` (FKs, both must be `kind='component'`), `relation_type text not null check (relation_type = 'recommended_with')`, `note text not null`, unique `(from_category_id, to_category_id, relation_type)`, check `from <> to`. RLS same. Seed:

| From | To | Note |
|---|---|---|
| Piston Ring Replacement | Head Gasket | The head is already off. |
| Piston Ring Replacement | Cylinder Honing / Boring | New rings need freshly honed cylinders. |
| Piston Ring Replacement | Valve Stem Seal Replacement | Easy while the head is off. |
| Piston Ring Replacement | Engine oil & filter | Fresh oil after engine work. |
| Main Bearing Replacement | Connecting Rod Bearing Replacement | Same area, same tear-down. |
| Main Bearing Replacement | Oil Pan Gasket | The pan is already off. |
| Main Bearing Replacement | Engine oil & filter | Fresh oil after engine work. |
| Connecting Rod Bearing Replacement | Oil Pan Gasket | The pan is already off. |
| Cylinder Head Machining / Resurfacing | Head Gasket | A new gasket goes on a machined head. |
| Cylinder Head Machining / Resurfacing | Valve Grinding & Seating | Usually done with the head on the bench. |
| Valve Grinding & Seating | Valve Stem Seal Replacement | The valves are already out. |
| Head Gasket | Engine oil & filter | Oil may be contaminated after a head gasket failure. |
| Head Gasket | Radiator Coolant Flush | Coolant may be contaminated after a head gasket failure. |
| Timing Belt | Water Pump | Usually driven by the timing belt — change together. |
| Timing Belt | Drive / Serpentine Belt | The front of the engine is already open. |
| PCV Valve | Engine oil & filter | A blocked PCV valve dirties the oil. |

**Data checks — every count must be 0.** DC1 + DC9: `docs/sql/engine-sections-once-checks.sql` (owner runs on live after the migration). DC2–DC8: `supabase/tests/engine_sections_checks.sql` in the existing style (one `DO` block per check, `RAISE NOTICE` the count, `RAISE EXCEPTION` if > 0), added to `.github/workflows/parts-sql-checks.yml` (paths + a `psql -v ON_ERROR_STOP=1` step), and also run by the owner on live.
**Once, right after the migration: DC1 and DC9. In CI on every deploy: DC2–DC8** (each is kept true by a rule — V5 cascade keeps DC2/DC7, V4 keeps DC3, triggers keep DC4, V3 lock keeps DC5, checks keep DC6/DC8).
- DC1 (once) Active Engine-home jobs not in any Engine section — the seed landed fully. After go-live an unsectioned job is allowed (it shows under "Other engine jobs").
- DC2 Section members whose job is retired or not `kind='component'`.
- DC3 A job listed twice in one group's sections.
- DC4 Section groups whose `system_id` is not `kind='system'`; sections whose `system_id` differs from their group's; members whose `system_id` differs from their section's.
- DC5 ★ jobs not in their home group (`air_filter`→`sys_filters`, `belt`→`sys_belts`, `coolant_flush`→`sys_fluids`) + ★ jobs whose `parent_id` is `sys_engine`.
- DC6 Jobs (`kind='component'`) with `default_action` NULL.
- DC7 Relations where **either end** is not an active `kind='component'`.
- DC8 Relations whose type is not `recommended_with` or that point a job at itself.
- DC9 (once) Active Engine-home jobs ≠ 29.

## Layer 2 — Server (fleet-ops)

**Fleet read**
- **V1** `GET /maintenance-categories/systems/:systemId/sections` → `{ groups: [{ code, name, sections: [{ code, name, description, iconKey, jobs }] }], otherJobs }`. Each job = category row (incl. `default_action`, `description`) + `recommendedWith: [{ categoryId, name, note, homeSystemId, homeSystemName }]` (active targets only). `otherJobs` = active jobs of that group not in any of its sections. A group with no sections → `groups: []`, all jobs in `otherJobs`.
- Pure `buildSystemSections(...)` in its own file + Deno test: order; ★ member; retired job dropped; unsectioned → `otherJobs`; group with no sections; `default_action` and `recommendedWith` (+ retired target dropped) carried.
- `WO_LINE_ACTIONS` gets the 4 new actions.

**Dominion write** (catalog-write permission, same check as Part types; every change recorded in `platform_revision` by the `trg_master_revision` trigger)
- **V2** `GET /admin/maintenance/jobs` → every group with its section groups, sections, members, and every job (incl. retired) with `default_action`, `description`, form type, home group, relations, section memberships, and whether it has been used (any of the 31 referencing tables). The used set comes from **one** call per request to `maintenance_job_used_ids()` (D7), joined to the job list — never a check per job, never a hard-coded table list.
- **V3** `POST /admin/maintenance/jobs` create a job: name, home group, form type (service / part), default action, description, icon. Server sets `code` and `op_code` (both unique; on either clash it adds a number, e.g. `fuel_pressure_test_2` / `ENG-FPT-2` — never a 500), service/part field setup (as D3). Plain-English errors for a duplicate name in the same group. `PATCH /admin/maintenance/jobs/:id` edit name, description, default action, icon. Home group and form type can't change once a job has been used (31-table check); before that they can.
- **V4** Section groups and sections: create, rename, edit description/icon, reorder (renumbers the whole list), delete. Delete a section group only when it has no sections; delete a section only when it has no jobs. A section group can't move to another group, and a section can't move to another section group's group (triggers). `PUT /admin/maintenance/sections/:id/members` sets the ordered job list; a job already in another section of the same group is refused with a plain message naming that section.
- **V5** Retire / restore a job: retire also removes it from every section and every relation (both ends), in one transaction; restore does not re-add them.
- **V6** Relations: add (job, related job, note) and remove. Both must be active jobs; refused if the same link exists or a job links to itself.
- **V7** `POST /admin/maintenance-categories` and all D5b functions send `default_action`.
- **V8** `GET /admin/maintenance/history` reads `platform_revision` for `maintenance_service_categories`, `maintenance_job_section_groups`, `maintenance_job_sections`, `maintenance_job_section_members`, `maintenance_job_relations` and `maintenance_task_templates` together, newest first, with a filter by kind of change (Jobs / Sections / Also-do links / Schedules). `historyPlainSentence` gets a case for each: job created / edited (which fields) / retired / restored; section group created / renamed / reordered / deleted; section created / edited / reordered / deleted; job added to / removed from / moved in a section; also-do link added / removed. Unknown changes fall back to "<who> changed <table>", never blank. Vitest covers every case.
- Deno tests for V3–V6 rules (used job can't change home group; duplicate member refused; retire clears memberships + relations; self-link refused).

## Layer 3 — Dominion screens (Master data → Maintenance)

The **Part types** tab becomes **Jobs**. Dominion shows only its own master data (no fleet counts). **The owner makes these in Stitch first** (Stitch is the spec for the look; this plan is the spec for the content):

| Screen | What it is |
|---|---|
| **DM1 Jobs** | List of every job, grouped by home group; per group, its section groups → sections (if any) → jobs, then unsectioned jobs. An empty section group shows "0 sections — add one"; an empty section shows "0 jobs — add some". A retired job's **Restore** button says beside it: "Restore doesn't put it back in sections or 'also do' links — add them again." Each row: icon, name, form type chip (Service / Part), action chip, "listed in" chip for ★ jobs, status chip, buttons Edit and Retire/Restore. Search (name, code, op_code), filter by group, filter Active / Retired. Header buttons: **+ Add job**, **Manage sections**. |
| **DM2 Add / Edit job** (drawer) | Name, home group (locked once used, with the reason shown), form type Service / Part (locked once used), default action (the one list), description (tooltip text, required), icon picker. "Also do" list: each link shows job + note with a red Remove button; **+ Add "also do"** picks a job and a note. Below it, read-only: "Suggested with: <jobs that link to this one>" (each name opens that job's drawer). Buttons: Save, Cancel. |
| **DM3 Manage sections** (for one group) | Section groups in order, each with its sections; each section shows its jobs in order. Buttons: + Add section group, + Add section, Rename, Edit (description, icon), Move up / Move down, Delete (red; a section group only when it has no sections, a section only when it has no jobs — otherwise the button is disabled with the reason), + Add jobs to section (picker of active jobs from any group; jobs already in another section of this group are shown greyed with "in <section>"), Remove from section (red). |
| **DM4 Retire job** (dialog) | States what happens: hidden from Fleet logging, removed from N sections and N "also do" links (links in both directions — it suggests, and it is suggested by), old logs untouched. Buttons: Retire (red), Keep it. |
| **DM5 History** (existing tab, new content) | Every change to jobs, section groups, sections, section jobs, "also do" links and schedules, newest first, one plain sentence each (e.g. "Deeki added Fuel Pressure Test to Fuel System"), who and when. Filter: All / Jobs / Sections / Also-do links / Schedules. Existing Export button kept. |

Rules: all actions are visible buttons (no text links); Cancel / Remove / Retire / Delete are red; no browser pop-ups (in-app dialogs only). Old Retire text link (P16) and the toast-only "+ Add part type" (P13) are removed.

### Stitch screens received (9 Nov) — S43a–S43d in `docs/stitch/dominion-redesign/html/`

The layout of all four is right — **no remake**. Port the look exactly; build the content from this plan. Shell (sidebar, top bar) = the real Dominion shell already in the app, not the sidebar items drawn in Stitch (Stitch invented "Engine Registry", "Telematics Sync", "Hubs & Depots", "System Nodes", "Integrations", "Audit Logs", "Compliance", "Core modules"). Dark mode = the existing Dominion dark tokens (the "dark mode" export was a light, unfinished screen and is not used).

**S43a Jobs list (DM1)**
- Keep: toolbar (search, Group filter, Active/Retired, Manage sections, + Add job), summary line, one card per home group, section-group caps headings, section sub-headings with job count + chevron, job rows (icon, name, mono code line, chips), collapsed sections as tiles, empty-section dashed row with "+ Add jobs", the Filters card's "also listed in" line, collapsed group cards.
- Drop (invented): "Registry node: DOM-ENG-V2", "Multi-variant linked", "Default sort: Spec order", "Section #ENG-01/02/03", every group description line ("Core powertrain components…", "Pads, rotors, calipers…" etc.), right-side hint words ("Cabin, Oil, Engine", "Pads & Discs, Hydraulics, ABS"…), the footer ("Dominion Maintenance Schema · v4.19 active", "Registry: 11 Groups · 43 Total Sections"), "Master Sync Active v2.4".
- Fix to real data: Engine = **29 jobs · 10 sections**; summary "Engine has **10** sections"; other groups show their real job count and section count (0 sections for every group but Engine this round — show "no sections" instead of a number); codes are the real `code · op_code` (e.g. `air_filter · <its op_code>`, not `engine_air_filter · ENG-AF-01`); section "Whole Engine" (not "Whole Engine Overhaul & Swaps"); empty section text "0 jobs — add some".
- Fix to the button rule: "Edit" = outline button, "Retire" = red outline button, "Manage sections" = outline button, "Collapse group" = icon button with border (no text link).
- Add: nothing.

**S43b Add / Edit job drawer (DM2)**
- Keep: drawer layout, Name, Home group + Form type locked with lock icon and helper "Locked — this job has been used in service logs.", Default action dropdown + helper, Description + helper, Icon row, "Also do (outgoing)" list with per-row Remove, link count chip, sticky footer Cancel + Save job.
- Drop: "System Locked" and "Immutable Schema" labels (use "Locked"); the sentence "Recommended auxiliary tasks automatically prompted when scheduling this job" (wrong — nothing is automatic).
- Replace with: "Suggested while logging. Never ticked automatically."
- Fix: Remove = red outline button (not red text in a pill); Cancel = red outline button.
- Add (cut off in the picture): "+ Add 'also do'" outline button under the list, and the read-only "Suggested with: …" line. Add mode = same drawer, fields unlocked, title "Add job", primary "Add job".

**S43c Manage sections (DM3)**
- Keep: back button, title "Sections · Engine", group dropdown, + Add section group, numbered group cards with Rename / up / down / + Add section / Delete, expanded section with description + Edit + Rename + Delete, ordered job rows with up/down + Remove, "+ Add jobs to section" popover (search, checkboxes, greyed job "in <section>", Cancel + Add N jobs), "Other sections in this group" tiles, collapsed sections in groups 2–4.
- Drop: "REGISTRY TIER 1", "Primary Intake" badge, "Available jobs in registry" (→ "Jobs"), the "Diagnostic"/"Cartridge" sub-labels (→ the job's home group only), "CROSS-LIST" badge (→ the "Listed from Filters" pill style used in S43a), every invented section description ("Valves, camshafts, seals…", "Rings, wrist pins…", "Main journals, flywheel…", "Complete long-block swaps…") — use the D4 tooltip text.
- Fix to real data: tile counts Fuel System 2, Ignition System 3, Accessory & Timing Drive 3, Fluids & Emissions 5, Cooling System 2 jobs.
- Fix to the rules: Delete on groups 2–4 must be **disabled** (they have sections) with the reason as a tooltip; "+ Add section", "Expand", "Edit" and "Remove" become real buttons (outline; Remove red outline).

**S43d Retire dialog + states (DM4)**
- Keep: the dialog (warning icon, title "Retire <job>?", the 4 lines, Keep it + Retire job), the retired row (strikethrough name, Retired chip, Restore + note), the three state cards (loading skeleton, error with Try again, empty search with Clear search).
- Drop: the whole "spec page" around them — "INSPECTION SPEC · DM4 DIALOG ARCHITECTURE", "Retire Lifecycle & System Boundary States", "Linkage: decoupled on retire", "JMD spec 4.8.2", "STAGE 01/02", "Triggered via…", "POST-RETIREMENT INLINE CATALOG ROW", "State: INACTIVE_PRESERVED", "LATENCY SHIMMER", "RPC FAIL 503", "PULSE 60FPS", "FLICKER FREE", "FAILOVER KGN-DC-02", "INDEX: 68 RECORDINGS", the "Audit Ledger Protection Active" bar, "EXPORT DIFF AUDIT", "SCHEMA DOCS"; "ENG-FPT-008 · REVISION 3" (→ the job's real code); "(SYS-04)".
- Replace the dialog's grey sub-lines with plain text: "No one can pick it when logging." / "It's taken out of <section names>." / "It's taken out of N links, both ways." / "Past service logs still show it."
- Error card text: "Couldn't load jobs. Check your connection and try again." Empty search hint: "Check the spelling, or choose another group."

## Layer 4 — Fleet screens (Log service)

Look: existing Stitch "Log service step 2" style; headings reuse the "Service packages" / "Quick jobs" heading style; chips reuse the existing pill style. **No new Stitch screen.** Keep: job cards, tick circles, tooltips, "Continue with N jobs". Add: section-group headings, section headings, action badge, "Also do" chips, info buttons.

- **F1** Group picker: if `groups` come back → section-group heading → section heading (icon + name + ⓘ) → job cards; "Other <group> jobs" only if `otherJobs` has at least one active job. A section with no active jobs and a section group with no shown sections are hidden. Groups with no sections: today's flat grid, unchanged. Order: `sort_order`, then name.
- **F2** Each selected job's system = its home group (`parent_id` → `allSystems`) on **every** save path: `handleContinueFromSystem`, search → job, and chip tick.
- **F3** Search label: `Group · Section · Action` when in a section (e.g. `Engine · Air Intake & Induction · Replace`), else `Group · Action`. When the search runs while the Engine picker is open, a ★ job shows its Engine section; when it runs from the "What was done?" screen, it shows its home group (`Filters · Replace`).
- **F4** Loading state; on error the flat grid (never blank).
- **F5** "Also do" chips under a ticked job with `recommendedWith`: one chip per related job (name; tooltip = note + "saves under <homeSystemName>" when that differs from the open group). Tap = tick/untick that job; a ticked related job's chip shows ticked. Never auto-tick.
- **F6** ⓘ on each section heading and job card: tap shows the description in an in-app popover; tap elsewhere closes it; never ticks the card. Hover tooltip kept for mouse.
- **F7** Action badge on each card from `default_action`. Service jobs save `default_action`; `defaultActionForCategory` removed (fallback when missing: `replace` for parts, `other` for services — logged as a console warning, because the database rule means it should never happen). Part jobs' Action dropdown preselects `default_action` and lists the full list.

Every control on the Engine screen: job card (tick/untick), ⓘ, "Also do" chips, Continue with N jobs, Back, red Cancel. Nothing else.

## Layer 5 — Tests

- Deno: `buildSystemSections` (V1); Dominion write rules (V3–V6).
- Vitest: F2 (Engine Air Filter from Engine → Filters; chip tick on a cross-group job → its home group); F3 labels; F5 chips; F7 badge + saved action; flat grid unchanged for a group with no sections; Dominion DM3 refuses a duplicate member with the section's name.
- DC1 + DC9 once after the migration; DC2–DC8 = 0 in CI on every deploy.
- Deno: reorder renumbers 10, 20, 30…; reads with equal `sort_order` order by name; V8 sentences for each table.

## Done-tests (plain words, written before building)

Fleet
1. Log service → Engine → 4 headings and 10 sections in the D4 order; no "Other engine jobs".
2. Tap ⓘ on "Pistons & Compression" → "Done by pulling the pistons out the top after the head is removed…". Same on a phone.
3. Tick Engine Air Filter + Throttle Body Cleaning + Valve Cover Gasket → Review lists "Filters · Engine Air Filter", "Engine · Throttle Body Cleaning", "Engine · Valve Cover Gasket".
4. Open Filters → Engine Air Filter still there; Find parts still lists air filters under Filters.
5. Search "bearing" → both bearing jobs, each `Engine · Crankshaft & Rotating Assembly · Replace`.
6. Brakes and Tires & wheels look exactly as before.
7. The two old combined jobs appear nowhere; "Piston Ring Replacement" and "Cylinder Head Machining / Resurfacing" do.
8. Tick Piston Ring Replacement → chips Head Gasket, Cylinder Honing / Boring, Valve Stem Seal Replacement, Engine oil & filter; tap Head Gasket → ticked; saved line reads "Engine · Head Gasket".
9. Tick Timing Belt → chip Drive / Serpentine Belt (tooltip "saves under Belts & hoses") → tap → saved line reads "Belts & hoses · Drive / Serpentine Belt".
10. Badges: Throttle Body Cleaning `Clean`, Spark Plugs `Replace`, Crankshaft Machining / Polishing `Machine`, Engine Overhaul / Rebuild `Rebuild`.
11. Log Wheel Alignment → saved action `adjust`.
12. Search "piston" → Piston Ring Replacement and Piston Replacement, each `Engine · Pistons & Compression · Replace`.

Dominion
13. Dominion → Maintenance → **Jobs** shows Engine with its 4 section groups and 10 sections; Air filter shows "listed in Engine · Air Intake & Induction" under Filters.
14. **+ Add job** → "Fuel Pressure Test", Engine, Service, action Inspect, description → Save → it appears in Engine → Other engine jobs in Fleet within one refresh.
15. **Manage sections** → add "Fuel Pressure Test" to Fuel System → Fleet shows it under Fuel System; "Other engine jobs" disappears.
16. Try adding Throttle Body Cleaning to Fuel System → refused: "Already in Air Intake & Induction."
17. Edit Throttle Body Cleaning's description → Fleet ⓘ shows the new text.
18. Add "also do" Spark Plugs → Ignition coil, note "Same access" → ticking Spark Plugs in Fleet shows the chip.
19. Retire "Fuel Pressure Test" → dialog says it leaves 1 section and 0 links → it disappears from Fleet; DC1–DC8 still 0.
20. Home group of Engine oil & filter (already used in logs) is locked in Edit, with the reason shown.
21. History tab (filter All) shows each change from 13–20 as a plain sentence with who and when; filter "Sections" shows only 15's change.
22. Create an empty section "Test" in Fuel System's section group → Fleet doesn't show it; Dominion shows "0 jobs — add some"; delete it.
23. Reorder Ignition System's jobs (move Spark Plug Wires to the top) → Fleet shows the new order; no two jobs share a position.

Data
24. DC1–DC9 return 0 right after the migration; DC2–DC8 return 0 after done-tests 13–23 (DC1 may be 1 between 14 and 15 — allowed).

## Out of this round

- Car-specific jobs (engine code applicability, belt vs chain, plug access) and `access_levels`.
- Engine service packages (Timing Belt Package, Head Gasket Job, Bottom-End Refresh).
- Relation types other than `recommended_with`.
- Moving a section to another group, or a section group to another group (both refused by trigger; would need member re-checks).
- Sections for groups other than Engine — the tables and Dominion screens support any group, but only Engine is seeded.

## Layer 1 built (10 Nov 2026)

Migration: `20261110001951_engine_service_sections.sql`

**D5b — creator functions**

| Function | Action |
|---|---|
| `upsert_self_serve_part_type` | **Changed** — insert sets `default_action = 'replace'` |
| `promote_part_proposal` | Left alone (no insert into `maintenance_service_categories`) |
| `part_import_route_review_rows` | Left alone |
| `save_self_serve_part` | Left alone |
| `save_self_serve_part_in_batch` | Left alone |
| `save_guided_part` | Left alone |
| `save_self_serve_catalog_page` | Left alone |
| `save_self_serve_fluid_bundle` | Left alone |
| `save_related_supply` | Left alone (live def in archive only; no insert) |
| `save_component_applicability` | Left alone (live def in archive only; no insert) |
| `maintenance_rule_impact` | Left alone |

Logbook (after apply on live):  
`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261110001951', 'engine_service_sections');`

## Layer 3 built early (9 Nov, by Claude, at the owner's request) — Dominion screens

Built before Layer 2 so the server can be written to the screens' exact contract. Not deployed. Until Layer 2 exists the Jobs tab shows its "Couldn't load jobs" state.

Files (`apps/admin/src/components/admin/maintenance-master/jobs/`): `jobsApi.ts` (contract below), `jobsModel.ts` (+ `jobsModel.test.ts`, 10 tests), `jobsUi.tsx` (buttons/chips — every action is a real button; Remove/Retire/Delete/Cancel red), `JobsTab.tsx` (DM1 + states), `JobDrawer.tsx` (DM2), `ManageSections.tsx` (DM3), `RetireJobDialog.tsx` (DM4). `MaintenanceMasterPage.tsx`: tab "Part types" → "Jobs". Removed: `PartTypesTab.tsx`, `MaintenanceMasterRetireDialog.tsx` (old toast-only add + text-link retire). DM5 (History sentences) is not built yet — it rides with V8.

**Layer 2 must serve exactly this (fleet-ops, catalog-write for writes):**

| Method + path | Body | Returns |
|---|---|---|
| GET `/admin/maintenance/jobs` | — | `{ groups: [{id, code, name, iconKey}], sectionGroups: [{id, groupId, code, name, sortOrder, sections: [{id, sectionGroupId, groupId, code, name, description, iconKey, sortOrder, jobIds[] (ordered)}]}], jobs: [{id, code, opCode, name, description, iconKey, isPart, defaultAction, homeGroupId, status: 'active'\|'retired', used, alsoDo: [{relationId, jobId, jobName, note}], suggestedBy: [{relationId, jobId, jobName}]}] }` — `groups` = active `kind='system'` rows except the `imp-*` import buckets |
| POST `/admin/maintenance/jobs` | `{name, homeGroupId, isPart, defaultAction, description, iconKey}` | `{ item: Job }` |
| PATCH `/admin/maintenance/jobs/:id` | any of the above; `homeGroupId`/`isPart` refused (409, plain message) when `used` | `{ item: Job }` |
| POST `/admin/maintenance/jobs/:id/retire` | — | `{ removedFromSections, removedLinks }` (V5 cascade) |
| POST `/admin/maintenance/jobs/:id/restore` | — | `{ item: Job }` |
| POST `/admin/maintenance/section-groups` | `{groupId, name}` | created row |
| PATCH `/admin/maintenance/section-groups/:id` | `{name}` | row |
| DELETE `/admin/maintenance/section-groups/:id` | — | refused (409) if it has sections |
| PUT `/admin/maintenance/section-groups/order` | `{groupId, orderedIds}` | renumbers 10, 20, 30… |
| POST `/admin/maintenance/sections` | `{sectionGroupId, name, description, iconKey}` | row |
| PATCH `/admin/maintenance/sections/:id` | `{name?, description?, iconKey?}` | row |
| DELETE `/admin/maintenance/sections/:id` | — | refused (409) if it has jobs |
| PUT `/admin/maintenance/sections/order` | `{sectionGroupId, orderedIds}` | renumbers |
| PUT `/admin/maintenance/sections/:id/members` | `{jobIds}` (full ordered list) | renumbers; refused (409) naming the section if a job is already in another section of the same group |
| POST `/admin/maintenance/job-relations` | `{fromJobId, toJobId, note}` | row; refused if self / duplicate / inactive |
| DELETE `/admin/maintenance/job-relations/:id` | — | — |

Errors return `{ error: "<plain sentence>" }` — the screens show it as-is.

## Layer 2 built (9 Nov 2026)

**Migration (local file; not applied on live in this pass):** [`supabase/migrations/20261110011234_engine_jobs_admin_rpc.sql`](supabase/migrations/20261110011234_engine_jobs_admin_rpc.sql) — `maintenance_job_retire_cascade`, `maintenance_job_section_members_set`, `maintenance_mjsg_reorder`, `maintenance_mjs_reorder` (service_role only).

Logbook (after apply on live):  
`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261110011234', 'engine_jobs_admin_rpc');`

**Server files**

| File | Role |
|---|---|
| [`supabase/functions/_fleet-server/maintenance_jobs_admin_routes.ts`](supabase/functions/_fleet-server/maintenance_jobs_admin_routes.ts) | V2–V6 Dominion write routes |
| [`supabase/functions/_fleet-server/maintenance_jobs_admin_helpers.ts`](supabase/functions/_fleet-server/maintenance_jobs_admin_helpers.ts) | Slug/op_code, mappers, refusal messages |
| [`supabase/functions/_fleet-server/maintenance_system_sections.ts`](supabase/functions/_fleet-server/maintenance_system_sections.ts) | V1 `buildSystemSections` |
| [`supabase/functions/_fleet-server/maintenance_master_routes.ts`](supabase/functions/_fleet-server/maintenance_master_routes.ts) | Register admin routes; V8 history `?kind=` |
| [`supabase/functions/_fleet-server/maintenance_routes.ts`](supabase/functions/_fleet-server/maintenance_routes.ts) | V1 GET sections; V7 `default_action`; `WO_LINE_ACTIONS` |
| [`supabase/functions/fleet-ops/routes.generated.json`](supabase/functions/fleet-ops/routes.generated.json) | Manifest refresh (141 routes) |

**Deno (Layer 2):** 20 passed, 0 failed — `maintenance_system_sections.test.ts` (7), `maintenance_jobs_admin_helpers.test.ts` (6), `maintenance_jobs_admin_routes.test.ts` (4), `maintenance_master_route_guards.test.ts` (3).

**Bundle:** `node scripts/build-edge-bundle.mjs fleet-ops` (not deployed).

**Still this layer / follow-up:** apply `20261110011234` on live before retire/members/order RPCs work; DM5 `historyPlainSentence` cases (plan V8 Vitest) not added in admin UI yet.
