# Powertrain job fit — audit (Rev 6, 15 Nov 2026)

**Goal in one sentence:** every screen that offers maintenance jobs for a car offers the jobs that fit that car's powertrain (petrol, diesel, hybrid, plug-in, electric…), using one clean, owner-confirmed powertrain value per car model and one fit rule per job, so that an electric car is never offered an oil change and a petrol car is never offered high-voltage work.

Everything below was checked in the code and on the live database on 15 Nov 2026. Method: `docs/how-we-build-playbook.md` (facts → findings with one fix → design → done-tests → Stitch → build in layers).

**Rev 6 changes (after the fifth review):**
- **`job_fit_count(p_job_id, p_overrides jsonb)`:** a missing key = the saved value, an array = that list, JSON null = "Same as group".
- **"All" on a job is stored as the full code list,** so "same as group", "all" and "a chosen list" stay three distinct states. Test 25 covers all three; test 27 added.
- **The "Not usual for this car" chip is grey,** with amber kept for High-voltage only.
- **The HV chip appears on every job card** (steps 2 and 3, Review, history), never on tiles. Test 26 covers hidden HV jobs and history.
- **The past-lines check is `live/powertrain-past-lines.sql`,** run by hand.
- **The count is debounced** at about 250 ms.
- **Assertions 12 / 13 are in order.** Test 9 is split between D1 (the function) and S1 (the route).
- **The playbook gets a golden rule** on optional parameters.

**Rev 5 changes (after the fourth review):**
- **Fleet "High-voltage" chip** on HV job cards in the picker (safety: visible before opening a job).
- **`job_fit_count`** (DB) feeds "Fits N of T car models (U not known yet)". It reuses `job_fits_car`'s helper, so no second copy of the rule; T = every model, `needs_check` included.
- **Test 2** checks the Fit's Electric A/C Compressor with the HV chip.
- **Every Stitch "Keep" element is now in section 4:** Show all in a group, Hide jobs that don't fit, the "You picked this" helper, the "N left" pill, the disagreement strip, Powertrain mix, Jobs that set their own, See which, the states, and the phone layout.
- **Re-run caveat** for hand-edited derived rows.
- **"Link this car" is a button.**
- **Assertion 11** is phrased as a formula; **assertion 13 added** (no mhev fits HV jobs).
- **Tests 25–26 added.**
- **Section 9:** rendering notes are separated from design drops.
- **The playbook's Step 4** says kept elements must be written into the plan's design section.

**Rev 4 changes (after the third review, all checked on live):**
- **`part_match.busy` is a session setting (GUC):** the trigger reads `current_setting('part_match.busy', true)`, so `SET LOCAL` works.
- **`maintenance_work_order_lines.component_id` is the job link** (`REFERENCES maintenance_service_categories(id)`).
- **Exact revision count:** 2,679 car rows + 47 job / group rows = **2,726**, with one UPDATE per table.
- **`is_high_voltage` can't be set on a group** (constraint on `kind`).
- **Electric A/C Compressor stays on Electrified, with the reason:** most full hybrids use a high-voltage electric compressor. Belt-driven ones get a per-model exception.
- **Alternator → ice only; Starter → ice, mhev.** Most mild hybrids replace the alternator with a belt starter-generator.
- **The past-lines check** reports "still doesn't fit" separately.
- **Notes added:** `fit_at_log = 'unknown'`, Rule 6, Rule 9's label, snapshot future-proofing, and the H2-ICE follow-up.

