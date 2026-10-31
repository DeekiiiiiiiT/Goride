# Roam Fleet · Fleet maintenance → Find parts tab — build and port plan (Rev 1, 30 Oct 2026)

Goal: build the new **Find parts** tab in Fleet maintenance.
- The audit decides the data and rules: [fleet-find-parts-audit.md](fleet-find-parts-audit.md).
- The Stitch export decides the looks: `C:\Users\deeki\Downloads\stitch_roam_fleet_parts_counter\stitch_roam_fleet_parts_counter`.
- The shared search engine comes from the Dominion side: [dominion-find-parts-audit.md](dominion-find-parts-audit.md) §6 and [dominion-find-parts-port-plan.md](dominion-find-parts-port-plan.md) Phase 1.

This plan was written from the real export files, the repo and live read-only SQL on 30 Oct 2026. No code was changed.

---

## 0. The finish line (read this first)

**A screen is done only when its live page sits next to its Stitch picture and looks the same, in light mode, in dark mode and on a 390 px phone.**

- The word checker (`node scripts/stitch-fidelity.mjs --report`, once Phase 1 extends it to Fleet) only looks at headings, labels and buttons. A score of 100% is required, but it is **not** proof that the page is ported.
- Do not design a new layout. Do not build a simpler version and call it a match.
- The only allowed differences from the picture are the ones listed for that screen in §4 (made-up text removed, sample values replaced by live ones).
- The **By vehicle** and **Service ledger** tabs, and the Fleet maintenance header above the tabs, must look exactly as they do today.

---

## 1. What is missing or broken in the export

| # | Problem | What this plan does |
|---|---|---|
| 1 | **All 12 `screen.png` files are empty.** Each one is a 28-byte placeholder, not a picture | Phase 0 makes the reference pictures by opening each `code.html` in a browser |
| 2 | **No screen has a dark version** (0 `dark:` classes in all 12 files) | §5 dark-mode rule: the dark colours from the Stitch prompt, checked by contrast |
| 3 | **Only one phone screen** (Screen 12, the results) | §5 phone rule for the other 11 |
| 4 | **Each HTML file has its own fake app shell.** There are two different top bars across the screens ("Kingston Hub · Switch vehicle or search hub · JM (JMD) · EST / UTC-5" and "Kingston Hub #01 · Search telemetry & fleet… · 14:32:08 EST · Dispatch Node 04"), a fake sidebar, a phone bottom nav (Fleet uses a flyout menu, not a bottom bar) and fake footers ("SYS LATENCY: 24ms", "BUILD v4.19.2", "© 2024 Roam Fleet Systems Ltd") | Port only the Find parts tab content (Phase 3, step 1). The real Fleet shell, the hub header and the tab row stay |
| 5 | **The hub header is redrawn** (title, Refresh, Bootstrap schedules, Compatible parts, "+ Log new service", tab row) with different styling from the live page | The live header and tabs stay unchanged (audit T11) |
| 6 | **The step bar is different on every screen.** Examples: "1. Vehicle › 2. Version & Trim › 3. Part Category › 4. Position & Fit"; "1. Pick car · 2. Trim: 1.5 GP5"; "1. Pick vehicle · 2. Trim & Year · 3. Category" | One step bar, using Screen 1's layout, labelled "1. Vehicle · 2. Version · 3. Part · 4. Front or back" (§4, rule G9) |
| 7 | **Made-up text everywhere.** Hubs, bins, ticket numbers, odometers, wear percentages, SLAs, guarantees, telemetry, staff names, supplier notes, work orders | §4 decides each one |
| 8 | **Three made-up features**: a parts cart ("Add to order", "Confirm parts list (1) J$ 1,850"), "You may also need for this service", and voice search (mic icon) | Removed (G7) |
| 9 | **Only 3 of the 5 match-type colours are used**, because the sample results have 3 sections | The other 2 come from the Stitch prompt: #0e7490 for Sister, #b45309 for Engine |
| 10 | **Urgency has 4 choices (Low, Normal, Urgent, 24h), but the database allows 3** (`low`, `normal`, `urgent` on `parts_sourcing_requests`) | "24h" is removed (Screens 7, 8 and 12) |
| 11 | **Fleet has no Stitch styling yet.** It loads no Inter, JetBrains Mono or Material Symbols fonts (`apps/fleet/index.html`), and has no scoped colour tokens like the Dominion `.parts-database-stitch` | Phase 0 adds a scoped `findParts.css` and the fonts |
| 12 | **The audit's screen file names don't match the export.** The audit names files like `find-parts-car.html`; the export uses Stitch folder names | §2 maps each folder to its file |

