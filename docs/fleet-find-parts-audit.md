# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 35, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only.

**Verified this round:** Rev 34 (overlay footer, test data, checker lists) is committed and pushed (bc7b8aa0). The first real request reached Dominion (`685c06ad`, Roomy · Drive belt), so the Fleet → Dominion path works end to end.

**Rules:** information only, parts only, no customer names or plates in Dominion. Port Stitch exactly, and never edit `docs/stitch/`. Never invent catalog facts or descriptions. No hidden word lists for the checker.

---

## N1 — Picking a new part keeps the old side (wrong data in Dominion)

**Found:** the first real request is "Drive belt · front · both" (`fit_descriptor = front:both`). A drive belt has no side, so this value came from the earlier brake lookup. In `FindPartsTab.tsx`, `onPick` and `onAskRoam` (lines ~335–347) set the new part but never clear `position` or `fitParam`. `RequestPartPanel.tsx:45` also shows "Front axle" when there is no position at all.

**Fix:**
- In both `onPick` and `onAskRoam`, call `setPosition("")` and `setFitParam("")`, and drop `pos`/`fit` from the URL.
- In `RequestPartPanel`, show the position label only when `position` is set; otherwise show "—".
- Add a vitest case: pick Brake pads → Both → Back → pick Drive belt → Ask Roam. The request body has no `side`, `position` or `fit`.
- **Data:** on `parts_sourcing_requests` row `685c06ad-37cd-4f2f-8d2c-7065322cf7ae`, set `install_position`, `install_side` and `fit_descriptor` to null and `need_text` to "Drive belt".

## N2 — Dominion drawer shows made-up sample text

**Found** in `PendingPartRequestDrawer.tsx`:
- Line 246 always says "Air filter · M900A", and line 253 always says "No existing air filters are registered…", whatever part was asked for. Your screenshot shows both on a Drive belt request.
- "Already on file for this car" never loads anything. `PendingPartsGroupDetail` has no on-file list, so it always says "Nothing yet".
- Line 107 has `data-stitch-lexicon="air filter 1 fleet 2 fleets…"`, a hidden word list for the checker.

**Fix:**
- The `platform-catalog` group-detail route returns `onFile`: the parts in the Parts database for this `vehicle_catalog_id` + `maintenance_component_id`, each with brand, part number and match type.
- The drawer heading's right side shows `{part type} · {chassis code}`. The section lists `onFile`, and when it is empty it shows "No {part type} on file for this car version yet."
- Remove `data-stitch-lexicon`. If the checker then drops below 100%, fix the screen, not the checker.

## N3 — New: "Copy for search" button in the Dominion drawer

**Goal:** one click copies everything Google, a parts shop or a person needs to look up the part. It contains no fleet, customer or plate details.

**Place:** in the drawer header row, next to "Asked by 1 fleet" and "first asked": an outlined button with the `content_copy` icon and the label **Copy for search**. After clicking, it shows "Copied ✓" for 2 seconds. If the clipboard fails, it shows "Couldn't copy".

**What it copies:** plain text built from the request group and the vehicle catalog record (`VehicleCatalogBrief`). A line with no value is left out.
```
Drive belt — Toyota Roomy 2016–2020
Version: Pre-Facelift · Custom G
Chassis: M900A
Engine: 1KR-FE
Drivetrain / gearbox: 2WD · CVT
Position: Rear · Left              (only for parts with a side)
Old part number / notes: "17801-…" (fleet notes, if any)
Search: Toyota Roomy M900A 1KR-FE drive belt part number
```
The last line is a ready-to-paste Google search: make, model, chassis, engine, part type, then "part number". Put the text builder in one function (`buildPartSearchText(group, vehicle, notes)`) with a vitest for a brake request (with side) and a drive belt request (no side).

---

## N4 — Overlay count line counts the wrong thing

The overlay is live: the owner's screenshot from 1 Nov shows the Brakes overlay with the grey footer bar. Its count line reads "4 PARTS IN THIS AREA · 6 ON FILE FOR YOUR CAR". The design means the number of parts that have something on file (2: Brake pads and Brake shoes). The overlay adds up the options instead (4 + 2).

**Fix:** in `Fp3AreaOverlay.tsx`, the second number is the count of rows with `onFileCount > 0`. Keep the line as one group ("4 PARTS IN THIS AREA · 2 ON FILE FOR YOUR CAR"), not spread across the width.

## Owner

1. After N1 ships, on the live site: Brakes → Brake pads → Which side? → Next. Results show 4 front pad sets. Then "Same car, different badge" → **Ask Roam to find a Sister option**. Dominion should show "1 fleet · Sister option".
2. Write the one-line description for each of the 37 part types in Dominion (Maintenance templates → part type → Description). None are written yet. Enter ABS / handbrake values when you have them.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix N1 (including the data fix), N2 and N3 with their tests, fix N4, deploy platform-catalog and the fleet + admin sites, then confirm the Copy for search button on the live Dominion drawer."
