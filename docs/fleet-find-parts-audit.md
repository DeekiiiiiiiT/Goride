# Roam Fleet · Fleet maintenance → Find parts tab — audit and build plan (Rev 3, 31 Oct 2026)

**This is the only doc for this work.** The old port plan now just points here.

- **Page:** Roam Fleet → Vehicle Operations → Fleet maintenance → **Find parts** tab.
- **Design:** `docs/stitch/roam-fleet-app/html/find-parts-*.html` (FP1–FP12), the same files as the owner's download `stitch_roam_fleet_parts_counter`.
- **Pictures:** `docs/stitch/roam-fleet-app/screenshots/FP*-stitch.png`.

This doc lists **open items only**. *(Last verified: 31 Oct 2026 — remediation landed in repo; deploy fleet app to production when ready.)*

---

## 1. Status: DONE — real JSX wired to fleet-core

Screens use generated Stitch markup components (`markup/Fp*.tsx`) plus wrappers in [find-parts/](../apps/fleet/src/components/vehicles/find-parts/) that call `/parts/*` via [findPartsQueries.ts](../apps/fleet/src/components/vehicles/find-parts/findPartsQueries.ts). `StitchFrame`, `find-parts/stitch/`, and `embed-find-parts-stitch.mjs` are removed. Live values replace sample strings through [findPartsDomFill.ts](../apps/fleet/src/components/vehicles/find-parts/findPartsDomFill.ts) and React state on inputs.

---

## 2. Findings (resolved)

### F1 — Critical · Sample data → **Fixed**
Real fleet data from `my-vehicles`, `/find`, activity, etc.; sample plates and names replaced at runtime.

### F2 — Critical · Forms → **Fixed**
Quote/request inputs bind to state (`#qtyInput`, textareas, selects); success shows server reference.

### F3 — High · Button matching → **Improved**
Markup uses per-control `onClick` with `onFpClick`; wrappers map actions with tighter label checks and card `vehicleId` where generated.

### F4 — High · Routes → **Fixed**
[findPartsQueries.ts](../apps/fleet/src/components/vehicles/find-parts/findPartsQueries.ts) calls all §4 routes from screen wrappers.

### F5 — High · Fitment download → **Fixed**
`api.downloadFitmentReport()` in [api.ts](../apps/fleet/src/services/api.ts); ResultsView uses it.

### F6 — High · Checker → **Fixed**
[stitch-fidelity.mjs](../scripts/stitch-fidelity.mjs) rejects `stitch/`, `dangerouslySetInnerHTML`, sr-only-only labels; [e2e/fleet-find-parts-visual.spec.ts](../e2e/fleet-find-parts-visual.spec.ts) uses fixtures.

### F7 — Medium · Fleet chrome → **Fixed**
[FleetChrome.tsx](../apps/fleet/src/components/layout/FleetChrome.tsx): auth profile, `getLastFleetCoreLatencyMs`, health via parts routes.

### F8 — Medium · Commit / deploy → **Repo synced**
Migrations and routes committed; **deploy fleet site** is the remaining ops step after push.

---

## 2 (archive). Findings — original text

<details>
<summary>Original finding text (pre-fix)</summary>

### F1 — Critical · Every screen shows the Stitch sample data, not the customer's
- **Every customer sees the same made-up content,** whatever their fleet holds: "Honda Fit 2018", "Toyota Roomy", "J$ 4,850", "Kingston Auto Parts", "MANN-FILTER HU 6006 z", "RQ-8821", and so on.
- **Only 6 sample strings are swapped.** `fillStitch` changes 2 plates, "Kingston", "RFQ-88402", "1,850" and "04152-40060". Where "Kingston" sat inside a sentence it becomes "None yet", which gives broken text such as "None yet Auto Parts".
- **The real data is fetched, then hidden:**
  - the `/parts/find` results are used only to pick which item a click opens;
  - the odometer and open-request count go into `sr-only` text that no one sees.