**Database facts that change the build** (live, 30 Oct):
- `part_quote_request` has `qty` and `note`, but **no `urgency` and no `maintenance_component_id`**. Phase 1 adds both.
- `parts_sourcing_requests.vehicle_id` is **NOT NULL**, so an "Another car" request cannot be saved. Phase 1 makes it nullable.
- Quotes, repeat alerts, warranty claims, core returns and org stock all have **0 rows**. The activity panel and the "On your shelf" badges will be empty on the live site. That is correct, not a bug.
- `org_part_stock.location` exists, so "On your shelf — 2 ({location})" can be live.
- `supplier_part_offer` has `unit_price`, `currency`, `lead_time_days`, `warranty_months` and `price_observed_at`. The supplier price table on Screen 6 can be fully live.
- `pickBestPart` already exists in [partsBestPick.ts](../packages/types/src/partsBestPick.ts). Reuse it; do not write a second one.

---

## 2. Screen list

| Screen | Stitch folder | README # | HTML in repo (`docs/stitch/roam-fleet-app/html/`) |
|---|---|---|---|
| 1 Pick the car (+ activity panel) | `find_parts_pick_the_car` | FP1 | `find-parts-car.html` |
| 2 Which one is yours? | `find_parts_which_one_is_yours` | FP2 | `find-parts-variant.html` |
| 3 What part? | `find_parts_what_part_guided_browser` | FP3 | `find-parts-browse.html` |
| 4 Front or back? | `find_parts_front_or_back` | FP4 | `find-parts-position.html` |
| 5 Results | `find_parts_results_in_five_match_types` | FP5 | `find-parts-results.html` |
| 6 Part detail drawer | `find_parts_part_detail_drawer` | FP6 | `find-parts-detail.html` |
| 7 Request a quote | `find_parts_request_a_quote` | FP7 | `find-parts-quote.html` |
| 8 Ask Roam to find it | `find_parts_ask_roam_to_find_it` | FP8 | `find-parts-request.html` |
| 9 Car not linked yet | `find_parts_car_not_linked_yet` | FP9 | `find-parts-link-car.html` |
| 10 Your parts activity | `find_parts_your_parts_activity` | FP10 | `find-parts-activity.html` |
| 11 Loading, error, no permission | `find_parts_loading_error_no_permission` | FP11 | `find-parts-states.html` |
| 12 Phone (390 px) | `find_parts_phone_390px` | FP12 | `find-parts-phone.html` |

All 12 reference pictures are rendered in Phase 0, because every PNG in the export is empty. React files are the ones in audit §7 (`apps/fleet/src/components/vehicles/find-parts/`).

---

## 3. Build order

Each phase ends with a check. Do not start the next phase until the check passes.

### Phase 0 — Put the design into the repo (no app code)
1. **Copy the HTML.** Copy each `code.html` to the path in §2. Copy `fleet_operational_engine/DESIGN.md` to `docs/stitch/roam-fleet-app/find-parts-DESIGN.md`.
2. **Make the reference pictures.** Use `scripts/stitch-render.mjs`; if the Dominion plan has not created it yet, create it now.
   - It opens each HTML file in Playwright Chromium at 1280 px wide (390 px for FP12), waits for the fonts, and saves a full-page screenshot to `docs/stitch/roam-fleet-app/screenshots/FP*-stitch.png`.
   - Pass it the folder as an argument, so the same script serves both apps.
3. **Add the README rows.** In `docs/stitch/roam-fleet-app/README.md`, add a "Find parts screens" section with the FP1–FP12 table from §2, the Stitch screen id, and a "Ported to" column (audit §8). Every row starts as "Not started".
4. **Add sample labels.** Create `docs/stitch/roam-fleet-app/sample-labels.json`. Under each FP row, add every "Remove" line from §4 for that screen, plus the hub header labels the export redraws ("Bootstrap schedules", "+ Log new service", "Compatible parts", "By vehicle", "Service ledger"). The word checker then does not ask for them.

**Check:** all 12 reference pictures open and show the real design.

### Phase 1 — Server (after the Dominion engine is live)
**Wait** until the Dominion plan's Phase 1 is deployed and passing. That provides the shared types, the migration, `parts_finder.ts`, and the browse, term and symptoms handlers.

**Then build:**
- **Migration.**
  - `part_quote_request`: add `urgency` (same 3 values as `parts_sourcing_requests`) and `maintenance_component_id`.
  - `parts_sourcing_requests.vehicle_id`: drop NOT NULL.
  - Check `vehicle_catalog_pending_requests.source`. If it has a check constraint, add `find_parts` to the allowed values.
