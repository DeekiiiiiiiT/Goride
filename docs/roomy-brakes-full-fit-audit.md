# Roomy brakes — full fit audit

**Rev 8 · 6 Nov 2026 · Phases 1, 2, 3a DONE + live; Phase 3b handed to Cursor** — Rev 8: Phase 3a applied (7/7 checks after the one-off NiBK fix; 10/10 factory numbers Confirmed, 10 maker-site links Confirmed, 18 shop links Needs checking). Rev 7: Trusted sources Stitch export in (docs/stitch/roomy-brakes-trusted-sources/), Keep / Drop / Add as Dominion 5–7; Phase 3 split into 3a (database + server) and 3b (Dominion screens). Rev 6: Phase 2 applied by the owner, 8/8 checks pass on live; Trusted sources Stitch prompt written (docs/stitch/roomy-brakes-trusted-sources-dominion-prompt.txt). Rev 5: Phase 1 applied by the owner, all 8 checks pass on live; RB-07 now also adds a brake role per type. Rev 4 added the build phases (§6a). Rev 3 added the per-screen Keep / Drop / Add lists (§5a) under the new Stitch rule; exports copied to docs/stitch/roomy-brakes-fleet/ and roomy-brakes-dominion/. Rev 2 added RB-15 and the screen table (§5).

**Goal (one sentence):** a Fleet user picks their Toyota Roomy, opens Brakes, and sees every brake part that fits it — each physical part shown once with all its brand numbers — plus every other car that same part fits (Mazda 2/Demio, Swift, Materia, Sirion, Fiesta…), all backed by a maker's own catalogue.

**Test car:** fleet vehicle 5179KZ → catalog row `3cd9cbf3` (Toyota Roomy M900A, 1KR-FE, Custom G, front ventilated disc 255 mm, rear drum).

