# Roomy brakes — full fit audit

**Rev 16 · 8 Nov 2026 · Open items only. Everything finished has been removed; git history keeps the old revisions.**

**Rev 16:** RB-24 closed with Toyota's catalogue for a 2017 frame, M900A-0049265 (`supabase/scripts/roomy_old_pad_shoe_numbers_8nov.sql`, run on live 8 Nov).
- **Pads:** 04491-B1190 is Toyota's pad for every build from 2016-11 to 2020-09. Early cars first had 04491-B1032, now replaced; it is recorded as a "replaces" number. 04465-B1190 is not in Toyota's catalogue for either frame, so it stays Needs checking (shop source only).
- **Shoes:** builds from 2016-11 to 2019-05 use 04495-B1310, which replaced the original 04495-B2400. Both now share one card, Confirmed for 2WD Roomy and Tank, 2016–2019. 04495-B2430 is 2019–2020 (it was 2016–2020).

**Rev 15:** RB-23 closed. The 4WD Roomy (`7c71d591`) and Tank (`05d10289`) M910A, 2016–2020, now have their Toyota brake parts: 40 fits, all Confirmed. Saved with `supabase/scripts/roomy_4wd_brakes_8nov.sql`; source is Partsouq frame M910A-0059713.
- 10 parts are shared with the 2WD (Variant M900,910): pads, both calipers, front disc, front hoses No.1/No.2, master cylinder, cable No.1, front ABS left/right.
- 8 parts are 4WD-only (Variant M910): rear wheel cylinder 47560-B5010 (left and right), shoes 04495-B1051, drum 42431-97502, rear hose 90049-22186 (left and right, built to 2020-07), cables 46420-B1120 (No.2) and 46430-B1120 (No.3), rear ABS 89545-B1100 (right) and 89546-B1100 (left).
- New item RB-27 for the 2020-on 4WD.

**Rev 14:** everything committed (83fad398) and deployed: fleet-core and the other fleet functions, plus the Dominion and Fleet sites (new code checked on roamdominion.co and roamfleet.co).
- RB-21 closed. The versions list showed a hard-coded "3/10" for every version except the open car. It now reads real readiness from `admin_vehicles_dashboard`.
- RB-22 closed. The Fleet port did not break the test. Its fake database still answered the old tolerance query that 4-05 replaced. The fake is updated and the 14/14 tests in `parts_finder.test.ts` pass.

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
- **Live (8 Nov):** all 40 ported screens and the edge code they use, plus the earlier held items (Fleet "Your car needs" card, Also fits label, Add a part fixes 5-13 and 5-01, No.1 / No.2 / No.3 buttons).

---

## Open items

### Screens

**RB-19 · Owner review of the 40 screens.** The owner has not yet looked at the ported screens on the test copy.
*Done-test:* the owner opens every screen in Fleet and Dominion on the test copy, in light, dark and phone width, and says each one matches its Stitch screen. Anything that doesn't match becomes its own item here.

### Data (owner, in Dominion)

**RB-27 · The 2020-on 4WD Roomy (M910A facelift, `ddf1d527`) has no brake parts.** The frame used for RB-23 covers builds up to 2020-09 only.
*Fix:* look up an M910A frame built after 2020-09 on Partsouq and repeat the RB-23 steps. For each part, keep the 2016–2020 number where the "Variant" and dates show it is unchanged; add new numbers where they differ.
*Done-test:* Fleet → a 2021 4WD Roomy → Brakes lists the same brake types as the 2016–2020 4WD.

**RB-25 · The Blue Print shoe kit is a separate part.** Blue Print ADT34155 sits in its own card instead of the Toyota 04495-B1310 / 04495-B2400 shoe card (2016–2019 builds). The only source saying they are the same is Spareto, a TecDoc copy.
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