- **Routes** in `part_sourcing_routes.ts`:
  - W1 `GET /parts/find`.
  - W2 `browse`, `term` and `symptoms`.
  - W3 quote with qty, urgency, note and component.
  - W4 pre-filled request.
  - W5 `GET /parts/activity`. Add a 5th list, `quotes` (from `part_quote_request`, own org, 5 newest and a total), because Screen 10 has a Quotes tab.
  - **New:** `POST /parts/request-photo`. It stores the file in a private bucket under the org's folder and returns `photo_url` for Screen 8.
  - **New:** `GET /parts/vehicle-context?vehicleId=`. It returns the vehicle's odometer, its services that are due (with component ids), and the date and km of the last service for a given `componentId`, all from existing tables. This fills Screens 1, 3 and 4.
- **Fidelity script (W6).** Extend `scripts/stitch-fidelity.mjs` to read the `roam-fleet-app` README rows that have a "Ported to" path, and its `sample-labels.json`.

**Check:** audit tests T1–T8 pass, plus 3 new tests:
- quotes in `/parts/activity` are own-org only;
- the photo upload refuses another org's folder;
- `vehicle-context` returns 403 for another org's vehicle.

Then deploy fleet-core and call each route once on the live server for 1505LM (the Honda Fit).

### Phase 2 — Styling base (one commit, no screens yet)
- Add the Inter, JetBrains Mono and Material Symbols Outlined fonts to `apps/fleet/index.html`.
- Create `apps/fleet/src/components/vehicles/find-parts/findParts.css`:
  - a `.fleet-find-parts-stitch` wrapper holding the export's colour tokens (from `find-parts-DESIGN.md` and each file's `tailwind.config`) and its font-size names;
  - a `.dark .fleet-find-parts-stitch` block holding the Stitch prompt's dark colours (background #252525, surface #2e2e2e, border #444444, text #fafafa, muted #b4b4b4, primary #fafafa, success #34d399, warning #f59e0b, error #f87171).
- Never add these tokens to global CSS. The other tabs must not change.

**Check:** the By vehicle and Service ledger tabs look the same as before in light and dark mode (snapshot test T11).

### Phase 3 — Port the screens, one at a time, in order 1 → 12
Each screen is one commit. For each screen:
1. **Port only the Find parts tab content**: what sits below the tab row inside `<main>`. Never port the fake top bar, sidebar, bottom nav, footer, hub header or tab row.
2. **Keep the HTML as it is.** Keep its element structure, classes, spacing and wording. Turn `class` into `className`, and turn the inline `<script>` blocks (card selection, quote dialog counter, drawer open) into React state.
3. **Put it inside `.fleet-find-parts-stitch`.** Any class from the export's `tailwind.config` that is missing goes into `findParts.css`.
4. **Fill in live data** and apply that screen's rows in §4.
5. **Make the proof pack** (§5).
6. **Mark it Ported.** Set the README row to "Ported", list the files in "Ported to", and run the word checker. It must show 100%.

The tab wiring from audit §7 goes in with Screen 1:
- the third tab;
- `hubTab` read from and written to the URL;
- the Compatible parts button switches to the tab.

The old dialog is deleted with Screen 6, once its actions have moved into the drawer.

### Phase 4 — Finish
- `vitest` passes, fleet `tsc` is ≤ 464, and the Playwright visual test passes (§5).
- Add the "Find parts for this" link on Services due (audit F10).
- Deploy the fleet site. Open the live URL and repeat the light, dark and phone pictures for Screens 1, 5 and 8 against real data.

---

## 4. Decisions for each clash (no need to ask)

### Rules for every screen
- **G1 · Made-up system text is removed.** This covers every chip or line naming a hub node, cluster, catalog version, index, latency, sync time, build number, SLA, policy code, trace or log.
  - Examples: "PARTS RUNNER ONLINE (KMTR-DISPATCH)", "CATALOG v4.88 · JM SPEC", "DISAMBIGUATION ENGINE · 100% FIT SPEC", "Index DB: 2025.04-KIN", "Triage Rulebook v2.4", "Catalog Synced 09m ago", "JAD Telemetry Broker Live", "DEV PREVIEW // NODE KIN-01", "POLICY: RBAC-MAINT-403", "HTTP 504 GATEWAY_TIMEOUT".
  - The space they took stays empty. Nothing moves.
- **G2 · Match-type names come from the audit:**

  | Title | Tag |
  |---|---|
  | Made for your car | OEM |
  | Same car, different badge | Sister |
  | Fits your engine | Engine |
  | Other brands that replace it | Aftermarket |
  | Fits by size | Universal |

  Replace "Exact Fit (Tier 1)", "Cross-Spec Approved", "Tier 1 OEM Preferred", "Tier-1 First Time Fit", "Direct OEM only" and "Universal Catalog Mode" with these.
