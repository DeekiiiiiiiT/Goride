# Powertrain job fit — audit (Rev 2, 15 Nov 2026)

**Goal in one sentence:** every screen that offers maintenance jobs for a car offers the jobs that fit that car's powertrain (petrol, diesel, hybrid, plug-in, electric…), using one clean, owner-confirmed powertrain value per car model and one fit rule per job, so that an electric car is never offered an oil change and a petrol car is never offered high-voltage work.

Everything below was checked in the code and on the live database on 15 Nov 2026. Method: `docs/how-we-build-playbook.md` (facts → findings with one fix → design → done-tests → Stitch → build in layers).

**Rev 2 changes (after review):** HV lockout keys off a new `is_high_voltage` flag (10 jobs), not the group (PT-5). Per-column inheritance, and empty lists not allowed (PT-3). A `powertrain_status` transition table (section 3b). `job_fits_car` is NULL-safe and returns a whole set in one call (PT-10). Stored schedule rows that don't fit are retired once, with a reason (PT-4). The "Not usual for this car" result is frozen on the line at save time (PT-8). Per-model exceptions are a full override (PT-9). The fuel column is renamed `fuel` and gains `hydrogen` / `electric`, and `lpg` is dropped. Hydrogen models go to `needs_check`; FCEVs get Reduction Gear Oil Change. Mismatch count corrected. Explicit DRYRUN assertions. Tests expanded (6 models, inheritance, unlinked car).

---

## 1. Facts (checked)

**Cars**
- Dominion's master list `vehicle_catalog` has **2,679 car models**, all `vehicle_class = 'car'`.
- `fuel_type` is free text with **11 values**: Petrol 1,802 · Electric 313 · Diesel 267 · Hybrid(petrol) 236 · Petrol/Electric 43 · CNG 8 · blank 5 · Hydrogen 2 · Hybrid(diesel) 1 · CNG/LNG 1 · Electric/Hybrid 1.
- `engine_type` is free text with **46 values**, mixing powertrain words (Hybrid, PHEV, EREV, Range Extender, BEV, PMSM, Electric) with engine shapes (Turbo, V6, Inline-4, Twin-Turbo V12…).
- `fuel_category` already exists and is closer (Gas / Diesel / Electric / Hybrid / CNG / Hydrogen / Electric/Hybrid), but it's **wrong or too coarse in places**:
  - **6** Hybrid(petrol) models are filed as "Gas" (a real disagreement). Separately, 1 CNG and 1 CNG/LNG model are filed as "Gas", which isn't a disagreement ("gas" covers natural gas).
  - 1 Petrol model and the 5 blanks have no category.
  - "Hybrid" lumps together normal hybrids, plug-ins (PHEV, 29 by engine_type), range-extenders (EREV / Range Extender, 26) and the diesel hybrid. Those need different jobs (only plug-ins and range-extenders have a charging port).
  - Parts code (`parts_finder.ts`, `vehicle_parts_context.ts`, `parts_auto_match_routes.ts` and others) already reads `fuel_category`, so changing its meaning would break parts matching.
- Fleet cars link to a model through `fleet.vehicles.vehicle_catalog_id` (text). Today: **2 cars, both linked**. 5179KZ Toyota Roomy = Petrol; 1505LM Honda Fit = Hybrid(petrol) / Hybrid.

**Jobs**
- `maintenance_service_categories` has 14 groups and 128 active jobs. **No column says which cars a job fits.**
- The Fleet Log service job lists come from `GET /maintenance-categories`, `/quick-jobs`, `/systems/:id/sections` and `/systems/:id/components` (`maintenance_routes.ts` ~1317–1420). **None of them takes the car.** Every car gets every job.
- Screens that list jobs: Fleet `LogMaintenanceServiceDialog.tsx` + `LogServiceSystemPicker.tsx` (Log service), and Dominion's job admin (`maintenanceMasterApi.ts`, `maintenanceTemplateService.ts`). The Driver app doesn't list jobs. If it ever shows due items, it must use `job_fits_car` too.
- **Half a fix exists, unused:** `catalog_component_applicability` (scope, vehicle_catalog_id, platform_id, engine_family_id, component_id, applicable, reason, evidence_url) can say "this job isn't on this car / platform". It has **0 rows**, and only the Dominion schedule preview reads it (`maintenance_master_routes.ts` ~275).

