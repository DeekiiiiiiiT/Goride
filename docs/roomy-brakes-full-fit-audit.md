# Roomy brakes — full fit audit

**Rev 13 · 8 Nov 2026 · Open items only. Everything finished has been removed; git history keeps the old revisions.**

**Rev 13:** RB-20 (Fleet test copy login) closed.
- `mm-f01-fleet@local.test` signs in at http://127.0.0.1:5181 in a real browser (fleet-login 200).
- Find parts → 5179KZ → Brakes opens with no server errors.
- The test copy's fleet-core bundle was out of date (built 7 Nov 09:37, before the new Find parts routes), so the "Which car" maker list answered 404. It has been rebuilt with `node scripts/build-edge-bundle.mjs fleet-core`.
- After any edge change, rebuild the bundle before using the test copy.

**Goal:** a Fleet user picks their Toyota Roomy, opens Brakes, and sees every brake part that fits it. Each physical part is shown once, with all its brand numbers. They also see every other car the same part fits. All of it is backed by a maker's own catalogue.

**Test car:** fleet vehicle 5179KZ → catalog row `3cd9cbf3` (Toyota Roomy M900A, 1KR-FE).

**Rules:** [source rule](#source-rule) · Find parts is look-up only (no prices, suppliers or stock) · Dominion stores everything and labels odd values, never blocks.

---

## Where we are (8 Nov)

- **Data:** every Roomy / Tank M900A brake part from Toyota's own catalogue is on file and Confirmed: pads, rotor, calipers, drum, shoes, wheel cylinders, master cylinder, hoses, handbrake cables, ABS sensors, and brake fluid from the owner's manual. The front pad's 62 car fits (other makers' cars) are on file. Key parts for the Roomy reads 4 of 10.
- **Database:** all migrations for this audit are live, including the three for the new screens and the readiness fix (V-15).
- **Screens:** all 40 Phase 7–8 Stitch screens are ported to the Stitch look. That is Fleet Find parts F1–F14, Dominion Add parts A1–A14 and Dominion Vehicles V1–V12.
  - The Stitch exports are in `docs/stitch/fleet-find-parts-everyday/`, `dominion-add-parts-self-serve/` and `dominion-vehicles-catalog/`.
  - Each screen's `live.png` sits next to its `screen.png` there.
  - Checks: Fleet capture 49/49, both Dominion captures pass, 130 admin unit tests pass, no type errors in the ported files.
- **Not live yet:** the ported screens and the edge code they use. Also the earlier built-but-held items: Fleet "Your car needs" card and Also fits version label, Add a part fixes 5-13 and 5-01, and the No.1 / No.2 / No.3 buttons.

---

## Open items

### Screens

**RB-19 · Owner review of the 40 screens.** The owner has not yet looked at the ported screens on the test copy.
*Done-test:* the owner opens every screen in Fleet and Dominion on the test copy, in light, dark and phone width, and says each one matches its Stitch screen. Anything that doesn't match becomes its own item here.

**RB-21 · The Vehicles sample data still says 3 of 10 on the versions list.** The car page sample says 4 of 10, which matches live. The versions list sample (`keyPartsById` in the Vehicles capture fixtures, admin and `e2e/` copies) still says 3.
*Fix:* set the Roomy 2016–2020 2WD sample to 4 of 10 in both fixture copies.
*Done-test:* `toyota_roomy_versions/live.png` shows "4/10 ready" on the first row.

### Tests

**RB-22 · One Deno test fails:** `findParts returns tolerance_mm and interchange group count`. Cursor said it already failed before the Fleet port. Nobody has proven that.
*Fix:* run it on the code from before the port. If it fails there too, it is outside this audit and is noted as such. If it passes there, the port broke it and it gets fixed here.
*Done-test:* the test passes, or it is shown to fail on the pre-port code too.

### Data (owner, in Dominion)

**RB-23 · The 4WD Roomy / Tank (M910A) has no brake parts.** Everything on file is for the 2WD M900A.
*Fix:* enter the M910A brake parts from Partsouq for an M910A frame number. Known from diagram 4601: rear cables 46420-B1120 (No.2) and 46430-B1120 (No.3); the No.1 cable 46410-B1011 is shared with the M900A.
*Done-test:* Fleet → a 4WD Roomy → Brakes lists the same brake types as the 2WD, with the M910A cable numbers.

**RB-24 · The old pad and shoe numbers are still Needs checking.** Toyota 04465-B1190, Daihatsu 04465-B1190 / 04465-B1320 (pads) and Toyota 04495-B2400 (shoes) come only from shop sites. For frame M900A-0344862, Toyota's catalogue shows 04491-B1190 and 04495-B2430 instead. The old numbers may cover earlier builds, which that frame-filtered page hides.
*Fix:* check Partsouq with a 2016–2018 M900A frame number. If the old numbers are listed there, re-save them with that link and the years they cover, so they become Confirmed. If not, they stay Needs checking with that reason.

**RB-25 · The Blue Print shoe kit is a separate part.** Blue Print ADT34155 sits in its own group instead of with the Roomy's rear shoe kit.
*Fix:* if Blue Print's own catalogue lists ADT34155 for the Roomy M900A, use **Merge same part** in Dominion to put it in the shoe kit's group. If it doesn't, leave it as is.

**RB-26 · Fluid brands sold in Jamaica (later).** Fleet shows only the car maker's named fluid (Toyota 2500H-A). Owners also buy Prestone, Lucas Oil, Johnsen's, ABRO, Flamingo, Penray, STP, Shell, Mobil and Rymax (Vector).
*Fix:* add these as fluid products (Add a part → By size or spec), each with its grade (DOT 3 / DOT 4 / DOT 5.1) from the brand's own label or catalogue page, never from a shop. The Roomy needs a Toyota source for the grade 2500H-A equals. Until then, other brands show **Needs checking** with the reason "The car maker names its own fluid; this brand's grade isn't confirmed against it". Information only: no prices, no shops.
*Done-test:* the Roomy's Brake fluid page lists Toyota 2500H-A as Confirmed, plus at least 3 brands of the matching grade, each with its own source.

---

<a id="source-rule"></a>
## Source rule (reminder)

A factory number or a car fit is **Confirmed** when any one of these holds:
1. **The car maker's own catalogue, or a frame-number site trusted for that maker.** Dominion keeps a per-maker list (e.g. Toyota / Daihatsu: Amayama, Megazip, Partsouq) of sites that show the maker's own catalogue for an exact frame number.
2. **The part maker's own catalogue**, for which cars its own part fits.
3. **Two different part makers' own catalogues name the same factory number for the car.** Both pages are stored.

**Needs checking:** a single "equals other brand" cross-reference; shops and TecDoc copies (Spareto, fitinpart, yoshiparts, Autodoc); any site not on that maker's trusted list.

**Never a source:** forums and AI web summaries.
