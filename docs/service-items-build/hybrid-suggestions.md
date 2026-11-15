# Hybrid & electric — for the owner to check (15 Nov 2026)

A new top-level group, **Hybrid & electric**, with **7 hybrid jobs** (4 part jobs, 3 services), **1 new supply**, 10 supply suggestions and 1 part suggestion. Full-EV jobs (charging port, on-board charger, traction motor, DC-DC converter) come later, in the same group.

**Usually** = used almost every time; **Sometimes** = only when needed. A blank amount means it depends on the car. Nothing is ticked for you in Fleet.

✅ **Ran on live 15 Nov** (after the tick-fix deploy), checked by Claude: 7 jobs, 10 supply links, 1 part link, new coolant supply active. `docs/service-items-build/live/hybrid-add.sql`. It was tested on the live database with everything undone afterwards: 7 jobs, 10 supply links, 1 part link.

## Decision: inverter coolant gets its own supply

**Hybrid Inverter Coolant (Low-Conductivity)**, sold by the litre. Most hybrids cool the inverter and motor on a separate loop that needs a low-conductivity coolant (for example Toyota SLLC, Honda Type 2). Logging it as ordinary Coolant / Antifreeze would put the wrong product in the history and the wrong cost on the job. Its description says to use the type the car maker specifies and never to top up with engine coolant.

## Jobs

| Job | Kind | Item | Supply / part | How often | Amount | Note |
|---|---|---|---|---|---|---|
| **HV Battery Health Check** | Service | — | — | — | — | Labor only, on purpose. |
| **HV Battery Cooling Fan Filter** | Part job | Cabin Filter Housing Cleaner | supply | Sometimes | 1 | Clean the filter housing. |
| **HV Battery Cooling Fan & Duct Cleaning** | Service | Cabin Filter Housing Cleaner | supply | Usually | 1 | Fan and duct. |
|  |  | Electrical Contact Cleaner | supply | Sometimes | 1 | Fan motor connector. |
|  |  | HV Battery Cooling Fan Filter | part | Sometimes | 1 | If the filter is dirty or torn. |
| **Inverter Coolant Service** | Service | Hybrid Inverter Coolant (Low-Conductivity) | supply | Usually | — | Amount depends on the car. Use the type the car maker specifies. |
|  |  | Distilled Water | supply | Sometimes | — | Only if the coolant is a concentrate. |
| **Inverter Coolant Pump** | Part job | Hybrid Inverter Coolant (Low-Conductivity) | supply | Usually | — | Refill after the pump is changed. |
|  |  | Electrical Contact Cleaner | supply | Sometimes | 1 |  |
|  |  | Dielectric Grease | supply | Sometimes | 1 | Pump connector. |
| **HV Battery Module Replacement** | Part job | Electrical Contact Cleaner | supply | Usually | 1 | Bus bars and terminals. |
| **HV Battery Pack Replacement** | Part job | Electrical Contact Cleaner | supply | Sometimes | 1 | Main connectors. |

Every high-voltage job's description and hint says **"High-voltage work: lockout first."** That's a reminder only; see the HV lockout section below.

## Changed from the earlier plan

- **Regen Brake Service is dropped.** Brake work on a hybrid is the normal Brakes job with its existing supplies. A separate job would split brake history in two.
- **Added:** HV Battery Cooling Fan & Duct Cleaning (the fan clogs on rideshare cars that run all day), Inverter Coolant Pump (a known hybrid failure), and HV Battery Module / Pack Replacement.

## HV lockout: pending design, owner = Deeki T

No screen records that a high-voltage lockout was done before HV work. That's the insurer and warranty exposure. Plan: a **safety checklist on HV jobs** in Log service (lockout done, by whom, gloves checked), saved with the service. It's a screen + server feature, not a catalogue job, so it gets its own plan after the EV file. It's on the service-items audit's Open list with Deeki T as owner.

## Left empty on purpose

- **HV Battery Health Check**: labor only.

## Left out on purpose

- **PPE (insulating gloves, lockout tags)**: shop tooling, not a per-car supply.
- **12V auxiliary battery**: the existing **Battery** job covers it.
- **Full-EV jobs**: they come in the EV file.
- **Battery pack coolant**: not added. The hybrid packs here are air-cooled (hence the cooling-fan jobs). Liquid-cooled PHEV / EV packs get a battery thermal-management coolant in the EV file.
- **HV cable / insulation-resistance inspection**: deferred to the EV file on purpose. It applies to hybrids too, and the EV file adds it to this same group, where it covers both.

## Find parts research

The 4 new part jobs (HV Battery Cooling Fan Filter, Inverter Coolant Pump, HV Battery Module, HV Battery Pack) start with no parts, the same as the Exhaust batch. Added to the Open list (Exhaust 18 + Hybrid 4 = **22**).