- **G3 · No promises the system can't keep.** Remove every guarantee and certainty line: "Zero Fitment Error Guarantee", "Zero-Fitment Guarantee", "100% matched", "100% SPEC MATCH", "PHOTO MATCH: 100%", "Zero fitment discrepancy reported since Nov 2023", "Protected by SLA Guarantee v2.4", "Coverage: 100% Roam Approved Stock".
- **G4 · Only your own org's data, and only real data.**
  - Plates, your vehicles, your stock, your suppliers' offers and your requests are allowed, because they belong to the caller's org.
  - Invented people are removed: "JD (Fleet Lead)", "John Doe (Driver Operator #210)", "Julian Douglas (Lead Dispatcher) · Extension #401 · Desk 3B".
  - Invented places are removed: "Kingston Hub #01", "Kingston Route Cluster 03", "Marcus Garvey Hub", "Bay 4C", "Bin #09-A".
  - A stock location shows only when `org_part_stock.location` has a value.
- **G5 · Every number is live or it goes.** If a route in Phase 1 provides it, fill it in. If not, remove the number, and keep its label only when the label still makes sense alone. Never hard-code a sample number.
- **G6 · No part photos.** No part photos are stored. Where the HTML shows a product photo, show the component's icon in the same box, at the same size.
- **G7 · Buttons with no feature behind them are removed.** This covers "Add to order", "Confirm parts list", "Save query", "Inspect lead", "Investigate wear history", "Review warranty terms", "View schematic", "Request access from JD", "Send notification to Fleet Admin JD", "Check connection status" and the mic icon.
- **G8 · Trade words become the audit's plain words.** These are the only wording changes allowed:

  | Export says | Becomes |
  |---|---|
  | "Ping RFQ", "Quote PO", "Request Fresh Supplier Quote", "Broadcast RFQ to 3 Suppliers" | "Request quote" |
  | "Allocate to Work Order" | "Use in a service log" |
  | "Add to requisition wishlist" | "Get a price" |
  | "RFQ", "requisition" | "quote", "request" |
  | "Prices include Jamaican landed import duties, GCT, and bonded port handling charges." | "Prices are landed cost in J$." (The landed cost does not prove GCT is included) |
  | Price lines | "J$ {n} landed · {lead} days", from `landedCostJmd`. With no offer: "No price yet" + "Get a price". Old price: grey "Price may be old", from `priceIsStale` |
- **G9 · One step bar.** Use Screen 1's layout on every step, labelled "1. Vehicle · 2. Version · 3. Part · 4. Front or back". A skipped step shows as done, greyed. The choice trail ("Honda Fit 2018 › 1.5 hybrid › Brake pads › Front") sits under it from step 2 on, and each chip opens its step again.
- **G10 · Urgency is Low, Normal or Urgent.** "24h" is removed everywhere.

### Screen 1 — Pick the car
| In the HTML | Decision |
|---|---|
| "Which car is it?", My Vehicles cards, "or another car" Make / Model / Year, Continue | Keep |
| "My Vehicles (in fleet) 2 active" | Live count of your vehicles |
| Card lines: plate, car, version, "Verified specs", "Service due: Oil & Filter" | Plate, car and `variantPlainLabel` are live. "Verified specs" becomes "Linked" or "Not linked" (Not linked opens Screen 9). "Service due" comes from `vehicle-context`, and is hidden when nothing is due |
| "2 parts on shelf" on the card | Remove (needs a full search per car) |
| "Or type vehicle / VIN" + "Tip: You can also paste Jamaican registration, chassis serial, or JDM model codes." | Tip becomes "Type a plate from your fleet, or make, model and year." A plate matches your own vehicles; frame numbers belong on Screen 9 |
| "Your parts activity" panel (Requests, Repeat-part alerts, Warranty claims, Core returns, See all) | Keep, live from `/parts/activity`. Each sub-line is built from the newest row. "See all" opens Screen 10 |
| "Need a part not in inventory?" card + Ask Roam to find it | Keep. Text: "Our team finds the part and gets you a price." ("within 24h" and "across Jamaica & Japan" are removed.) The button opens Screen 8, filled with whatever has been chosen so far |
| The inline "Submit Parts Request" pop-up | Remove. Screen 8 is the only request form |
| "Zero-Fitment Error Guarantee" card | Remove (G3) |

### Screen 2 — Which one is yours?
| In the HTML | Decision |
|---|---|
| Title "Which 2018 Honda Fit is it?", version cards, Not sure, help line, Back, Continue | Keep |
| Card code line "GP5 · LEB · 7-speed DCT" | Live chassis code, engine code and transmission |
| Card description sentences and "Chassis match: GP5-1000001+" | Remove (no data) |
| "Most common in fleet (Kingston)" | "Most common in your fleet". Shown on the version most of your vehicles of this model have; hidden when you have none |
| "Kingston Hub Fleet Telemetry" panel (your 2 Fits, plates, "100% of Roam fleet fits are…") | Keep the panel and retitle it "In your fleet". It lists your vehicles of this make and model with plate and version code, plus "{x} of {n} are {version}". The status words ("Active Dispatch · Kingston") are removed. Hidden when you have none |
| "PARTS FIT COMPATIBILITY RADAR" box | Keep the box, with live catalog rows: engine size, transmission, drive. "Front Brake Rotor 262mm" is removed |
| "ACTIVE VEHICLE CONTEXT" box (generation, drive, body) | Live catalog fields. A row is hidden when empty |
| "Jamaica MV-99 Paper Guide" | Retitle "Where to find it on your papers". Keep the TAJ fitness certificate and chassis-prefix text. The engine line lists the live engine codes of the versions shown |
| "Universal Catalog Mode", "Filter mode: Annotated Comparison", "FITMENT SENSITIVE", "Step 02 Disambiguation" | Remove (G1, G2) |

