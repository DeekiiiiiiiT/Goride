# Cleaning jobs — for the owner to check (Rev 2, 15 Nov 2026)

10 new cleaning jobs, 5 new supplies, 20 supply suggestions on the new jobs, and 9 extra suggestions on jobs you already have. **Usually** = used almost every time; **Sometimes** = only when needed. A blank amount means it depends on the car (your team types it). Nothing is ticked for you in Fleet; these are only offered.

Change anything you like: tell Claude, or edit in Dominion after it's added. Run `docs/service-items-build/live/cleaning-jobs-add.sql` only after you're happy. Rev 2 was tested on the live database with everything undone afterwards: all 10 jobs landed in the right place, with 20 suggestions on the new jobs and 9 extras.

**Rev 2 changes (after review):** the carbon job is now walnut blasting only, with Walnut Blasting Media as Usually and a blank amount (the chemical method is the Induction Service job you already have). Added A/C Disinfectant Fogger (Sometimes) to A/C Evaporator Cleaning, and EGR & Carbon Cleaner (Sometimes) to Induction Service.

**Checked on live, nothing to fix:** MAF Sensor Cleaner, Carburetor Cleaner, Silicone Brake Grease and Brake Anti-Squeal Compound already exist and are in use. No "Brake Caliper Grease" supply exists, so there's nothing to merge. The three Engine sections (Air Intake & Induction, Fuel System, Fluids & Emissions) already exist. Leak Inspection already offers UV Leak Detection Dye.

Every new job asks for **labor only** in Log service. The supplies carry the material cost, the same as Throttle Body Cleaning today.

## Already in the app (nothing to add)

- **Throttle Body Cleaning** and **Fuel Injector Cleaning / Induction Service** are already jobs.
- **Brake cleaning** is already covered: Brakes, Brake rotor and Brake caliper offer Brake Cleaner, Silicone Brake Grease and Anti-Squeal.
- **Cabin filter housing cleaning** is already covered: both cabin filter jobs offer Cabin Filter Housing Cleaner.
- **Wheel hub cleaning**: Brake rotor already offers Brake Cleaner and Anti-Seize on the hub face.

## New supplies (5)

| Supply | Sold as | What it is |
|---|---|---|
| EGR & Carbon Cleaner | can | Strong spray for carbon on the EGR valve and turbo. |
| Walnut Blasting Media | pack | Crushed walnut shell for scrubbing carbon off intake valves. |
| A/C Evaporator Cleaner Foam | can | Foam that cleans mould out of the A/C evaporator. |
| A/C Disinfectant Fogger | can | Fogger that disinfects the vents and ducts. |
| Battery Terminal Cleaner | can | Spray that dissolves corrosion on battery terminals. |

## New jobs (10)

### Engine

| Job | Engine section | Supply | How often | Usual amount | Note |
|---|---|---|---|---|---|
| **EGR Valve Cleaning** | Fluids & Emissions | EGR & Carbon Cleaner | Usually | 1 |  |
|  |  | Penetrating Oil | Sometimes | 1 | For seized bolts. |
|  |  | Brake Cleaner | Sometimes | 1 | Clean the gasket faces. |
| **Intake Valve Carbon Cleaning (Walnut Blasting)** | Air Intake & Induction | Walnut Blasting Media | Usually | — | Amount depends on the engine size. |
|  |  | Engine Oil | Sometimes | — | Oil is often changed after a carbon clean. |
| **MAF / MAP Sensor Cleaning** | Air Intake & Induction | MAF Sensor Cleaner | Usually | 1 |  |
|  |  | Electrical Contact Cleaner | Sometimes | 1 | For the MAP sensor and plugs. |
| **Engine Bay Degreasing** | Fluids & Emissions | Degreaser | Usually | 2 |  |
| **Carburetor Cleaning** | Fuel System | Carburetor Cleaner | Usually | 1 |  |
| **Intercooler Cleaning** | Air Intake & Induction | Degreaser | Usually | 1 |  |
|  |  | Brake Cleaner | Sometimes | 1 |  |
| **Turbo Decoking** | Air Intake & Induction | Induction / Fuel Injector Cleaner | Usually | 1 |  |
|  |  | EGR & Carbon Cleaner | Sometimes | 1 |  |

### HVAC

| Job | Supply | How often | Usual amount | Note |
|---|---|---|---|---|
| **A/C Evaporator Cleaning** | A/C Evaporator Cleaner Foam | Usually | 1 |  |
|  | Cabin Filter Housing Cleaner | Sometimes | 1 | If the cabin filter housing is cleaned too. |
|  | A/C Disinfectant Fogger | Sometimes | 1 | If the vents are disinfected at the same time. |
| **A/C Vent Disinfection** | A/C Disinfectant Fogger | Usually | 1 |  |

### Battery & electrical

| Job | Supply | How often | Usual amount | Note |
|---|---|---|---|---|
| **Battery Terminal Cleaning** | Battery Terminal Cleaner | Usually | 1 |  |
|  | Battery Terminal Protector | Usually | 1 |  |
|  | Dielectric Grease | Sometimes | 1 |  |

## Extras on jobs you already have (9)

| Job | Supply | How often | Usual amount | Note |
|---|---|---|---|---|
| **Fuel Injector Cleaning / Induction Service** | EGR & Carbon Cleaner | Sometimes | 1 | For heavy carbon. |
| **Transmission Fluid** | Brake Cleaner | Sometimes | 1 | Clean the pan and magnet. |
| **Suspension** | Degreaser | Sometimes | 1 | Clean parts to check for wear. |
| **Shock absorber** | Degreaser | Sometimes | 1 | Clean parts to check for wear. |
| **Front Stabilizer Bar** | Degreaser | Sometimes | 1 | Clean parts to check for wear. |
| **Front Stabilizer Link** | Degreaser | Sometimes | 1 | Clean parts to check for wear. |
| **Rear Stabilizer Bar** | Degreaser | Sometimes | 1 | Clean parts to check for wear. |
| **Rear Stabilizer Link** | Degreaser | Sometimes | 1 | Clean parts to check for wear. |
| **Battery** | Battery Terminal Cleaner | Sometimes | 1 | For corroded terminals. |

## Left out on purpose

- ~~**DPF cleaning**: only for diesel cars. Add it when the fleet has one.~~ **Changed 15 Nov:** the catalogue covers every car Dominion lists, not just the cars in Fleet, so DPF Cleaning / Regeneration is in the Exhaust & emissions file (`exhaust-emissions-suggestions.md`).
- **Ultrasonic cleaning, parts washer, thread chasing**: shop tools and methods used inside other jobs. They're not logged as jobs or as supplies on a car.
- **Exhaust system treatment**: the same chemical as Induction Service, so it's already covered by that job.
- **Engine Bay Degreasing stays in Fluids & Emissions**: the Engine area has no "General" section, and Leak Inspection already lives there. Degreasing is mostly done to find leaks.
- **Carburetor Cleaning keeps its name**: its description already says it's only for older engines that have a carburetor.