**Rev 3 changes (after the second review):**
- **Derivation:** re-checked engine_type on live. The rules now read engine_type by keyword. The 2 Hydrogen models say "Fuel Cell", so they're derived as fcev. "REEV" counts as a range-extender. **7 mild hybrids** get their own value, `mhev`. All 43 Petrol/Electric models place cleanly. Exact counts are in table 3a; `needs_check` falls from ≈33 to **12**.
- **Fit at save:** `fit_at_log` is also recomputed when an edit changes a line's job.
- **Spark-ignition preset** = petrol, cng (no hydrogen).
- **D1 backfill:** only touches rows that aren't confirmed and whose values actually differ, so a re-run changes nothing. A full snapshot spec has been added.
- **Charging Port Inspection & Cleaning:** stays non-HV, with the conditions written into its description.
- **Confirmed rows:** a text change re-asks the owner only if the derived answer changes. The trigger also watches `fuel_category`. The confirm columns are renamed `powertrain_last_confirmed_*`.
- **Schedule retire:** runs every night (it's idempotent).
- **New PT-11:** the existing car-model triggers (revision history, parts-year match) and how D1 handles them.
- Tests 18–22 added.

---

## 1. Facts (checked)

**Cars**
- Dominion's master list `vehicle_catalog` has **2,679 car models**, all `vehicle_class = 'car'`, each with a `platform_id` column (used by PT-9).
- `fuel_type` is free text with **11 values**: Petrol 1,802 · Electric 313 · Diesel 267 · Hybrid(petrol) 236 · Petrol/Electric 43 · CNG 8 · blank 5 · Hydrogen 2 · Hybrid(diesel) 1 · CNG/LNG 1 · Electric/Hybrid 1.
- `engine_type` is free text with **46 values**. On the models that matter for powertrain it says:
  - Electric: Electric 266, PMSM 17, BEV 13, blank 11, EV 4, Dual PMSM 2.
  - Hybrid(petrol): Hybrid 127, blank 43, PHEV 29, Hybrid(petrol) 13, EREV 12, Turbo 4, REEV 2, Turbo V8 Hybrid 2, Mild Hybrid 1, and 1 each of Turbo V6 Hybrid, Hybrid (2.0L), Turbo Hybrid.
  - Petrol/Electric: Range Extender 14, Hybrid 10, EREV 6, Twin-Turbo Hybrid 5, Plug-in Hybrid 4, Mild Hybrid 3, V12 Hybrid 1.
  - Petrol: Mild Hybrid 3 (the rest are engine shapes such as Turbo, V6, Inline-4).
  - Hydrogen: Fuel Cell 2.
- `fuel_category` is closer (Gas / Diesel / Electric / Hybrid / CNG / Hydrogen / Electric/Hybrid), but:
  - **6** Hybrid(petrol) models are filed as "Gas" (4 with blank engine_type, 2 "Turbo"): a real disagreement. 1 CNG and 1 CNG/LNG model are filed as "Gas", which isn't a disagreement ("gas" covers natural gas).
  - **1** Petrol model has no category: a category-hygiene note only. The rule places it as ice / petrol.
  - The **5** blank-fuel models have no category.
  - "Hybrid" lumps together normal hybrids, plug-ins, range-extenders and mild hybrids. Those need different jobs.
  - Parts code (`parts_finder.ts`, `vehicle_parts_context.ts`, `parts_auto_match_routes.ts` and others) already reads `fuel_category`, so changing its meaning would break parts matching.
- **Existing triggers on `vehicle_catalog`** (they fire on any backfill):
  - `mm_master_revision_vehicle_catalog`: after each row insert / update / delete, writes one `platform_revision` row (old / new).
  - `part_match_vehicle_catalog_years_upd`: statement-level. It only acts on production-year changes, but it first joins every changed row to its OE numbers through `part_match_oe_chain`. It returns at once when `part_match.busy = 'on'`.
  - `vehicle_catalog_engine_listings_sync`: fires only on an `engine_family_id` change.
  - `vehicle_catalog_one_maker_per_platform`.
  - `maintenance_service_categories` has `mm_master_revision_service_categories` (same revision writer) and `trg_msc_default_action_fill`.
- Fleet cars link to a model through `fleet.vehicles.vehicle_catalog_id` (text). Today: **2 cars, both linked**. 5179KZ Toyota Roomy = Petrol; 1505LM Honda Fit = Hybrid(petrol) / Hybrid.

**Jobs**
- `maintenance_service_categories` has 14 groups and 128 active jobs. **No column says which cars a job fits.**
- The Fleet Log service job lists come from `GET /maintenance-categories`, `/quick-jobs`, `/systems/:id/sections` and `/systems/:id/components` (`maintenance_routes.ts` ~1317–1420). **None of them takes the car, and none caches** (checked: no server-side cache or memo on these routes).
- A saved line's job **can** change on edit: `fleet_save_work_order` updates `component_id` when the line JSON has it.
- Screens that list jobs: Fleet `LogMaintenanceServiceDialog.tsx` + `LogServiceSystemPicker.tsx` (Log service), and Dominion's job admin. The Driver app doesn't list jobs. If it ever shows due items, it must use `job_fits_car` too.
- **Half a fix exists, unused:** `catalog_component_applicability` (scope, vehicle_catalog_id, platform_id, engine_family_id, component_id, applicable, reason, evidence_url). It has **0 rows**; only the Dominion schedule preview reads it.

**Schedules**
- 21 active global `maintenance_task_templates`, filtered only by `applicable_vehicle_classes` (every model is "car"). They include Engine oil, Spark Plugs, Engine Air Filter, Drive / Serpentine Belt, Transmission Fluid and Radiator Coolant Flush.
- Schedules are **stored rows**: `vehicle_component_schedule` has 59 (active 25, odometer_needed 25, no_rule 9), all on the 2 Fleet cars. **7 server files read it directly.** `schedule_status` already allows `'retired'`.

---

## 2. Findings (one fix each)

**PT-1 (High). Log service offers every job to every car.**
**Fix:** each job-list route takes `vehicleId` and returns every job with `fits: 'yes' | 'no' | 'unknown'`. Fleet shows the fitting jobs and hides the rest behind "Show all jobs". There's **no confirmation dialog** for logging a hidden job; the chip is the only signal.

**PT-2 (High). There is no trustworthy powertrain value per car model.**
**Fix:** new controlled columns on `vehicle_catalog`, filled by the rules in 3a:
- `powertrain`: `ice`, `mhev` (mild hybrid: 48V, no high-voltage drive battery), `hev`, `phev`, `erev`, `bev`, `fcev`;
- `fuel`: `petrol`, `diesel`, `cng`, `hydrogen`, `electric` (what the car runs on);
- `powertrain_status`: `derived`, `confirmed`, `needs_check`;
- `powertrain_note`, `powertrain_last_confirmed_by`, `powertrain_last_confirmed_at`.

The original text columns stay untouched ("capture, never gate"). Rows the rules can't place are `needs_check` and go to a Dominion list for the owner.

**PT-3 (High). Jobs have no fit rule.**
**Fix:** `fits_powertrains text[]` and `fits_fuels text[]` on `maintenance_service_categories`. **Inheritance is per column:** a job's non-NULL value is used; NULL takes the group's value; NULL on the group too means "any". **Empty arrays are refused by a constraint** (a job that fits nothing is retired instead). Each element is constrained to the code lists above. A job fits when the car's powertrain is in the effective powertrain list **and** its fuel is in the effective fuel list. **Every job not named in section 5's overrides inherits its group's values.**

**PT-4 (High). Schedules would put combustion jobs on electric cars, and wrong stored rows would stay visible to the 7 readers.**
**Fix:** (1) the schedule builder skips any job where `fits = 'no'`; (2) **every nightly run** (not one-time) sets `schedule_status = 'retired'` and `retired_reason = 'Job doesn''t fit this car''s powertrain'` on any stored row whose job is `fits = 'no'` for its car and isn't already retired. It's idempotent: retired rows aren't touched again. That also catches any row made later by a bug. Rows are never deleted, and `unknown` never retires anything. Expected on live today: **0** rows (both cars' 59 rows fit).

