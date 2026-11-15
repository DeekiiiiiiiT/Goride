# Powertrain job fit — audit (Rev 1, 15 Nov 2026)

**Goal in one sentence:** every screen that offers maintenance jobs for a car offers the jobs that fit that car's powertrain (petrol, diesel, hybrid, plug-in, electric…), using one clean, owner-confirmed powertrain value per car model and one fit rule per job, so that an electric car is never offered an oil change and a petrol car is never offered high-voltage work.

Everything below was checked in the code and on the live database on 15 Nov 2026. Method: `docs/how-we-build-playbook.md` (facts → findings with one fix → design → done-tests → Stitch → build in layers).

---

## 1. Facts (checked)

**Cars**
- Dominion's master list `vehicle_catalog` has **2,679 car models**, all `vehicle_class = 'car'`.
- `fuel_type` is free text with **11 values**: Petrol 1,802 · Electric 313 · Diesel 267 · Hybrid(petrol) 236 · Petrol/Electric 43 · CNG 8 · blank 5 · Hydrogen 2 · Hybrid(diesel) 1 · CNG/LNG 1 · Electric/Hybrid 1.
- `engine_type` is free text with **46 values**, mixing powertrain words (Hybrid, PHEV, EREV, Range Extender, BEV, PMSM, Electric) with engine shapes (Turbo, V6, Inline-4, Twin-Turbo V12…).
- `fuel_category` already exists and is closer (Gas / Diesel / Electric / Hybrid / CNG / Hydrogen / Electric/Hybrid), but it's **wrong or too coarse in places**:
  - 6 Hybrid(petrol) models are filed as "Gas", and CNG/LNG is filed as "Gas".
  - 1 Petrol model and the 5 blanks have no category.
  - "Hybrid" lumps together normal hybrids, plug-ins (PHEV, 29 by engine_type), range-extenders (EREV / Range Extender, 26) and the diesel hybrid. Those need different jobs (only plug-ins and range-extenders have a charging port).
  - Parts code (`parts_finder.ts`, `vehicle_parts_context.ts`, `parts_auto_match_routes.ts` and others) already reads `fuel_category`, so changing its meaning would break parts matching.
- Fleet cars link to a model through `fleet.vehicles.vehicle_catalog_id` (text). Today: **2 cars, both linked**. 5179KZ Toyota Roomy = Petrol; 1505LM Honda Fit = Hybrid(petrol) / Hybrid.

**Jobs**
- `maintenance_service_categories` has 14 groups and 128 active jobs. **No column says which cars a job fits.**
- The Fleet Log service job lists come from `GET /maintenance-categories`, `/quick-jobs`, `/systems/:id/sections` and `/systems/:id/components` (`maintenance_routes.ts` ~1317–1420). **None of them takes the car.** Every car gets every job.
- Screens that list jobs: Fleet `LogMaintenanceServiceDialog.tsx` + `LogServiceSystemPicker.tsx` (Log service), and Dominion's job admin (`maintenanceMasterApi.ts`, `maintenanceTemplateService.ts`). The Driver app doesn't list jobs.
- **Half a fix exists, unused:** `catalog_component_applicability` (scope, vehicle_catalog_id, platform_id, engine_family_id, component_id, applicable, reason, evidence_url) can say "this job isn't on this car / platform". It has **0 rows**, and only the Dominion schedule preview reads it (`maintenance_master_routes.ts` ~275).
- **Schedules:** 21 active `maintenance_task_templates`, all `template_scope = 'global'`, filtered only by `applicable_vehicle_classes` (every model is "car"). They include Engine oil, Spark Plugs, Engine Air Filter, Drive / Serpentine Belt, Transmission Fluid and Radiator Coolant Flush. So an electric car would be told its oil change is due.

---

## 2. Findings (one fix each)

**PT-1 (High). Log service offers every job to every car.** None of the four job-list routes knows which car is being serviced.
**Fix:** each route takes `vehicleId` and returns every job with `fits: true | false | unknown` (section 4). Fleet shows the fitting jobs and hides the rest behind "Show all jobs".

