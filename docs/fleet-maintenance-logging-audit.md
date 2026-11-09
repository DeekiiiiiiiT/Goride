# RoamFleet Maintenance Logging — Audit

**Rev 13 · 8 Nov 2026** · Open items only. Everything else is done and checked.
**Scope:** logging only. The full system is in `fleet-maintenance-enterprise-audit.md`.

**Checked 8 Nov:** nightly job `fleet-maintenance-nightly` ran by itself every day 1–8 Nov at 07:00 UTC, 8 of 8 succeeded (S-04 closed).

**V-01 done 8 Nov:** all 12 screens captured signed in (test copy, `mm-f01` login) and saved as `live.png` beside each `screen.png` in [`docs/stitch/roam-fleet-app/maintenance-logging/`](stitch/roam-fleet-app/maintenance-logging/). Screen 7 check passes: 6 Jan 2026 + 1,230,000 km on 5179KZ shows the amber **Check reading** box.

---

## Fixed during V-01 (code done, verified in test copy)

| # | What was broken | Fix |
|---|---|---|
| F-01 | **Log service crashed** the whole Maintenance page as soon as a car was picked (`setWorkOrderRef is not defined`, left over from the 1 Nov change). | Removed the leftover line in `LogMaintenanceServiceDialog.tsx`. |
| F-02 | **"Did the part fit?" / warranty follow-up** after saving would crash the same way (dialog header, title, description never imported). | Added the imports. Fleet type errors 380 → 373. |
| F-03 | **Odometer history** drawer always said "Failed to load" and showed 0 readings; **It's correct / Void** buttons failed too. Server read a table name the API can't see. | `maintenance_routes.ts` + `maintenance_logging_helpers.ts` now read `fleet_odometer_readings` (4 places). |
| F-04 | **Mileage check never worked**: no "Check reading" warning on step 1, and saved services never flagged odd mileage (the error was swallowed). Two causes: function not reachable by the API, and the function itself failed on every call ("is_anomaly is ambiguous"). | Migration `20261109032207_public_assess_odometer_anomaly.sql`: fixes `fleet.assess_odometer_anomaly`, adds server-only `public.fleet_assess_odometer_anomaly` (anon/signed-in blocked, checked 401). Server calls the new name. |
| F-05 | Log odometer, Which car and the Log service wizard each showed **two close (X) buttons**. | Built-in X hidden on those three dialogs. |
| F-06 | When the page failed to load, it also said **"Nightly check didn't run last night"** (untrue). | Banner only judges the nightly job when the page data loaded. |

---

## Open items

### O-01 · Live app still has F-01 to F-06
The fixes are in the code and the test copy only. The live app still crashes on Log service until the Fleet site, the `fleet-ops` server and the F-04 migration are live.
**Done when:** on live, Log service reaches step 4, odometer history lists readings, and 6 Jan 2026 + 1,230,000 km shows Check reading.

### O-02 · Car with no reading shows "OK" instead of "Odometer needed"
1505LM has no reading, but the overview, the Which car list and the status column show **OK**. Stitch shows **Odometer needed** with a **Log odometer** button and "Log an odometer reading to see km-based items". The row's status comes from the server (`fleetStatus`).
**Done when:** a car with no reading shows Odometer needed + Log odometer everywhere it appears.

### O-03 · Due items drawer is missing parts of the Stitch screen
Missing: the Critical / Impending / Compliant count boxes, the **Log this** button on each line, the "Last done" line, and the coloured overdue strip (e.g. "Overdue 67,192 km · 208 days").
**Done when:** each due line has Log this (opens Log service on that part) and the three count boxes show.

### O-04 · Log odometer dialog
- Date shows **9 Nov** while it is still 8 Nov in Jamaica (10 PM EST). It uses the UTC date.
- No time field, no "This is the car's first reading" note, and no optional dashboard photo (all in Stitch).
**Done when:** date defaults to today in Jamaica time, and the first-reading note shows for a car with no reading.

### O-05 · Step 1 date field shows two calendar icons
The browser's own icon and the screen's icon both show.
**Done when:** one icon.

### O-06 · Steps 3–4 show a raw code and miss the per-part layout
- Under each part name the screen shows **`synthetic_1`** (an internal code). Drop it.
- Stitch step 3 is one compact row per part: Replaced / Inspected buttons, matched part with "Verified fit", cost, Save line, then a subtotal and a mechanic note. Live is a long form per part, one part at a time.
- Review step "What happens next" is one generic sentence. Stitch lists each part's next due (km and date).
**Done when:** no internal codes show, step 3 matches the Stitch row layout, and the review lists each part's next due.

### O-07 · Phone (390 px)
The four summary cards stack first, so the car list starts below the first screen. Stitch shows the car cards (with Log service / Log odometer buttons) first.
**Done when:** at 390 px the first car card is visible without scrolling.

### O-08 · Which car list
Each car shows a single status word. Stitch shows counts ("2 overdue", "1 due soon") and the reading source/age.
**Done when:** counts show per car.

**Not counted as differences** (intentional): extra hub tabs (Work orders, Requests, Inspections, Schedule); no Bootstrap schedules / Compatible parts buttons; Stitch's sample footer cards and made-up hub names dropped. Service history matched in layout, but the test copy has no completed services, so its rows could not be compared.