**PT-5 (High, safety). "High-voltage" isn't defined anywhere, and HV jobs are offered to petrol and diesel cars.**
**Fix:** `is_high_voltage boolean NOT NULL DEFAULT false`, true on exactly these **10 jobs**: HV Battery Health Check, HV Battery Module Replacement, HV Battery Pack Replacement, HV Cable & Insulation Resistance Inspection, HV Cable / Connector Replacement, Charging Port, On-Board Charger, DC-DC Converter, Traction Motor, Electric A/C Compressor. The HV lockout checklist keys off this flag only. The 8 non-HV jobs in the group stay false. **Groups can't carry it:** constraint `CHECK (kind = 'component' OR is_high_voltage = false)` (`kind` is 'system' for groups, 'component' for jobs), and the flag doesn't cascade.
- **Electric A/C Compressor** fits Electrified (hev included) on purpose. Most full hybrids (Toyota, Honda, Hyundai / Kia; the Honda Fit hybrid in this fleet is one) use a high-voltage electric compressor, so hiding it from hevs would hide real HV work. A hybrid with a belt-driven compressor gets a per-model exception (`applicable = false`, reason "belt-driven compressor"). Its description gains: "Belt-driven compressors (petrol cars, a few hybrids) aren't this job; use the conventional A/C Compressor job once the HVAC file adds it."
- **Charging Port Inspection & Cleaning** is non-HV *by its scope*. Its description gains: "Visual check and pin cleaning with the car switched off and unplugged; the port housing stays closed. If the housing has to be opened, that's high-voltage work: log Charging Port and follow lockout." The owner (Deeki T, the safety owner on the Open list) can flip the switch in Dominion.
- Checked: none of the 8 non-HV jobs carries a "lockout first" hint. Only Fan & Duct Cleaning's description mentions lockout, conditionally ("if the cover comes off"), which is correct. So no hint text changes.

**PT-6 (Medium). Diesel cars are offered spark-plug jobs; petrol cars are offered DPF / AdBlue / glow-plug jobs.**
**Fix:** `fits_fuels` (section 5). **Spark-ignition = petrol, cng.** Hydrogen is left out on purpose. If a hydrogen-combustion model is ever confirmed, `hydrogen` is added to those jobs at that point. Diesel-only jobs are diesel.

**PT-7 (Medium). A car with no model link, or a `needs_check` model, has an unknown powertrain.**
**Fix:** `fits = 'unknown'` for every job. Fleet shows all jobs with the banner "We don't know this car's engine type yet. Showing every job." and a "Link this car" button. Never hide jobs on a guess. **The same applies if the fit lookup itself fails** (network or server error): Fleet shows every job with "Couldn't check which jobs fit this car. Showing every job." and a "Try again" button (added with the Stitch prompt, 15 Nov).

**PT-8 (Medium). Old services must never disappear or be refused, and history must not be relabelled when rules change.**
**Fix:** the fit rule only filters job pickers and schedules. History, edits and the save path never refuse anything. `maintenance_work_order_lines.fit_at_log text` ('yes' | 'no' | 'unknown'; NULL for lines saved before this work) is set by `fleet_save_work_order` **when a line is inserted, and when an update changes the line's `component_id`** (the line's job: `REFERENCES maintenance_service_categories(id)`, checked), and at no other time. A quantity, price or note edit keeps the value frozen. On a car whose fit is 'unknown' (unlinked or `needs_check`), lines save as `'unknown'`, so there's **no chip, by design**: no false "not usual" when the app doesn't know. The "Not usual for this car" chip reads `fit_at_log = 'no'` only. The read-only check reports two numbers: "N lines were logged as not usual; M of them still don't fit today". M is the action list. N − M are lines where a rule has since been widened.

