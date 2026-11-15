# Exhaust & emissions — for the owner to check (15 Nov 2026)

A new top-level group, **Exhaust & emissions**, with **18 jobs + 3 part types** (21 rows in all; each part type can also be logged as its own job). It also adds 3 new supplies, 44 supply suggestions and 11 part suggestions, and moves Tire Valve Stem from a supply to a part type.

**Usually** = used almost every time; **Sometimes** = only when needed. A blank amount means it depends on the car. Nothing is ticked for you in Fleet; these are only offered.

- **Part job** = the job asks for the part on its own line (part picker, brand, part number) and shows in Find parts.
- **Service** = labor only on the line; the supplies carry the material cost.
- **Part item** = a part shown on another job's May-need list, with a **Pick a part** button (fits this car / fits by size / type it in instead). This is the first time part items are used.

The catalogue covers every car Dominion lists (267 diesel models among them), not only the cars in Fleet today. Jobs marked "Diesel only" never appear on a petrol car's history unless someone logs them.

## Run it in two SQL steps, checking in Fleet after each

1. **Pilot:** ✅ ran 15 Nov — Muffler shows 3 supplies + 2 parts. Run `docs/service-items-build/live/exhaust-1-pilot.sql`. It adds the group, the **Muffler** job, the Exhaust Clamp and Exhaust Hanger part types, and the sealant supply.
2. **Check in Fleet** (nothing is saved): open Log service on any car → Exhaust & emissions → Muffler. Under Items used you should see 3 supplies and 2 parts. Tick **Exhaust Clamp** → **Pick a part** → **Type it in instead** → type any brand → the total updates. Then press Cancel. Tell Claude what you saw.
3. **Run the rest:** ✅ ran 15 Nov — verified live by Claude: 21 rows, 44 supply / 11 part links, 3 new supplies, Tire Valve Stem supply retired with no links left. `docs/service-items-build/live/exhaust-2-rest.sql`.
**Both Fleet checks PASSED 15 Nov (owner, Toyota Roomy, nothing saved):** Muffler showed 3 supplies + 2 parts; Exhaust Clamp → Pick a part → "No parts are listed for this car yet. Type it in instead" → typed brand saved on the item → cost J$ 1,500 went into the total. Exhaust Manifold / Header showed Exhaust Manifold Gasket as a part item, and the typed brand saved the same way. Found + fixed on the way: a typed-in part showed the green "verified" tick; it now shows only for parts picked from the car's own list (`ItemsUsedSection.tsx`, Fleet tests 52/52; not deployed yet).

4. **Check in Fleet** (nothing is saved): Log service → Exhaust & emissions → **Exhaust Manifold / Header**. The **Exhaust Manifold Gasket** item should show; tick it and press **Pick a part**. It should open with the same three choices as step 2 (fits this car / fits by size / type it in instead). Then Cancel. Tell Claude what you saw.

Both were tested together on the live database with everything undone afterwards: 21 rows, 44 supply links, 11 part links, and Tire Valve Stem moved. Saving a part item is already covered by the Fleet end-to-end test (it saves a gasket part item).

## New supplies (3)

| Supply | Sold as | What it is |
|---|---|---|
| Exhaust Gasket Sealant / Muffler Cement | tube | Heat-proof paste for slip joints and flanges with no gasket. |
| DPF Cleaning Fluid | can | Solvent flush that clears soot from a DPF. |
| DPF Regeneration Additive | bottle | Fuel additive that helps a DPF burn off soot. |

AdBlue already exists as **AdBlue (Diesel Exhaust Fluid)** and is reused.

## New part types (3) — sized per car, so parts, not supplies

**How part items work (one mechanism):** in the app, a "part type" is simply a part job. A May-need part item can point at **any** active part job; the database allows exactly that and nothing else (`maintenance_job_item_guard`: kind = component, is_part = true). So **Exhaust Manifold Gasket**, a part job in this batch, is the part item on Exhaust Manifold / Header, the same way the 3 below are. That makes **4 new part items** in this group: the 3 new part types plus Exhaust Manifold Gasket. Separately, Tire Valve Stem moves from supply to part type and becomes a part item on Tire Change. The Fleet end-to-end test uses this path: it links an existing gasket part job as a part item on another job, saves it, and checks the database and history.