**Schedules**
- 21 active `maintenance_task_templates`, all `template_scope = 'global'`, filtered only by `applicable_vehicle_classes` (every model is "car"). They include Engine oil, Spark Plugs, Engine Air Filter, Drive / Serpentine Belt, Transmission Fluid and Radiator Coolant Flush. So an electric car would be told its oil change is due.
- Schedules are **stored rows**: `vehicle_component_schedule` has 59 rows today (active 25, odometer_needed 25, no_rule 9), all on the 2 Fleet cars. **7 server files read it directly** (Fleet Admin ledger, Find parts, Log service context, fleet enrich, master routes, maintenance routes, service ledger core). `schedule_status` already allows `'retired'`.

---

## 2. Findings (one fix each)

**PT-1 (High). Log service offers every job to every car.** None of the four job-list routes knows which car is being serviced.
**Fix:** each route takes `vehicleId` and returns every job with `fits: 'yes' | 'no' | 'unknown'` (section 4). Fleet shows the fitting jobs and hides the rest behind "Show all jobs". There's **no confirmation dialog** for logging a hidden job; the chip is the only signal.

**PT-2 (High). There is no trustworthy powertrain value per car model.** `fuel_type` / `engine_type` are free text; `fuel_category` is coarse, has 6 real disagreements and 6 blanks, and is already used by parts code.
**Fix:** three new controlled columns on `vehicle_catalog`, filled from today's text by the rules in section 3:
- `powertrain`: `ice`, `hev`, `phev`, `erev`, `bev`, `fcev`;
- `fuel`: `petrol`, `diesel`, `cng`, `hydrogen`, `electric`. This is what the car runs on: `electric` for BEVs, `hydrogen` for FCEVs and hydrogen-combustion cars. `lpg` is dropped because no model produces it; it's added the day one does;
- `powertrain_status`: `derived`, `confirmed`, `needs_check`.

The original text columns stay untouched ("capture, never gate"). Rows the rules can't place cleanly are `needs_check` and go to a Dominion list for the owner.

**PT-3 (High). Jobs have no fit rule.**
**Fix:** two nullable array columns on `maintenance_service_categories`: `fits_powertrains text[]` and `fits_fuels text[]`. **Inheritance is per column:** for each of the two columns separately, a job's non-NULL value is used; a NULL value takes the group's value; a NULL on the group too means "any". So a job can be set to "petrol only" without retyping its group's powertrain list. **Empty arrays (`'{}'`) are refused by a constraint.** A job that should fit nothing is retired, not given an empty list. Each element is constrained to the code lists above. A job fits a car when the car's powertrain is in the effective powertrain list **and** the car's fuel is in the effective fuel list. Starting values: section 5.

