# Roam Fleet · Fleet maintenance → Find parts tab — audit (Rev 8, 31 Oct 2026)

**This is the only doc for this work.** It lists open items only.
- **Design:** `docs/stitch/roam-fleet-app/html/find-parts-*.html`.
- **Screens:** `apps/fleet/src/components/vehicles/find-parts/`. FP1 is `CarStep.tsx`; FP2–FP12 are `screens/Fp*Screen.tsx`.

**Status:** live on roamfleet.co (commit 613fed56). Data and buttons are mostly wired. Open: step 3 shows "None yet" for a linked car (F1), the checker is being fooled again (F2), plus smaller items.

---

## F1 — High · "Why does it skip step 2?" Skipping is right; showing "None yet" is the bug
**Checked in production.** 5179KZ (Toyota Roomy 2019) is linked to one exact version: *Pre-Facelift · 1KR-FE · 2WD · M900A* (`fleet.vehicles.vehicle_catalog_id = 3cd9cbf3…`). 1505LM (Honda Fit 2018) is linked to *Hybrid (i-DCD) · LEB · GP5*.

For a linked car, `/parts/find` already knows the version, so "Which one is yours?" is correctly skipped (it only asks when the version is unknown). The screen should then show step 2 as **done with the version name**. Instead it shows "2. Trim: None yet", "None yet · —" and "NONE YET":
- **No version, name or plate from the server.** `GET /parts/vehicle-context` ([fleet_find_parts_routes.ts:352](../supabase/functions/_fleet-server/fleet_find_parts_routes.ts#L352)) returns only odometer, services due and last service. So `trimLabel` in [findPartsViewModels.ts](../apps/fleet/src/components/vehicles/find-parts/findPartsViewModels.ts) is always empty.
- **A link that names a vehicle skips the check entirely.** With `?vehicle=…` in the address, [FindPartsTab.tsx:40](../apps/fleet/src/components/vehicles/find-parts/FindPartsTab.tsx#L40) opens straight on step 3 without calling `/parts/find`. An unlinked car opened that way skips "Car not linked yet" and the version question.

**Fix:**
- **Server:** `/vehicle-context` also returns the car's label, plate, and the linked version (`trim_series`, `engine_code`, `drivetrain`, `chassis_code`), read from `vehicle_catalog`.
- **Screens:**
  - Step 3 and step 4 show "2. Trim: Pre-Facelift · 1KR-FE · 2WD" as a done step.
  - The car chip shows "Toyota Roomy 2019 · 5179KZ".
  - "Full schematic breakdown for M900A chassis" uses the real chassis code.
- **Address with `?vehicle=`:** run the same `/parts/find` check as clicking a car card. Not linked → FP9. Version unknown → FP2. Linked → step 3.

## F2 — High · The checker is passing because of a word list
- **A 336-phrase word list counts as screen text.** [findPartsStitchFooter.ts](../apps/fleet/src/components/vehicles/find-parts/findPartsStitchFooter.ts) holds the Stitch design phrases, sample text included ("toyota roomy ac compressor quote…"). It is attached to all 12 rows in `docs/stitch/roam-fleet-app/README.md`, so the checker counts its words as if the screens showed them. It is never shown.
- **Filler lines are printed on screens.** They exist so the checker finds the words:
  - **FP3:** the grey line above the second step bar in the owner's screenshot: "4. Position & Fit · Continue to position & fit · … · 2 in stock · … · Telemetry & mechanical assessment:" ([PartStep.tsx:121](../apps/fleet/src/components/vehicles/find-parts/PartStep.tsx#L121)). "2 in stock" is typed in.
  - **FP4:** "2. Trim & year · 4. Position & fit" ([PositionStep.tsx:25](../apps/fleet/src/components/vehicles/find-parts/PositionStep.tsx#L25)).
  - **FP10:** "jad telemetry broker live" ([ActivityView.tsx:40](../apps/fleet/src/components/vehicles/find-parts/ActivityView.tsx#L40)).
- **The real scores,** without the word list (run on a scratch copy):

| FP1 | FP2 | FP3 | FP4 | FP5 | FP6 | FP7 | FP8 | FP9 | FP10 | FP11 | FP12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 94% | 71% | **32%** | 54% | 74% | 69% | 81% | 77% | 62% | 57% | 82% | 69% |

**Fix:**
- Delete `findPartsStitchFooter.ts` and remove it from all 12 README rows.
- Delete the three filler lines.
- Run `node scripts/stitch-fidelity.mjs --report`. For each "miss":
  - if it is a sample value now shown live (a plate, km, price, car or part name), add it to `docs/stitch/roam-fleet-app/sample-labels.json`;
  - if it is design text, put it back on the screen in its Stitch place.
- **Guard:** the checker fails a row that lists a file which is not a rendered component, i.e. any `.ts` file that holds only strings.

## F3 — Medium · Two step bars on the same screen
Steps 1, 3 and 4 and "Ask Roam" show the shared `StepBar` *and* the Stitch step row drawn inside the screen. That is the second bar in the screenshot.

**Fix:** remove `<StepBar>` from `CarStep`, `PartStep`, `PositionStep`, `RequestPartPanel` and `VariantStep`. Each screen's own Stitch step row is the only one.

## F4 — Medium · Step 3 still has fixed or doubled text
| Seen on screen | Fix |
|---|---|
| "Tire Change, Tire Change" and two identical buttons | When two due services have the same name, add their position ("Tire Change · Front" / "· Rear"). If the position is also the same, show it once |
| "Automated telematics flag from Fleet hub Depot Diagnostic bay #3 (Logged yesterday at 17:40 EST)" | The newest service note or parts alert for this car, with its real date. "None yet" if there is none |
| "Fleet hub Hub Schedule", "Fleet hub fleet depot turnaround" | `hubLabel` is fixed to "Fleet hub". Use the vehicle's location, or the org name |
| "KIN-FLEET" chip | The org's short code |
| "Common wear" under every common part | The component's `description` |

## F5 — Medium · 9 buttons still do nothing
| Screen | Button | What it must do |
|---|---|---|
| FP6 Part detail | − / + by Add to stock | Change the quantity saved |
| FP12 Phone | Bookmark icon | Save query → `/saved-searches` |
| FP12 Phone | "Your Parts Activity" bar | Open and close the section |
| FP12 Phone | Close, − / + on the Quick RFQ sheet | Close the sheet; change the quantity sent to `/quote` |
| FP9 Not linked | Verify | Decode the typed frame number (`decodeFrameNumbers`) and pick that trim |
| FP10 Activity | "Your parts activity" breadcrumb | Back to the Find parts search |

## F6 — Low · 2 fixed engine-code lines
- **FP6** "Filter Engine: 1NZ-FXE 1.5L" ([Fp6Screen.tsx:39](../apps/fleet/src/components/vehicles/find-parts/screens/Fp6Screen.tsx#L39)) → engine code and size from `/vehicle-context` (F1).
- **FP9** "1NR-FE 1.3L (NSP160), and 1NZ-FXE Hybrid (NHP160)" ([Fp9Screen.tsx:86](../apps/fleet/src/components/vehicles/find-parts/screens/Fp9Screen.tsx#L86)) → the model's other versions from `data.trims`.

## Last step (owner)
Once F1–F6 are deployed, log in and go through the flow once:
- Pick the Roomy. Step 2 shows as done with "Pre-Facelift · 1KR-FE · 2WD".
- Pick a part, open a result, request a quote, then Ask Roam to find it.
- Both should show in Your parts activity.

---

## Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md and fix F1–F6 in order.

Not allowed: word lists or filler text added to satisfy the checker, files listed
in the README that are not rendered screens, fixed sample values. The checker
score must come from what the screens actually show.

Keep fleet tsc at or below 464. Commit, push and deploy the fleet site.
```
