# Roam Plug — Free Launch

**Rev 22 · 2026-10-25 · Rev 21 is mostly closed and live (`d4170b95`). The fake stations, prices, fills, toll rates and most of the fake shops are gone from the live bundle. `plug-empty` now checks the rule itself. One small item is left: dates, times and opening hours that are still typed into 8 screens.**

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

**Checked:**
- Plug `tsc` is clean and the dead-button check passes.
- Playwright: 5 passed and 1 skipped (screenshots), including `plug-empty`.
- I swept every route as an empty account. The only station and price shown is the one the test supplied.

---

## 1. Last Stitch leftovers (🟠)
`plug-empty` checks money and km, but it doesn't check **dates, times or opening hours**, so these got through:

| Screen | Shows | File |
|---|---|---|
| Vehicle overview | "Certificate of Fitness · Expires in 21 days (Nov 15, 2024) · DUE SOON" with no document saved | `VehicleOverviewScreen` |
| Service item | "Last Service Record · Verified Work · 14 March 2024" | `ServiceItemScreen` |
| Fuel details / Saved offline | "Today, 3:45 PM" / "Today at 3:45 PM" instead of the real fill time | `FuelDetailsScreen:300`, `SavedOfflineScreen:66` |
| Pending place | "Oct 24, 2024 • 3:15 PM", "Original capture • Dunrobin Ave" | `PendingPlaceScreen:188` |
| Mechanic / Facility / Place | "Open Now", "Mon–Fri 8:00 AM – 6:00 PM", "Closes 5:30 PM", "Open Daily 6:00 AM – 10:00 PM", and "Dunrobin Ave &" | `MechanicScreen:432`, `FacilityScreen`, `PartsStoreScreen` |
| Part detail | Store at "Dunrobin Avenue" | `PartDetailScreen:435` |

**Fix:** show the real date, time and hours, or hide the line. Places have no hours data yet, so remove the hours block and "Open Now".
**Test:** in `plug-empty`, add a date/time pattern (`\d{1,2}:\d{2} ?[AP]M`, month names with a day) to the same rule as money and km. Also check that every street name shown is one the test supplied.

**Owner choice:** Help says "support desk staffed 7:00 AM – 9:00 PM daily". Keep it only if that's true.

## 2. Yours
1. **On your phone at roam-plug.vercel.app:**
   - Continue with Google → Explore → Map It → the pin appears in the Dominion queue.
   - A brand-new account shows nothing that isn't its own.
   - The 8 journeys pass.
2. **Map 20 real places.**
3. **Decide on the 2 close station pairs in Dominion:** St Ann's Bay `st_1ba3015a` / `st_2f35d794`, and RUBiS HWT / TotalEnergies HWT.

**Note:** `d4170b95` also carried admin and fleet files. Commit Plug fixes on their own (Rule 10).

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. **No demo or sample data anywhere.** A value with no real source is removed, not faked or hidden at runtime.
5. One version of the app, ever. The Stitch design is the app. Mockup furniture from Stitch (status bars, sample people, places, numbers, dates and photos) is not part of the design.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change. Every paid or abusable endpoint gets `hitLimit()`.
8. Fit tests cover every route. Tap targets are at least 44×44, made with padding.
9. Roles are only ever written server-side. `/join` grants `explorer_user` only to a new role-less Plug sign-up.
10. A Plug commit holds Plug files only.

Mark an item **Done** only after its check passes on a real phone, with the commit and deploy version.