**PT-2 (High). There is no trustworthy powertrain value per car model.** `fuel_type` / `engine_type` are free text; `fuel_category` is coarse, wrong on 7 rows and already used by parts code.
**Fix:** two new controlled columns on `vehicle_catalog`, filled from today's text by the rules in section 3: `powertrain` (`ice`, `hev`, `phev`, `erev`, `bev`, `fcev`) and `combustion_fuel` (`petrol`, `diesel`, `cng`, `lpg`, `none`), plus `powertrain_status` (`derived`, `confirmed`, `needs_check`). The original text columns stay untouched ("capture, never gate"). Rows the rules can't place cleanly are `needs_check` and go to a Dominion list for the owner.

**PT-3 (High). Jobs have no fit rule.**
**Fix:** two nullable array columns on `maintenance_service_categories`: `fits_powertrains text[]` and `fits_fuels text[]`. On a group they're the default for its jobs; on a job they override the group. NULL on both = fits every car. A job fits a car when the car's powertrain is in the job's list (or the list is NULL) **and** the car's fuel is in the job's fuel list (or that list is NULL). Starting values: section 5.

**PT-4 (High). Schedules would put combustion jobs on electric cars.** The 21 global templates ignore powertrain.
**Fix:** the schedule builder (the nightly due-items check and the Dominion preview) skips any job that doesn't fit the car, by the same rule, before it looks at templates. An electric car never gets "Engine oil due".

**PT-5 (High, safety). High-voltage jobs are offered to petrol and diesel cars.** That's 18 jobs (17 in the Hybrid & electric group, plus Electric A/C Compressor), which matters because of the HV lockout rule.
**Fix:** covered by PT-3 / PT-1 (Hybrid & electric fits `hev, phev, erev, bev, fcev` only). The HV lockout checklist (separate item, owner Deeki T) keys off the same group.

**PT-6 (Medium). Diesel cars are offered spark-plug jobs; petrol cars are offered DPF / AdBlue / glow-plug jobs.**
**Fix:** `fits_fuels` on those jobs (section 5): spark-ignition jobs are petrol / cng / lpg; diesel-only jobs are diesel.

**PT-7 (Medium). A car with no model link, or a model marked `needs_check`, has an unknown powertrain.** Today 0 of 2 Fleet cars, but it will happen.
**Fix:** `fits = unknown` for every job. Fleet shows **all** jobs with a banner "We don't know this car's engine type yet. Showing every job." plus a link to fix it (Fleet: link the car to a model; Dominion: confirm the model). Never hide jobs on a guess.

**PT-8 (Medium). Old services must never disappear or be refused.** A past service may hold a job that, under the new rule, doesn't fit (e.g. logged on the wrong car).
**Fix:** the fit rule only filters **job pickers and new schedules**. Service history, edits of existing services and the save path ignore it. A job that doesn't fit can still be logged after "Show all jobs". Its line shows a small "Not usual for this car" chip and is saved as normal ("capture, never gate"). A read-only check lists past lines whose job doesn't fit their car, for the owner to look at. Nothing is changed automatically.

**PT-9 (Low). Per-model exceptions have no use yet.** For example, a petrol model with no turbo, or a hybrid with no 12V starter motor.
**Fix:** keep `catalog_component_applicability` as the per-model / per-platform override, applied **after** the powertrain rule. It can turn a job off for a model (`applicable = false`, with a reason), or back on. Filled only when needed; no bulk load in this work.

**PT-10 (Low). "Fits" must mean the same thing everywhere.**
**Fix:** one database function, `public.job_fits_car(job_id uuid, vehicle_catalog_id uuid) returns text` ('yes' | 'no' | 'unknown'), holding the whole rule: group default, job override, then the per-model exception. Every route and the schedule builder call it. No second copy of the rule in TypeScript.

---

## 3. Car powertrain: derivation rules (from today's text)

| fuel_type (engine_type) | powertrain | combustion_fuel | status | models |
|---|---|---|---|---|
| Petrol | ice | petrol | derived | 1,802 |
| Diesel | ice | diesel | derived | 267 |
| Electric | bev | none | derived | 313 |
| Hybrid(petrol) + engine_type PHEV | phev | petrol | derived | 29 |
| Hybrid(petrol) + engine_type EREV | erev | petrol | derived | 12 |
| Hybrid(petrol) + other engine_type | hev | petrol | derived | ~195 |
| Petrol/Electric + engine_type Range Extender | erev | petrol | derived | 14 |
| Petrol/Electric + engine_type Hybrid | hev | petrol | derived | 10 |
| Petrol/Electric + anything else | — | petrol | **needs_check** | ~19 |
| Hybrid(diesel) | hev | diesel | derived | 1 |
| CNG, CNG/LNG | ice | cng | derived | 9 |
| Hydrogen | fcev | none | derived | 2 |
| Electric/Hybrid | — | — | **needs_check** | 1 |
| blank | — | — | **needs_check** | 5 |
| any row where fuel_category disagrees (e.g. Hybrid(petrol) filed as "Gas") | as above | as above | **needs_check** | 6 |

