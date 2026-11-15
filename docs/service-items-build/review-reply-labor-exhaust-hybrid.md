# Reply to review: labor-only jobs, Exhaust draft, EV/Hybrid (Rev 9, 15 Nov 2026)

## Rev 9: the EV file

`ev-suggestions.md` + `live/ev-add.sql`, tested on live with everything undone afterwards: **11 jobs** (10 in Hybrid & electric, Electric A/C Compressor in HVAC), 7 part jobs + 4 services, **3 new supplies**, **17 supply links**, **1 part link** (Charging Port on Charging Port Inspection & Cleaning). Not run yet.

The three things you said you'd look for:
1. **Battery thermal-management coolant:** decided as its own supply, **EV Battery Coolant** (litre). Usually on Battery Thermal Management Coolant Service and Battery Coolant Pump; Sometimes "if liquid-cooled" on the On-Board Charger, DC-DC Converter and Traction Motor. It's kept separate from Hybrid Inverter Coolant because battery and inverter loops don't always use the same coolant.
2. **HV cable / insulation-resistance inspection:** in, as a labor-only service covering hybrids and EVs, with HV Cable / Connector Replacement as its repair job.
3. **`part_source`: not shipped.** Status: still 1 saved item row in total, so no real data lost yet. Plan: its own small round (column on `maintenance_work_order_line_item`, the save function, Fleet sending it), done before any Exhaust / Hybrid / EV part item is used on a real service. This is the next build item after the EV SQL runs.

Also in the file:
- **POE Compressor Oil (Non-Conductive)** on the new Electric A/C Compressor job: PAG oil in a high-voltage compressor is a safety fault, so it gets its own supply.
- **EV Reduction Gear Oil** for the single-speed gearbox, with its own oil-change service.
- **No grease on charging pins or HV connectors**, written into those notes.
- **Left out, with reasons:** software / ADAS (later Battery & electrical file), A/C refrigerant recharge (needs its own HVAC file; no recharge job exists for any car), battery heater / chiller (logged under the coolant service for now), PPE.
- **Find parts backlog:** 22 + 7 = 29. **HV lockout:** owner Deeki T, pending design, and it moves up now that the EV jobs add more HV work.

## Rev 8: deployed, last check passed

- **Tick fix deployed:** commit 367dcb07 pushed to main; the Fleet deploy (Vercel) succeeded. CI's one red step is "Dominion Stitch fidelity", which was already failing on the commit before this one (another chat's work) and doesn't touch these files.
- **Part type logged as its own job: PASSED** (owner, 15 Nov, nothing saved). Exhaust Clamp alone → step 3 shows Action Replace, Quantity, Unit price, Labor (blank), Labor hours/rate, Brand, Part number, Link part ("No compatible parts" — research backlog), and Items used "No standard items suggested…". No phantom labor.
- **`hybrid-add.sql` ran on live after the deploy** (15 Nov) and was checked there: group "Hybrid & electric", 7 jobs, 10 supply links, 1 part link, Hybrid Inverter Coolant supply active. Hybrid batch closed.

## Rev 7: reload badge, part_source, sequencing

- **Reload: never falsely verified.** (1) A reopened service doesn't load the part label back, so the Items step shows no badge at all on a saved part item, just "Pick a part" / the job name. (2) Service history and Review show no part badge. (3) The helper's default for anything with no `part_id` and no `partFit` is "typed" (pen, "Typed in"), never "verified". A saved size pick therefore reads back as typed: imprecise, not wrong. **Test 5 added:** "a saved typed-in or fits-by-size part read back is never verified". Fleet log-service tests 57/57.
- **`part_source`:** the Open list now says size vs typed can never be reconstructed for items saved before it ships, and moves it ahead of real use of the Exhaust / Hybrid part items. Today there is 1 saved item row in total, so nothing real is lost yet.
- **Sequence:** commit → CI → deploy the tick fix, then the owner does the 2-minute "part type as its own job" check (Exhaust Clamp), then `hybrid-add.sql` runs. The SQL doesn't run before the deploy.
- **HV lockout owner:** Deeki T, named on the Open list and in the hybrid file.
- **Hybrid file:** added "Battery pack coolant: not added — packs here are air-cooled; liquid-cooled PHEV/EV packs in the EV file" and "HV cable / insulation-resistance inspection: deferred to the EV file on purpose; it covers hybrids too".
- **Title:** this file is now titled Rev 7.