### Screen 3 — What part?
| In the HTML | Decision |
|---|---|
| Search box, suggestions, Common parts, By area, sub-category chips, "What's wrong with the car?", Skip | Keep (audit E4–E6) |
| "Scheduled Maintenance Active … This car has 2 services due" with service buttons | Keep, live from `vehicle-context`. Each button picks that component. "48,210 km · Kingston Hub Schedule" and the "Automated telematics flag…" line are removed. Hidden for Another car or when nothing is due |
| Common-part badges "2 in stock", "Due soon" | Live: stock from your org stock, Due soon from `vehicle-context`. Spec badges ("34B19L AGM", "Front 26"+14"", "4 req.", "LED / H4", "Carbon") are removed |
| By area names and counts, "10 Categories Total" | Live areas and counts; "{n} areas" |
| Sub-category chip extras ("J$ 6,800", "DOT 4", "L/R", "Rear") | Remove (no price at this step) |
| Problem answer "Telemetry & Mechanical Assessment: Usually worn brake pads. Metal-on-metal…" | Only the live hint ("Usually worn brake pads."). The rest is removed |
| Mic icon | Remove (G7) |

### Screen 4 — Front or back?
| In the HTML | Decision |
|---|---|
| "Which brakes?", Front, Back and Both cards, Back to Categories, Show parts | Keep. Shown only for parts that come in front and back versions |
| "Current ODO 64,280 km", "Last Brake Service 18,400 km ago" | Live from `vehicle-context` for your vehicle. Hidden for Another car or when there is no service |
| Rotor spec boxes | Live spec values; a box is hidden when empty |
| "70% Wear Load", "Est. Replacement Time", "Secondary Wear", "Recommended Package", "Fleet Maintenance Tip … Red Hills Road" | Remove |
| "On your shelf: 2 sets available at Kingston Hub #01 · Bins: KH-B4-09" | Live: "On your shelf: {n}", plus the location when set |
| "Supplier stock only (Kingston Auto Parts, Hagley Park Rd)" | Live best-offer supplier name. "Same-day courier dispatch" and "free courier delivery" are removed |
| "(6 matching parts available)" | Live count for that side |
| Chassis diagram "▲ Front of vehicle" | Keep (it is a drawing, not data) |

### Screen 5 — Results
| In the HTML | Decision |
|---|---|
| "Fleet Spares" top strip with breadcrumb and "Kingston Depot Hub #01 Linked" | Remove. The step bar and choice trail (G9) sit there instead |
| Title "Oil filter for your Honda Fit 2018 (1.5 hybrid)" | Live |
| Filter chips "All matches (3) · In stock locally (2) · Direct OEM only (1)" | Keep, as live filters: "All matches", "On your shelf" and "Made for your car only" (G2) |
| "Trim Scope: Fits all 3 trims / Only 1.5 hybrid" | Shown only when "Not sure" was picked. Filters by `fitsVariantIds` |
| Best match card ("TOP RECOMMENDED") | Keep, chosen by `pickBestPart`. The GTIN and "OEM SPEC 11400-GP5 · DENSO REV C" line is removed |
| Sections, rows, expand-row specs | Keep. Specs come from live spec values. "Service Schedule: Every 10,000 km…" and "Supplier Note: …" are removed. "Interchange" lists the live other part numbers |
| "Depot Bay: KGN-01-A4" | Live stock location, or hidden |
| "Save query" | Remove (G7). The URL already holds the search (audit F10) |
| "Use in a service log", "Details", "Get a price", "Add to stock" | Keep |

