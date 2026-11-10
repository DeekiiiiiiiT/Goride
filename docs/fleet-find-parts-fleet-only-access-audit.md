# Fleet Find parts — your verified cars only (audit)

**Rev 4 — 9 Nov 2026.** fleet-core deployed (smoke test passed) and the owner checked the screens on localhost against the live server: both cars show as verified and open their parts. Left: the live Fleet website still runs the old screens (O-02), stale capture spec (O-01), commit.

## Status (Rev 4)
- **fleet-core deployed 9 Nov 2026** with T0–T10 (`npm run deploy:fleet-core`, smoke test: health, auth 401/404, CORS, manifest all ok).
- **Owner browser check passed 9 Nov** (localhost:3000 → live fleet-core): only Roomy 5179KZ and Fit 1505LM, no "Another car", both cars verified, Roomy opens its parts. Done-tests 1, 2 pass. The Rev 3 "Not verified yet" on both cars was the old server's T9 bug, gone after the deploy.
- **Open — O-02 live Fleet website runs the old screens.** Until the Fleet site is rebuilt from this code, its car-home search (no `vehicleId` → 400) and the old "Another car" picker (`/find` by make/model/year → 400) fail with an error instead of showing other cars. Nothing leaks; those screens just stop working. Fix: build and deploy the Fleet site from this code.
- **Open — O-01** stale capture spec (unchanged, see Rev 3).
- Done-tests 4–10 are covered by the Deno route tests; not re-run by hand against the live server.

## Status (Rev 3)
- **Phase 2 — screens S1–S9 + server T9/T10: DONE in code, checked 9 Nov.** Checked by reading the code and running checks, not by trusting the report: 47/47 Deno tests pass across the five parts test files; fleet `tsc` has 0 errors in `find-parts`; no "Another car" / "Pick another car" / "Recent searches" / "Link this car once" / "Choose 2WD" / `partsVehicleOptions` / `everydayRecentSearches` left in `apps/fleet/src`. Search sends `vehicleId`; the variant comes only from `/parts/vehicle-context` (no client override); unverified cars open the new "Not verified yet" step.
- **Open — O-01 stale capture spec.** `e2e/fleet-find-parts-everyday-capture.spec.ts` and `e2e/findPartsEverydayCaptureFixtures.ts` still name the deleted capture folders (`pick_another_car_maker_model_year`, `which_roomy_2019_is_yours_2wd_or_4wd`). Not run in CI (CI runs only `playwright.plug.config.ts`), so nothing is red. Fix: delete those two entries from the spec and fixtures.
- **Open — done-tests 1–3 and 11 in the browser**, and 4–10 against fleet-core once it is redeployed.

## Status (Rev 2)
- **Phase 1 — server T0–T8: DONE in code, checked 9 Nov.** New `fleet_parts_access.ts` (explicit link only, existence-checked); every route listed in T1–T8 wired; `/vehicle-options` deleted. 45/45 Deno tests pass (`fleet_parts_access`, `fleet_find_parts_routes`, `fleet_parts_lookup`, `parts_catalog_read`, `read_brakes_overview`). Uncommitted, not deployed.
- Until Phase 2 ships, the Fleet search screen calls `/parts/term` without `vehicleId` and gets 400 (only once fleet-core is redeployed).
- **T9 (found in Phase 1 check).** `/parts/my-vehicles` sets `verified` from `car.catalogId || car.vehicleCatalogId`, not the explicit `vehicle_catalog_id` the lock uses, so the "Your cars" grid can mislabel a verified car. Fix: use `readExplicitCatalogLink` + existence check (same as T0).
- **T10 (flagged by Cursor).** `/parts/vehicle-context` still fills `specs` (chassis, engine, drive, brakes) from `loadVehiclePartsContextExtras`, which guesses a catalog row for an unlinked car. Fix: when `verified` is false, return `specs` with every value null.
- **Known limit, no fix needed now:** `readPartTerm` takes the first 16 catalogue-wide part matches and then filters to the car, so a car's part can be missed when the word matches many parts. Results are never wrong, only sometimes incomplete.

## Goal (one sentence)
A fleet user can only see parts information for the cars in their own fleet that are verified on Roam, and nothing else.