| Part type | Fit | Used as a part item on |
|---|---|---|
| Exhaust Flange Gasket | by size | Catalytic Converter, DPF Replacement |
| Exhaust Clamp | by size | Muffler, Resonator, Flex Pipe, Exhaust Pipe / Tailpipe, DPF Replacement |
| Exhaust Hanger / Rubber Isolator | by size | Muffler, Resonator, Exhaust Pipe / Tailpipe |

## Petrol exhaust + EVAP (10 jobs)

| Job | Kind | Item | Supply / part | How often | Amount | Note |
|---|---|---|---|---|---|---|
| **Exhaust Manifold / Header** | Part job | Penetrating Oil | supply | Usually | 1 | Rusted studs and nuts. |
|  |  | Anti-Seize Compound | supply | Usually | 1 | On studs and flange faces. |
|  |  | Exhaust Manifold Gasket | part | Usually | 1 | Log it here, not as its own job too. |
|  |  | Exhaust Gasket Sealant / Muffler Cement | supply | Sometimes | 1 | If no gasket is used. |
|  |  | Brake Cleaner | supply | Sometimes | 1 | Clean the mating faces. |
|  |  | Thread-Locking Fluid | supply | Sometimes | 1 |  |
| **Exhaust Manifold Gasket** | Part job | Anti-Seize Compound | supply | Usually | 1 |  |
|  |  | Penetrating Oil | supply | Sometimes | 1 |  |
|  |  | Brake Cleaner | supply | Sometimes | 1 | Clean the sealing faces. |
| **Catalytic Converter** | Part job | Penetrating Oil | supply | Usually | 1 |  |
|  |  | Anti-Seize Compound | supply | Usually | 1 | Flange and sensor threads. |
|  |  | Exhaust Flange Gasket | part | Sometimes | 1 |  |
|  |  | Exhaust Gasket Sealant / Muffler Cement | supply | Sometimes | 1 |  |
| **Muffler** *(pilot)* | Part job | Penetrating Oil | supply | Usually | 1 |  |
|  |  | Exhaust Gasket Sealant / Muffler Cement | supply | Usually | 1 | Slip joints. |
|  |  | Anti-Seize Compound | supply | Sometimes | 1 |  |
|  |  | Exhaust Clamp | part | Usually | 1 |  |
|  |  | Exhaust Hanger / Rubber Isolator | part | Sometimes | 1 | If the old one is perished. |
| **Resonator** | Part job | Penetrating Oil | supply | Usually | 1 |  |
|  |  | Exhaust Clamp | part | Usually | 1 |  |
|  |  | Exhaust Hanger / Rubber Isolator | part | Sometimes | 1 |  |
| **Flex Pipe** | Part job | Penetrating Oil | supply | Usually | 1 |  |
|  |  | Exhaust Gasket Sealant / Muffler Cement | supply | Sometimes | 1 |  |
|  |  | Exhaust Clamp | part | Sometimes | 1 |  |
| **Exhaust Pipe / Tailpipe** | Part job | Penetrating Oil | supply | Usually | 1 |  |
|  |  | Exhaust Clamp | part | Usually | 1 |  |
|  |  | Exhaust Hanger / Rubber Isolator | part | Sometimes | 1 |  |
| **Exhaust System Inspection** | Service | — | — | — | — | Labor only, on purpose. |
| **EVAP / Charcoal Canister** | Part job | Brake Cleaner | supply | Sometimes | 1 | Clean the mounting area. |
|  |  | Electrical Contact Cleaner | supply | Sometimes | 1 | Purge valve connector. |
|  |  | Penetrating Oil | supply | Sometimes | 1 | Rusted fasteners. |
| **Purge Valve** | Part job | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
|  |  | Dielectric Grease | supply | Sometimes | 1 | Connector seal. |