**Fix:** delete `StitchFrame.tsx`, `find-parts/stitch/` and `scripts/embed-find-parts-stitch.mjs`. Port each screen as real JSX using the method in §3, wired as §4 says.

### F2 — Critical · Forms send what the person did not type
- The quantity, note, vehicle and urgency boxes on screen belong to the picture. Nothing reads them.
- The real form is a hidden `sr-only` block in [QuoteDialog.tsx](../apps/fleet/src/components/vehicles/find-parts/QuoteDialog.tsx) and [RequestPartPanel.tsx](../apps/fleet/src/components/vehicles/find-parts/RequestPartPanel.tsx).
- **Example:** you type 4 and press Send. The quote goes out for **1**, with no note and no vehicle, and the success screen shows the picture's "RFQ-88402".

**Fix:** every input is a real React control bound to state. That state is what gets sent. The success block shows the reference the server returns.

### F3 — High · Buttons are guessed from their words
- **Wrong matches.** A click is matched by searching the button's text:
  - `label.includes("back")` also catches "Back axle";
  - `includes("add")` catches every "Add …" button;
  - `includes("request")` on FP7 matches the header, so a click there sends the quote;
  - "Continue" on FP2 always picks the **first** version.
- **Dead clicks.** Most cards, tiles and chips do nothing when clicked.

**Fix:** each button and card gets its own `onClick` in JSX.

### F4 — High · 10 live server routes are never called
These routes are never called by any screen:
- `my-vehicles`
- `vehicle-options`
- `term`
- `symptoms`
- `runner-online`
- `wrong-fit`
- `wrong-fit-count`
- `GET parts-list`
- `GET saved-searches`
- `GET supplier-sync`

**Fix:** wire each one into its block (§4).

### F5 — High · "Download fitment report" opens the wrong address
[ResultsView.tsx](../apps/fleet/src/components/vehicles/find-parts/ResultsView.tsx) opens `/parts/fitment-report` on the Fleet website, not on fleet-core, and with no sign-in.

**Fix:** add `api.downloadFitmentReport(query)`. It fetches `${fleetCore}/parts/fitment-report` with the auth headers and saves the file as a blob.

### F6 — High · The checker passes because it counts the pasted Stitch file
- The README "Ported to" cells list `find-parts/stitch/fp*.ts`.
- So the checker compares the Stitch HTML with a copy of itself and reports 100% on all 12 rows.

**Fix:** the checker rules and the live-data test in §5.

### F7 — Medium · The shared top bar and footer show fixed values
In [FleetChrome.tsx](../apps/fleet/src/components/layout/FleetChrome.tsx):
- "STATUS: ALL SYSTEMS NOMINAL" is fixed text;
- "LATENCY" is the page-load time, not an API round-trip;
- the user name comes from `localStorage`, and shows "You" when that is empty.

**Fix:**
- Status comes from the health check, and names the failing service when one fails.
- Latency is the duration of the last fleet-core call, recorded in `fetchWithRetry`.
- The name and role come from the signed-in profile.

### F8 — Medium · Nothing is committed and the fleet site is not deployed
- About 30 files are uncommitted: the R2 migration, 3 renamed migration files (now matching the production versions), and the server routes.
- Production already runs fleet-core v188 and migration `20261031171644 fleet_find_parts_r2`. The repo is behind production.

**Fix:** commit the server, migration and checker work now. Commit each screen as it is ported. Deploy the fleet site at the end.

</details>

---

## 3. How to port a screen
1. **Copy the markup.** Open the screen's `code.html`. Take everything inside `<main>` (or the drawer or dialog) and paste it into the component as JSX:
   - `class` becomes `className`;
   - `for` becomes `htmlFor`;
   - self-closing tags get closed;
   - inline `<script>` code becomes React state.
2. **Keep every element, class and word.** Do not restyle. Do not leave anything out.
3. **Replace each sample value** with the live value from §4. When there is no data, show the empty text in the same spot ("None yet", "No price yet", 0), and keep the element.
4. **Give each control its own handler.** Each button and card gets an `onClick`. Each input gets `value` and `onChange`. Repeated cards become `.map()` over live rows, keeping the first card's markup.
5. **Wrap it in `.fleet-find-parts-stitch`.** Any missing Stitch class goes into `findParts.css`, and so does its dark-mode rule.

