# Electric cars (EV) — for the owner to check (Rev 4, 15 Nov 2026)

**12 jobs**: 10 go into the existing **Hybrid & electric** group, and 2 into **HVAC** (Electric A/C Compressor, and A/C Recharge for every car). 7 part jobs, 5 services. **5 new supplies**, 24 supply suggestions, 1 part suggestion.

**Usually** = used almost every time; **Sometimes** = only when needed. A blank amount means it depends on the car. Nothing is ticked for you in Fleet.

✅ **Ran on live 15 Nov** (the whole `docs/service-items-build/live/ev-add.sql`, by the owner), checked by Claude: 12 jobs, 5 new supplies, 24 supply links, 1 part link; no leftover single "A/C Refrigerant" supply; both Inverter Coolant jobs got their "don't log both" note. Still 0 part-item rows and 0 HV services.

The hybrid jobs already live (HV Battery Health Check, HV Battery Module / Pack Replacement) cover EVs too, so they aren't repeated here.

**Rev 4 changes (after review, docs only; the SQL text changes ran with it):** "don't log both" on both coolant-pump pairs (the live hybrid pair updated by the same SQL); the O-ring / receiver-drier note on Electric A/C Compressor; the HV rule now requires logging in the app with a lockout note, never "outside the app"; the "usually one of these" limitation is written down; conventional A/C compressor + PAG oil named for the HVAC file; follow-ups and conventions sections.

**Rev 3 changes (after review):** A/C refrigerant split into **R-134a** and **R-1234yf** (different products, very different prices, the same reasoning as Hybrid Inverter Coolant). "Don't log both" notes on Electric A/C Compressor / A/C Recharge. HV services gated until the lockout checklist ships. UV Leak Detection Dye confirmed as an existing supply (SUP-00039, already on Leak Inspection).

**Rev 2 changes (after review):** added **A/C Recharge** + **A/C Refrigerant**, so a compressor replacement has somewhere to log its refrigerant. Added "don't log both" notes to the two charging-port jobs. Added Dielectric Grease (Sometimes, "only where the car maker specifies") to HV Cable / Connector. Gave HV lockout a target date. Set the drain-plug washer rule.

## The three things the reviewer asked for

1. **Battery thermal-management coolant: its own supply, "EV Battery Coolant".** It's Usually on Battery Thermal Management Coolant Service and Battery Coolant Pump, and Sometimes on the charger, DC-DC converter and motor ("if liquid-cooled"). It's separate from Hybrid Inverter Coolant because an EV battery loop doesn't always use the same coolant as an inverter loop.
2. **HV cable / insulation-resistance inspection: in, as "HV Cable & Insulation Resistance Inspection"** (labor only), covering hybrids and EVs. Its repair job is HV Cable / Connector Replacement.
3. **`part_source`: not built yet.** See the last section.

## New supplies (5)

| Supply | Sold as | Why it's its own supply |
|---|---|---|
| EV Battery Coolant | litre | Battery loop coolant; not always the engine or inverter coolant. |
| EV Reduction Gear Oil | litre | EVs have a single-speed gearbox with its own oil. |
| POE Compressor Oil (Non-Conductive) | bottle | Electric A/C compressors run on high voltage; ordinary PAG oil can make them leak current. POE only. |
| A/C Refrigerant R-134a | can | Older cars. Different product, fittings and price from R-1234yf. |
| A/C Refrigerant R-1234yf | can | Most newer cars. Costs several times more than R-134a, so it gets its own supply for honest costs. |

**Existing supplies reused (checked on live):** Electrical Contact Cleaner (SUP-00014), Dielectric Grease (SUP-00024), Distilled Water (SUP-00046), UV Leak Detection Dye (SUP-00039, already on Leak Inspection). CO2 (R-744) A/C on some newer EVs would need a third refrigerant later; not added yet.

## Jobs

