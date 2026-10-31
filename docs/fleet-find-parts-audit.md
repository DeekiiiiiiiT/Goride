# Roam Fleet · Fleet maintenance → new "Find parts" tab — audit (Rev 1, 30 Oct 2026)

Page: Roam Fleet → Vehicle Operations → **Fleet maintenance**. Today it has two tabs, **By vehicle** and **Service ledger**, plus a **Compatible parts** button that opens a dialog. All of it lives in [FleetMaintenanceHub.tsx](../apps/fleet/src/components/vehicles/FleetMaintenanceHub.tsx) (912 lines). The dialog calls `GET /vehicles/:vehicleId/compatible-parts` in [part_sourcing_routes.ts:71](../supabase/functions/_fleet-server/part_sourcing_routes.ts#L71).

This is an audit only. No code was changed. The live numbers were read from production on 30 Oct 2026 with read-only SQL.

- **Stitch prompt:** [docs/stitch/fleet-find-parts-prompt.txt](stitch/fleet-find-parts-prompt.txt)
- **Sister doc (owns the shared search engine):** [docs/dominion-find-parts-audit.md](dominion-find-parts-audit.md). **Its §6 (E1–E10) must be built and deployed first.** This doc only adds what is Fleet-only.

---

## 0. READ FIRST — the Stitch screens are the spec

**Order of work**
1. Build the Stitch screens in the **Roam Fleet APP** project (`3587123323600813385`, design system "Precision Operations").
2. Export the HTML to `docs/stitch/roam-fleet-app/html/` and add the rows to that README (§8).
3. Only then write React.

| Topic | Winner |
|---|---|
| Layout, spacing, order, colours, icons, wording, state text | **Stitch HTML** |
| Which data, matching, permissions, prices, stock, links | **This audit** |

**Porting rules**
- Keep the same structure and classes as the Stitch export.
- Copy the labels word for word.
- Swap only the sample values.

**Proof**
- `scripts/stitch-fidelity.mjs` reads only `docs/stitch/dominion-redesign/` today. Extend it to also read `docs/stitch/roam-fleet-app/README.md` rows marked Ported (§7, W6). The report must show **100%** for every row below.
- Side-by-side screenshots in light, dark and 390 px phone.

**Stitch screen numbers → README rows** (the prompt uses plain numbers only). **Build plan and screen-by-screen port decisions:** [fleet-find-parts-port-plan.md](fleet-find-parts-port-plan.md).

| Prompt screen | README # | HTML file |
|---|---|---|
| Screen 1 — Find parts tab: pick the car | FP1 | `find-parts-car.html` |
| Screen 2 — Which one is yours? | FP2 | `find-parts-variant.html` |
| Screen 3 — What part? (guided browser) | FP3 | `find-parts-browse.html` |
| Screen 4 — Front or back? | FP4 | `find-parts-position.html` |
| Screen 5 — Results in five match types | FP5 | `find-parts-results.html` |
| Screen 6 — Part detail drawer | FP6 | `find-parts-detail.html` |
| Screen 7 — Request a quote | FP7 | `find-parts-quote.html` |
| Screen 8 — Not found → ask Roam to find it | FP8 | `find-parts-request.html` |
| Screen 9 — Car not linked yet | FP9 | `find-parts-link-car.html` |
| Screen 10 — Your parts activity | FP10 | `find-parts-activity.html` |
| Screen 11 — Loading, error, no permission | FP11 | `find-parts-states.html` |
| Screen 12 — Phone (390 px) | FP12 | `find-parts-phone.html` |

The **By vehicle** and **Service ledger** tabs are not part of this work and must look the same after it.

---

## 1. Goal and who uses it

A fleet manager, or a staff member who is **not a mechanic**, needs to find the right part for one of their cars, or for any car, and then get it. They want:
- a price;
- whether they already have it on the shelf;
- a quote;
- or someone at Roam to find it for them.

**The flow is the same as Dominion's:**
1. Car (required).
2. Which one is it (only when it matters).
3. Part (optional, with a guided browser).
4. Side (only when it matters).
5. Results in five match types.
6. Act on a result.

**What only Fleet adds:**
- "My vehicles" as the fastest way in;
- your stock;
- supplier prices (landed cost in J$);
- quotes;
- requests to Roam;
- your parts activity.

---

## 2. Live data on 30 Oct 2026

| Fact | Value |
|---|---|
| Fleet vehicles in the hub (screenshot) | Honda Fit 2018 (1505LM), Toyota Roomy 2019 (5179KZ) |
| Their catalog versions | Fit 2018 has 3 possible versions (GK5 1.5 petrol, GK3 1.3 petrol, GP5 1.5 hybrid); Roomy 2019 has 2 (2WD, 4WD; same engine, so engine parts never need the question) |
| Parts on file in Dominion | 2 (oil filter, Toyota and MANN) |
| Supplier offers | **0**, so no price shows anywhere yet |
| Universal parts | 5 (oil 0W-20, 3 wiper sizes, CVT fluid FE) |
| Parts requests ever sent (`parts_sourcing_requests`) | **0** |
| Car versions marked parts-ready | 0 |

**What this means:** most searches will end at Screen 8, "Ask Roam to find it". That screen must be quick and pre-filled, because today it is the main way the data grows.

---

## 3. Findings — the current "Compatible parts" dialog

Severity:
- **High**: the screen gives a wrong answer or blocks the person.
- **Medium**: the screen is confusing or something is missing.
- **Low**: tidy-up.

### F1 — High · Parts search is hidden in a dialog behind a button
To search, the person must click Compatible parts, choose a vehicle, then press Load. Everything else is squeezed into one scrolling dialog: results, requests, repeat alerts, warranty claims and core returns.

**Fix:**
- Add a third tab, **Find parts**, next to By vehicle and Service ledger.
- The **Compatible parts** header button stays where it is but switches to that tab, keeping its label.
- Delete the dialog and its 12 `parts*` state hooks. They move into the new tab folder (§7).

### F2 — High · No way to pick a part
The route already accepts `component_id`, but the dialog never sends it. The person gets every part for the car, with no categories or sub-categories and no help when they don't know the part's name.

**Fix:** the "What part?" step, Screen 3. It uses the shared `browse`, `term` and `symptoms` routes (Dominion doc E4–E6).

### F3 — High · Only linked fleet vehicles can be searched
- You can't look up a car you are about to buy, a car not yet in the fleet, or a vehicle that isn't linked.
- For an unlinked vehicle, you get a dead end: "Link this vehicle to the motor catalog to see compatible parts."

**Fix:**
- Screen 1 offers **My vehicles** (one tap; the version is already known) **or** **Another car** (Make / Model / Year).
- An unlinked fleet vehicle opens Screen 9:
  - "Link it now" uses the existing `CatalogVariantPicker`, and needs `vehicles.edit`.
  - "Search by make, model and year instead" pre-fills Screen 1 from the vehicle's make, model and year.

### F4 — High · Jargon on the screen
- The dialog says: "Lists parts configured in Super Admin that fit this fleet vehicle's linked motor catalog row (and optional chassis/engine gates)."
- The button tooltip says "Parts from Super Admin catalog…".

**Fix:**
- All text comes from the Stitch screens.
- The section titles use the plain names (Dominion doc F6): "Made for your car", "Same car, different badge", "Fits your engine", "Other brands that replace it", "Fits by size".

### F5 — High · "Request quote" fires instantly, with qty 1
- Clicking **Request quote** sends quantity 1 with no confirmation.
- The only feedback is a toast ([FleetMaintenanceHub.tsx:830](../apps/fleet/src/components/vehicles/FleetMaintenanceHub.tsx#L830)).
- "Add 1 to stock" writes stock straight from the search list (line 781).

**Fix:**
- Both actions move into the part detail drawer.
- **Request a quote** opens Screen 7: quantity, urgency, which vehicle it is for, and an optional note. It then shows a confirmation that lists the request in "Your parts activity".
- **Add to stock** asks for the quantity (default 1) and confirms in place.

### F6 — Medium · The "request a missing part" box starts empty
- The person must type everything, for example "Front brake pads for 2019 Toyota Probox…".
- `maintenance_component_id` is never sent, even though the column exists.

**Fix:** Screen 8 is pre-filled from the choices already made.
- It fills in the car, the version (or "not sure"), the part, and the side.
- The person only adds quantity, urgency, an optional note and a photo.
- The request sends `maintenance_component_id`, `qty`, `urgency` and `photo_url`, plus `platform_id` and `engine_family_id` taken from the version (all existing columns).
- The text is built for them, e.g. "Front brake pads · 2018 Honda Fit 1.5 hybrid (GP5)".

### F7 — Medium · Prices show as a bare "—"
There are 0 offers, so every row shows "—".

**Fix:**
- Each row shows the best offer as "J$ 4,250 landed · 3 days", from the existing `priceOffer` / `landedCostJmd` logic.
- With no offer, the row shows "No price yet" and a **Get a price** link that opens Screen 7.
- A stale price is shown in grey with "Price may be old". It is never hidden.

### F8 — Medium · The best answer is buried in a table
**Fix:** a **Best match** card at the top, chosen by `pickBestPart(sections, { useStock: true, usePrice: true })` (Dominion doc E8). A part on your shelf wins, with the badge "On your shelf — 2".

### F9 — Medium · Parts activity is stuck at the bottom of the dialog
- Repeat-part alerts, warranty claims, core returns and "My requests" are listed below the results.
- They load each time the dialog opens.

**Fix:**
- Show them on Screen 10, **Your parts activity**, as a right-hand panel on the tab's first step (desktop) or a collapsible section (phone).
- They load once when the tab opens, through react-query (stale time 60 s).
- Each list shows its 5 newest items, with "See all".

### F10 — Medium · The tab can't be linked to
- `hubTab` is local state, so the Vehicles page, the "Services due" view, or a shared link can't open the Find parts tab with a car and part already chosen.

**Fix:**
- The URL keeps `?tab=find-parts&vehicle=<id>&part=<componentId>&pos=<front|rear>`.
- **Services due** rows gain the link "Find parts for this" → `?tab=find-parts&vehicle=<id>&part=<component of that schedule row>`.

### F11 — Low · The "Log new service" flow is a separate path
- `LogMaintenanceServiceDialog` calls `getCompatibleParts(vehicleId, componentId)` on its own (line 503).

**Fix:**
- It keeps working.
- The detail drawer gains **Use in a service log**, which opens `LogMaintenanceServiceDialog` with the vehicle and component pre-set.

### Not a finding
- `GET /vehicles/:vehicleId/compatible-parts` stays as it is, for `LogMaintenanceServiceDialog`.
- The By vehicle and Service ledger tabs stay untouched.

---

## 4. Customer-data rule (Dominion = master data)
- Fleet **reads** the parts master data (versions, parts, listings, universal parts, problems and search words) through the shared engine.
- Stock, offers marked with an `organization_id`, quotes, requests, alerts, warranty claims and cores are **org data**. They are added only in the Fleet route, only for the caller's org, and they never reach a Dominion response.
- **Another car** searches are not saved against the org. The `catalog_signal_part_demand` counter may record the search, but only as an anonymous demand count, with no org id.

---

## 5. The flow (guidance; Stitch wins on looks)

```
Tabs:  By vehicle | Service ledger | Find parts ●

① Your car    My vehicles:  [Honda Fit 2018 · 1505LM]  [Toyota Roomy 2019 · 5179KZ]
               — or —  Another car:  Make ▾  Model ▾  Year ▾
               Right panel: Your parts activity (requests · alerts · warranty · cores)
② Which one?  only for "Another car", or a fleet car with no version set, and only if the answer differs
③ What part?  search · Common parts · By area · By problem · Show everything
④ Front/back? only for position-aware parts
⑤ Results     Best match (price · stock · lead time)
               Made for your car / Same car… / Fits your engine / Other brands / Fits by size
               "Nothing on file for: Sister, Engine."   [Ask Roam to find it]
⑥ Detail      why it fits · fits these versions · prices from suppliers · on your shelf
               [Request a quote] [Add to stock] [Use in a service log]
⑦ Quote       qty · urgency · for which vehicle · note → sent
⑧ Not found   pre-filled request → sent → shows in Your parts activity
⑨ Not linked  [Link it now] or [Search by make, model, year]
```

The **choice trail** ("Honda Fit 2018 › 1.5 hybrid › Brake pads › Front") is sticky from step ② on. Each chip goes back to its step.

---

## 6. API (Fleet-only parts; the engine itself is in the Dominion doc §6)

### W1 — `GET /parts/find` on fleet-core
In `_fleet-server/part_sourcing_routes.ts`, behind `requireAuth()` and `requirePermission("vehicles.view")`.

**Query**
- `vehicleId` **or** `make` + `model` + `year`;
- optional `variantId` (`any` = not sure), `componentId`, `position`, `side`.

**With `vehicleId`**
- Load the KV vehicle, as today.
- `resolveCatalogIdForKvVehicle` supplies the `variantId`.
- If it isn't linked, return `{ linked: false, make, model, year }`, which drives Screen 9.

**Then**
- Call `findParts({ ..., orgId, downtimePerDay })` from `parts_finder.ts`.
- `orgId` and `downtimePerDay` are read exactly as the compatible-parts route does today.

**Response:** the Dominion `FindPartsResult`, plus:
- `linked: boolean`;
- `vehicle: { id, label, plate } | null`;
- `stockQty` and `bestOffer` on each item.

### W2 — `GET /parts/browse`, `GET /parts/term`, `GET /parts/symptoms` on fleet-core
These reuse the same handlers as the Dominion routes (Dominion doc E4–E6) and are read-only, behind `vehicles.view`.

### W3 — Quote with quantity
`api.requestPartQuote` already exists. It now sends:
- `qty`, `urgency` and `note`;
- `vehicleId` (null for "Another car");
- `componentId`.

The server stores them on `part_quote_request` (add `urgency`, `note` and `maintenance_component_id` if they are missing; check before the migration).

### W4 — Pre-filled request
`api.requestPartsSourcing(vehicleId | null, needText, extra)` sends:
- `maintenance_component_id`, `qty`, `urgency`, `photo_url`;
- `platform_id` and `engine_family_id`, taken from the version.

A null `vehicleId` is allowed for "Another car". Check that the column is nullable, and make it nullable if it isn't.

### W5 — Activity in one call
`GET /parts/activity` returns `{ requests, repeatAlerts, warrantyClaims, cores }`, each with its 5 newest items and a total. This replaces the 4 calls made today.

---

## 7. Frontend

New folder: `apps/fleet/src/components/vehicles/find-parts/`.

| File | Screen | Content |
|---|---|---|
| `FindPartsTab.tsx` | — | Step state, URL sync (F10), react-query |
| `CarStep.tsx` | 1 | My vehicles chips + Another car selects, quick-type box |
| `VariantStep.tsx` | 2 | Plain version cards + "Not sure" |
| `PartStep.tsx` | 3 | Search, Common, By area, By problem, Show everything |
| `PositionStep.tsx` | 4 | Front/Rear/Both, Left/Right/Both |
| `ChoiceTrail.tsx` | 2–8 | Sticky chips |
| `ResultsView.tsx` | 5 | Best match, sections, folded empty line |
| `PartDetailDrawer.tsx` | 6 | Why it fits, offers, stock, actions |
| `QuoteDialog.tsx` | 7 | Qty, urgency, vehicle, note |
| `RequestPartPanel.tsx` | 8 | Pre-filled request |
| `LinkCarPanel.tsx` | 9 | Link now / search instead |
| `PartsActivityPanel.tsx` | 10 | Requests, alerts, warranty, cores |
| `findPartsApi.ts` | — | Typed calls (W1–W5) |

**Wiring**
- `FleetMaintenanceHub.tsx`:
  - Add `<TabsTrigger value="find-parts">` with the `Package` icon, then the matching `TabsContent`.
  - Widen `hubTab` to include `"find-parts"`, and read and write it from the URL.
  - The **Compatible parts** button calls `setHubTab("find-parts")`.
  - Delete the parts dialog and its state.
- `LogMaintenanceServiceDialog` is unchanged, except that it accepts a pre-set component when opened from the drawer.
- **Shared code.** Import `pickBestPart`, `variantPlainLabel` and `PART_MATCH_TIERS` (with `plainLabel`) from `@roam/types`. Do not copy them.
- **Type check.** The fleet `tsc` count must not go above the baseline (**464**).

**Permissions**

| Action | Needs |
|---|---|
| See the tab | `vehicles.view` |
| Link a car | `vehicles.edit` |
| Quote, request, add to stock | `vehicles.view`, as the routes are today. Keep the existing server checks |

Without `vehicles.view`, the tab is hidden.

---

## 8. Stitch README rows (`docs/stitch/roam-fleet-app/README.md`)

Add a section called "Find parts screens" with the FP1–FP12 table from §0: number, screen, file and Stitch screen id. Add a "Ported to" column listing the files in §7.

**W6:** in `scripts/stitch-fidelity.mjs`, also read the rows of `docs/stitch/roam-fleet-app/README.md` that have a "Ported to" path. Use the same scoring, with the 80% floor in CI.

---

## 9. Tests

| # | Test | Where |
|---|---|---|
| T1 | `/parts/find?vehicleId` for a linked vehicle: no version question, results come back | Deno |
| T2 | Unlinked vehicle → `linked: false` with make, model and year | Deno |
| T3 | `make/model/year` search works with no vehicle | Deno |
| T4 | Offers and stock from another org never appear | Deno |
| T5 | No `vehicles.view` → 403. A driver role → 403 | Deno |
| T6 | Quote sends qty, urgency, note and component. Qty 0 or less → 400 | Deno |
| T7 | Request with a null vehicle (Another car) is saved, with the component and engine family set | Deno + SQL |
| T8 | `/parts/activity` returns only the caller's org rows | Deno |
| T9 | Best match: an item on the shelf beats a tier-1 item with no stock. Price breaks ties | Shared `partsBestPick.test.ts` |
| T10 | URL `?tab=find-parts&vehicle=…&part=…` opens straight on the results | Vitest |
| T11 | The By vehicle and Service ledger tabs render unchanged | Vitest snapshot |
| T12 | Fleet `tsc` is still ≤ 464 | CI |
| T13 | Fidelity is 100% for FP1–FP12 | CI + PR |

---

## 10. Build order
1. **Wait for the Dominion engine.** Dominion doc §11, steps 2–4, must be live (shared types, migration, `parts_finder.ts`).
2. **Stitch.** Build screens 1–12 in the Roam Fleet APP project, export them, add the README rows, and extend the fidelity script (W6).
3. **Server.**
   - Build W1–W5.
   - Run the column checks for W3 and W4, and migrate if needed.
   - Write tests T1–T8.
   - Deploy fleet-core.
4. **Frontend.** Build the `find-parts/` folder, ported from the Stitch HTML, with tests T10–T11.
5. **Wiring.**
   - Add the third tab and the URL state.
   - Point the Compatible parts button at the new tab.
   - Delete the dialog.
   - Add the "Find parts for this" link on Services due.
6. **Ship.**
   - Check `tsc` is still ≤ 464 and fidelity is 100%.
   - Take screenshots in light, dark and phone.
   - Commit and deploy the fleet site.