Rules this audit follows: [parts source rule](#source-rule) · Find parts is look-up only (no prices/suppliers/stock) · Dominion stores everything, odd values get a label (never blocked).

---

## 1. What a user gets today (checked live, 6 Nov)

`parts_for_vehicle(3cd9cbf3…, <type>, 2019)` in production:

| Brake part type | Results | What they really are |
|---|---|---|
| Front brake pads (`brakes`) | 7 rows | **One** physical pad (factory no. 04465-B1190) under 7 brand numbers: Toyota 04465-B1190, Daihatsu 04465-B1190, "Subaru" 04465-B1320, NiBK PN5562, Brembo P 16 013, SB BP25562, Akebono AN-754WK |
| Rear shoes / drums (`brake_shoes_drums`) | 2 rows | One shoe kit: Toyota 04495-B2400, Blue Print ADT34155 |
| Brake rotor (`brake_rotor`) | 0 | — |
| Brake fluid (`brake_fluid`) | 0 | — |
| Caliper, wheel cylinder, brake hose, master cylinder, handbrake cable, ABS sensor, rear drum (on its own) | — | **No part type exists** |

"Also fits" shown to the user: only the sister bodies **Daihatsu Thor, Subaru Justy, Toyota Tank** (worked out from the shared platform). Nothing about Mazda, Suzuki, Ford, or other Daihatsu models.

Whole database: **11 parts, 61 car listings, 11 of 937 cars have any part** (all Roomy family). 0 shared-component links between different platforms.

## 2. The owner's car list, checked against the makers' own catalogues

Sources (part maker's own catalogue = verified for which cars *its own* part fits):
- SB BP25562 — https://www.sbparts.jp/catalogue/723410
- NiBK PN5562 — https://jnbk-brakes.com/catalogue/cars/brake/723409/PN5562

Both list the same 92 applications for the Roomy front pad (125.7 × 51.7 mm, 4 pcs). Result per car on the owner's list:

| Owner's list | Makers say | Verdict |
|---|---|---|
| Mazda 2 / Demio DE (2007–2014) | Mazda 2 DE 1.3/1.4/1.5/1.6 (2007–2015); Demio **DE5FS** 1.5 ZY-VE (2007–2014) | **Correct** |
| Suzuki Swift 2010–2017, Swift Sport ZC32S, ZD72S | Swift IV (2009–2017) incl. ZC32S, ZD72S, ZC72S LHD, ZC82S; also Swift V (2016–2024) and Swift VI (2023–) | **Correct, and wider than the list** |
| Suzuki Baleno 2016–2022 | Baleno WB32S/WB42S/WB52S (2015–2022), Baleno 2021– | **Correct** |
| Toyota Rush (2006–) | **Not listed** by either maker | **Wrong — do not add** |
| Ford Fiesta 1.4 / 1.6 | Fiesta CL 1.4 C14HDEZ and 1.6 C16HDEZ **05/2010–08/2013 only**; India Fiesta B299 1.5 DV5 2011–2013; India CA 2014– | **Partly correct — years 2010–2013 only** |
| Daihatsu Materia 2006–2013 | Materia M401L 1.3 K3-VE (2006–2013), M402S/M412S 1.5 3SZ-VE (2006–2008) | **Correct** |
| Daihatsu Sirion 2005–2013 | Sirion M300 1.3 K3-VE, M303S 1.5 3SZ-VE (2005–2013) | **Correct** |

Makers also list cars the owner didn't: Suzuki Ertiga, Dzire, Fronx, XL-6; Toyota Glanza, Starlet, Urban Cruiser; Perodua Myvi; Maruti Baleno/Ertiga.

Same pages give the factory numbers this pad replaces (needed for auto-matching): Daihatsu 04465-B1120 / B1190 / B1191 / B1320; Toyota 04465-WC001 / WC002, 04491-B1032; Mazda D0YN-33-28Z(A/B), DFY1-33-28Z(A), DNY0-33-28Z; Suzuki 55810-52R20/52R21/52R50/68L00/68L50/70T00/71L50/71L51/M69P50 …; Ford 1 438 867, 1 676 630, 1 853 382, 6G91-2MM08-GA/GB. These are the **maker's cross-reference list → "Needs checking"**, not verified (source rule).

### How the owner's catalog rows line up with the makers' lists

| Catalog row | Chassis / engine / years | Maker list says | Add as |
|---|---|---|---|
| `977b3c10` Swift | ZC13S K10C 2017–2020 | ZC13S JPN 12/2016~ | **Verified** |
| `adf34412` Swift | ZC33S K14C 2017–2023 | ZC33S JPN 09/2017~ | **Verified** |
| `2d9e29e7` Swift | ZCED1S Z12E 2023– | ZCEDS Z12E 12/2023~ | **Verified** |
| `7758f192` Swift | ZC72S K12B 2010–2013 | ZC72S **LHD** 2009–2013; ZD72S JPN | Needs checking (JDM ZC72S not named) |
| `b848ec64` Swift | ZC72S K12B 2013–2016 | same | Needs checking |
| `5231766d` Swift | ZC83S K12C 2017–2023 | not named (ZC43S K12C is) | Needs checking |
| `d86b29e2` Swift | ZC71S K12B 2004–2010 | not listed | **Do not add** |
| `b016603b` Demio | DE3FS ZJ-VE 2007–2011 | Demio only DE5FS; Mazda 2 DE 1.3 ZJ-VE (AEDM05) 2007–2014 | Needs checking |
| `f348cacd` Demio | DE3FS ZJ-VEM 2011–2014 | same | Needs checking |
| `2cbd7ac4` / `74a56d8d` Demio DJ, `19c2fc54` Mazda 2 DJLFS | 2014– | not listed | **Do not add** |
| `d962f606` Materia | M400 3SZ 2007–2010 | M402S / M412S 3SZ-VE 2006–2008 | Needs checking (chassis M400 vs M402S, years 2009–2010 beyond list) |
| `dfdb60ba` Sirion | M301RS K3-VE 2006– | M300 K3-VE 2005–2013 | Needs checking (chassis M301RS vs M300) |
| `30956c80` Fiesta | B299 1.6 Ti-VCT 2008–2017 | CL 1.6 C16HDEZ 2010–2013 | Needs checking, **years 2010–2013 only** |
| `cd96df2f` Fiesta | B479 1.0 EcoBoost 2017–2023 | not listed | **Do not add** |
| `140c6105` Boon | M300 1KR-FE 2004– | not listed | **Do not add** |
| `7b7b602c` Rush | J210E 3SZ-VE 2006–2016 | not listed | **Do not add** |

Not in the catalog at all (needed for the full list): Suzuki Baleno (WB32S/WB42S/WB52S), Swift ZD72S, Swift ZC32S, Mazda Demio DE5FS, Ertiga, Glanza, Perodua Myvi.

---

## 3. Findings (one fix each)

### Database / data

**RB-01 · The owner's Roomy has no factory brake number.** `vehicle_oe_number` has 04465-B1190 for 7 Roomy-family rows but **not** `3cd9cbf3` (the row 5179KZ uses). Today it gets its pads only through hand listings. Auto-matching (OE number → every part that cross-references it) never runs for this car.
*Fix:* add 04465-B1190 (front pad) and 04495-B2400 (rear shoe kit) to `3cd9cbf3` and the other 4 Roomy rows, from Toyota's own parts catalogue (EPC by frame number), with the EPC page as source.

**RB-02 · One pad shows as 7 different parts.** The 7 front pads sit in 6 separate interchange groups (only NiBK + Brembo were merged, by WVA 24283). Toyota 04465-B1190 and Daihatsu 04465-B1190 are the same number in two groups. The user sees 7 "different" pads.
*Fix:* use the existing owner-only **Merge same part** action to put all 7 into one group, with Daihatsu 04465-B1190 as the reference (Daihatsu makes the car). Same for the 2 rear shoe kits.

**RB-03 · No brake part in the database is marked verified.** All 9 brake parts have `verified_at` empty. NiBK PN5562, SB BP25562 and Brembo P 16 013 come from the makers' own catalogue pages, so they qualify as verified. The rest come from copies: Toyota/Daihatsu 04465-B1190 from fitinpart.sg (a shop), "Subaru" 04465-B1320 and Blue Print ADT34155 from Spareto (a TecDoc copy), Toyota 04495-B2400 from yoshiparts.com (a shop).
*Fix:* mark the 3 maker-catalogue pads verified. Re-source the Toyota/Daihatsu numbers from the Toyota EPC (RB-01) and Blue Print from Blue Print's own catalogue; until then they stay Needs checking.

**RB-04 · Wrong maker on 04465-B1320.** It is stored as **Subaru** 04465-B1320. 04465-B1320 is a Daihatsu number (both SB and NiBK list it under DAIHATSU).
*Fix:* change the manufacturer to Daihatsu and set the source to the SB/NiBK page.

**RB-05 · The cross-car fits are missing.** None of the cars in §2 are linked to this pad.
*Fix:* add the pad's car fits from §2 through **Dominion → Parts → the pad → Add a car** (or the Bulk upload): the 3 **Verified** rows as verified with the SB/NiBK page as source, the 8 **Needs checking** rows as Needs checking, Fiesta limited to 2010–2013. Leave out the rows marked **Do not add**.

**RB-06 · Cars the makers list are not in the vehicle catalog.** Baleno, Swift ZD72S / ZC32S, Demio DE5FS, Ertiga, Glanza, Myvi.
*Fix:* add these to the Vehicle Database (Dominion) with chassis, engine and years from the car maker, then link them as in RB-05.

**RB-07 · Brake part types are incomplete.** Only pads, shoes/drums, rotor and fluid exist. There is no caliper, wheel cylinder, brake hose, master cylinder, handbrake cable, ABS wheel-speed sensor, or rear drum on its own. `brake_rotor` is not position-aware (front/rear), so it can't hold a front-only rotor.
*Fix:* add those 7 part types under Brakes in Dominion → Part types, with front/rear positions (and left/right for hoses, wheel cylinders, ABS sensors, calipers), and turn on position for Brake rotor.

**RB-08 · No rotor, drum or fluid data for the Roomy.**
*Fix:* load the Roomy's front rotor, rear drum and brake fluid spec (DOT 3 per Toyota) from the Toyota EPC / owner's manual, then the matching aftermarket parts from the part makers' own catalogues. Same method for every type added in RB-07.

**RB-09 · Brake specs missing on sister rows.** Thor, Justy, Tank (all rows) and Rush have no front/rear brake type. Roomy rows have it. The "By size or spec" fit mode can't place parts on these cars.
*Fix:* copy the brake type and disc size from the Roomy rows to Tank/Thor/Justy (same body, same brakes per the maker lists), and fill Rush from Toyota's spec sheet.

### Server

**RB-10 · No "every car this part fits" answer for Fleet.** `parts_for_vehicle` returns `sister_names` (same platform only). There is no route that gives Fleet the full list of cars a part is listed for. Dominion already has one inside the part drawer (`part.fits`).
*Fix:* add the full fit list (make, model, chassis, years, verified / needs checking) to the Fleet `/parts/lookup` part detail response, read from the same source Dominion's "Cars it fits" uses.

### Screens

**RB-11 · Fleet part detail (FP6) shows only sister cars.** "Fits these engine variants" and the cross-ref rows are built from `sisterNames` — Thor / Justy / Tank.
*Fix:* add an **"Also fits"** section to the Fleet part detail listing every car from RB-10, grouped by make, with a **Needs checking** chip on unverified rows. The owner makes this section in Stitch (one screen: FP6 with the Also fits list), then it is ported exactly.

**RB-12 · One part shows as many rows in Fleet results.** Even after RB-02 the results list should show one card per physical part with its brand numbers inside, not one card per brand.
*Fix:* group Fleet results by interchange group: one card ("Front brake pad set — fits front"), with the brand numbers listed in the card (Daihatsu 04465-B1190 · NiBK PN5562 · SB BP25562 · Brembo P 16 013 · Akebono AN-754WK …).

**RB-13 · Empty brake types show nothing.** Rotor and fluid return 0, and the user can't tell "we don't have it yet" from "your car doesn't have one".
*Fix:* show "Not in our database yet" with the existing **Ask Roam to find it** button for any brake type the car has (per its brake specs) but that has no part.

**RB-15 · Dominion can't set trust per car.** Add a part takes one source page, and that source sets Verified / Needs checking for the whole part. The part drawer's "Cars it fits" shows only the link chip (Direct / Sister / Kept). RB-05 needs 3 Swift rows Confirmed and the Demio, Materia, Sirion, Fiesta and other Swift rows Needs checking, each with a reason, all on the same pad. `part_listing` already has `verified_by` / `verified_at` / `evidence_url` / `note` per row; the screens don't use them.
*Fix:* in Add a part's cars step, a Confirmed | Needs checking toggle and a "Why?" field per selected car, plus per-car years. In the part drawer, a trust chip and reason per car, a trust filter, and a per-car menu (Mark confirmed, Mark needs checking, Change years, Remove this car). Saved to the listing row's own fields. The owner makes these screens in Stitch first.

**RB-16 · Dominion can't record which sources count as Confirmed for each car maker, or two-maker agreement.** The widened source rule (bottom of this doc) needs a per-maker trusted-source list, and a way to mark a factory number Confirmed because two part makers agree. Today `source_type` has only `car_maker_catalogue` / `part_maker_catalogue` / `other`, and `vehicle_oe_number` has one `evidence_url` and no trust field.
*Fix:* a Dominion setting "Trusted sources" — per car maker, the site addresses that count as the maker's catalogue (seed: Toyota, Daihatsu, Lexus → amayama.com, megazip.net, partsouq.com). When a source link's site is on that maker's list it counts as `car_maker_catalogue`. On `vehicle_oe_number`, add a trust state (Confirmed / Needs checking) and a second source link; Confirmed when the source is on the maker's list or two different part makers' pages are given. The 3 Roomy rows added in Phase 1 then become Confirmed with the SB + NiBK pages. Built in Phase 3 with RB-15 (it uses the same trust chip). The owner makes one small Stitch screen for the Trusted sources setting.

### Gates

**RB-14 · Nothing proves the Roomy brake result end to end.**
*Fix:* add the done-tests below to the parts done-check set. They run on the local test copy with made-up part numbers (never the real ones), through the real API path.

---

## 4. Done-tests (write these first)

1. Roomy `3cd9cbf3` → Brakes → Front pads shows **one** card with ≥ 5 brand numbers, position Front.
2. Same card → **Also fits** lists Mazda 2 / Demio, Swift, Materia, Sirion, Fiesta (2010–2013), Tank, Thor, Justy — and **not** Rush, not Demio DJ, not Fiesta B479.
3. Rows added as Needs checking show the chip; verified rows don't.
4. Pick Suzuki Swift ZC33S as "another car" → Brakes → Front pads shows the same pad card.
5. Roomy → Brakes → Rear shoes shows one card (Toyota 04495-B2400 + Blue Print ADT34155).
6. Roomy → Brakes → every new type from RB-07 is listed; empty ones show "Not in our database yet" + Ask Roam.
7. Brake rotor can be saved as Front only.
8. Undo of an Add-a-car batch removes those fits and the Also fits list shrinks back.

## 5. Screens the owner makes (Stitch)

| Prompt file | Screen | What's on it | Finding | Opened by |
|---|---|---|---|---|
| `docs/stitch/roomy-brakes-fleet-prompt.txt` | 1 | Brakes list — every brake part type, Front / Rear / Whole system, counts, "Not on file yet" | RB-13 | Find parts → car → Brakes |
| | 2 | Front brake pads — one card per part, same part other brands inside | RB-12 | a brake type row with parts |
| | 3 | Part detail — Also fits grouped by maker, trust filter, sources | RB-11 | "View details" |
| | 4 | Part type with nothing on file — "Not in our database yet" + Ask Roam | RB-13 | a "Not on file yet" row |
| | 5 | States — loading, error, no brake details, sisters only | RB-11/13 | — |
| | 6 | Narrow window 390px for 2 and 3 | — | — |
| `docs/stitch/roomy-brakes-dominion-prompt.txt` | 1 | Part drawer — Cars it fits with trust + reason per car, filter, per-car menu | RB-15 | Parts database → a part |
| | 2 | Add a part — cars step with Confirmed / Needs checking + Why + years per car | RB-15 | Add parts → cars step |
| | 3 | Add a part — review sentence with trust counts | RB-15 | review step |
| | 4 | States — no cars, all Needs checking, Undo toast, could not load | RB-15 | — |

Once ported, the old versions of these screens are deleted (no fallback).

### 5a. How the Stitch screens are used (rule of 6 Nov 2026)

The exports are in `docs/stitch/roomy-brakes-fleet/` and `docs/stitch/roomy-brakes-dominion/` (each folder: `code.html` + `screen.png`). **Stitch is the spec for the look** — layout, section order, card and chip styles, spacing, colours, fonts, dark mode — port it exactly. **This audit is the spec for the content** — every number, badge, car, button and sentence comes from real data or a feature listed here. For each screen:
- **Keep** — port exactly, filled with real data (the Stitch sample values are never copied into code or the database).
- **Drop** — Stitch invented it; it does not appear in the app. Every drop is listed here; nothing is hidden in a word list.
- **Add** — the audit needs it and Stitch left it out; build it in the same style as the screen.

Proof = side-by-side `screen.png` vs live screenshot (light + dark) where every Keep/Add element is present and no Drop element appears.

**Always dropped on every screen:** design-tool labels and frame titles ("Frame 1 — Light standard", "Night protocol", "Dual fidelity inspector", "Case A-01", state toggles), made-up IDs (REF-ID, SKU, Req #, batch ref, chassis serials), footers ("Roam Fleet Infrastructure v2.4…", "© 2025…"), design-note cards, and any price, stock, supplier or quote.

#### Fleet 1 — Brakes list (`find_parts_brakes_list_toyota_roomy_5179kz`)
- **Keep:** header row (back arrow, "Brakes for Toyota Roomy 2019", plate chip, spec line from the car's brake fields); "Parts encyclopedia for your car" intro card; Front / Rear / Whole system cards with heading, setup word ("Disc setup" / "Drum setup" from the car), component count; each type row (icon, name, one-line description, "1 part" / "Not on file yet" chip, arrow); pill tabs; "Your parts activity" card with Pending requests and Recently found sections; "Need a part that isn't on file?" card with "Ask Roam to find a part".
- **Drop:** "Specification Lock: OEM Verified · JDM SPEC" chip; the whole "Brake Inspection Tip" card (no maintenance info in Find parts); "Checking Denso and cross-match catalogues"; "sourcing specialists … regional supplier stock" wording (use "Tell us which part you need and Roam will add it."); the dot after "Front brake pads" / "Rear brake shoes" names.
- **Add:** nothing.

#### Fleet 2 — Front brake pads (`find_parts_front_brake_pads_light_dark_mode`)
- **Keep:** header (back arrow, title, "FRONT" chip, "1 part fits your car. It is sold under N brand numbers."); the one part card (name, trust chip, position chip, reference number large in mono, Copy button, "Same part, other brands" grid with brand/number/trust chip/copy per cell, size line, "Also fits N other cars — makers" line, "Use in a service log" + "View details" buttons); right "Your parts activity"; the dark frame.
- **Drop:** "Dual Fidelity Inspector", "Light & Dark Runtime", "Fleet Spec …", "REF-ID", "HUB #01", "NIGHT PROTOCOL", frame captions.
- **Change wording:** "Copy SKU" → "Copy"; "OEM PRIMARY REFERENCE" → "Reference number"; "6 verified cross-references" → "N other brand numbers".
- **Add:** each brand cell's trust chip comes from data — Akebono (a cross-reference) shows **Needs checking**; the Confirmed dot is green (#059669), not orange; tabs use the pill style from Fleet 1.

#### Fleet 3 — Part detail with Also fits (`find_parts_part_detail_with_also_fits_light_dark_mode`)
- **Keep:** panel with breadcrumb (Brakes › Front brake pads › number) and close X; chips; title, reference number + Copy; "Current selected vehicle" row with "Your car"; "Same part, other brands" grid (brand, number, copy only); "Also fits" note, filter buttons with counts, maker groups with model counts, car rows (model bold, chassis · years · engine mono, trust chip); sources list with "Open source" buttons; "Back to Brakes" + "Use in a service log"; dark frame.
- **Drop:** page heading block ("Technical spec sheet…", "Part Detail & Interchange Compatibility", its description), "Dual View / Light / Dark" toggle, "ISO/PAS 16949 Ref.", "High Contrast UI"; "Verified identical dimensions, clip orientation, and backing plate design"; every brand badge ("OEM DIRECT", "SUPERSEDED", "TIER 1 AFTERMARKET", "JAPANESE SPEC", "ECE R90 CERTIFIED", "OEM SUPPLIER") and brand sub-labels ("Toyota Genuine", "NiBK Performance"…); "Pad Assembly (4 pcs)" chip; "Confirmed OEM Fit" (use "Confirmed"); engine add-ons "Turbo", "Boosterjet"; the Fiesta caliper note (use "Only 2010–2013 cars" from the listing's years); "Daihatsu OEM Technical EPC" source; sample cars Passo, Boon M700S, Stella (the list is whatever the database holds).
- **Rename:** "Citations & catalog proof" → "Where this comes from".
- **Add:** text size up (body 14px, car names 15px, numbers 14px mono) — the export is too small to read; light and dark as separate full-width states (theme follows the app, not a toggle).

#### Fleet 4 — Part type not on file (`find_parts_brake_rotor_not_on_file_request_sent`)
- **Keep:** header row (back to Brakes, type name, car, plate, position chip); the centre empty card (icon, "Not in our database yet", the sentence built from the car's brake fields, "Ask Roam to find it", "We'll add it and tell you when it's here."); "Your parts activity" with the new request at the top.
- **Drop:** "Simulate State" bar; "255 MM OEM SPEC" tag; the Axle position / Disc construction / Pitch circle boxes; the whole "Catalogue engineering baseline" card; "Chassis: M900A-012844"; "Export CSV" and "New Work Order" buttons; "Fleet Parts Helpdesk · Ext 8140"; "Req #…"; "In catalogue queue"; "⌘K" box; footer.
- **Add:** the after-press state — button replaced by a green "Request sent" chip; same header and pill tabs as Fleet 1.

#### Fleet 5 — States (`find_parts_states_skeletons_error_unknown_car_sister_cars`)
- **Keep:** Frame A skeleton layout; Frame B red banner "Couldn't load brake parts. Nothing was changed." + "Try again"; Frame C centre card "We don't know this car's brake setup yet, so we can't list its brake parts." + "Ask Roam to find it"; Frame D Also fits with sister cars + "No other cars found yet."
- **Drop:** page title "Diagnostics & System Edge States", its description, "Parts subsystem harness…" line, A/B/C/D toggle; "Catalog querying" tag; "Inspect logs"; "HTTP 504 GATEWAY_TIMEOUT"; the banner's second line; Frame C car extras ("2018 8821KP", grade, market, "Brake specs: Unresolved", "Hub: Kingston #01"), "Chassis … not been indexed…", "275 mm solid or ventilated discs", the three boxes (Estimated resolution / Alternative action / Fleet requisition); Frame D card grid, "SKU: FP-9912", "Semi-metallic friction…", "OEM Reference 04465-B1380", "Platform variant" lines, "Justy 4WD", Boon; "Export CSV", "New Work Order"; footer.
- **Add:** Frame D uses the Fleet 3 Also-fits row style (maker heading, car rows, trust chip) instead of the card grid.

#### Fleet 6 — Narrow window (`find_parts_phone_390px_screen_2_screen_3_responsive`)
- **Keep:** the stacked layout of Fleet 2 and Fleet 3 at 390px (one-column brand list, wrapping filter buttons, two-line car rows, full-width buttons).
- **Drop:** **"J$ 4,850" and "Hub Stock: 6 units"**; the bottom tab bar (Vehicle / Ledger / Parts / Requests); "ROAM FLEET JA HUB" header (Fleet's normal top bar stacks); brand sub-lines ("OEM Direct Equivalent", "Revision B Code"…), "OEM Spec" chip; sample cars bB, Passo, Boon, Coo, Solio, Ignis, Dex, Flair Crossover; every per-car note ("14-inch rotor", "Check caliper pin", "Aisin caliper"…) — only the years note from data stays.
- **Rename:** "View details & cross-fit" → "View details"; "Verified cross-reference sources" → "Where this comes from".
- **Add:** trust chip per brand row from data.

#### Dominion 1 — Part drawer, Cars it fits (`part_drawer_cars_it_fits_with_per_car_trust_light_mode`)
- **Keep:** drawer header (number, "Active" status, part name, type · position, other numbers chips), catalogue sources block, "Cars it fits" heading with "N MATCHED", filter buttons with counts, maker groups, car rows (make · model · chassis · years · position, link chip, trust chip, "From the Roomy" for sister rows, reason line in amber mono for Needs checking), the per-car "⋯" menu (Mark confirmed, Mark needs checking, Change years, Remove this car — red) and the source button, which are in `code.html` but cut off in the picture.
- **Drop:** "Tier 1:" / "Tier 2:" prefixes (chips read "Direct", "Sister", "Kept" as today); "Owner-verified fitments with individual…" line; "(2 LINKS VERIFIED)"; "17 fitment records registered"; sample car Daihatsu Boon M700S; the made-up rows in the table behind the drawer (that table is the existing Full database list with real rows).
- **Add:** dark mode (same drawer with the Dominion dark tokens); drawer width so nothing is clipped at 1440px.

#### Dominion 2 — Add a part, cars step (`add_parts_step_2a_specific_cars_per_car_trust_year_editor`)
- **Keep:** step tracker; "Where did you find this list?" source field + the line under it naming the source type and default trust; the car table (tick box, car, chassis, years) with search and year sort and paging; the "Selected cars" panel with count, each car with chassis chip, years, "Why?" field for Needs checking cars, and the "Change years" From/To editor; footer summary "N cars · N Confirmed · N Needs checking", Cancel, Next.
- **Drop:** "Calipers / Axle" column and its values; "Region: JDM / UK"; "Active presets", "Platform: B-Segment", "Disc: Front Ventilated", "Clear all"; "Verify Link" button; "Validation confidence score…"; "CALIBRATING" chip and "Calibrate valid production span" (call it "Change years"); car tags "M900 Series", "Badge Sister", "Gen 3", "DE Series", "Mk6 / B299", "OEM Thor OEM", "GK Chassis"; panel descriptions "Japan Domestic Market", "OEM Badge Twin", "Platform Rebadge"…; breadcrumb "Catalog management / Parts intake engine / SKU-BRK-99218" and title "Fitment Assignment" (use the existing "Add a part" title and breadcrumb).
- **Add:** an **Engine** column (from the catalog row); one table row per catalog version (not "M900A, M910A" merged); the **Confirmed | Needs checking** switch on every selected car (only partly in the export); red Cancel; Save years / red Cancel in the year editor.

#### Dominion 3 — Add a part, review (`add_parts_step_4_review_trust_breakdown`)
- **Keep:** step tracker (all done, Review current); the big review sentence; a part card (reference, other numbers, type, position); a sources card listing the source link(s); the collapsible "Needs checking cars (N)" table and "Confirmed from <source> (N)" row; footer with Back and Save.
- **Drop:** "Algorithmic fitment summary", "PASS_CONFIDENCE_78.4%"; "Manual sign-off required … before final write to global registry" (nothing is blocked — Needs checking cars are saved with their label); "API VERIFIED", "v24.2.1", "SYNCED", "nibk-osaka/api/v4…", "Last pipeline fetch"; the whole "Factory Supersedes" card (04465-B2150 is invented); "OEM_SPEC" tag; label names "NiBK Inter-Code", "SB Production Code", "Product Taxonomy" (use "Other numbers", "Part type", "Position"); every invented technical reason in the Why column (caliper carrier, steering rack, pin geometry, disc thickness, 258 mm rotor); "Classification / Tier 1" column; car sub-lines ("Compact MPV (Global)"…); "Chassis variation mismatch…"; "Zero variance between…"; "Parts database / Ingestion pipeline / Stage-04-verification", "Batch ref #ING-2024-88"; "11 auto-verified · 6 flagged for audit log retention"; "Undo changes" before saving (Undo appears after Save, as today).
- **Add:** the Why column shows only the owner's typed reason; nothing else.

#### Dominion 4 — States (`parts_database_trust_states_exceptions_frames_a_d`)
- **Keep:** Frame A — "No car listing yet." with "Add a car"; Frame B — amber note "None of these cars are confirmed yet." above the filter buttons and car list; Frame C — the "Swift ZC72S marked Confirmed" toast with "Undo"; Frame D — red banner "Could not load this part. Nothing was changed."
- **Drop:** page title "Parts Database — System States & Trust Exceptions", "Catalog architecture // Spec matrix…", "State Matrix", the four "Case …" cards, the whole "Trust & Exception Guidelines … ISO-19790 Compliant" card; drawer tabs "Specifications / Cars it fits / Cross References / Audit Ledger" (the drawer has no tabs); "SKU", "Barcode", "Draft Catalog Entry", "Verified Sync", "Index health", "Validation lock", "Trust confidence 0.00%", "Transaction buffer…", "State reversible", "Author:" lines, "Fault vector"; Frame D "Data Cache Empty", "Force Sync Master", "Inspect", endpoint text, "Node db-edge-caribbean-02…".
- **Add:** "Try again" button in Frame D; every frame uses the real drawer from Dominion 1.

#### Dominion 5 — Trusted sources list (`roomy-brakes-trusted-sources/trusted_sources_maker_directory_screen_1`)
- **Keep:** new "Trusted sources" tab after Part types (shield icon, active underline); intro card with the explanation sentence and the two trust chips; filter box + "N car makers · N trusted sites" summary + filled "Add a car maker"; two-column grid of maker cards — header (maker name, mono "N sites" chip, "⋯" menu), address rows (globe icon, mono address, "Added by <name> · <date>", outlined "Open", red "Remove"), footer add field + outlined "Add"; empty card text "No trusted sites yet — links for this maker are saved as Needs checking."
- **Drop:** the Stitch sidebar ("DOMINION Operations Core v4.8", Engines, Warehouses, Logistics & Routes, OEM Catalogs, Data Schema, Audit Logs, Access Control, "KGN-DC-01 · JMD READY") — the page sits inside Dominion's real sidebar and top bar; "SCHEMA: OEM_CANONICAL_V4 / AUTHORITY_REGISTRY"; "domains active" (say "trusted sites"); the footer line "AUTO_VERIFY … SECURITY LEVEL…".
- **Add:** dark mode (Dominion dark tokens); the "⋯" menu contents (Rename, Remove maker — red) from Screen 2's style; seed rows Toyota / Daihatsu → amayama.com, megazip.net, partsouq.com; Lexus → amayama.com, megazip.net; Suzuki, Mazda empty; a second section **"Part makers"** under the car makers, same card style and same add/remove, with the intro line "A part maker's own site counts as Confirmed for that maker's own parts." — seed SB Nagamochi → sbparts.jp, NiBK → jnbk-brakes.com, Brembo → bremboparts.com.

#### Dominion 6 — Add / remove (`…/trusted_sources_add_remove_dialog_workflows_screen_2`)
- **Keep:** the four interactions — typing an address with the helper line "Only the site address is kept, e.g. amayama.com"; the added row + dark toast "<site> added to <maker>" with "Undo"; the in-app remove panel ("Remove partsouq.com from Toyota? Parts already saved stay as they are." · outlined "Keep" · red "Remove"); the "Add a car maker" panel (Car maker field · red "Cancel" · filled "Add").
- **Drop:** the page heading "Security & Ingestion / Domain Allowlist Engine", "Trusted Sources · Lifecycle State Matrix", its description, the "Protocol Sync / Trusted Sources Active / Origin Audit (24h)" toggle, the stats strip ("14 Verified Makers", "118 URLs Active", "Strict FQDN stripping", "Validation Daemon"), frame captions and "STATE: …" labels, the explainer boxes under each frame ("Focus ring active…", "Zero modal drift…", "Action controls follow…"), the regex/colour footer; card variants "Toyota Motor Corp", "OEM EPC catalog domains", "N Registered", relative dates "Added 14d ago", "Just added" + "Now verified"; "OEM REG" tag and "Default ISO 3166-1 telemetry assigned automatically".
- **Add:** every card in these frames uses the Dominion 5 card style (maker name, "N sites", address rows with Open / Remove, "Added by … · date"); the new row after Add shows the same row style.

#### Dominion 7 — States (`…/trusted_sources_system_states_edge_cases_screen_3`)
- **Keep:** Frame A skeleton cards; Frame B red banner "Could not load trusted sources. Nothing was changed." + "Try again"; Frame C add-field error "megazip.net is already trusted for Toyota."; Frame D add-field error "Type a website address, like amayama.com."
- **Drop:** page heading block ("Specification protocol // verification architecture", "State catalog v4.8", "Trusted Sources System States & Edge Validations", description), the "Catalog Rules / Trusted Sources / Audit Integrity / Sync Queues" tabs, frame captions, "Fetching trusted maker registries…", "POLL_INTERVAL", "TARGET … HANDSHAKE ACTIVE", "ERR_CATALOG_TIMEOUT_504", the banner's second sentence, "Check cluster connection", the "Local registry audit status" box, "Safe-state engine", "Data mutation reversed"; card variants with "OEM-CODE", "Tier 1 primary", "Tier 2 verified", "Collision candidate", sample sites toyota-epc.online / hondapartsnow.com / jp-carparts.com; "Enter a valid host name…" second line; "Rule: …", "Regex: …", footer.
- **Add:** Frames C and D use the Dominion 5 card style.

## 6a. Build phases

| Phase | Findings | What | Who | Proof |
|---|---|---|---|---|
| **1 — Fix existing data ✅ DONE 6 Nov (live, 8/8 checks)** | RB-04, RB-03, RB-02 (front pads), RB-01 (front pad number) | One data migration + a read-only checks file | Cursor writes; Claude dry-runs on live inside a cancelled transaction; owner applies | checks file all PASS on live; parts_for_vehicle shows the 7 pads in one group; undo restores 6 groups (dry run) |
| **2 — Brake part types ✅ DONE 6 Nov (live, 8/8 checks)** | RB-07 | 7 new brake part types + positions; rotor gets front/rear; brake role per type (disc / drum / rear axle / whole system) so Fleet can group Front / Rear / Whole system and show "Not on file yet" | Cursor (migration) | Roomy shows every type in Dominion Part types and Fleet Brakes list data |
| **3a — Trust: database + server ✅ DONE 6 Nov (live; server routes need a fleet-core deploy)** | RB-15, RB-16 | per-car trust + reason + years on listings; trusted sources per maker; factory-number trust; server routes for all of it | Cursor | SQL checks + route tests on the test copy with made-up data; read-only checks on live |
| **3b — Trust: Dominion screens ✅ DONE in code 7 Nov (14/14; live pending)** | RB-15, RB-16 | Dominion 1–7 per §5a | Cursor | e2e on test copy; side-by-side vs Stitch per §5a |
| **4 — Fleet Also fits + one card per part ✅ DONE in code 7 Nov (Fleet 8/8, Dominion 15/15; live pending)** | RB-10, RB-11, RB-12, RB-13 | `/parts/lookup` full fit list + Fleet 1–6 screens | Cursor | e2e on test copy; side-by-side vs Stitch per §5a |
| 5 — Load the data | RB-06, RB-05, RB-09, RB-08 | add missing cars, link the 17 cars, brake specs on sisters, rotor/drum/fluid | Owner in Dominion (screens from Phase 3) | done-tests 1–8 |
| 6 — Final gate | RB-14 | all done-tests run through the real API path | Cursor + Claude check | §4 all pass |

**Phase 1 decisions (6 Nov):**
- Front-pad merge goes into the existing group `34c02865…` (NiBK + Brembo, already merged by WVA 24283), and is logged against the kept conflict `e9e86e27…` (CNF-001317, which lists all 6 pad groups) with rule `oe_same_part`, so the existing `part_match_unmerge_same_part` can undo it. The old duplicate warnings were all marked **Keep** on 4 Nov instead of merged, so the Merge button can't be used on them (it needs an open warning).
- **Rear shoes are not merged in Phase 1.** The only source saying Blue Print ADT34155 = Toyota 04495-B2400 is Spareto (a TecDoc copy). They merge when Blue Print's own catalogue page is found.
- The 3 Roomy rows without 04465-B1190 get it from the same SB page the other 7 rows use (Toyota's own parts catalogue isn't publicly reachable), with a note saying so. The rear shoe factory number is not added (shop source only).

**Phase 3b notes (6 Nov, Claude's single test run):**
- `e2e/roomy-brakes-trust.spec.ts` now runs against the real test copy: real owner login (mm-p01 owner, aal2), real fleet-core routes, real database. No catalog mocks. Fixture car: FxToyota FxRoomy.
- One run, result **2 passed, 1 failed**:
  - Trusted sources list, plus add a site and remove it: **PASS**. The database row was checked after each step.
  - Trusted sources in dark mode: **PASS**.
  - Add a part (per-car trust, then review): **FAIL** at Step 1. The real Step 1 has two parts (pick the type, then the details), and the Brand / Part number / Source link labels were not linked to their boxes. The test was rewritten for the real flow and the labels are now linked. It has not been run again yet.
- Bugs found and fixed:
  - **3b-01 Trusted sources hid makers.** The GET route listed only car makers that have cars in the catalogue, matched with exact spelling. A trusted maker with no cars yet (or with different capitals) never showed, so its sites could not be seen or removed. Fixed in `catalog_routes.ts`: every maker with trusted sites always shows, matched ignoring capitals. Re-checked with a real request: all seeded makers come back.
  - **3b-02 Step 1 labels not linked.** In `Step1Details.tsx`, Brand, Part number and Source page link had no link between label and box (also a screen-reader gap). Fixed with `htmlFor` / `id`.
  - **3b-03 Drawer close button had no name.** The X in `FullDatabaseDrawer.tsx` had only a hover title, so screen readers could not name it. Fixed with `aria-label="Close"`.
  - **3b-04 "Remove maker" never worked.** `DELETE /trusted-sources/maker` was caught by the earlier `DELETE /trusted-sources/:id` route, which answered "Invalid id" (400), so the maker stayed. Fixed in `catalog_routes.ts`: `:id` now only matches a real id. Re-checked with a real request: 200, and the database row count went from 1 to 0. The spec now waits for the "Maker removed" message before checking, because the open confirm box hides the card from the test.
  - **3b-05 Add-a-part car search always failed (500).** The search asked for `vehicle_catalog.version_name`, a column that has never existed (only app-store tables have it). The same mistake was in the parts-import car list download and the import car matching. Fixed in `catalog_routes.ts`, `parts_import_routes.ts` and `parts_import_vehicle_resolve.ts`: they read `trim_series` under the old name, so the screens are unchanged. Re-checked: a search for FxRoomy returns 200 with the car.
  - **3b-06 (Critical) Every ticked car saved as Confirmed.** On Step 2 a newly ticked car was set to Confirmed before the server's answer arrived, and the server's answer never replaced it. So a part saved with a shop or unknown link was stored Confirmed on every car, against the source rule. Three causes:
    - the screen never sent the link to the trust preview;
    - the preview's per-car answer used the field name `vehicleId`, which the Dominion customer-field guard blocks, so it always failed (500) and the screen ignored the error;
    - the screen defaulted to Confirmed.

    Fixed:
    - the link is sent (`addPartsApi.ts`, `AddPartsTab.tsx`, `catalog_routes.ts`);
    - the route renames the field to `catalogId` before the guard; the guard is kept, and the live database function is unchanged;
    - a new car stays blank until the server answers.

    Re-checked with real requests: example.com gives Needs checking, and a trusted car-maker site gives Confirmed.
  - **3b-07 The headline "Default trust" label used the "made by" choice, not the link.** It said "Verified · part maker's catalogue" for example.com. It now comes from the server's per-car answer (Confirmed / Needs checking / Mixed).
  - **3b-08 "Front Axle" looked picked when it wasn't.** In `Step2FitBlock.tsx` the front button's fixed icon was a filled circle (`adjust`), and the rear's was empty. So with nothing picked, Front looked chosen, and Next stayed greyed out with no visible reason. Fixed: the circle fills only on the axle actually picked, plus `aria-pressed`. The spec now picks Front Axle.
- **Cursor run 5 (6 Nov): 12/12 PASS** on the real test copy.
- **Side-by-side vs Stitch (6 Nov, Claude).** Every live screenshot was compared with its Stitch `screen.png` and the §5a lists. Dominion 1 (drawer) and Dominion 4 (states) match. Open items:
  - **3b-09 (Critical, source rule) A part is saved Confirmed from the "made by" answer, not the link.**
    - `self_serve_catalog_decision(source_type)` returns confirmed for any `car_maker_catalogue` / `part_maker_catalogue`, and picking "No — another brand" sets `part_maker_catalogue` automatically. So a part saved with an example.com link is stored Confirmed.
    - The screens repeat it: "Verified" at the top, "Verified Direct Match" and "Verified · part maker's catalogue" on Review.
    - Fix: the part's decision comes from the link. Confirmed only when `source_trust(link, chosen car maker, ARRAY[brand])` = confirmed; otherwise pending / Needs checking. Same for the preview's `trustLabel`, and every Verified label on Steps 1–4 reads it.
  - **3b-10** Removing a single site has no confirm panel. Stitch Frame C: "Remove partsouq.com from Toyota? Parts already saved stay as they are." · outlined Keep · red Remove, in-app.
  - **3b-11** The add-site field:
    - it has no helper line "Only the site address is kept, e.g. amayama.com";
    - its placeholder "example.com" looks like a typed value (use "e.g. amayama.com");
    - "already trusted" and "Type a website address…" show as toasts, not under the field (Frames C/D).
  - **3b-12** No toast "<site> added to <maker>" with Undo after Add (Frame B).
  - **3b-13** An empty maker card has no text. It should say "No trusted sites yet — links for this maker are saved as Needs checking."
  - **3b-14** The summary says "4 car makers · 11 trusted domains", but 11 includes the part-maker sites. It should count car-maker sites only and say "trusted sites".
  - **3b-15** The part-makers line says "…supplier catalogue (not the car brand's own EPC)". Use "A part maker's own site counts as Confirmed for that maker's own parts.", placed under the "Part makers" heading.
  - **3b-16** The Cancel button in "Add trusted site" is grey. Cancel buttons are red (owner rule).
  - **3b-17** "Advanced tune" shows twice on the Trusted sources tab (header and tab row).
  - **3b-18** The "Needs checking" table on Review shows Years "–" for a car with 2018–2022.
- **3b-09 to 3b-18 fixed by Cursor (7 Nov), 14/14 Playwright pass** (Cursor's report says "last run", so it may have run more than once).
  - New migration `20261107004225_roomy_brakes_phase3b_trust_labels.sql`, checked by Claude against live:
    - the Phase 3a bodies in the repo equal live (md5 match) for `save_self_serve_part` and `self_serve_part_add_preview`;
    - the new file changes only the part decision and `trustLabel` (from `source_trust(link, catalogCarMaker, ARRAY[brand])`).
  - Pending parts still show in Fleet: `parts_for_vehicle` hides only `rejected`.
  - Server: `catalogCarMaker` is passed to preview and save; `vehicleId` is renamed to `catalogId` in preview and save answers.
  - `main` has no fleet-core runtime changes missing here (only a generated status file and a test).
- **Phase 3b CLOSED in code; live 7 Nov 01:14 UTC.** Migration applied by the owner (live function md5 = file for both functions); fleet-core v245 deployed. Left: the Dominion screens reach live with the next Dominion release.
- Cursor run 4 (6 Nov): 10 passed. Dominion 2–3 failed on 3b-08 (the trust fixes 3b-05 to 3b-07 showed correctly on its screenshot); the dark version did not run.
- Cursor run 3 (6 Nov): 10 passed (Dominion 1, 4, 5, 6, 7, each light + dark). Dominion 2–3 failed on 3b-05; the dark version did not run.
- Cursor run 2 (6 Nov): 4 passed (Dominion 1 + dark, Dominion 4 + dark). Dominion 6 failed on 3b-04; the 7 tests after it did not run.
- Test-copy facts learned:
  - The local fleet-core bundle (`supabase/functions/fleet-core/index.ts`) was from 5 Nov and had no Phase 3a routes. It must be rebuilt (`node scripts/build-edge-bundle.mjs fleet-core`) before any trust test. It is now rebuilt and includes 3b-01.
  - On a fresh local setup from this branch, Phase 2 silently skipped. Some column-adding migrations on this branch carry later dates, so they ran after it. Re-running the Phase 2 file on the local copy fixed it; local brake types now match live (11 types).
- Open: the next single run of the spec; Cursor's mocked catch-all in `e2e/addPartsStitchMocks.ts` (answers every `/functions/v1/` call with `{}`, which affects the older add-a-part mock tests); the screenshot side-by-side vs Stitch for Dominion 1–7.

**Phase 4 notes (7 Nov):**
- Cursor built:
  - the server: Fleet `parts/lookup` with the full fit list, `brakes-overview`, and grouped `parts/find`;
  - the screen: one `BrakesFindPartsFlow` for Fleet 1–6;
  - the database: migration `admin_catalog_master_part` (+ engine, + platform twins);
  - the test: a seed and `e2e/roomy-brakes-fleet.spec.ts`.

  Cursor's single run failed while loading its test data; Cursor then fixed the seed without re-running.
- Claude review:
  - The migration's base equals live (`admin_catalog_master_part` md5 8144ecf5… = Phase 3a = live), so it undoes nothing.
  - **4-01** The migration was dated 14 Nov (future). Renamed to `20261107012459_…`.
  - **4-02 (source rule)** "Platform twin" cars (same body as a listed car but never listed for the part) were sent to Fleet as **Confirmed**, and capped at 12 without saying so. Now they are **Needs checking** with the reason "Same body as a listed car; no source for this car yet", set in the database so Dominion and Fleet agree; the cap is removed. On live today this adds only Toyota Tank M900A to the front pads.
  - **4-03** The seed put FxRush on the FxRoomy body, which made it a twin while the test expects no Rush. It now has its own body.
  - **4-04** The Fleet login helper (`e2e/helpers/mmF01Auth.ts`) did not save the session under the test copy's key `sb-127-auth-token`, so the test sat on the sign-in page. Fixed.
- Claude run 1 (one run): the seed loaded cleanly; done-test 1 failed on 4-04 (sign-in page); 4 did not run.
- The owner then allowed as many runs as needed. Further fixes:
  - **4-05 (LIVE BUG) Fleet part search fails for every part type.** `loadUniversalToleranceMm` (`parts_finder.ts`) filtered `universal_part.maintenance_component_id`, a column that does not exist; the link is through the spec key. Live logs show `parts/find` 500 for 5179KZ brake pads on 6 Nov (18:42, 21:04). Fixed: the lookup goes through `spec_key` / `part_type_spec_field`. Its route also returned "[object Object]" for database errors; it now returns the message.
  - **4-06** One part was split into two cards. The factory number sat under "Made for your car" and the other brands under "Other brands", and grouping ran per section. Now `groupFindSections` groups across sections and puts the card in its best section.
  - **4-07** The Fleet screen showed only the first part card, with "1 part fits your car" built into the text. It now shows every card, says "N parts fit your car.", and each card says "Sold under N brand numbers."
  - **4-08** Test and type fixes: the spec's selectors now match real row titles; screenshots are taken on the right screen; every screen is captured in dark mode and at 390px; `CatalogPartItem.groupId` was added; the lookup test typing is fixed.
- **Result: Fleet e2e 5/5 PASS; server unit tests 10/10 PASS** (grouping, lookup, brakes overview, trust routes). Fleet `tsc` shows no errors in Phase 4 files (4 older errors remain in untouched files).
- **Side-by-side vs Stitch (Claude, 7 Nov).** Fleet 1 (Brakes list) and Fleet 4 (not on file) are close. Fleet 2, 3 and 6 work but are not yet ported. Open:
  - **4-09 Fleet 2 (pad card) is not the Stitch card.** Missing:
    - the header "Front brake pads · <car> · <plate>" with the FRONT chip and "1 part fits your car. It is sold under N brand numbers.";
    - the card's trust chip and position chip;
    - "Reference number" over the big mono number, with an outlined Copy button;
    - a brand grid with a copy icon per cell;
    - the size line;
    - "Also fits N other cars — makers";
    - "Use in a service log" plus a filled "View details →";
    - the left accent bar.
  - **4-10 Fleet 3 (part detail) is not the Stitch panel.** Missing:
    - the breadcrumb, chips, title, and reference + Copy;
    - "Current selected vehicle" with "Your car";
    - the "Same part, other brands" grid;
    - the Also fits note, counts on the filter buttons, and model counts per maker;
    - sources listed by name, each with an outlined "Open source" button (today it is an underlined link);
    - "Use in a service log";
    - the text sizes in §5a.

    The panel top also sits under the test-copy bar.
  - **4-11 Dark mode trust chips are unreadable** (pale chip with pale text) in the Fleet 3 panel.
  - **4-12 "Your parts activity" is not the Stitch panel.** It needs Pending requests and Recently found. The "Self-serve parts desk … sources genuine & OEM replacements across Jamaica & Japan within 24h" text must go (Fleet 1 Drop): use "Tell us which part you need and Roam will add it." "Repeat-part alerts … hub" is invented.
  - **4-13** On the Dominion part drawer, twin rows (no listing) still offer the per-car menu, so Mark confirmed etc. would fail. Twin rows need no menu, plus "Add this car" to list it for real.
  - **4-14** Fleet 5 (states) has no test or screenshot: loading, could-not-load, unknown brake setup, and sisters only.
- **4-09 to 4-14 ported by Cursor (7 Nov). Claude re-ran on the test copy: Fleet 8/8, Dominion trust 15/15.** Pad card and detail panel now match Stitch; dark trust chips are readable; activity panel is clean; twin rows show "Add this car" with no menu; Fleet 5 error and unknown-setup states are tested.
  - Minor, not blocking: the pad card lacks the "Also fits N other cars — makers" line, and it says "5 other brand numbers" where it should say 4 (the count includes the reference number itself).
- **Phase 4 CLOSED in code.** Live `admin_catalog_master_part` is still the Phase 3a body (md5 8144ecf5…), so `20261107012459` applies cleanly. To go live: the owner applies that migration and deploys fleet-core (this also fixes live bug 4-05); the Fleet and Dominion screens reach live with the next release.

**Phase 5 notes (7 Nov):**
- RB-06 done: 890 + 6 cars imported (catalog 937 → 1,833). Only Swift ZC32S and Demio DE5FS had been missing; both are in now.
- RB-09 prepared: migration `20261107025603_roomy_brakes_phase5_sister_brake_specs.sql`.
  - Tank, Thor and Justy (M900/M910) get the Roomy values: Ventilated Disc / Drum / 255 mm.
  - Rush J210E gets Ventilated Disc / Drum from Goo-net and dealer listings; size left blank because sources disagree.
  - It fills empty cells only.
- Committed on parts-auto-match: 8f67ceb1 (all Phase 1–4 work plus fixes) and 6975e65d (RB-09). Not pushed.
- Left: RB-05 (link pads to the other cars, in the new Dominion screens after release) and RB-08 (rotor / drum / fluid).

## 6. Order

1. Data fixes on what exists: RB-04, RB-03, RB-02, RB-01.
2. Part types: RB-07 (owner, in Dominion → Part types).
3. Screens + server: RB-15 (Dominion) → RB-10 → RB-11 → RB-12 → RB-13, each from the owner's Stitch screens in §5.
4. Data loading: RB-06 → RB-05 → RB-09 → RB-08.
5. Gates: RB-14 done-tests pass.

<a id="source-rule"></a>
## Source rule (reminder)

*(Widened 6 Nov 2026 — the car-maker-only version meant no Japanese car could ever be Confirmed, because their parts catalogues aren't public.)*

A factory number or a car fit is **Confirmed** when any one of these holds:
1. **The car maker's own catalogue, or a frame-number site trusted for that maker.** Dominion keeps a per-maker list (e.g. Toyota / Daihatsu: Amayama, Megazip, Partsouq) of sites that show the maker's own catalogue for an exact frame number (RB-16).
2. **The part maker's own catalogue**, for which cars its own part fits.
3. **Two different part makers' own catalogues name the same factory number for the car** (SB and NiBK both list 04465-B1190 for Tank/Roomy → Confirmed). Both pages are stored.

**Needs checking:** a single "equals other brand" cross-reference, shops and TecDoc copies (Spareto, fitinpart, yoshiparts, Autodoc), any site not on that maker's trusted list. **Never a source:** forums and AI web summaries — the list the owner pasted was one, and it wrongly included the Toyota Rush.
