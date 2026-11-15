# Electric cars (EV) — for the owner to check (Rev 2, 15 Nov 2026)

**12 jobs**: 10 go into the existing **Hybrid & electric** group, and 2 into **HVAC** (Electric A/C Compressor, and A/C Recharge for every car). 7 part jobs, 5 services. **4 new supplies**, 22 supply suggestions, 1 part suggestion.

**Usually** = used almost every time; **Sometimes** = only when needed. A blank amount means it depends on the car. Nothing is ticked for you in Fleet.

Run `docs/service-items-build/live/ev-add.sql` after you're happy. Rev 2 was tested on the live database with everything undone afterwards: 12 jobs, 4 new supplies, 22 supply links, 1 part link.

The hybrid jobs already live (HV Battery Health Check, HV Battery Module / Pack Replacement) cover EVs too, so they aren't repeated here.

**Rev 2 changes (after review):** added **A/C Recharge** + **A/C Refrigerant**, so a compressor replacement has somewhere to log its refrigerant. Added "don't log both" notes to the two charging-port jobs. Added Dielectric Grease (Sometimes, "only where the car maker specifies") to HV Cable / Connector. Gave HV lockout a target date. Set the drain-plug washer rule.

## The three things the reviewer asked for

1. **Battery thermal-management coolant: its own supply, "EV Battery Coolant".** It's Usually on Battery Thermal Management Coolant Service and Battery Coolant Pump, and Sometimes on the charger, DC-DC converter and motor ("if liquid-cooled"). It's separate from Hybrid Inverter Coolant because an EV battery loop doesn't always use the same coolant as an inverter loop.
2. **HV cable / insulation-resistance inspection: in, as "HV Cable & Insulation Resistance Inspection"** (labor only), covering hybrids and EVs. Its repair job is HV Cable / Connector Replacement.
3. **`part_source`: not built yet.** See the last section.

## New supplies (4)

| Supply | Sold as | Why it's its own supply |
|---|---|---|
| EV Battery Coolant | litre | Battery loop coolant; not always the engine or inverter coolant. |
| EV Reduction Gear Oil | litre | EVs have a single-speed gearbox with its own oil. |
| POE Compressor Oil (Non-Conductive) | bottle | Electric A/C compressors run on high voltage; ordinary PAG oil can make them leak current. POE only. |
| A/C Refrigerant | can | R-134a or R-1234yf, by the bonnet label. One supply, like coolant: "use the type it names". |

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
|  |  |  | A/C Refrigerant | supply | Usually | — | The system is recharged after the compressor is changed. |
| **A/C Recharge** *(all cars)* | HVAC | Service | A/C Refrigerant | supply | Usually | — | Amount is on the bonnet label. Use the type it names. |
|  |  |  | POE Compressor Oil (Non-Conductive) | supply | Sometimes | 1 | Electric compressors only. |
|  |  |  | UV Leak Detection Dye | supply | Sometimes | 1 | Only a dye approved for the system; check before using it on an electric compressor. |

**Don't log the charging port twice:** **Charging Port** is for a port replacement on its own. If the port is replaced during an inspection, tick Charging Port as the part item on **Charging Port Inspection & Cleaning** instead. Both job descriptions and hints say so (same pattern as the exhaust manifold gasket).

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

## Open items this file touches

- **Find parts research:** 7 more part jobs (HV Cable / Connector, Battery Coolant Pump, Charging Port, On-Board Charger, DC-DC Converter, Electric A/C Compressor, Traction Motor). **Backlog 22 + 7 = 29.**
- **HV lockout checklist: target 30 Nov 2026, owner Deeki T, blocked on the screen design** (Deeki makes it in Stitch, then it's built). **As of 15 Nov: 0 HV services logged** (checked on live), so no audit gap exists yet. Each HV service logged without a lockout record is a permanent gap.
- **`part_source`: not built. Rule: no Exhaust, Hybrid or EV part items on real services until it ships.** **As of 15 Nov: 1 saved item row in total, and it's a supply; 0 part-item rows** (checked on live). Part items are the only rows `part_source` matters for, so the clean window is still fully open. It ships before the first real part item is saved. It's the next build item after this SQL runs.