| Job | Group | Kind | Item | Supply / part | How often | Amount | Note |
|---|---|---|---|---|---|---|---|
| **HV Cable & Insulation Resistance Inspection** | Hybrid & electric | Service | — | — | — | — | Labor only, on purpose. |
| **HV Cable / Connector Replacement** | Hybrid & electric | Part job | Electrical Contact Cleaner | supply | Sometimes | 1 | Never grease HV connectors unless the car maker says so. |
|  |  |  | Dielectric Grease | supply | Sometimes | 1 | Only where the car maker specifies it. |
| **Battery Thermal Management Coolant Service** | Hybrid & electric | Service | EV Battery Coolant | supply | Usually | — | Amount depends on the car. Use the type the car maker specifies. |
|  |  |  | Distilled Water | supply | Sometimes | — | Only if the coolant is a concentrate. |
| **Battery Coolant Pump** | Hybrid & electric | Part job | EV Battery Coolant | supply | Usually | — | Refill after the pump is changed. |
|  |  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
|  |  |  | Dielectric Grease | supply | Sometimes | 1 | Pump connector (low-voltage) only. |
| **Charging Port** | Hybrid & electric | Part job | Electrical Contact Cleaner | supply | Sometimes | 1 | Never grease the charging pins. |
| **Charging Port Inspection & Cleaning** | Hybrid & electric | Service | Electrical Contact Cleaner | supply | Usually | 1 | Charging pins. Never grease them. |
|  |  |  | Charging Port | part | Sometimes | 1 | If the pins are burnt, bent or loose. |
| **On-Board Charger** | Hybrid & electric | Part job | EV Battery Coolant | supply | Sometimes | — | If the charger is liquid-cooled. |
|  |  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
| **DC-DC Converter** | Hybrid & electric | Part job | EV Battery Coolant | supply | Sometimes | — | If the converter is liquid-cooled. |
|  |  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
| **Traction Motor** | Hybrid & electric | Part job | EV Reduction Gear Oil | supply | Sometimes | — | If the gearbox is opened. |
|  |  |  | EV Battery Coolant | supply | Sometimes | — | If the motor is liquid-cooled. |
|  |  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
| **Reduction Gear Oil Change** | Hybrid & electric | Service | EV Reduction Gear Oil | supply | Usually | — | Amount depends on the car. |
| **Electric A/C Compressor** | HVAC | Part job | POE Compressor Oil (Non-Conductive) | supply | Usually | 1 | POE only. Never PAG oil in an electric compressor. |
|  |  |  | A/C Refrigerant R-134a | supply | Usually | — | Only if the bonnet label says R-134a. Recharged after the compressor is changed. |
|  |  |  | A/C Refrigerant R-1234yf | supply | Usually | — | Only if the bonnet label says R-1234yf. Recharged after the compressor is changed. |
| **A/C Recharge** *(all cars)* | HVAC | Service | A/C Refrigerant R-134a | supply | Usually | — | Only if the bonnet label says R-134a. Amount is on the label. |
|  |  |  | A/C Refrigerant R-1234yf | supply | Usually | — | Only if the bonnet label says R-1234yf. Amount is on the label. |
|  |  |  | POE Compressor Oil (Non-Conductive) | supply | Sometimes | 1 | Electric compressors only. |
|  |  |  | UV Leak Detection Dye | supply | Sometimes | 1 | Only a dye approved for the system; check before using it on an electric compressor. |

**Don't log the charging port twice:** **Charging Port** is for a port replacement on its own. If the port is replaced during an inspection, tick Charging Port as the part item on **Charging Port Inspection & Cleaning** instead. Both job descriptions and hints say so (same pattern as the exhaust manifold gasket).

**Don't log the refrigerant twice:** when a compressor is replaced, the refrigerant is logged on **Electric A/C Compressor**. Don't also log **A/C Recharge** for the same visit. Both job descriptions say so.

**Why A/C Recharge is in the EV file:** it's for every car, and it belongs to HVAC long-term. It's in this batch because the EV compressor job exposed the gap (refrigerant had nowhere to go).

