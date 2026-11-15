# Electric cars (EV) — for the owner to check (15 Nov 2026)

**11 jobs**: 10 go into the existing **Hybrid & electric** group, and 1 (Electric A/C Compressor) into **HVAC**. 7 part jobs, 4 services. **3 new supplies**, 17 supply suggestions, 1 part suggestion.

**Usually** = used almost every time; **Sometimes** = only when needed. A blank amount means it depends on the car. Nothing is ticked for you in Fleet.

Run `docs/service-items-build/live/ev-add.sql` after you're happy. It was tested on the live database with everything undone afterwards: 11 jobs, 17 supply links, 1 part link.

The hybrid jobs already live (HV Battery Health Check, HV Battery Module / Pack Replacement) cover EVs too, so they aren't repeated here.

## The three things the reviewer asked for

1. **Battery thermal-management coolant: its own supply, "EV Battery Coolant".** It's Usually on Battery Thermal Management Coolant Service and Battery Coolant Pump, and Sometimes on the charger, DC-DC converter and motor ("if liquid-cooled"). It's separate from Hybrid Inverter Coolant because an EV battery loop doesn't always use the same coolant as an inverter loop. Both supplies say "use the type the car maker specifies".
2. **HV cable / insulation-resistance inspection: in, as "HV Cable & Insulation Resistance Inspection"** (labor only). It covers hybrids and EVs, as the hybrid file promised. Its repair job is HV Cable / Connector Replacement.
3. **`part_source`: not built yet.** See the last section.

## New supplies (3)

| Supply | Sold as | Why it's its own supply |
|---|---|---|
| EV Battery Coolant | litre | Battery loop coolant; not always the engine or inverter coolant. |
| EV Reduction Gear Oil | litre | EVs have a single-speed gearbox with its own oil. |
| POE Compressor Oil (Non-Conductive) | bottle | Electric A/C compressors run on high voltage; ordinary PAG oil can make them leak current. POE only. |

## Jobs

| Job | Group | Kind | Item | Supply / part | How often | Amount | Note |
|---|---|---|---|---|---|---|---|
| **HV Cable & Insulation Resistance Inspection** | Hybrid & electric | Service | — | — | — | — | Labor only, on purpose. |
| **HV Cable / Connector Replacement** | Hybrid & electric | Part job | Electrical Contact Cleaner | supply | Sometimes | 1 | Never grease HV connectors unless the car maker says so. |
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

Every high-voltage job's hint says **"High-voltage: lockout first."** That's a reminder only, until the HV lockout checklist exists.

## Left empty on purpose

- **HV Cable & Insulation Resistance Inspection**: labor only.

## Left out on purpose

- **Software / module updates and ADAS calibration**: not high-voltage work, and labor only. They belong in a later Battery & electrical file.
- **A/C refrigerant recharge**: there's no A/C recharge job in the catalogue yet, for any car. It needs its own HVAC file.
- **Battery heater / chiller**: these are parts inside the battery thermal system and are logged under Battery Thermal Management Coolant Service until there's demand.
- **PPE and insulated tools**: shop tooling, not per-car supplies.
- **12V battery**: the existing Battery job.

## Open items this file touches

- **Find parts research:** 7 more part jobs (HV Cable / Connector, Battery Coolant Pump, Charging Port, On-Board Charger, DC-DC Converter, Traction Motor, Electric A/C Compressor). **Backlog 22 + 7 = 29.**
- **HV lockout:** owner Deeki T, pending design. Unchanged; still the one with insurer and warranty exposure. This file adds more HV jobs, so it moves up.
- **`part_source`: not built.** A saved part item still can't tell fits-by-size from typed-in. The badge is safe on reload (never falsely verified), but the data gap grows with every real item saved. Today there is still only 1 saved item row. Next step: its own small round (one database column, the save path, and Fleet sending it), done before any Exhaust, Hybrid or EV part item is used on a real service.