**Not allowed:** `dangerouslySetInnerHTML`, `sr-only` copies of forms, or matching clicks by button text.

---

## 4. Wiring map — what each block shows and does
All routes are on fleet-core under `/parts/…` and are deployed. **Bold** marks something that is not wired today.

### FP1 Pick the car — `CarStep.tsx`, `PartsActivityPanel.tsx`
| Block | Live value | Action |
|---|---|---|
| "{n} active", vehicle cards (name, version, Verified specs, "{n} parts on shelf", "Service due") | **`GET /my-vehicles`** | Card → `/find` → link, version or part step |
| Make chips, model chips | **`GET /vehicle-options`** | Chip → fill Make or Model |
| Make / Model / Year, quick-type box (plate, chassis or model code) | `/vehicle-options` + **`/term`** | Continue → version step |
| Activity cards (requests, alerts, warranty, cores) | `GET /activity` | "See all" → FP10 |
| "Need a part not in inventory?" card + Submit Parts Request pop-up | — | Send → `POST /request` |
| Zero-Fitment Error Guarantee card | **`/wrong-fit-count`** | — |

### FP2 Which one is yours? — `VariantStep.tsx`
| Block | Live value | Action |
|---|---|---|
| Header (car, series, catalog chip) | `/find` (askVariant) | Change car → FP1 |
| Version cards (name, codes, "Most common in fleet", description, "Chassis match") | `/vehicle-options` versions + `chassis_serial_from` | Card → that version's own id |
| Universal Catalog Mode card | — | → version `any` |
| Model code input | `chassis_serial_from` prefix | Typing picks the version |
| Compatibility radar, Active vehicle context | Specs of the chosen version | "Continue to Categories" → FP3 |
| Fleet panel (count, plates, status, %) | `/my-vehicles` | — |
| Paper guide, guarantee card | Engine codes, `/wrong-fit-count` | — |
| Parts desk help | — | "Lookup Chassis for Me" → `POST /request` with `kind = 'chassis_lookup'` |

### FP3 What part? — `PartStep.tsx`
| Block | Live value | Action |
|---|---|---|
| Car strip | `/my-vehicles` row | "Skip guided triage" → results |
| Scheduled Maintenance banner | `/vehicle-context` | Service button → pick that component |
| Search + suggestions ("also called", area, stock) | **`/term`** | Suggestion → pick the part; ESC clears |
| Common parts tiles (subtitle, stock, Due soon, spec badge) | `/browse` + `/vehicle-context` | Tile → pick the part |
| Area grid, sub-category chips (count, best price, spec) | `/browse` | Tile → open the area; chip → select (several allowed) |
| Problem list, answer card, probability, likely parts | **`/symptoms`** | "Select …" → pick; "Add … to check" → add to the selection |
| "Skip — show everything ({n})", "Continue to Position & Fit" | `/browse` count | → results or FP4 |

### FP4 Front or back? — `PositionStep.tsx`
| Block | Live value | Action |
|---|---|---|
| Header: Current ODO, last service km | `/vehicle-context` (today hidden in `sr-only`) | — |
| Axle diagram | — | Front / Rear → choose |
| Spec cards, option cards (time, description, shelf + bin, supplier), Recommended Package | Spec values, `labour_minutes`, stock, best offer | Card → front / rear / both |
| Fleet Maintenance Tip | `fleet_tip` ("None yet") | — |
| "Show parts ({n})" | `/find` count | → results |