Every high-voltage job's hint says **"High-voltage: lockout first."** That's a reminder only, until the HV lockout checklist exists.

## Rule set now: drain-plug washers

A drain-plug crush washer comes in sizes, so it's a **part type**, not a supply, and not bundled into the oil. It will be added once, as "Drain Plug Washer", and offered as a Sometimes part item on every drain-and-fill job: engine oil, transmission, differential and reduction gear oil. That happens in the Fluids / Drivetrain file, so all of those jobs get it at the same time.

## Left empty on purpose

- **HV Cable & Insulation Resistance Inspection**: labor only.

## Left out on purpose

- **Software / module updates and ADAS calibration**: not high-voltage work, and labor only. They belong in a later Battery & electrical file.
- **Battery heater / chiller**: logged under Battery Thermal Management Coolant Service until there's demand.
- **PPE and insulated tools**: shop tooling, not per-car supplies.
- **12V battery**: the existing Battery job.
- **Conventional (belt-driven) A/C Compressor job and PAG oil:** not in this batch (EV-only). They're added in the HVAC file, alongside A/C Recharge's long-term home, together with **A/C O-Ring Kit** and **Receiver-Drier** as part types (sized), offered on both compressor jobs. Until then, the Electric A/C Compressor description tells the tech to add O-rings and a receiver-drier as Other items.

## Follow-ups this file leaves

- **Drain Plug Washer → Reduction Gear Oil Change.** When the Fluids / Drivetrain file creates Drain Plug Washer, add it to Reduction Gear Oil Change too. It's the one EV job that needs it and isn't in that file's scope.
- **2-minute check now that it's live** (nothing saved; HV rule above means don't finish it on a real car): Log service → Hybrid & electric → **Charging Port Inspection & Cleaning** → step 3 → **Charging Port** shows as a part item → tick it → **Pick a part** → Cancel. Proves the part-item path on this batch's own job pair.

## Conventions this file sets (for every future file)

1. **Double-log rule:** when a part that holds a fluid is replaced, the fluid is logged on the **part job**, not on the separate fluid service, and both job descriptions say "don't log both for the same visit". Applied here to Electric A/C Compressor / A/C Recharge, Battery Coolant Pump / Battery Thermal Management Coolant Service, and (live, updated by this SQL) Inverter Coolant Pump / Inverter Coolant Service. The Cooling (water pump / coolant flush), Transmission and Drivetrain files follow it.
2. **"Usually one of these":** A/C Recharge and Electric A/C Compressor show both refrigerants as Usually, because a recharge almost always uses one, and the bonnet label decides which. The screen can't say "usually one of these" today. The same shape will come back with oil grades, brake fluid DOT 3 / 4 / 5.1 and coolant types. On the audit Open list as a product question.
3. **Every batch file lists its reused supplies with their SUP codes** ("Existing supplies reused (checked on live)").

## Open items this file touches

- **Find parts research:** 7 more part jobs (HV Cable / Connector, Battery Coolant Pump, Charging Port, On-Board Charger, DC-DC Converter, Electric A/C Compressor, Traction Motor). **Backlog 22 + 7 = 29.**
- **HV lockout checklist: target 30 Nov 2026, owner Deeki T, blocked on the screen design** (Deeki makes it in Stitch, then it's built). **As of 15 Nov: 0 HV services logged** (checked on live), so no audit gap exists yet. **Rule (Rev 4): HV work waits until the checklist ships wherever it can. If it can't wait (a safety fault, or the car is off the road), log it in the app, never outside it, with a line in the service notes: "HV lockout done by <name> at <time>".** When the checklist ships, those services get their checklist filled in from that note. "Done outside the app" is not allowed: it would leave no service history at all.
- **`part_source`: not built. Rule: no Exhaust, Hybrid or EV part items on real services until it ships.** **As of 15 Nov: 1 saved item row in total, and it's a supply; 0 part-item rows** (checked on live). Part items are the only rows `part_source` matters for, so the clean window is still fully open. It ships before the first real part item is saved. It's the next build item after this SQL runs.