### Screen 6 — Part detail drawer
| In the HTML | Decision |
|---|---|
| The page behind the drawer ("Parts Compatibility Index", 1505LM Probox telemetry, KPI tiles, recommended list) | Remove. The real Screen 5 is behind the drawer |
| Header, "On your shelf — 2", spec chips | Live. "Pre-inspected batch #JA-9921…" is removed |
| "Why it fits this chassis" | Keep, with one live line from `reason`. "Confirmed on 4 installs…", "Serviced on units…" and "Zero fitment discrepancy…" are removed |
| "Prices from suppliers" table (Supplier, Raw, Landed, Lead / Wty) | Keep, live from `supplier_part_offer`. "Updated 14:00 EST" becomes the newest `price_observed_at`. "Ping RFQ" becomes "Request quote" |
| "Fits these engine variants" | Retitle "Fits these versions". Live from `fitsVariantIds` |
| "Same part, other numbers" | Keep, live. "Tier-1 First Time Fit" and "Heavy Duty Line" become the G2 tag |
| "You may also need for this service" with "Add to order" | Remove (G7) |
| Add to stock (− / + qty), Request quote, Use in a service log | Keep (audit F5, F11) |
| "Kingston Hub #01 Automated Allocation", "Action recorded in telemetry stream" | Remove (G1) |

### Screen 7 — Request a quote
| In the HTML | Decision |
|---|---|
| The page behind the dialog ("Parts catalogue" with Active Inventory, Stock Deficits, Open RFQs, Avg Lead Time and the search list) | Remove. Screen 6 is behind the dialog |
| Dialog: part line, Quantity, Urgency, Assign to vehicle, Note, Cancel, Send request | Keep. Urgency follows G10 |
| "Supplier target: Kingston Auto Parts & Mandeville Motor Spares" | Live names of the suppliers that have an offer for this part. Hidden when none |
| "MIN: 1 · MAX: 24" | "MIN: 1" only. The server refuses 0 or less (T6) |
| "Current shelf balance: 2 units in Kingston Hub" | Live: "On your shelf: {n}" |
| "Linked work-order #WO-992" | Remove |
| Note "28/140" | Keep. The note is limited to 140 characters on the screen and on the server |
| Success: "Quote requested … REQUISITION: RFQ-88402 · QUANTITY · ASSIGNED TO", Done, Activity | Keep. The reference is the first 8 characters of the new id. "Notifications routed to Kingston Hub #01." is removed |

### Screen 8 — Ask Roam to find it
| In the HTML | Decision |
|---|---|
| Headline "We don't have front brake pads for this car on file yet.", the pre-filled spec box, Quantity, Urgency, Note, photo drop zone, Ask Roam to find it, Search a different part | Keep (audit F6) |
| "Chassis: GP5-3401928" | Remove |
| "Quantity needed (axle sets)" | "Quantity needed" |
| Photo drop zone | Uploads through `POST /parts/request-photo`. The caliper-specific helper text becomes "A photo of the old part helps us match it." |
| Success: "Request dispatched to Kingston Sourcing Desk. Ticket #REQ-8849 logged. Average quote time is currently 18 minutes." | "Request sent to Roam. Reference {first 8 of id}." "View in activity ledger →" becomes "View in Your parts activity →" |
| "Active Fleet Target" side card | Plate, car and odometer are live. "Kingston Route Cluster 03" and "Brake wear est." are removed. Hidden for Another car |
| "What happens next?" | Keep, with 2 true steps: "Roam looks for the part." and "Prices show in Your parts activity." The cross-brand, "2–3 options" and "Hub Delivery" lines are removed |
| "Recent Sourcing Wins" | Remove (no price data on resolved requests) |

### Screen 9 — Car not linked yet
| In the HTML | Decision |
|---|---|
| Car header with plate, "Missing catalog trim", "We need to know exactly which Toyota Probox this is", Link it now, Search by make, model and year instead | Keep. "Missing catalog trim" becomes "Not linked". "Kingston Fleet Unit #14" and "MOD-8910" are removed |
| "Switch unit" | "Choose another car" (goes back to Screen 1) |
| "Fitment Disambiguation Required · UNMAPPED VIN/CHASSIS" | Remove (G1) |
| The 3 benefit cards | Keep the cards, with true text: "Right version, right part" / "Versions of the same car take different parts."; "Faster searches" / "Linked cars go straight to parts."; "Your stock counts" / "Parts on your shelf show first." |
| "Staff / Driver view" note | For people without `vehicles.edit`: "Ask someone who can edit vehicles to link this car." Its button is removed (G7) |
| "Candidate Trim Platforms" list | Live versions for the car's make, model and year. "84% fleet avg" is removed. "Select →" links the car (needs `vehicles.edit`) |
| "Chassis Plate Locator" drawing | Keep as a drawing, with the small label "Example" |
| "Fast Stamped Code Input" + Verify | Wired to the existing `api.decodeFrameNumbers`, then `api.confirmFrameDecode`. Helper text: "Type the frame number, e.g. NCP160-0019284." |
| "Depot Stock Linked: 3,410 Probox parts…" | Remove |
| "Classify 8943-JX" drawer | Keep. Live versions, saved with the same link call `CatalogVariantPicker` uses. "Most common Jamaican commercial fleet import" and "100% replacement parts in stock at Marcus Garvey Hub" are removed |