**Don't log the gasket twice:** when the manifold is replaced, the gasket is an item on the Exhaust Manifold / Header job. The Exhaust Manifold Gasket job is for gasket-only work, and its description says so.

## Diesel (8 jobs)

| Job | Kind | Item | Supply / part | How often | Amount | Note |
|---|---|---|---|---|---|---|
| **DPF Cleaning / Regeneration** | Service | DPF Cleaning Fluid | supply | Sometimes | 1 | Fluid flush only; machine cleaning and forced regeneration use none. |
|  |  | EGR & Carbon Cleaner | supply | Sometimes | 1 | Heavy soot on the housing. |
|  |  | DPF Regeneration Additive | supply | Sometimes | 1 | Additive-assisted regeneration only. |
| **DPF Replacement** | Part job | Penetrating Oil | supply | Usually | 1 |  |
|  |  | Anti-Seize Compound | supply | Usually | 1 |  |
|  |  | Exhaust Flange Gasket | part | Usually | 1 |  |
|  |  | Exhaust Clamp | part | Sometimes | 1 |  |
| **SCR / AdBlue System Service** | Service | AdBlue (Diesel Exhaust Fluid) | supply | Usually | — | Amount depends on the car. |
|  |  | Electrical Contact Cleaner | supply | Sometimes | 1 | Pump and sensor connectors. |
|  |  | Brake Cleaner | supply | Sometimes | 1 | Clean the mounting area. |
| **AdBlue / DEF Top-up** | Service | AdBlue (Diesel Exhaust Fluid) | supply | Usually | — | Amount depends on the car. |
| **NOx Sensor** | Part job | Anti-Seize Compound | supply | Usually | 1 | Only if the new sensor is not pre-coated. |
|  |  | Penetrating Oil | supply | Sometimes | 1 | For a seized old sensor. |
|  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
|  |  | Dielectric Grease | supply | Sometimes | 1 |  |
| **Glow Plugs** | Part job | Anti-Seize Compound | supply | Usually | 1 | On the plug threads. |
|  |  | Penetrating Oil | supply | Sometimes | 1 | Soak a seized plug before removal. |
|  |  | Dielectric Grease | supply | Sometimes | 1 |  |
| **Exhaust Gas Temperature (EGT) Sensor** | Part job | Anti-Seize Compound | supply | Usually | 1 |  |
|  |  | Penetrating Oil | supply | Sometimes | 1 |  |
|  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
| **DPF Differential Pressure Sensor** | Part job | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
|  |  | Dielectric Grease | supply | Sometimes | 1 |  |

## Tire Valve Stem moves from supply to part type

Valve stems come in sizes (snap-in rubber or TPMS, by rim hole), so by the rule they're a part type. **Tire Valve Stem** becomes a part type in Tires & wheels and a Sometimes part item on **Tire Change** ("One per tire."). The old supply is retired; it was never used on a saved service.

**Kept as supplies, by the same rule:**
- **Wheel Weights**: stick-on weights fit every rim, and the amount is how much weight goes on.
- **Tire Valve Core**: one standard thread fits every valve.
- **Tire Patch / Plug Kit**: one kit fits every tire.

## Left empty on purpose

- **Exhaust System Inspection**: labor only.
- **Exhaust Flange Gasket, Exhaust Clamp, Exhaust Hanger** as their own jobs: the part is the job. Labor is optional and starts blank, so logging a clamp alone adds no hours unless someone types them.

## Left out on purpose

- **Exhaust wrap / heat tape, exhaust cutouts, welding consumables**: shop tooling or modifications, not per-car supplies.
- **Oxygen sensor, PCV Valve, EGR Valve Cleaning**: they stay in Engine › Fluids & Emissions, not moved or copied here.

## Known gaps (on the service-items audit's Open list)

- **Find parts research** for 18 items: the 3 new part types, 14 new part jobs and Tire Valve Stem. Until it's done, "Fits your car" shows nothing for them and the team types them in.
- **HV lockout is recorded nowhere.** It goes in the hybrid file's design, and it's a separate checklist feature.
