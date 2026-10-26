# Roam Plug — Free Launch

**Rev 21 · 2026-10-25 · The Rev 19 fixes are committed (`c50eddad`) and live. In the live bundle, "123 Hope Road", "84,210", the fake invoice and "Road Scout" no longer appear. One item is still open: the Stitch sample data on about 20 screens (§2), which is also still in the live bundle.**

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

**Checked 2026-10-25:**
- Plug `tsc` is clean and the dead-button check passes.
- Playwright: 6 passed and 1 skipped, which includes the new `plug-empty`.
- "123 Hope Road", "84,210 km", the fake invoice file and the Road Scout/XP wording are gone from the source.

---

**Note:** `c50eddad` also carried driver and fleet settlement files, which breaks Rule 10. It doesn't break anything, but commit the next Plug fix on its own.

## 2. Stitch sample data on about 20 more screens (🔴)
Test setup: a new account with no car, no fills and no pins. The only test station was Total Half Way Tree. Everything below is fixed text in the generated screens, and none of it comes from the test data:

| Area | Shows | Files |
|---|---|---|
| **Public map (worst)** | Fake stations and prices in Guest Explore, the station list and the offline view: "Fesco Beechwood J$208.20", "Cool Oasis J$209.50", "Texaco J$214.50", "PARISH AVG J$208.20". Anyone who opens the site sees these. | `GuestModeScreen`, `StationListScreen`, `OfflineChipScreen`, `OfflineScreen`, `FiltersScreen`, `StartingOdometerScreen` |
| **Garage with no fills** | A fake fill (Barbican, 20 L, J$4,290, "Today 3:45 PM"), "J$64,300 · 6 Services", a fake service history (J$14,500, "Toyota Jamaica (Liguanea)", J$4,200), and "4 Transactions · Avg J$4,612.50" | `VehicleOverviewScreen`, `HistoryScreen`, `ServiceItemScreen`, `FuelSpendScreen` |
| **Fuel flow** | J$4,290 / 20.00 L / J$214.50 / Barbican shown before anything was entered | `FuelDetailsScreen`, `SavedScreen`, `SavedOfflineScreen`, `SaveErrorScreen`, `FirstSaveScreen` |
| **Places + parts** | Fake shops: "14 / 48 Dunrobin Ave", "Mario's Auto Parts", "Kingston Spares & Imports". Made-up price ranges ("J$11,500 – 14,000"). A "J$100" entry fee. | `MechanicScreen`, `PendingPlaceScreen`, `WithdrawScreen`, `PlacePinScreen`, `PoorGpsScreen`, `PartDetailScreen`, `PartsStoreScreen`, `PartsResultsScreen`, `LogServiceScreen`, `FacilityScreen`, `StationDetailScreen`, `DirectionsScreen` |
| **Tolls** | Plaza rates typed into the screen (Vineyards J$650, Spanish Town J$260, J$720 one-way) and not read from `/tolls`. If a rate changes, the app is wrong. | `TollsScreen` |

**Fix:** each value is rendered from the API, or the block becomes an empty state ("No fills yet", "No stations nearby"). Station lists show only rows from `/stations`.

**Test change (this is the third round of the same problem):** the banned-phrase list in `plug-samples.mjs` can't keep up. Make `plug-empty` check the rule itself:
- With an empty account, garage, fuel-history and spend screens contain no `J$` amount and no km reading.
- Every station or shop name shown is one the test supplied.

Then nothing new can slip through.

## 3. Yours (after 2 is live)
1. **On your phone at roam-plug.vercel.app:**
   - Continue with Google → Explore → Map It → the pin appears in the Dominion queue.
   - A brand-new account shows nothing that isn't its own.
   - The 8 journeys pass.
2. **Map 20 real places.**
3. **Decide on the 2 close station pairs in Dominion:** St Ann's Bay `st_1ba3015a` / `st_2f35d794`, and RUBiS HWT / TotalEnergies HWT.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. **No demo or sample data anywhere.** A value with no real source is removed, not faked or hidden at runtime.
5. One version of the app, ever. The Stitch design is the app. Mockup furniture from Stitch (status bars, sample people, places, numbers and photos) is not part of the design.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change. Every paid or abusable endpoint gets `hitLimit()`.
8. Fit tests cover every route. Tap targets are at least 44×44, made with padding.
9. Roles are only ever written server-side. `/join` grants `explorer_user` only to a new role-less Plug sign-up.
10. A Plug commit holds Plug files only.

Mark an item **Done** only after its check passes on a real phone, with the commit and deploy version.