**PT-4 (High). Schedules would put combustion jobs on electric cars**, and wrong stored rows would stay visible to the 7 readers.
**Fix, in two parts:** (1) the schedule builder (the nightly due-items check and the Dominion preview) skips any job where `fits = 'no'` before it looks at templates; (2) **one-time, on the first nightly run after the flag goes on:** every stored schedule row whose job is `fits = 'no'` for its car is set to `schedule_status = 'retired'`, with a new column `retired_reason = 'Job doesn''t fit this car''s powertrain'`. Rows are never deleted. The DRYRUN reports how many would be retired (expected **0** on live today: both cars' 59 rows fit). `unknown` never retires anything.

**PT-5 (High, safety). High-voltage jobs are offered to petrol and diesel cars, and "high-voltage" isn't defined anywhere.** The Hybrid & electric group mixes HV work (pack, modules, cables, charger, motor) with non-HV work (cooling fan, coolant, gear oil, cleaning the charging port). Electric A/C Compressor is HV but sits in HVAC.
**Fix:** a new `is_high_voltage boolean NOT NULL DEFAULT false` on `maintenance_service_categories`, set true on exactly these **10 jobs**: HV Battery Health Check, HV Battery Module Replacement, HV Battery Pack Replacement, HV Cable & Insulation Resistance Inspection, HV Cable / Connector Replacement, Charging Port, On-Board Charger, DC-DC Converter, Traction Motor, Electric A/C Compressor. The **HV lockout checklist** (separate item, owner Deeki T) keys off this flag only, never off the group or "electrified". The 8 non-HV jobs in the group stay false: Cooling Fan Filter, Fan & Duct Cleaning, Inverter Coolant Service, Inverter Coolant Pump, Battery Thermal Management Coolant Service, Battery Coolant Pump, Charging Port Inspection & Cleaning, Reduction Gear Oil Change. Dominion's job drawer shows the flag as a switch; a new HV job gets it set when it's created. The "High-voltage: lockout first" hint text on the 8 non-HV jobs is checked and removed where it's wrong.

**PT-6 (Medium). Diesel cars are offered spark-plug jobs; petrol cars are offered DPF / AdBlue / glow-plug jobs.**
**Fix:** `fits_fuels` on those jobs (section 5). Spark-ignition jobs are petrol / cng / hydrogen (a hydrogen-combustion engine uses spark plugs; FCEVs are excluded by powertrain). Diesel-only jobs are diesel.

**PT-7 (Medium). A car with no model link, or a model marked `needs_check`, has an unknown powertrain.** Today 0 of 2 Fleet cars, but it will happen.
**Fix:** `fits = 'unknown'` for every job. Fleet shows **all** jobs, with a banner "We don't know this car's engine type yet. Showing every job." and a link to fix it (Fleet: link the car to a model; Dominion: confirm the model). Never hide jobs on a guess.

**PT-8 (Medium). Old services must never disappear or be refused, and history must not be relabelled when rules change.**
**Fix:** the fit rule only filters **job pickers and new schedules**. Service history, edits of existing services and the save path ignore it. A job that doesn't fit can still be logged after "Show all jobs", with no dialog. **The fit is frozen at save time:** a new column `maintenance_work_order_lines.fit_at_log text` ('yes' | 'no' | 'unknown', NULL for lines saved before this work) is set by the save function from `job_fits_car` when the line is **first created**, and never recomputed. The "Not usual for this car" chip reads `fit_at_log = 'no'`. A read-only check lists lines with `fit_at_log = 'no'` for the owner. Because the value is frozen, it never re-reports a line just because a rule changed.

**PT-9 (Low). Per-model exceptions have no use yet.** For example, a petrol model with no turbo, or a hybrid that does have a 12V starter motor.
**Fix:** `catalog_component_applicability` is a **full override**, checked first. If a row exists for (job, model) or (job, the model's platform), with model beating platform, its `applicable` value is the answer: `true` → 'yes', `false` → 'no'. It can widen or narrow. Only when there's no row does the powertrain / fuel rule apply. Filled only when needed; no bulk load in this work.

**PT-10 (Low). "Fits" must mean the same thing everywhere, and stay fast.**
**Fix:** one database function holds the whole rule:
`public.job_fits_car(p_vehicle_catalog_id uuid, p_job_ids uuid[] DEFAULT NULL) RETURNS TABLE (job_id uuid, fits text)`.
- It returns one row per job, for every active job when `p_job_ids` is NULL. One call per page, never one per job.
- Order: (1) `p_vehicle_catalog_id IS NULL`, or the model doesn't exist, or its `powertrain_status = 'needs_check'` → 'unknown' for every job; (2) the per-model / platform exception (PT-9); (3) the effective powertrain and fuel lists (PT-3) → 'yes' / 'no'.
- A NULL id inside `p_job_ids` is skipped, never an error.
- STABLE; `GRANT EXECUTE` to service_role only (the DRYRUN runs in the SQL editor as `postgres`, which owns it).
- A comment on it says: "Assumes vehicle_class = 'car'. Extend when other classes are added."

No second copy of the rule in TypeScript. Routes and the schedule builder call this function.

---

## 3. Car powertrain

### 3a. Derivation rules (from today's text)

| fuel_type (engine_type) | powertrain | fuel | status | models |
|---|---|---|---|---|
| Petrol | ice | petrol | derived | 1,802 |
| Diesel | ice | diesel | derived | 267 |
| Electric | bev | electric | derived | 313 |
| Hybrid(petrol) + engine_type PHEV | phev | petrol | derived | 29 |
| Hybrid(petrol) + engine_type EREV | erev | petrol | derived | 12 |
| Hybrid(petrol) + other engine_type | hev | petrol | derived | ~195 |
| Petrol/Electric + engine_type Range Extender | erev | petrol | derived | 14 |
| Petrol/Electric + engine_type Hybrid | hev | petrol | derived | 10 |
| Petrol/Electric + anything else | — | petrol | **needs_check** | ~19 |
| Hybrid(diesel) | hev | diesel | derived | 1 |
| CNG, CNG/LNG | ice | cng | derived | 9 |
| Hydrogen | — | hydrogen | **needs_check** (fuel cell or hydrogen combustion: the owner decides) | 2 |
| Electric/Hybrid | — | — | **needs_check** | 1 |
| blank | — | — | **needs_check** | 5 |
| Hybrid(petrol) with fuel_category "Gas" (a real disagreement) | as above | as above | **needs_check** | 6 |

The exact counts are written by the migration's check query, not by hand. The owner confirms each `needs_check` row in Dominion (about 33 rows). New models added later get derived on save and land in the same list if the rule can't place them.

The Fleet cars today: Roomy → ice / petrol; Honda Fit → hev / petrol (both derived). The owner confirms them first, as the real test.

### 3b. `powertrain_status` transitions

The trigger runs on insert, and on update of `fuel_type` / `engine_type`. An owner confirm or edit in Dominion goes through its own route, not the trigger.

| From | Event | To | powertrain / fuel | confirmed_by / at |
|---|---|---|---|---|
| (new row) | rule places it | derived | rule's values | NULL |
| (new row) | rule can't place it | needs_check | NULL (fuel kept if known) | NULL |
| derived | text changes, rule places it | derived | new rule values | NULL |
| derived | text changes, rule can't place it | needs_check | NULL | NULL |
| needs_check | text changes, rule places it | **derived** (leaves the list) | rule's values | NULL |
| needs_check | text changes, still can't place it | needs_check | NULL | NULL |
| confirmed | text changes (any) | **needs_check** | kept (shown as "last confirmed") | **kept** as the last confirmation, plus `powertrain_note = 'Text changed after confirmation — please re-confirm'` |
| any | owner confirms / edits in Dominion | confirmed | owner's values | set to the owner / now; note cleared |

A `confirmed` row is never overwritten by a re-derive. While a confirmed-then-changed row is `needs_check`, `job_fits_car` returns 'unknown' for it (safe: show everything) until the owner re-confirms.

---

## 4. Design

### Database
- `vehicle_catalog`: `powertrain`, `fuel`, `powertrain_status`, `powertrain_note`, `powertrain_confirmed_by`, `powertrain_confirmed_at` (check-constrained), plus the trigger from 3b.
- `maintenance_service_categories`: `fits_powertrains text[]`, `fits_fuels text[]` (non-empty, elements constrained), `is_high_voltage boolean NOT NULL DEFAULT false`, with column comments ("NULL = take the group's value; NULL on the group = any").
- `maintenance_work_order_lines.fit_at_log text` (PT-8), set by `fleet_save_work_order` on line insert only.
- `vehicle_component_schedule.retired_reason text` (PT-4).
- `public.job_fits_car(...)` (PT-10).
- A read-only check: lines with `fit_at_log = 'no'` (PT-8).
- **"Fits N of 2,679 models"** in Dominion is computed on demand when the drawer opens, from one set query over `vehicle_catalog` grouped by (powertrain, fuel) (at most ~30 combinations), not 2,679 calls. It's cheap enough that no cache is needed; revisit if the model count grows 10×.

### Server
- The four Fleet job-list routes accept `vehicleId` and add `fits` per job (one `job_fits_car` call per request). Without `vehicleId` they behave as today (Dominion and old callers unchanged).
- The schedule builder skips `fits = 'no'`, and runs the one-time retire (PT-4).
- `fleet_save_work_order` sets `fit_at_log` on new lines.
- Dominion: routes to set a model's powertrain / fuel (→ `confirmed`), list `needs_check` models, set a group's / job's `fits_*` and `is_high_voltage`.

### Screens (every screen and button)
**Fleet: Log service, step 2 "Work done"** (`LogServiceSystemPicker.tsx`, quick jobs, sections, components):
- Shows only fitting jobs. Groups with no fitting job are removed and the list closes up (no gap). For example, Hybrid & electric doesn't appear on the Roomy.
- **"Show all jobs (N hidden)"** button at the bottom, where N = **jobs**. It reveals the hidden jobs, greyed, each with a "Not usual for this car" chip. They're still tickable, with **no confirmation dialog**.
- **Unknown powertrain banner** (PT-7) with **"Link this car"** (to the existing vehicle-link flow); all jobs shown.
- Step 3 / Review / history: a line saved with `fit_at_log = 'no'` keeps its "Not usual for this car" chip.

**Fleet: maintenance overview / due items:** no new controls. Non-fitting jobs stop appearing (PT-4).

**Dominion: car model page:** a "Powertrain" row showing the value, fuel and status ("Worked out from 'Hybrid(petrol) / PHEV'", "Confirmed by … on …", or "Text changed after confirmation — please re-confirm"), with an **Edit** button (two selects + Save / Cancel).

**Dominion: "Powertrain to check" list:** the `needs_check` models, each with its raw `fuel_type` / `engine_type` / `fuel_category`, two selects and **Confirm**. A count badge on the Vehicles home.

**Dominion: job and group drawer:** a "Fits" row using **presets**, never raw arrays. Powertrain: **All / Combustion / Electrified / Plug-in / Custom…**. Fuel: **All / Petrol / Diesel / Spark-ignition / Custom…**. On a job, each row also has **"Same as group"**, the default and shown as the group's preset name. Plus an **"High-voltage work"** switch, and "Fits N of 2,679 models".

Stitch screens are needed for the Dominion car-model row, the "Powertrain to check" list, the job / group "Fits" row, and the Fleet step-2 states ("Show all jobs", hidden-job chip, unknown banner). The owner makes them in Stitch (one file per app); the Stitch prompt is written after this audit is reviewed.

### Gates
- `pnpm test:service-items` + the new tests below; `/code-review` before push; live SQL as a generated DRYRUN first (assertions in section 6b), then the real file with its logbook line; the owner confirms the two Fleet cars' powertrain in Dominion before the Fleet filter is switched on.
- Behind a flag `job_fit_filter`, off by default (off → today's behaviour). It's global; per-organisation flags are a future consideration if more fleets join, not this work.

---

## 5. Starting fit values (group default, then per-job overrides; per-column inheritance)

Presets: **Combustion** = ice, hev, phev, erev. **Electrified** = hev, phev, erev, bev, fcev. **Plug-in** = phev, erev, bev. **Spark-ignition** (fuel) = petrol, cng, hydrogen. "—" = NULL (any, or the group's value on a job).

| Group | fits_powertrains | fits_fuels | Job overrides |
|---|---|---|---|
| Engine | Combustion | — | Spark Plugs, Spark Plug Wires, Ignition coil, Throttle Body Cleaning / Relearn, Carburetor Cleaning → fuels Spark-ignition. |
| Filters | — | — | Oil filter, Engine Air Filter, Fuel filter → Combustion. |
| Fluids | — | — | Engine oil (both rows), Radiator Coolant Flush → Combustion. |
| Belts & hoses | Combustion | — | — |
| Transmission | ice, hev, phev, erev | — | (BEVs and FCEVs use Reduction Gear Oil Change.) |
| Exhaust & emissions | Combustion | — | DPF ×2, SCR / AdBlue ×2, NOx, Glow Plugs, EGT, DPF Pressure Sensor → fuels diesel. EVAP / Charcoal Canister, Purge Valve → fuels petrol. |
| Hybrid & electric | Electrified | — | Charging Port, Charging Port Inspection & Cleaning, On-Board Charger → Plug-in. Battery Thermal Management Coolant Service, Battery Coolant Pump → phev, erev, bev. HV Battery Cooling Fan Filter / Fan & Duct Cleaning → hev, phev. Inverter Coolant Service / Pump → hev, phev, erev. **Reduction Gear Oil Change → bev, erev, fcev.** |
| HVAC | — | — | Electric A/C Compressor → Electrified. |
| Battery & electrical | — | — | Alternator, Starter motor → ice (hybrids use the motor-generator; a per-model exception can turn them back on). |
| Tires & wheels, Brakes, Suspension & steering, Lighting & visibility, Shop fees | — | — | — |

`is_high_voltage = true`: the 10 jobs listed in PT-5. These are starting values. The owner can change any of them in Dominion, and the "Fits N of 2,679 models" count shows the effect before saving.

---

## 6. Tests

### 6a. Done-tests (written before the build)

1. Roomy (ice / petrol): Log service shows Engine and Exhaust & emissions (no DPF / AdBlue / glow plugs); no Hybrid & electric group; no Electric A/C Compressor; the group list has no gap.
2. Honda Fit (hev / petrol): shows Engine and Hybrid & electric; no Charging Port, no On-Board Charger, no Reduction Gear Oil Change, no Alternator / Starter motor.
3. A bev test model: no Engine group, no Engine oil, no Spark Plugs, no Transmission Fluid; Charging Port and Reduction Gear Oil Change present; Brakes, Tires and A/C present.
4. A diesel test model: DPF, AdBlue and glow plugs present; Spark Plugs and EVAP absent.
5. "Show all jobs (N hidden)": N = the number of hidden **jobs**. A hidden job can be ticked with no dialog, saved with `fit_at_log = 'no'`, and shown in history with "Not usual for this car".
6. A car with no model link, or a `needs_check` model: every job shown, plus the unknown banner.
7. Schedules: a bev test car gets no Engine oil / Spark Plugs / Transmission Fluid due items; the Roomy's due items don't change.
8. Saving or editing an old service never fails or loses a line because of the fit rule; old lines keep `fit_at_log = NULL`.
9. `job_fits_car` matches the route `fits` for every job on **6 models**: ice / petrol (Roomy), ice / diesel, hev / petrol (Fit), phev / petrol, bev, and a `needs_check` model (every job 'unknown').
10. Transitions: every row of table 3b, including "confirmed → text changes → needs_check, confirmation kept as last confirmed".
11. Flag off → step 2 is exactly today's list.
12. Migration check: every model has a powertrain or is `needs_check`; the counts match section 3a's rules.
13. Unlinked car (`vehicle_catalog_id` NULL): every route returns `fits: 'unknown'` for every job, with no error.
14. **Inheritance** (on test jobs in a test group): job NULL / NULL → takes the group's values; job powertrains set + fuels NULL → job powertrains + group fuels; job powertrains NULL + fuels set → group powertrains + job fuels; both set → job's both; `'{}'` → refused by the constraint.
15. **Exceptions:** a model row `applicable = false` turns a fitting job to 'no'; `applicable = true` turns a non-fitting job to 'yes'; a model row beats a platform row.
16. **Frozen fit:** a line saved as 'no' stays 'no' after the job's fit rule is changed to include the car.
17. **HV flag:** exactly the 10 PT-5 jobs have `is_high_voltage = true`.

### 6b. DRYRUN assertions (D1 live SQL; the always-stop message prints them)

1. `count(*) FROM vehicle_catalog WHERE powertrain IS NULL AND powertrain_status <> 'needs_check'` = **0**.
2. `count(*) WHERE powertrain_status = 'needs_check'` = the rule's count (≈33), printed with the per-reason split (Petrol/Electric other, Hydrogen, Electric/Hybrid, blank, Gas disagreement).
3. Every `powertrain` / `fuel` / `fits_*` element is a known code (constraint check, **0** bad rows).
4. No job or group has an empty `fits_*` array (**0**).
5. Roomy's model = ice / petrol / derived; Honda Fit's model = hev / petrol / derived.
6. `is_high_voltage = true` on exactly the **10** named job codes.
7. `job_fits_car(Roomy model)` gives 'no' for every Hybrid & electric job and 'yes' for Engine oil; `job_fits_car(Fit model)` gives 'yes' for Inverter Coolant Service and 'no' for Charging Port.
8. Schedule rows that the one-time retire would touch = **0** (printed).
9. `changed_other` = 0: no row of any other column / table changed (snapshot pattern from the double-log SQL).

---

## 7. Build rounds

1. **D1 (Cursor):** car columns + derivation + transitions trigger + `needs_check` list; job `fits_*` + `is_high_voltage` + starting values (section 5); `fit_at_log`; `retired_reason`; `job_fits_car`; SQL tests 9, 10, 12–17. Live via generated DRYRUN (6b) + real file + logbook line.
2. **S1 (Cursor):** routes take `vehicleId` and return `fits`; schedule builder skip + one-time retire; `fit_at_log` on save; Dominion routes; flag; server tests 7, 8, 9, 13.
3. **Stitch (owner):** the screens in section 4.
4. **UI1 (Claude):** Dominion car-model row, "Powertrain to check" list, job / group "Fits" row with presets + HV switch.
5. **UI2 (Claude):** Fleet step 2 states; click-throughs 1–6, 11.
6. **Live:** the owner confirms the two Fleet cars and the `needs_check` list, flag on, real check on both cars.

---

## 8. Not in this work

- Motorcycles / trucks (`vehicle_class` is "car" for every model today; `job_fits_car`'s comment marks where to extend).
- Changing `fuel_type`, `engine_type` or `fuel_category` (they stay as they are; parts code keeps using `fuel_category`).
- Bulk per-model exceptions (PT-9 is used only as cases come up).
- The HV lockout checklist itself (its own item; it reads `is_high_voltage`).
- A per-organisation `job_fit_filter` flag.