## The rule
- **Verified car** = a car in the user's own organisation whose `fleet.vehicles.vehicle_catalog_id` is set **and** points to a real `vehicle_catalog` row.
- A car that is only *guessed* from make/model/year does **not** count. The server today falls back to guessing (`resolveCatalogIdForKvVehicle` → `resolveVehicleCatalogIdFromMakeModelYear`); the guess must never grant access.
- Every parts answer (part list, part number, other brands' numbers, cars a part fits, brake overview, search hit) must come from a verified car the user owns. The server enforces this, not just the screens.

## Live data (checked 9 Nov 2026, read-only)
| Plate | Car | Catalog link | Chassis · Engine · Drive |
|---|---|---|---|
| 5179KZ | Toyota Roomy 2019 | `3cd9cbf3…` (explicit) | M900A · 1KR-FE · 2WD |
| 1505LM | Honda Fit 2018 | `820a0e11…` (explicit) | GP5 · LEB · 2WD |

The org has 2 cars; both are verified. No other org has cars. Only the Fleet app calls the `/parts/*` fleet-core routes (admin uses its own `/admin/catalog/*` routes), so locking them breaks nothing else.

---

## Problems found (one fix each)

### Screens (apps/fleet → Maintenance → Find parts)

**S1. "Another car" card on "Which car is it for?"** — search box "Type a make or model", 8 maker logos, "All makers" button. Lets anyone open any car in the catalogue.
Fix: delete the card. Subtitle becomes "Pick one of your cars."

**S2. "Pick another car" screen** (`step === "catalog"`) — maker → model → year picker, "Continue with …", "Recent searches" card, "Can't find your car? Ask Roam to add this car".
Fix: delete the screen, `finishMmy`, the recent-searches card and `everydayRecentSearches.ts`, and the `catalog` step.

**S3. "We don't have the {car} in our list yet"** (`stateUnknown`) — only reachable from S2, asks Roam to add an unlisted car.
Fix: delete the screen and the `stateUnknown` step.

**S4. "Link this car once" + "Which {model} is yours? 2WD / 4WD"** (`linkCar`, `version` steps, "I'm not sure which one I have", "Depends on your version") — the user picks the car version themselves, which can point their car at a version Roam never verified.
Fix: replace both with one **"Not verified yet"** screen for an unverified fleet car: "Roam is checking this car. Parts show here once it's verified." Buttons: **Ask Roam to verify this car** (sends `/parts/catalog-request` with the car's `vehicleId`) and **Back to your cars**. Delete the version picker, `afterVariantPick`, `unsureVariant` and the `variantId` override.

**S5. "Your cars" grid** — shows fleet cars, but an unverified car opens the self-link flow (S4).
Fix: an unverified car shows a grey **Not verified yet** pill and opens the S4 screen. Verified cars open the car home as today.

**S6. Part search on the car home + "Showing matches … on {car}" screen** — the results come from the whole parts database (any car, by name or part number), yet the screen says "on your car". Leaks other cars' part numbers and can show a wrong-fit number.
Fix: keep the search box; results come only from server fix T2 (this car's parts). "Popular" chips and "By area" tiles keep working through the same search.

**S7. "Every car this part fits" overlay** — keep. It answers "what else is this same part sold for", about a part that fits the user's car (copy buttons added 9 Nov). Server fix T3 makes sure it only opens for parts that fit one of the user's verified cars.

**S8. Screenshot-capture states for deleted screens** (`findPartsCapture.ts`: `pick_another_car_maker_model_year`, `which_roomy_2019_is_yours_2wd_or_4wd`, the `unknown` state of `states_loading_…`).
Fix: delete those entries and the `catalog` / `version` / `stateUnknown` / `linkCar` step names (add `notVerified`).

**S9. Dead code after S1–S4.** `catalogPhase`, `make/model/year` setters used only by the picker, `unknownSample`, `makersQ`/`allMakes`, `usePartsVehicleOptions`, `api.partsVehicleOptions`, the `versions` list.
Fix: delete them. Keep `api.partsCatalogMakers` — `MakerLogo` uses it for logos only (no car data).

### Server (fleet-core `/make-server-37f42386/parts/*`)

**T0. No shared "is this the user's verified car" check.** Each route checks something different; most check nothing.
Fix: one helper `verifiedCatalogIdsForOrg(supabase, orgId)` → the org's `vehicle_catalog_id`s that exist in `vehicle_catalog`; and `verifiedCarForVehicle(c, vehicleId)` → `{ vehicle, catalogId | null }` using the explicit link only (no guessing). Every route below uses these.

**T1. `GET /parts/find` accepts make + model + year with no car** — any car in the catalogue. It also lets the caller pass any `variantId` while naming their own car.
Fix: `vehicleId` required (400 without it); car must be in the org (403/404) and verified (else `{ linked: false }`); the variant is always the car's own `vehicle_catalog_id`; a different `variantId` in the query is ignored.

**T2. `GET /parts/term` searches every part in `part_master`** (name or part number) for anyone.
Fix: `vehicleId` required and must be a verified car of the org. Part hits are limited to parts whose `interchange_group_id` has a `part_listing` row for that car's `vehicle_catalog_id`. Plain component names (e.g. "Brake pads") still match.

**T3. `GET /parts/lookup` opens any `partId`** — full fit list, brand numbers, every car it fits.
Fix: the part must have a `part_listing` row (via its `interchange_group_id`) for one of the org's verified catalog ids, else 404. `variantId` must be one of those ids, else ignored.

**T4. `GET /parts/brakes-overview`, `/parts/browse`, `/parts/component-fit-hints`, `/parts/symptoms` take any `variantId`;** `/parts/browse` with no `variantId` returns the whole catalogue.
Fix: `variantId` required and must be one of the org's verified catalog ids, else 404.

**T5. `GET /parts/vehicle-options` lists the whole car catalogue** (makes, models, years). Only S2 uses it.
Fix: delete the route.

**T6. `POST /parts/catalog-request` without `vehicleId`** files an "unlisted" car for any make/model/year.
Fix: `vehicleId` required and must be the org's car; the no-car path is deleted.

**T7. `POST /parts/request` takes `vehicleCatalogId` / `platformId` from the body**, so a request can be filed against any car version.
Fix: `vehicleId` required and must be the org's car; the catalog id is taken from that car's explicit link, the body value is ignored.

**T8. `GET /parts/vehicle-context` returns a guessed `variantId`** when the car has no explicit link.
Fix: return `variantId` only for the explicit link; otherwise `null` plus `verified: false`, which sends the screen to S4.

`/parts/catalog-makers` (maker names + logos), `/parts/my-vehicles`, `/activity`, `/request-photo`, `/saved-searches`, `/wrong-fit`, `/notify-admin`, `/fitment-report`, `/sourcing-request-note`, `/request-draft` are already org-scoped or carry no car data — no change.

---

## Screens after the change (every button)
| Screen | Buttons / actions | Must do |
|---|---|---|
| Which car is it for? | One card per fleet car; "Your requests" card ("See all requests") | Verified car → car home. Unverified → Not verified yet. No other way to pick a car. |
| Not verified yet (new) | Ask Roam to verify this car · Back to your cars | Sends catalog-request for that car once; shows "Sent". |
| Car home | Change car · part search · Popular chips · By area tiles | Search results only for this car. |
| Search results | Back · Switch car · open result · Ask Roam to find it | Only this car's parts. |
| Brakes / answer / every car | unchanged | Server refuses parts that don't fit a verified car. |
| Requests / Request a part | unchanged | Request always tied to one of your cars. |

## Done-tests (write before building)
1. Open Find parts → only Toyota Roomy (5179KZ) and Honda Fit (1505LM). No "Another car", no maker logos, no "Pick another car" screen anywhere.
2. Roomy → brakes → front pads → 04465-B1320 shows as today; "See every car" opens.
3. Search "pads" on the Fit → only Fit parts; no Roomy number 04465-B1320 unless that pad is listed for the Fit.
4. Call `/parts/find?make=Mazda&model=Demio&year=2010` → 400.
5. Call `/parts/find?vehicleId=<Roomy>&variantId=<a Demio id>` → Roomy parts only.
6. Call `/parts/term?q=04465` with no `vehicleId` → 400.
7. Call `/parts/lookup?partId=<a part not listed for Roomy or Fit>` → 404.
8. Call `/parts/brakes-overview?variantId=<a car not in the fleet>` → 404; `/parts/browse` with no `variantId` → 400.
9. Call `/parts/vehicle-options` → 404 (route gone).
10. Call `/parts/catalog-request` with no `vehicleId` → 400.
11. A fleet car with no catalog link → shows "Not verified yet"; "Ask Roam to verify this car" creates one pending request.
12. Deno tests for T0's helpers (explicit link counts, guessed match does not, other org's car refused) and for each route's refusal above; fleet `tsc` shows no new errors in `find-parts`.

## Build order
Server (T0–T8, with Deno tests) → Screens (S1–S9) → done-tests 1–12.