Exact counts are written by the migration's check query, not by hand. The owner confirms each `needs_check` row in Dominion (about 30 rows), which sets `confirmed`. A confirmed value is never overwritten by a re-derive. New models added later get derived on save and land in the same list if the rule can't place them.

The Fleet cars today: Roomy → ice / petrol; Honda Fit → hev / petrol (both derived; the owner confirms them first, as the real test).

---

## 4. Design

### Database
- `vehicle_catalog`: `powertrain`, `combustion_fuel`, `powertrain_status` (check-constrained to the values above), `powertrain_confirmed_by`, `powertrain_confirmed_at`. A trigger re-derives on insert / update of `fuel_type` / `engine_type`, unless the status is `confirmed`.
- `maintenance_service_categories`: `fits_powertrains text[]`, `fits_fuels text[]` (each element check-constrained), with a column comment saying "NULL = fits every car; job value overrides its group".
- `public.job_fits_car(job_id, vehicle_catalog_id)` (PT-10), STABLE, granted to service_role only.
- A read-only check: past work-order lines whose job doesn't fit their car (PT-8).

### Server
- The four Fleet job-list routes accept `vehicleId` and add `fits` per job. Without `vehicleId` they behave as today (Dominion and old callers unchanged).
- The schedule builder (nightly due items + Dominion preview) skips jobs where `fits = 'no'`.
- Dominion: routes to set a model's powertrain / fuel (sets `confirmed`), list `needs_check` models, and set a group's / job's `fits_*`.

### Screens (every screen and button)
**Fleet: Log service, step 2 "Work done"** (`LogServiceSystemPicker.tsx`, quick jobs, sections, components):
- Shows only fitting jobs. Groups with no fitting job are hidden (e.g. Hybrid & electric on the Roomy).
- **"Show all jobs (N hidden)"** button at the bottom. It reveals the hidden jobs, greyed, each with a "Not usual for this car" chip; they're still tickable.
- **Unknown powertrain banner** (PT-7) with **"Link this car"** (to the existing vehicle-link flow) instead of hiding.
- Step 3 / Review: a ticked job that doesn't fit keeps its "Not usual for this car" chip.

**Fleet: maintenance overview / due items:** no new controls. Non-fitting jobs simply stop appearing (PT-4).

**Dominion: car model page:** a "Powertrain" row showing the value, fuel and status ("Worked out from 'Hybrid(petrol) / PHEV'" or "Confirmed by …"), with an **Edit** button (two selects + Save / Cancel).

**Dominion: "Powertrain to check" list:** the `needs_check` models, each with its raw `fuel_type` / `engine_type` / `fuel_category`, two selects and **Confirm**. A count badge on the Vehicles home.

**Dominion: job and group drawer:** a "Fits" row with powertrain chips and fuel chips. On a job: **"Same as group"** (the default) or **"Set for this job"**. Shows "Fits N of 2,679 models" live.

Stitch screens are needed for the Dominion car-model row, the "Powertrain to check" list, the job / group "Fits" row, and the Fleet step-2 states ("Show all jobs", hidden-job chip, unknown banner). The owner makes them in Stitch (one file per app); the Stitch prompt is written after this audit is reviewed.