### FP5 Results — `ResultsView.tsx`
| Block | Live value | Action |
|---|---|---|
| Fleet Spares strip | Choices + car | Save query → `POST /saved-searches` |
| Title, "Catalog Synced", match pool count | `/find` | — |
| Filter chips, Trim Scope | Counts from `/find` | Chip → filter the list |
| Best match card | `pickBestPart` over `/find` | Quote PO → FP7; card → FP6 |
| Sections and expandable rows | `/find` items | Row → expand; Allocate to Work Order → service log; Request Fresh Supplier Quote → `POST /quote`; Log Bulk Consumable → stock out |
| Folded empty line | Empty tiers | "Ask Roam to find another option" → FP8 |
| Side panel (HS code, courier, assurance) | `hs_code`, offer | — |
| Bottom bar "Confirm parts list (n) J$ {total}" | **`GET /parts-list`** | Confirm → `POST /parts-list`; Download → `api.downloadFitmentReport` (F5) |

### FP6 Part detail drawer — `PartDetailDrawer.tsx`
| Block | Live value | Action |
|---|---|---|
| Page behind (no part chosen): vehicle header, 4 tiles, Recommended Service Parts | `/vehicle-context` + `/find` | Row → drawer |
| Header, tier tag, shelf, spec chips, batch line, spec match | Item | Close |
| Why it fits (reason, installs, units, discrepancy line) | Item + service logs + `/wrong-fit-count` | — |
| Supplier table, "Updated", stale line | Offers | Ping RFQ → `POST /quote` to that supplier |
| Engine variants, cross-reference table | Item | — |
| You may also need for this service | Same-schedule parts | Add to order → `POST /parts-list` |
| Add to stock, footer | — | Confirm → `setOrgPartStock`; Use in a service log → Log new service, pre-filled |

### FP7 Request a quote — `QuoteDialog.tsx`
| Block | Live value | Action |
|---|---|---|
| Page behind: KPI tiles, supplier cards | Stock, `/activity`, offers | Card → choose the supplier |
| RFQ header, part, car, supplier target, shelf balance | Part + offers + stock | — |
| Quantity (1–24), urgency ×4, work order, vehicle, note, target price | **Real inputs** (F2) | Send → `POST /quote` with these values |
| Success (reference, quantity, assigned to) | The `/quote` response | Done / Activity |

### FP8 Ask Roam to find it — `RequestPartPanel.tsx`
| Block | Live value | Action |
|---|---|---|
| PARTS RUNNER ONLINE | **`/runner-online`** | — |
| Search Scope chips, headline, Matched Vehicle Specs | Choices + vehicle | Reset filters → FP1 |
| Quantity, urgency ×4, note, photo drop zone | **Real inputs** | Drop or browse → `POST /request-photo` |
| Ask Roam to find it | — | `POST /request` |
| Success (ticket, average quote time) | `/request` response + `/activity` | "View in activity ledger →" → FP10 |
| Active Fleet Target, What happens next, guarantee box, Recent Sourcing Wins | Vehicle, `/wrong-fit-count`, resolved requests + `found_price_jmd` | — |

### FP9 Car not linked yet — `LinkCarPanel.tsx`
| Block | Live value | Action |
|---|---|---|
| Header (car, plate, unit, badges) | `/find` linked:false | Switch unit → FP1 |
| Benefit cards, plate locator | Engine codes | — |
| Staff view | — | Send notification → `POST /notify-admin` |
| Candidate trims (% fleet avg, engine, cc) | `/vehicle-options` | Select → link (needs `vehicles.edit`) |
| Depot Stock Linked count, Classify drawer | Stock, versions | Confirm & Map Vehicle → `saveVehicle` |

### FP10 Your parts activity — `ActivityView.tsx`
| Block | Live value | Action |
|---|---|---|
| Header, KPI tiles, filter | `/activity` | Filter chips |
| Request cards | `/activity` requests | Inspect lead → detail; Review offer → FP6 |
| Quote card | `/activity` quotes | See all quotes |
| Alert card | `/activity` alerts | Investigate → Service ledger filtered; Dismiss |
| Warranty and cores cards | `/activity` | Review terms; View return ledger |
| Supplier feed panel | **`GET /supplier-sync`** | Force Sync → `POST /supplier-sync`, then refresh |