### Screen 10 — Your parts activity
This is the "See all" view. It opens from the Screen 1 panel as a second view inside the Find parts tab ("Search parts" | "Your parts activity"), with the URL `?tab=find-parts&view=activity`.

| In the HTML | Decision |
|---|---|
| Header lines "Procurement Pipeline • St. Andrew & Corporate Area Fleet", "HUB-KIN-01" | Remove |
| KPI strip "Open RFQs · SLA Target 99.2% · Core Bal J$ 0.00" | "Open requests {n}", "Open quotes {n}", "Cores owed J$ {sum}", all live |
| Tabs All / Requests / Quotes / Alerts / Core returns, and the search box | Keep, with live counts. Warranty shows under All |
| Request cards | Live. Status words: open → "Sent", in_progress → "Looking", resolved → "Found", rejected → "Can't find". "REF" is the first 8 characters of the id. "TARGET OEM" is the found part number, shown only when found. "Sourcing from Mandeville / Kingston" and "PO Pre-alloc" are removed. "Review offer" shows only when a part was found, and opens that part's drawer (Screen 6) |
| "6 backlog requests resolved this week", "See all 8 requests" | Live counts |
| Quote card | Live. Statuses: open → "Waiting for price", quoted → "Price in", closed → "Closed". The supplier names come from `supplier_ids`. "Bidding Suppliers: {n} notified" is live. The SLA window, target limit, "Prior batch PO-2908…" and catalog sync line are removed |
| Repeat-part alert card | Live from `part_repeat_alert`. The body is the alert's `detail`. Dismiss uses the existing `dismissPartRepeatAlert`. The cycle lines and OBD line are removed |
| Warranty card | Keep "None open. Crediting a claim is done by Roam." The other text is removed (G3) |
| Core returns card | Live: "{n} cores owed · {n} overdue". The made-up sentence is removed |

### Screen 11 — Loading, error, no permission, car not in the list
The export is a board showing four states plus a "Design System Matrix" table. **It is not a page.** Each state is drawn in place inside the Find parts tab. The board header, the state tabs and the matrix table are removed.

| In the HTML | Decision |
|---|---|
| Skeleton | Keep. The same shape as the step being loaded. "Matching fitment against 14,200 Kingston Hub catalog items..." becomes "Finding parts…" |
| Error: "Could not load parts. Nothing was changed." + Retry | Keep. The vehicle and section lines become the live choice trail. The requisition id, feed node, cache and attempt lines are removed |
| Car not in the list: "We don't have the 1998 Toyota Probox in our car list yet.", Ask Roam to add it, Select another vehicle, "Pre-fills: …" | Keep. "Ask Roam to add it" writes a `vehicle_catalog_pending_requests` row through the existing route in `pending_vehicle_catalog_routes.ts`, with source `find_parts`. "Takes 2–4 hours…" and the "Pre-2002 JDM…" line are removed |
| No permission: "You don't have access to vehicle parts. Ask your fleet admin.", Back to Fleet maintenance | Keep. This only shows when a link opens the tab without `vehicles.view`; otherwise the tab is hidden (audit §7). The role names, profile, depot and admin contact lines, and "Request access", are removed |

### Screen 12 — Phone
| In the HTML | Decision |
|---|---|
| The phone top bar and bottom nav ("Maint · Vehicles · Drivers · Reports") | Remove. The real Fleet phone shell (flyout menu) stays |
| Choice trail, best match card, sections, the collapsible "Your Parts Activity", categories | Keep. "View schematic" is removed |
| "Kingston Hub #01 stock", "Hub #01 Bay 4C", "Bin #09-A", "Ready today" | Live stock location and lead time, or hidden |
| "Add to requisition wishlist" | "Get a price" (G8) |
| "Quick RFQ Inquiry" sheet | Becomes the phone version of Screen 7, with all its fields (quantity, urgency, vehicle, note). "Broadcast RFQ to 3 Suppliers" becomes "Send request". "Target delivery: Kingston Hub #01 (Within 24h)" is removed |
| "Confirm parts list (1) J$ 1,850" bottom bar | Remove (G7) |

---

## 5. Proof pack (the definition of done)

### How the comparison works
Live data is nearly empty: 0 offers, 0 stock and 0 activity rows. So the picture is checked with **the same sample data**, and the live page is checked separately.

1. **Visual test.** Add `e2e/fleet-find-parts-visual.spec.ts`, and add it to the `fleet` project's `testMatch` list in `playwright.config.ts`.
   - It intercepts `/parts/find`, `browse`, `term`, `symptoms`, `activity`, `vehicle-context` and the vehicles list with `page.route`.
   - It answers with fixture JSON in `e2e/fixtures/fleet-find-parts/` that holds the picture's sample values: 1505LM Honda Fit, 5179KZ Toyota Roomy, Toyota 04152-40060, MANN-FILTER HU 6006 z, J$ 1,850 landed, 2 on the shelf, and so on.
   - It screenshots each screen at 1280 px in light mode, at 1280 px in dark mode, and at 390 px.