**PT-9 (Low). Per-model exceptions have no use yet.**
**Fix:** `catalog_component_applicability` is a **full override, checked first**: a row for (job, model), else (job, the model's `platform_id`), decides. `applicable = true` → 'yes', `false` → 'no'. It can widen or narrow. With no row, the powertrain / fuel rule applies. Filled only when needed.

**PT-10 (Low). "Fits" must mean the same thing everywhere, and stay fast.**
**Fix:** one function, `public.job_fits_car(p_vehicle_catalog_id uuid, p_job_ids uuid[] DEFAULT NULL) RETURNS TABLE (job_id uuid, fits text)`:
- one row per job (every active job when `p_job_ids` is NULL);
- NULL ids inside the array are skipped;
- order: (1) NULL / unknown / `needs_check` model → 'unknown'; (2) exception (PT-9); (3) effective lists (PT-3);
- STABLE, `GRANT EXECUTE` to service_role only, with the comment "Assumes vehicle_class = 'car'. Extend when other classes are added."

No TypeScript copy of the rule. One call per page. A future fleet-wide due-items view across N cars should call it once per distinct model, not per car, or get a multi-model variant then. Not needed at 2 cars.

**PT-11 (Medium, new). The D1 backfill fires the existing car-model triggers on ~2,667 rows.**
**Fix:** in the D1 transaction:
- `SET LOCAL part_match.busy = 'on'`, so the parts-year trigger returns at once. (Checked: it's a session setting, not a table row. The trigger function opens with `IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN RETURN NULL`, before any join.) Years don't change, so it would do nothing useful anyway, but it would still join every row to its OE numbers.
- The revision trigger stays **on**: each changed model gets one honest `platform_revision` row (≈2,667), counted by DRYRUN assertion 11.
- The engine-listings trigger doesn't fire (`engine_family_id` doesn't change).
- The backfill is one UPDATE statement, and touches only rows whose values change (3c).

---

## 3. Car powertrain

### 3a. Derivation rules (exact counts from live, 15 Nov)

The rules are checked in this order. engine_type keywords are case-insensitive "contains" matches.

| # | Rule | powertrain | fuel | status | models |
|---|---|---|---|---|---|
| 1 | fuel_type blank, or Electric/Hybrid | — | — | **needs_check** | 5 + 1 |
| 2 | Hybrid(petrol) with fuel_category "Gas" (disagreement) | — | petrol | **needs_check** | 6 |
| 3 | engine_type contains "mild" | mhev | petrol (diesel if fuel_type says diesel) | derived | 7 (Petrol 3, Hybrid(petrol) 1, Petrol/Electric 3) |
| 4 | Electric | bev | electric | derived | 313 |
| 5 | Hydrogen + engine_type contains "fuel cell" | fcev | hydrogen | derived | 2 |
| 6 | Hydrogen, anything else | — | hydrogen | **needs_check** | 0 today; kept so a future hydrogen-combustion model lands in the list instead of being guessed |
| 7 | Hybrid(petrol) / Petrol/Electric + engine_type contains "phev" or "plug-in" | phev | petrol | derived | 33 (29 + 4) |
| 8 | Hybrid(petrol) / Petrol/Electric + engine_type contains "erev", "reev" or "range extender" | erev | petrol | derived | 34 (12 + 2 + 20) |
| 9 | Hybrid(petrol) / Petrol/Electric, anything else | hev | petrol | derived | 202 (186 + 16); petrol hevs only, the diesel one is rule 10 (hev total 203) |
| 10 | Hybrid(diesel) | hev | diesel | derived | 1 |
| 11 | Petrol | ice | petrol | derived | 1,799 |
| 12 | Diesel | ice | diesel | derived | 267 |
| 13 | CNG, CNG/LNG | ice | cng | derived | 9 |
| | **Total** | | | | **2,679** (needs_check **12**) |

**Verified 15 Nov by running these exact rules as a read-only query on live:** ice 2,075 · bev 313 · hev 203 · erev 34 · phev 33 · needs_check 12 · mhev 7 · fcev 2 = 2,679; Roomy → ice, Honda Fit → hev (its fuel_category is "Hybrid", so no disagreement). Hybrid(petrol) 236 = phev 29 + erev 14 (EREV 12, REEV 2) + mhev 1 + needs_check 6 + hev 186. Petrol/Electric 43 = erev 20 + phev 4 + mhev 3 + hev 16. The D1 check query prints this exact split; the doc and the query must agree. New models added later are derived on save, and land in the list if no rule places them.

The Fleet cars today: Roomy → ice / petrol (rule 11); Honda Fit → hev / petrol (rule 9). The owner confirms them first, as the real test.

### 3b. `powertrain_status` transitions

The trigger runs on insert, and on update of `fuel_type`, `engine_type` or `fuel_category`. An owner confirm or edit in Dominion goes through its own route.

| From | Event | To | powertrain / fuel | last_confirmed_by / at, note |
|---|---|---|---|---|
| (new row) | rule places it | derived | rule's values | — |
| (new row) | no rule places it | needs_check | NULL (fuel kept if known) | — |
| derived | text change, rule places it | derived | new values | — |
| derived | text change, no rule places it | needs_check | NULL | — |
| needs_check | text change, rule places it | **derived** (leaves the list) | rule's values | — |
| needs_check | text change, still unplaced | needs_check | NULL | — |
| confirmed | text change, **rule gives the same values** | **confirmed** | unchanged | kept; note cleared |
| confirmed | text change, rule gives different values or none | **needs_check** | kept (shown as "last confirmed") | kept; note "Text changed after confirmation: please re-confirm" |
| any | owner confirms / edits in Dominion | confirmed | owner's values | set to the owner / now; note cleared |

Column comment on `powertrain_last_confirmed_by / _at`: "The last time the owner confirmed this model's powertrain. On a needs_check row this is history, not the current state." A `confirmed` row is never overwritten by a re-derive. While a row is `needs_check`, `job_fits_car` returns 'unknown' for it.

### 3c. D1 backfill (idempotent)

One UPDATE that computes the rule's values and writes **only** where the row isn't confirmed and something differs:
`UPDATE vehicle_catalog SET powertrain = r.powertrain, fuel = r.fuel, powertrain_status = r.status FROM (rule) r WHERE r.id = vehicle_catalog.id AND vehicle_catalog.powertrain_status IS DISTINCT FROM 'confirmed' AND (vehicle_catalog.powertrain, vehicle_catalog.fuel, vehicle_catalog.powertrain_status) IS DISTINCT FROM (r.powertrain, r.fuel, r.status);`

The derivation trigger is created **after** the backfill, in the same transaction, so they never fight. A second run of the whole D1 file changes **0** rows and adds **0** revision rows (assertion 10).

**Re-run caveat (written in the D1 file's header too):** a re-run puts back the rule's values on any `derived` row that was edited by hand since the first run (the `IS DISTINCT FROM` set catches it), and assertion 10 then reports that row by id. That's intentional. To keep a hand-set value, confirm the model (`confirmed` rows are never touched by a re-derive).

**One UPDATE per table, so one revision row per changed row:**
- **Cars:** the new columns are added nullable with no default, so on the first run **every one of the 2,679 rows** changes (the 12 `needs_check` rows too: status NULL → needs_check, and fuel where known). After the backfill, `powertrain_status` becomes `NOT NULL`.
- **Jobs and groups:** one UPDATE … FROM (VALUES …) carrying every column D1 sets on that row (`fits_powertrains`, `fits_fuels`, `is_high_voltage`, and the 2 description additions). It's **targeted**: only rows section 5 / PT-5 name. Rows that inherit keep NULL, so NULL = inherit survives D1. That's exactly **47 rows**: 5 groups (Engine, Belts & hoses, Transmission, Exhaust & emissions, Hybrid & electric); 35 job overrides (Engine 6, Filters 3, Fluids 3, Exhaust 10, Hybrid & electric 10, HVAC 1, Battery & electrical 2); and 7 more HV jobs that set only `is_high_voltage` (HV Battery Health Check, Module, Pack, Insulation Inspection, HV Cable, DC-DC Converter, Traction Motor; the other 3 HV jobs are already among the overrides). The 2 description changes (Charging Port Inspection & Cleaning, Electric A/C Compressor) are on rows already counted.
- **Expected new `platform_revision` rows on the first run = 2,679 + 47 = 2,726; on a re-run = 0.** The DRYRUN computes the number from the VALUES lists and asserts it equals the rows actually changed.

---

## 4. Design

### Database
- `vehicle_catalog`: `powertrain`, `fuel`, `powertrain_status`, `powertrain_note`, `powertrain_last_confirmed_by`, `powertrain_last_confirmed_at` (check-constrained), plus the trigger from 3b.
- `maintenance_service_categories`: `fits_powertrains`, `fits_fuels` (non-empty, elements constrained), `is_high_voltage NOT NULL DEFAULT false`, with column comments.
- `maintenance_work_order_lines.fit_at_log` (PT-8, insert + job change only).
- `vehicle_component_schedule.retired_reason` (PT-4).
- `public.job_fits_car(...)` (PT-10).
- The read-only `fit_at_log = 'no'` check (PT-8) is a SQL file, **`docs/service-items-build/live/powertrain-past-lines.sql`**, that the owner runs by hand. It prints the two numbers and the lines behind M. A Dominion screen for it is a future item on the Open list.
- **"All" on a job is stored as the full code list, never as NULL.** On a job, NULL already means "Same as group". So the drawer's **All** preset saves every powertrain code (`{ice,mhev,hev,phev,erev,bev,fcev}`) or every fuel code, and **Same as group** saves NULL. On a group, All saves NULL (= any). The drawer shows a job's full list as "All" again when it reads it back. That keeps three distinct states on a job: same as group (NULL), all (full list), and a chosen list.
- **`public.job_fit_count(p_job_id uuid, p_overrides jsonb DEFAULT NULL) RETURNS TABLE (fits int, unknown int, total int)`** for the Dominion drawer's "Fits N of T" line. It's **one set-based query** over all models, using the **same internal helper as `job_fits_car`** (effective-list resolution, then the exception lookup), so there's no second copy of the rule, in TypeScript or SQL.
  - `fits` = models where the answer is 'yes'; `unknown` = 'unknown' (the `needs_check` ones); `total` = `count(*) FROM vehicle_catalog`, every model including `needs_check`.
  - **`p_overrides` previews unsaved edits.** A **missing key** = use the job's saved value. Key present with an **array** = that list. Key present with **JSON null** = "Same as group" (NULL on the job). Example: `{"fits_fuels": ["petrol"]}` previews a fuels-only change; `{"fits_powertrains": null}` previews going back to the group. Allowed keys: `fits_powertrains`, `fits_fuels`; anything else, or an empty array, raises `job_fit_count_bad_override`.
  - One call per drawer open or per (debounced) change; 2,679 models × one job is fast, no cache.

### Server
- The four Fleet job-list routes accept `vehicleId` and add `fits` (one `job_fits_car` call per request). Without `vehicleId`, they behave as today.
- The schedule builder skips `fits = 'no'`, and runs the nightly retire (PT-4).
- `fleet_save_work_order` sets `fit_at_log` (PT-8).
- Dominion: set a model's powertrain / fuel (→ confirmed), list `needs_check` models, set a group's / job's `fits_*` and `is_high_voltage`.

### Screens (every screen and button)
**Fleet: Log service, step 2 "Work done"** (Fleet is responsive; every screen has a 390px phone layout, as the service-items screens do):
- The car strip shows a **powertrain pill** ("Petrol", "Hybrid", "Electric"…, or "Engine type unknown").
- Only fitting jobs. Groups with none are removed and the grid closes up. Each group tile shows its count of fitting jobs.
- **"Show all jobs (N hidden)"** at the bottom of the group grid, and **"Show all jobs in this group (N hidden)"** inside a group, where N = hidden **jobs**. Pressed, it reveals the hidden jobs under a **"Not usual for this car" divider**, greyed, each with a **grey** "Not usual for this car" chip (info icon), still tickable with **no dialog**. Grey, not amber: amber is kept for "High-voltage" alone, so a hidden HV job shows one grey chip and one amber chip, never two amber ones. The button then reads **"Hide jobs that don't fit"**, and pressing it hides them again (a ticked hidden job stays ticked and visible).
- **High-voltage chip:** every job with `is_high_voltage = true` shows a small amber **"High-voltage"** chip (lightning icon, the same amber as Dominion's switch) on every **job card**, wherever it appears: step 2 (normal or hidden), step 3, Review and Service history. Group tiles don't carry it, because a group can mix HV and non-HV jobs. So a person choosing between "Charging Port" and "Charging Port Inspection & Cleaning" sees which one is HV before opening either.
- **Unknown banner** with a **"Link this car" button** (a real button, not a text link); all jobs shown; no "Show all" button (nothing is hidden).
- **Couldn't check banner:** "Couldn't check which jobs fit this car. Showing every job." with a **"Try again"** button (PT-7).
- Step 3: a job card with `fit = 'no'` shows the chip in its header and the helper "You picked this from all jobs. It's saved as normal."
- Review / Service history: a line with `fit_at_log = 'no'` keeps its chip.

**Fleet: maintenance overview / due items:** no new controls; non-fitting jobs stop appearing.

**Dominion: car model page:** a "Powertrain" row showing the value, fuel and status ("Worked out from 'Hybrid(petrol) / PHEV'", "Confirmed by … on …", or "Text changed after confirmation: please re-confirm"), with an **Edit** button (two selects + Save / Cancel).

**Dominion: "Powertrain to check" list:** the 12 `needs_check` models (and future ones), each with its raw `fuel_type` / `engine_type` / `fuel_category`, two selects and **Confirm** (enabled once both are chosen). A **"N left"** count pill at the top. A model in the list because its data disagrees gets a **disagreement strip** naming the two values, e.g. "The data disagrees: fuel type says Hybrid(petrol), category says Gas." A confirmed row shows "Confirmed: Hybrid · Petrol" and fades out of the list. States: loading, "Every car model is confirmed" (empty), and "Couldn't save this. Try again." with a red-outline **Try again** button.

**Dominion: Vehicles home:** a **"Powertrain to check"** card (the count, with a **Review** button) and a **"Powertrain mix"** card: one horizontal bar split by powertrain, each segment labelled with its plain name and count (today the 3a counts), read from `vehicle_catalog` when the page loads.

**Dominion: job and group drawer:** a "Fits" row with presets, never raw arrays:
- Powertrain: **All / Combustion / Electrified / Plug-in / Custom…**;
- Fuel: **All / Petrol / Diesel / Spark-ignition / Custom…**;
- **Custom…** opens a row of checkbox chips, one per code, with plain labels ("Mild hybrid", "Plug-in hybrid"…);
- on a job, each row also has **"Same as group"** (the default, showing the group's preset name);
- on a job only, a **"High-voltage work"** switch (setting it adds the amber chip to the drawer header); groups have no switch;
- the line **"Fits N of T car models (U not known yet)"** from `job_fit_count`, updating as choices change (debounced about 250 ms; the last known number stays shown, softly faded, until the new one arrives), with a **"See which"** button that opens a simple list of the matching models; if the count can't load: "Couldn't count right now" with a **Retry** button;
- on a **group** drawer, the presets are shown as four large cards (All cars / Combustion / Electrified / Plug-in) plus **Custom…**, and a read-only list **"Jobs that set their own"** (each job in the group with a non-NULL `fits_*`, and its value in plain words).

Stitch screens: the Dominion car-model row, the "Powertrain to check" list, the "Fits" row (presets + Custom chips + HV switch), and the Fleet step-2 states. The owner makes them (one file per app); the prompt is written after review.

### Gates
- `pnpm test:service-items` + the new tests; `/code-review` before push; live SQL as a generated, hash-stamped DRYRUN (6b) then the real file with its logbook line; the owner confirms the two Fleet cars before the flag goes on.
- Flag `job_fit_filter`, global, off by default. A per-organisation flag is a future consideration.

---

## 5. Starting fit values

Presets: **Combustion** = ice, mhev, hev, phev, erev. **Electrified** = hev, phev, erev, bev, fcev (not mhev: no high-voltage drive battery). **Plug-in** = phev, erev, bev. **Spark-ignition** (fuel) = petrol, cng. "—" = NULL. **Every job not named under "Job overrides" inherits its group's values (PT-3).**

| Group | fits_powertrains | fits_fuels | Job overrides |
|---|---|---|---|
| Engine | Combustion | — | Spark Plugs, Spark Plug Wires, Ignition coil, Throttle Body Cleaning / Relearn, Carburetor Cleaning → fuels Spark-ignition. |
| Filters | — | — | Oil filter, Engine Air Filter, Fuel filter → Combustion. |
| Fluids | — | — | Engine oil (both rows), Radiator Coolant Flush → Combustion. |
| Belts & hoses | Combustion | — | — |
| Transmission | ice, mhev, hev, phev, erev | — | (BEVs and FCEVs use Reduction Gear Oil Change.) |
| Exhaust & emissions | Combustion | — | DPF ×2, SCR / AdBlue ×2, NOx, Glow Plugs, EGT, DPF Pressure Sensor → fuels diesel. EVAP / Charcoal Canister, Purge Valve → fuels petrol. |
| Hybrid & electric | Electrified | — | Charging Port, Charging Port Inspection & Cleaning, On-Board Charger → Plug-in. Battery Thermal Management Coolant Service, Battery Coolant Pump → phev, erev, bev. HV Battery Cooling Fan Filter / Fan & Duct Cleaning → hev, phev. Inverter Coolant Service / Pump → hev, phev, erev. Reduction Gear Oil Change → bev, erev, fcev. |
| HVAC | — | — | Electric A/C Compressor → Electrified. |
| Battery & electrical | — | — | **Alternator → ice. Starter motor → ice, mhev.** Full hybrids use the motor-generator for both. Most mild hybrids replace the alternator with a belt starter-generator but keep a 12V starter. A per-model exception handles the rest (an mhev with an integrated starter-generator, or a full hybrid with a 12V starter). |
| Tires & wheels, Brakes, Suspension & steering, Lighting & visibility, Shop fees | — | — | — |

`is_high_voltage = true`: the 10 jobs in PT-5.

---

## 6. Tests

### 6a. Done-tests (written before the build)

1. Roomy (ice / petrol): Engine and Exhaust & emissions shown (no DPF / AdBlue / glow plugs); no Hybrid & electric group; no Electric A/C Compressor; the list closes up.
2. Honda Fit (hev / petrol): Engine and Hybrid & electric shown; no Charging Port, On-Board Charger, Reduction Gear Oil Change, Alternator or Starter motor. **HVAC shows Electric A/C Compressor with the "High-voltage" chip** (the Fit has an HV electric compressor). There is no conventional A/C Compressor job yet (HVAC-file follow-up), so a belt-driven compressor can't be logged as its own job on any car today.
3. A bev model: no Engine group, Engine oil, Spark Plugs or Transmission Fluid; Charging Port and Reduction Gear Oil Change present; Brakes, Tires and A/C present.
4. A diesel model: DPF, AdBlue and glow plugs present; Spark Plugs and EVAP absent.
5. "Show all jobs (N hidden)": N = hidden jobs. A hidden job can be ticked with no dialog, saved with `fit_at_log = 'no'`, and shown in history with the chip. "Hide jobs that don't fit" hides them again, except a ticked one, which stays visible.
6. No model link, or a `needs_check` model: every job shown, plus the banner.
7. Schedules: a bev car gets no Engine oil / Spark Plugs / Transmission Fluid due items; the Roomy's due items don't change; the nightly retire on live retires 0 rows; a second night retires 0 again.
8. Saving or editing an old service never fails or loses a line; old lines keep `fit_at_log = NULL`.
9. `job_fits_car` = route `fits` for every job on **6 models**: ice / petrol (Roomy), ice / diesel, hev / petrol (Fit), phev / petrol, bev, and a `needs_check` model (all 'unknown').
10. Every row of transition table 3b, including "confirmed + text change with the same derived values → stays confirmed".
11. Flag off → step 2 is exactly today's list.
12. Migration check: the 3a split, exactly.
13. Unlinked car: every route returns 'unknown' for every job, with no error.
14. Inheritance: NULL / NULL → group's values; powertrains set + fuels NULL → job's powertrains + group's fuels; the reverse; both set → job's both; `'{}'` → refused.
15. Exceptions: a model row false → 'no' on a fitting job; true → 'yes' on a non-fitting job; a model row beats a platform row.
16. Frozen fit: a line saved 'no' stays 'no' after the rule changes; **editing a saved line from a fitting job to a non-fitting job sets it to 'no'**; editing its quantity doesn't change it.
17. HV flag: exactly the 10 PT-5 jobs, and no group row.
18. `job_fits_car` with NULLs inside `p_job_ids`: returns rows for the real ids, skips the NULLs, with no error.
19. **Re-run:** running the whole D1 file twice → the second run changes 0 car rows, 0 job rows, 0 confirmed rows, and adds 0 `platform_revision` rows.
20. `fuel_category`-only update (e.g. correcting a Gas hybrid to Hybrid) → the trigger fires and the row moves `needs_check` → derived hev.
21. A mild hybrid (`mhev`) gets Engine and Starter motor jobs, and **no** Alternator, Hybrid & electric or Electric A/C Compressor jobs.
22. **`part_match.busy` really suppresses the trigger:** on the local copy, wrap the backfill in a test that counts `part_match_oe_chain` calls (or temporarily raises inside it) with `SET LOCAL part_match.busy = 'on'` → 0 calls; without the setting → > 0. If the mechanism ever changes (a setting becomes a table row), this test fails with "part_match.busy no longer suppresses the year trigger".
23. **No group carries `is_high_voltage`:** the constraint refuses `UPDATE … SET is_high_voltage = true WHERE kind = 'system'`, and the HV checklist query reads jobs only.
24. **The past-lines check** returns both numbers (logged as not usual / still don't fit) on a fixture where one rule was widened after logging.
25. **`job_fit_count`** equals `count(*)` of models where `job_fits_car` = 'yes' (and 'unknown') for 4 fixture jobs: an inheriting job, an overriding job, a job with a model exception, and a job where both the job and its group are NULL / NULL (expected: fits = 2,679 − 12 = 2,667, unknown = 12, total = 2,679). `p_overrides` gives the same count as saving those values and calling it again. **The three override states differ:** for a job saved as `fits_powertrains = {hev}` in the Hybrid & electric group (Electrified), (a) no override → the hev count (203); (b) `{"fits_powertrains": null}` → the group's Electrified count (585); (c) `{"fits_powertrains": [all 7 codes]}` → every placed model (2,667). An empty array or an unknown key raises `job_fit_count_bad_override`.
26. **Fleet HV chip:** on the Honda Fit, Electric A/C Compressor and the HV jobs in Hybrid & electric show "High-voltage"; Cooling Fan Filter and Charging Port Inspection & Cleaning don't. **On the Roomy, "Show all jobs" → every hidden HV job shows the amber "High-voltage" chip next to the grey "Not usual for this car" chip. Logging one → step 3, Review and Service history show both.** Group tiles never show the HV chip.
27. **"All" on a job** saves the full code list (not NULL), reads back as "All", and differs from "Same as group" in `job_fit_count`.

### 6b. DRYRUN assertions (D1 live SQL; generated, hash-stamped always-stop copy)

**Snapshot taken first** (temp tables, before any change):
- `vehicle_catalog`: id + `md5(to_jsonb(row) - ARRAY['powertrain','fuel','powertrain_status','powertrain_note','powertrain_last_confirmed_by','powertrain_last_confirmed_at'])`. The new columns don't exist yet, so the snapshot is the whole row, compared after on everything except those 6.
- `maintenance_service_categories`: id + `md5(to_jsonb(row) - ARRAY['fits_powertrains','fits_fuels','is_high_voltage','description'])`, plus the full `description` of the **2** rows whose description D1 changes (Charging Port Inspection & Cleaning, Electric A/C Compressor), each checked as exactly old + its new sentence.
- Row counts + `md5(string_agg(to_jsonb(t)::text ORDER BY id))` for `vehicle_component_schedule`, `maintenance_work_order_lines` (minus `fit_at_log`), `catalog_component_applicability`, `maintenance_task_templates`, `maintenance_work_order_line_item`.
- `count(*) FROM platform_revision`.
- **Future-proofing:** the exclusion lists name exactly the columns D1 adds or sets. Any column added to `vehicle_catalog` or `maintenance_service_categories` after D1 must be added to these lists in the D1 file before it's re-run, or `changed_other` fails on every re-run. The D1 file's header says so.

**Assertions** (stop with "Stopped, nothing saved: <check> on <ids>" on failure, before COMMIT):
1. `powertrain IS NULL AND powertrain_status <> 'needs_check'` = 0.
2. The split equals 3a: needs_check 12 (blank 5, Electric/Hybrid 1, Gas disagreement 6), mhev 7, bev 313, fcev 2, phev 33, erev 34, hev 203, ice 2,075.
3. Every powertrain / fuel / `fits_*` element is a known code; 0 bad rows.
4. No empty `fits_*` array.
5. Roomy's model = ice / petrol / derived; Fit's model = hev / petrol / derived.
6. `is_high_voltage = true` on exactly the 10 named job codes.
7. `job_fits_car(Roomy)` → 'no' for every Hybrid & electric job and 'yes' for Engine oil; `job_fits_car(Fit)` → 'yes' for Inverter Coolant Service, 'no' for Charging Port and Alternator.
8. Schedule rows the retire rule would touch = 0 (printed).
9. `changed_other` = 0 across every snapshot above (other columns, other tables, other descriptions).
10. **Idempotency:** the backfill's `IS DISTINCT FROM` set, re-evaluated after the UPDATE, is empty (a re-run would change 0 rows).
11. New `platform_revision` rows = car rows changed + job rows changed, as counted by the UPDATEs themselves (`GET DIAGNOSTICS … ROW_COUNT`). Expected today: 2,679 + 47 = 2,726 on the first run, 0 on a re-run. The message prints all three numbers.
12. `is_high_voltage = true` on 0 group rows.
13. **No mild hybrid fits any Hybrid & electric job or Electric A/C Compressor:** `count(*)` of (mhev model × those jobs) where `job_fits_car` = 'yes' = 0.

---

## 7. Build rounds

1. **D1 (Cursor):** columns, derivation (3a), backfill (3c) then the trigger (3b), `fits_*` + `is_high_voltage` + starting values (5), `fit_at_log`, `retired_reason`, `job_fits_car`, `job_fit_count`, `part_match.busy` (PT-11); SQL tests 10, 12, 14–23, 25, 27 (and test 9's function half: `job_fits_car` on the 6 models; the route half runs in S1). Live via the generated DRYRUN (6b) + real file + logbook line.
2. **S1 (Cursor):** routes take `vehicleId` and return `fits`; schedule skip + nightly retire; `fit_at_log` in `fleet_save_work_order` (insert + job change); Dominion routes; flag; server tests 7, 8, 9 (route = function), 13, 24.
3. **Stitch (owner):** the screens in section 4.
4. **UI1 (Claude):** Dominion car-model row, "Powertrain to check", "Fits" row with presets / Custom chips / HV switch.
5. **UI2 (Claude):** Fleet step 2; click-throughs 1–6, 11, 26.
6. **Live:** the owner confirms the two Fleet cars and the 12 `needs_check` models, flag on, real check on both cars.

---

## 8. Not in this work

- Motorcycles / trucks (`job_fits_car`'s comment marks where to extend).
- Changing `fuel_type`, `engine_type` or `fuel_category` (parts code keeps using `fuel_category`).
- Bulk per-model exceptions.
- The HV lockout checklist itself (it reads `is_high_voltage`).
- A per-organisation `job_fit_filter` flag.
- A multi-model `job_fits_car` for a fleet-wide due-items view (PT-10 note).

**Follow-ups recorded on the service-items audit Open list:**
- **When a hydrogen-combustion (H2-ICE) model is first confirmed:** add `hydrogen` to the Spark-ignition preset's jobs (Spark Plugs, Spark Plug Wires, Ignition coil, Throttle Body, Carburetor), and decide whether H2-ICE needs a fuel value of its own.
- **The conventional A/C Compressor job** (HVAC file) is the home for belt-driven compressors, including hybrids with a per-model exception on Electric A/C Compressor.

---

## 9. Stitch screens received (15 Nov) — Keep / Drop / Add

Files: `docs/stitch/powertrain-job-fit-fleet/html/01–10` and `docs/stitch/powertrain-job-fit-dominion/html/01–10` (HTML + PNG, numbered as the prompts). **Stitch = the look; this audit = the content.** Checked by eye and by searching each HTML file for the required elements: all 20 screens contain their key elements. The PNGs of Fleet 1 / 3 and Dominion 7 / 8 / 9 are cut off only because Stitch drew a fixed-height inner scroll area; the port uses the real dialog / drawer layout, so the clipping doesn't carry over.

**Every screen, Drop:** invented data and controls, i.e. engine codes ("1.0L 1KR-FE"), VINs, "auto-detection confidence", "data pipeline / batch", "Export CSV", filter / sort / paging on the check list, "telemetry" text, invented jobs and job counts (e.g. O2 sensors and a heat shield in Exhaust, "Tires & wheels 12 jobs"), sidebar items that don't exist ("Powertrains", "HV & Battery", "Fleet Allocations"…), the "Catalytic" chip, and every text link ("Undo", "Inspect raw feed": real buttons or nothing).
**Rendering notes (not design decisions):** Dominion screens 1–6 don't load Inter, so they render serif; the port uses the app's font. The cut-off PNGs come from Stitch's fixed-height inner scroll area; the port uses the real dialog / drawer.
**Every Keep below is now written into section 4 (Rev 5)**, so section 4 is the one spec UI1 / UI2 build against. Section 9 only records where each element came from.
**Add (missing from Stitch):** the amber "High-voltage" chip on every Fleet screen that shows a job card (2, 3, 4, 6, 7, 8); group tiles (1, 5, 10) don't carry it, because a group can mix HV and non-HV jobs. **Change:** the "Not usual for this car" chip is grey, not Stitch's amber, so a hidden HV job never shows two amber chips (section 4).
**Every screen, Keep:** card / drawer / dialog shapes, spacing, chip styles (powertrain chips, "Needs checking", "Confirmed", amber "High-voltage work", amber "Not usual for this car"), the button styles (red outline Cancel, one solid primary), and the layouts below.
**Content always comes from this audit:** real group names and job counts from live, real "Fits N of 2,679" numbers (2,084 Spark Plugs / 380 Charging Port / 585 Hybrid & electric group, all matching the screens), and the 12 real `needs_check` models.

| # | Fleet screen | Keep | Drop / change |
|---|---|---|---|
| 1 | Step 2 petrol | car strip + powertrain pill, group tile grid, "Show all jobs (26 hidden)" | the "13 Groups" box and engine code; use real per-group counts |
| 2 | Inside a group | group breadcrumb, job cards with action pill + tick, "Show all jobs in this group (8 hidden)" | invented jobs; list = the real fitting jobs |
| 3 | Show all opened | "Not usual for this car" divider + greyed cards + chip, "Hide jobs that don't fit" | invented jobs |
| 4 | Hybrid car | Hybrid & electric tile, "Show all jobs (16 hidden)" | — |
| 5 | Unknown engine type | amber banner + "Link this car" button, all tiles | — |
| 6 | Step 3 not usual | chip in the job card header + "You picked this from all jobs" helper | — |
| 7 | Review | chip on the job card | — |
| 8 | Service history | chip on the opened service's job | — |
| 9 | States | loading, "Couldn't check… Showing every job" + Try again, group-removed caption, nothing ticked | — |
| 10 | Phone | single-column tiles, full-width "Show all jobs", pinned footer | — |

| # | Dominion screen | Keep | Drop / change |
|---|---|---|---|
| 1–4 | Car model "What powers this car" card (worked out / editing / confirmed / re-confirm) | the card, two rows with chips, status chip, "Worked out from …", Confirm / Edit, the amber re-confirm strip | serif font; extra spec rows Stitch invented |
| 5 | Powertrain to check | row layout (model, raw data line, two selects, Confirm), "12 left", the disagreement strip, the confirmed row fading | confidence %, pipeline text, VIN lines, filter / sort / paging, CSV export, "Undo" / "Inspect raw feed" links |
| 6 | Vehicles home | "Powertrain to check" card + "Powertrain mix" bar with the 3a counts | invented other cards |
| 7–8 | Job drawer Fits | "Same as group / Set for this job", preset select, Custom checkbox chips, HV switch + header chip, "Fits N of 2,679" + "See which" | "Electrical specifications" / "Safety isolation protocol" rows (invented), "Reset to default" button |
| 9 | Group drawer presets | 2×2 preset cards, "Jobs that set their own" list, no HV switch | — |
| 10 | States | loading, "Every car model is confirmed", couldn't save + Try again, couldn't count + Retry | — |