### Gates
- `pnpm test:service-items` + the new tests below; `/code-review` before push; live SQL as a generated DRYRUN first, then the real file with its logbook line; the owner confirms the two Fleet cars' powertrain in Dominion before the Fleet filter is switched on.
- Behind a flag `job_fit_filter` (off → today's behaviour), switched on after the owner's check.

---

## 5. Starting fit values (by group, then job overrides)

Powertrain codes: ice, hev, phev, erev, bev, fcev. "Combustion" = ice, hev, phev, erev. "Electrified" = hev, phev, erev, bev, fcev. "Plug-in" = phev, erev, bev.

| Group | fits_powertrains | fits_fuels | Job overrides |
|---|---|---|---|
| Engine | combustion | — | Spark Plugs, Spark Plug Wires, Ignition coil, Throttle Body Cleaning / Relearn, Carburetor Cleaning → fuels petrol, cng, lpg. Turbo Decoking, Intercooler Cleaning → no override (any combustion). |
| Filters | — (all) | — | Oil filter, Engine Air Filter, Fuel filter → combustion. Cabin filters → all. |
| Fluids | — (all) | — | Engine oil (both rows), Radiator Coolant Flush → combustion. Washer fluid, Coolant (top-up), Fluids (Washer / Coolant) → all. |
| Belts & hoses | combustion | — | — |
| Transmission | ice, hev, phev, erev | — | (BEVs use Reduction Gear Oil Change.) |
| Exhaust & emissions | combustion | — | DPF ×2, SCR / AdBlue ×2, NOx, Glow Plugs, EGT, DPF Pressure Sensor → fuels diesel. EVAP / Charcoal Canister, Purge Valve → fuels petrol. |
| Hybrid & electric | electrified | — | Charging Port, Charging Port Inspection & Cleaning, On-Board Charger → plug-in. Battery Thermal Management Coolant Service, Battery Coolant Pump → phev, erev, bev. HV Battery Cooling Fan Filter / Fan & Duct Cleaning → hev, phev. Inverter Coolant Service / Pump → hev, phev, erev. Reduction Gear Oil Change → bev, erev. |
| HVAC | — (all) | — | Electric A/C Compressor → electrified. |
| Battery & electrical | — (all) | — | Alternator, Starter motor → ice (hybrids use the motor-generator; a per-model exception can turn them back on). |
| Tires & wheels, Brakes, Suspension & steering, Lighting & visibility, Shop fees | — (all) | — | — |

These are starting values. The owner can change any of them in Dominion, and the "Fits N of 2,679 models" count shows the effect before saving.

---

## 6. Done-tests (written before the build)

1. Roomy (ice / petrol): Log service shows Engine, Exhaust & emissions (no DPF / AdBlue / glow plugs), no Hybrid & electric group, and no Electric A/C Compressor.
2. Honda Fit (hev / petrol): shows Engine and Hybrid & electric; no Charging Port, no On-Board Charger, no Reduction Gear Oil Change, no Alternator / Starter motor.
3. A bev test model: no Engine group, no Engine oil, no Spark Plugs, no Transmission Fluid; Charging Port and Reduction Gear Oil Change present; Brakes, Tires and A/C present.
4. A diesel test model: DPF, AdBlue and glow plugs present; Spark Plugs and EVAP absent.
5. "Show all jobs" reveals exactly the hidden count; a hidden job can be ticked, saved and shown in history with "Not usual for this car".
6. A car with no model link, or a `needs_check` model: every job shown, plus the unknown banner.
7. Schedules: a bev test car gets no Engine oil / Spark Plugs / Transmission Fluid due items; the Roomy's due items don't change.
8. Saving or editing an old service never fails or loses a line because of the fit rule.
9. `job_fits_car` returns the same answer as the route `fits` for every job on 4 test models (one per powertrain kind).
10. Re-deriving never overwrites a `confirmed` model.
11. Flag off → step 2 is exactly today's list.
12. Migration check: every model has a powertrain or is `needs_check`; the counts match section 3's rules.

---

## 7. Build rounds

1. **D1 (Cursor):** car columns + derivation + trigger + `needs_check` list; job `fits_*` columns + starting values (section 5); `job_fits_car`; SQL tests 9, 10, 12. Live via DRYRUN + real file + logbook line.
2. **S1 (Cursor):** routes take `vehicleId` and return `fits`; schedule builder skips non-fitting jobs; Dominion routes; flag; server tests 7, 8, 9.
3. **Stitch (owner):** the screens in section 4.
4. **UI1 (Claude):** Dominion car-model row, "Powertrain to check" list, job / group "Fits" row.
5. **UI2 (Claude):** Fleet step 2 states; click-throughs 1–6, 11.
6. **Live:** the owner confirms the two Fleet cars and the `needs_check` list, flag on, real check on both cars.

---

## 8. Not in this work

- Motorcycles / trucks (`vehicle_class` is "car" for every model today).
- Changing `fuel_type`, `engine_type` or `fuel_category` (they stay as they are; parts code keeps using `fuel_category`).
- Bulk per-model exceptions (PT-9 is used only as cases come up).
- The HV lockout checklist (its own item; it reuses this work's "electrified" rule).