2. **Side-by-side picture.** For every screen, the test writes `docs/stitch/roam-fleet-app/screenshots/FP*-compare.png`: Stitch on the left, live in the middle, and a pixel-difference overlay on the right.
3. **Allowed differences.** The only red areas allowed in the overlay are:
   - the "Remove" and "Replace" items in §4 for that screen;
   - the fake shell around the tab content.
   Anything else red is a bug.
4. **Live check.** After the deploy, take the same 3 pictures of Screens 1, 5 and 8 against the real server.

### Dark mode rule (there is no dark picture)
- Same layout as light mode. Colours come from `.dark .fleet-find-parts-stitch` in `findParts.css`.
- Any class without a dark rule gets one there.
- **Pass:** no white or light-grey boxes left, and an axe check in the visual test reports no colour-contrast failures.

### Phone rule (only Screen 12 is drawn)
- Screen 12 must match its picture.
- Screens 1–11 at 390 px must:
  - keep the same order as on desktop;
  - stack to one column;
  - make the step bar and choice trail scroll sideways inside themselves;
  - turn drawers and dialogs into full-height sheets;
  - collapse the activity panel under the car picker;
  - show no page-level sideways scrolling (`scrollWidth <= 390`);
  - keep every button reachable.

### Per-screen checklist
- [ ] The word checker shows 100%
- [ ] The light compare image has red only in the allowed areas
- [ ] The dark compare image passes the dark rule
- [ ] The phone image passes the phone rule (Screen 12: matches its picture)
- [ ] No sample number or name is hard-coded. A unit test searches the `find-parts/*.tsx` files for the fixture-only values ("Kingston", "1,850", "RFQ-88402" and the rest)
- [ ] The By vehicle and Service ledger tabs are unchanged (T11)
- [ ] A user without `vehicles.edit` sees Link and Select disabled on Screen 9

---

## 6. Risks to watch

| Risk | Guard |
|---|---|
| The fake shell or hub header gets copied in | Phase 3, step 1, plus the T11 snapshot |
| Scoped Stitch colours leak into the other tabs | Tokens live only under `.fleet-find-parts-stitch` (Phase 2) |
| Fonts missing on Fleet, so icons show as words like "oil_barrel" | Phase 2 adds the fonts. The visual diff shows it as large red areas |
| A request for "Another car" fails because `vehicle_id` is NOT NULL | Phase 1 migration, plus test T7 |
| Quote urgency is lost because the column doesn't exist | Phase 1 migration, plus test T6 |
| Sample numbers left hard-coded | The fixture-value search in the checklist |
| Fleet starts before the Dominion engine is live | Phase 1 waits on the Dominion plan's Phase 1 |

---

## 7. Build prompt (copy this into any AI)

```
Read these files fully before writing any code:
1. docs/fleet-find-parts-port-plan.md      (how to build it, and when it is done)
2. docs/fleet-find-parts-audit.md          (the data and the rules)
3. docs/dominion-find-parts-audit.md §6    (the shared search engine Fleet builds on)

The Stitch export is in:
C:\Users\deeki\Downloads\stitch_roam_fleet_parts_counter\stitch_roam_fleet_parts_counter

The finish line: a screen is done only when the live page sits next to its Stitch
picture and looks the same, in light mode, dark mode and on a 390 px phone. The proof
is the compare image in plan §5. The word checker (scripts/stitch-fidelity.mjs) must
score 100%, but it is not proof.

Rules:
- The HTML decides the looks: layout, spacing, colours, type, icons and wording.
  Port only the Find parts tab content, into the .fleet-find-parts-stitch wrapper.
  Do not copy the Stitch top bar, sidebar, bottom nav, footer, hub header or tab row.
- The By vehicle and Service ledger tabs must not change.
- The audit decides the data, the rules and the permissions.
- Fill in live names and numbers only. Never hard-code a number or name from the picture.
- Plan §4 already decides every known clash between the HTML and the audit. Apply it.
  Stop and ask me only for a clash that §4 does not cover.
- Do not design a new layout. Do not build a simpler version and call it a match.
- Work in the order of plan §3: Phase 0, then Phase 1 (only after the Dominion engine
  is live), then Phase 2, then the screens one at a time from 1 to 12.
  Each screen is one commit with its proof pack.
- Do not start a screen until the routes it needs exist and pass their tests.
- Fleet tsc must stay at or below 464.

Start with Phase 0. Show me the 12 rendered reference pictures before Phase 1.
```