---

## Rev 6: answers on the tick fix, and the hybrid file

**1. Regression test: added.** The badge choice moved into a pure helper, `pickedPartBadge()` in `itemsUsed.ts`, and the screen uses it. 4 new tests in `itemsUsed.test.ts`: car-list pick is verified; fits-by-size never; typed-in never; a saved catalogue part read back (which has no screen-only `partFit`) stays verified. Fleet log-service tests are 56/56 (52 before + 4).

**2. Fits by size: already a third state, now labelled too.** The icon is a ruler for fits-by-size and a pen for typed-in, never the green tick. Each also gets a label: "Fits this car" (green), "Check before buying" (fits by size, orange), "Typed in" (grey). So three states: verified / catalogued by size / unverified.

**3. Data: partly recorded.** A pick from this car's list saves `part_id` (and the server re-checks it fits this car), so "verified" is in the data. A fits-by-size pick and a typed-in part are both saved as brand + part number with no `part_id`, so the database can't tell those two apart. On the audit Open list: a `part_source` column ('car' | 'size' | 'typed'), for when parts-cost reporting is built. Nothing reports on part source today.

**Deploy:** the fix is on the owner's machine, uncommitted. It goes live with the next Fleet deploy, before the hybrid batch is used on a real service.

**Untested paths:**
- **Fits by size:** none of the new part types has any fits-by-size parts yet, so that branch can't show on these jobs. It can only be checked by eye once parts research adds some. The badge logic for it is covered by the new test.
- **Part type logged as its own job:** a 2-minute check for the owner. Log service → Exhaust & emissions → Exhaust Clamp as a job → step 3 shows the part picker, brand, part number and an optional Labor box (blank by default) → Cancel.

**Hybrid file:** `hybrid-suggestions.md` + `live/hybrid-add.sql`, tested on live with everything undone afterwards: new group "Hybrid & electric", 7 jobs, 1 new supply, 10 supply links, 1 part link.
- **Inverter coolant: decided as a supply.** "Hybrid Inverter Coolant (Low-Conductivity)", sold by the litre, Usually on Inverter Coolant Service and Inverter Coolant Pump. Not a note.
- **HV lockout: pending design, owner = Deeki T,** on the audit Open list. Plan: a safety checklist on HV jobs in Log service, saved with the service, planned on its own after the EV file.
- **Regen Brake Service dropped** (the normal Brakes job covers it; a separate job would split brake history). Added: fan & duct cleaning, inverter coolant pump, HV module and pack replacement.
- **Find parts backlog:** 18 + 4 = 22.

## Rev 5: batch live, both Fleet checks passed

- **Both SQL files ran on live** and were checked there: 21 rows, 44 supply links, 11 part links, 3 new supplies, Tire Valve Stem supply retired with no links left. The "4 vs 5 part items" sentence, the heading and the step 4 wording were fixed before part 2 ran.
- **Muffler check (part-type path):** 3 supplies + 2 parts shown; Exhaust Clamp → Pick a part → "No parts are listed for this car yet" → Type it in instead → brand saved → J$ 1,500 went into the total.
- **Header check (job-as-part-item path):** Exhaust Manifold Gasket shown as a part item on Exhaust Manifold / Header; Pick a part and typing it in worked the same way.
- **Found + fixed:** a typed-in part showed the same green "verified" tick as a part picked from the car's list. The tick now shows only for car-list picks; typed-in and fits-by-size parts get a plain icon. Fleet tests 52/52; not deployed yet.
- **Next:** the hybrid file, with the inverter-coolant supply decided in it.

## Rev 4: the Header gasket, and the backlog count