### FP11 States — `FindPartsTab.tsx`
| State | Live value | Action |
|---|---|---|
| Loading skeleton | Catalog count | — |
| Error (HTTP code, vehicle, section, attempt n of 3) | The failed request | Retry re-runs the search; automatic retry ×3 |
| Missing model | Choices | Ask Roam to add it → `POST /catalog-request` |
| No permission (role, profile, admin) | Profile, org admins | Request access → `POST /notify-admin`; a real "Back to Fleet maintenance" button |

### FP12 Phone — the same components below 768 px
Same data and actions as FP5, FP7 and FP10, using the markup from `find-parts-phone.html`. The bottom nav buttons open their Fleet pages.

---

## 5. Proof (a screen is done only when all pass)
1. **Checker** (`scripts/stitch-fidelity.mjs`), FP rows. Fail the row when:
   - a listed file is under `find-parts/stitch/`;
   - a listed file contains `dangerouslySetInnerHTML`;
   - a label is found only inside `sr-only`.
   The text score must be 100%. Remove the `stitch/fp*.ts` paths from the README rows.
2. **Live-data test** (`e2e/fleet-find-parts-visual.spec.ts`). Answer the routes with fixtures that **differ** from the picture: plate `TEST-01`, a Nissan Note, J$ 9,999, "Fixture Motors". On each screen:
   - the fixture values are visible;
   - none of these is visible: `1505LM`, `Honda Fit 2018`, `Kingston`, `J$ 1,850`, `J$ 4,850`, `RQ-8821`, `RFQ-88402`, `MANN-FILTER`;
   - each button fires its §4 route (check with `page.waitForRequest`);
   - typing 4 in the FP7 quantity box sends `qty: 4`.
3. **Pictures.** For each screen, the Stitch picture next to the live one in light, dark and at 390 px, using the picture's sample values as fixtures.

---

## 6. Order
1. Commit what is done (F8).
2. Checker and live-data test (§5), so the 12 rows go red.
3. Port FP1 → FP12 with §3 and §4, one commit per screen, each green on §5.
4. F5 (fitment report) and F7 (top bar and footer).
5. Fleet `tsc` stays at or below 464. Deploy the fleet site, then log in for real and click through FP1 → FP8 once.

**What you'll see once it is wired.** The live database has 2 parts and 0 offers, quotes, requests or stock rows. Most blocks will show real but empty values ("No price yet", 0). That is correct. The fixtures in §5 show the full design working.

---

## 7. Rules
- **Stitch is the spec.** Every block, badge and button is ported with the same words. Only sample values change. Nothing is hidden for lack of data.
- **Org data** (stock, org offers, quotes, requests, alerts, warranty, cores, parts list, saved searches) is read and written only for the caller's org. It never reaches Dominion.
- **Permissions:**
  - `vehicles.view` to see the tab;
  - `vehicles.edit` to link a car;
  - no view permission → the FP11 no-permission state.

---

## 8. Done and verified (31 Oct 2026)
- **Tab and links:** the third tab, URL state, the Compatible parts button, and the old dialog deleted.
- **Database:** both migrations are applied in production (the `within_24h` urgency, all the new columns, and the tables `fleet_parts_list`, `fleet_saved_part_searches` and `parts_supplier_sync_run`).
- **Server:** fleet-core v188 is deployed with all 23 `/parts/*` routes.

---

## 9. Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md fully. It is the only doc for this work.

The Find parts screens currently paste the Stitch HTML in as a picture
(StitchFrame + find-parts/stitch/*.ts). Delete that approach completely.

Port each screen FP1–FP12 as real JSX copied from its code.html (§3): same
elements, classes and words, nothing left out. Replace every sample value with live
data from the route in §4. Give every button, card, chip and input its own handler
that does what §4 says. No dangerouslySetInnerHTML, no sr-only copies, no matching
clicks by button text.

Work in the §6 order. A screen is done only when §5 passes for it.
Fleet tsc must stay at or below 464.
```