- **There is one mechanism.** In the app a "part type" is a part job, and nothing else. A May-need part item can point at any active part job; the database guard `maintenance_job_item_guard` allows a part item only when the target is kind = component and is_part = true. So Exhaust Manifold Gasket (a part job in this batch) feeding the Header job is the same path as the clamp feeding Muffler. Any part job can be a part item, not only this one; the next files can rely on that.
- **The end-to-end test's gasket is not the Header one.** The Exhaust jobs don't exist yet. The test picks an existing gasket part job and links it as a part item on Throttle Body Cleaning, then saves and checks the database and history. That proves the same path, not this link.
- **Both fixes are done:** the Exhaust file now explains it in "How part items work" (4 distinct part items: the 3 new part types plus Exhaust Manifold Gasket, and Tire Valve Stem on Tire Change), and has a step 4 after part 2: open Exhaust Manifold / Header in Fleet, tick the gasket, press Pick a part, then Cancel.
- **Backlog count:** 18 (3 part types + 14 part jobs + Tire Valve Stem), stated on the audit's Open list and in the Exhaust file.
- **Cleaning file DPF strike-through:** done (`cleaning-jobs-suggestions.md`, "Left out on purpose"). **Inverter coolant:** the supply decision is made in the hybrid file, which isn't written yet.

---

## Rev 3: answers to the "verify before the SQL runs" list

The Exhaust file is written: `exhaust-emissions-suggestions.md`, with `live/exhaust-1-pilot.sql` and `live/exhaust-2-rest.sql`. Both were tested together on live with everything undone afterwards: 21 rows, 44 supply links, 11 part links. Nothing has run yet.

1. **Job total:** stated as **18 jobs + 3 part types** (21 rows; each part type can also be logged as its own job). **No phantom hours:** labor on every job line is optional and starts blank, so a clamp logged alone adds hours only if someone types them. New part jobs get the same form a job made in Dominion gets (quantity, unit price, labor).
2. **Pilot:** done as you said. `exhaust-1-pilot.sql` adds only the group, Muffler, Exhaust Clamp, Exhaust Hanger and the sealant. The owner opens Muffler in Fleet Log service, ticks the clamp, goes Pick a part → Type it in instead, checks the total, and cancels. `exhaust-2-rest.sql` runs only after that. Saving a part item and its money is already covered by the Fleet end-to-end test, which saves a gasket part item and checks it in the database and in history. So the pilot checks the screens, not the maths.
3. **Rule vs existing supplies:** **Tire Valve Stem** becomes a part type (it comes in sizes); the supply is retired (never used on a saved service) and Tire Change gets it as a part item. **Wheel Weights** stay a supply: stick-on weights fit every rim and the amount is the weight. **Tire Valve Core** and **Tire Patch / Plug Kit** stay supplies (one kind fits all). Written into the Exhaust file.
4. **Cleaning file:** its DPF line is struck through with "Changed 15 Nov", pointing to the Exhaust file. The AdBlue line only ever lived in this reply file and was already fixed in Rev 2.
5. **Gasket double-count:** the Exhaust Manifold Gasket job's description says it is for gasket-only work, and the gasket item on Exhaust Manifold / Header says "Log it here, not as its own job too."

**Minor:**
- **DPF Cleaning Fluid** is now Sometimes: "Fluid flush only; machine cleaning and forced regeneration use none." DPF Cleaning has no Usually item, on purpose, because the method decides what's used.
- **Find parts research** and **HV lockout** are on the service-items audit's Open list (the project's tracked list), not only in batch files. Research runs once `exhaust-2-rest.sql` is live.
- **Inverter coolant:** the supply decision is carried into the hybrid file, not left as a note.

---

Checked against the live app, code and database on 15 Nov 2026. Rev 1 points you accepted (no flag, parts vs supplies, "piece", AdBlue exists, 56 links, new group, Find parts, hybrid scope) are not repeated here.

## 1. Diesel: in. The catalogue covers every car Dominion knows, not just the cars in Fleet today

Both statements were true but about different things. **Fleet** has 2 cars today (1 petrol, 1 petrol hybrid). **Dominion**, the master catalogue that feeds Fleet, lists 2,679 car models: 1,802 petrol, 313 electric, 267 diesel, 236 petrol hybrid, 43 petrol/electric, and a few CNG and hydrogen. The job catalogue is master data, so it is built for every car Dominion lists, not for the 2 cars in Fleet today. A job no car uses costs nothing.

So:

- **The 8 diesel jobs go into the Exhaust file**, using the existing "AdBlue (Diesel Exhaust Fluid)".
- **DPF Cleaning / Regeneration**, which I left out of the cleaning list, comes in with them.
- **Full EV work** (charging, traction motor, pack) gets its own file after hybrid, not "when an EV joins".

## 2. "Empty list = labor-only": part jobs are not affected; no new field

- **A part job's own part is never a May-need item.** In Fleet, every part job has its own part picker, brand and part number on the job line itself. The May-need box ("No standard items suggested…") only covers extras used alongside the job. So **Drive / Serpentine Belt** with an empty list still asks for the belt. It is not labor-only.
- **Engine Air Filter isn't empty.** It offers MAF Sensor Cleaner (Sometimes).
- **"Deliberately empty" vs "not checked yet":** every batch file lists the jobs it leaves empty on purpose. The May-need file named all 10 (Engine service labor, Throttle Body Relearn, Valve Clearance Adjustment, Cylinder Head Machining, Crankshaft Machining, Tire Pressure Check, Rotate Tires, Wheel Straightening, Drive / Serpentine Belt, Inspection / diagnostic fee). The Exhaust file does the same for Exhaust System Inspection. All catalogue changes come in through these reviewed batch files, so the written list is the record. No `reviewed` field.

## 3. Gaskets, clamps and hangers: added as part items on the May-need list, using what the app already has

A May-need item can be a **part type** as well as a supply. In Fleet, a part type shows a **Pick a part** button: parts that fit this car, parts that fit by size, or "Type it in instead". Nothing uses this yet (0 part-type links live), and it is exactly the gap you found. So:

- **3 new part types** (also loggable as their own jobs): **Exhaust Flange Gasket**, **Exhaust Clamp**, **Exhaust Hanger / Rubber Isolator**.
- **Exhaust Manifold / Header** gets **Exhaust Manifold Gasket** (already a job in the draft) as a Usually part item.
- **Catalytic Converter** and **DPF Replacement** get Exhaust Flange Gasket. **Muffler, Resonator, Flex Pipe, Exhaust Pipe / Tailpipe** and **DPF Replacement** get Exhaust Clamp, and Muffler, Resonator and Exhaust Pipe / Tailpipe also get Exhaust Hanger, at the draft's Usually/Sometimes levels.
- **The rule for clamps and similar items:** if one kind fits every car (sprays, greases, sealant, zip ties), it's a **supply**. If it comes in sizes for the car (gaskets, clamps, hangers, hose clamps, fuel-line clips), it's a **part type**. The same rule will apply to cooling hoses and fuel lines.
- **New part types start with no part numbers**, so the team types them in until Find parts research fills them. That's known data-entry debt, and it's the same for every new part job.

## 4. Counts for the Exhaust file

| Batch | Jobs | New supplies | Supply links | Part-type links |
|---|---|---|---|---|
| Petrol exhaust + EVAP | 10 + 3 new part types | 1 (Exhaust Gasket Sealant / Muffler Cement) | 23 | 9 |
| Diesel | 8 | 2 (DPF Cleaning Fluid, DPF Regeneration Additive) | 21 | 2 |
| **Total** | **21** | **3** | **44** | **11** |

The 23 petrol supply links match your count (5+3+3+3+1+2+1+0+3+2). The diesel supply count is 21 because the gasket and clamp on DPF Replacement are now part-type links.

## 5. Smaller flags

- **Inverter coolant:** Inverter Coolant Service gets the note "Use the coolant the car maker specifies; the inverter loop may be separate from the engine loop."
- **HV lockout: known gap, not settled.** Right now no screen records a lockout. It is listed as an open gap for a later checklist feature, and it stays out of the catalogue files.
- **Naming:** top-level groups already use "Battery & electrical", "Tires & wheels" and "Suspension & steering", so **"Exhaust & emissions"** follows that. Engine sections such as "Fluids & Emissions" use Title Case on purpose.

## Next step

Write the Exhaust & emissions file (petrol + diesel, 21 jobs, 3 new supplies, 44 supply links + 11 part-type links) in the cleaning-file format, with SQL tested on live with everything undone afterwards. Then the hybrid file, then full EV.
