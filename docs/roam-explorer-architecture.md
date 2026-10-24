# Roam Plug — Free Launch

**Rev 10 · 2026-10-24 · Security closed and live. The app UI is NOT usable: rebuild it as a connected prototype first (§1), then run the phone checks.**
This doc lists only what is still open. Earlier revisions are in git history.

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`). 77 screens are saved in `docs/stitch/roam-plug/html/`.

---

## 1. UI/UX: make it a real, connected prototype (🔴, do this before anything else)

### 1.1 What's wrong today (checked 2026-10-24)

| # | Problem | Evidence |
|---|---|---|
| U1 | **There are two versions of the app.** Cursor first built plain-text screens (`screens.tsx`). Later, it was told to use the Stitch design, so it added a Stitch version (`stitch/StitchScreen.tsx`) and never deleted the plain one. The committed `App.tsx` uses the plain one, and the working copy uses the Stitch one. **Owner decision (2026-10-24): the Stitch design is the only app. The plain-text version is deleted completely.** | `git diff HEAD -- apps/plug/src/App.tsx` |
| U2 | **The Stitch build is mostly dead buttons.** The 77 screens have about 1,000 buttons and links. `StitchScreen.tsx` only reacts to about 35 hard-coded labels and ids, such as `"Let's Go!"`, `submit-btn` and `finishBtn`. Anything else does nothing. | `StitchScreen.tsx` `act()` |
| U3 | **The bottom nav exists on only 10 of 77 screens.** Screens like Vehicle overview (30) and Choose type (42) have no nav and no working exit. They are dead ends. | `data-path` count per file |
| U4 | **About 25 screens can't be reached at all** in the React build. Nothing links to them: Parts (the whole section), Tolls, Search, Inbox, Filters, Guest, Station list, Pending place, Confirm odometer, Service item, Log service, Withdraw pin, Notifications, Settings, Help, Offline, Mechanic and facility lists. | grep of `Link`/`navigate` in `screens.tsx` |
| U5 | **States were turned into pages.** Loading, empty, offline, error, first save, weak GPS, approved and toast are separate routes (`/explore/empty`, `/fuel/first`, `/garage/empty`…). You only see them by typing the URL, and the real screen never shows them. | `App.tsx` |
| U6 | **Back is broken.** `Frame` uses `navigate(-1)`, so a screen opened fresh has nowhere to go back to. | `Shell.tsx` |
| U7 | **Flags block the walkthrough.** `Gate` shows "This section is turned off" before it checks sign-in. A guest who taps Log Fuel sees "turned off" instead of a sign-in prompt, and with flags off you can't click through at all. | `screens.tsx` `Gate` |
| U8 | **Flows stop halfway.** Model/year just reloads the search. Log Fuel skips Confirm, hard-codes grade 87 and never shows the station. Log service always saves "oil" and stays on the page. Document reminder always saves "fitness" and stays on the page. Service item and Part detail are fixed text. Map It has no draggable pin, no photo and no "what's here" ticks. Explore is a plain list, with no map, no grade chips, no sort and no bottom sheet. | `screens.tsx` |
| U9 | **Every launch replays onboarding.** `/` always shows Splash → Welcome, even for a signed-in user. | `App.tsx` |

### 1.2 The fix in one sentence

**One app only: the Stitch design.** Delete the plain-text screens. Make every button on every Stitch screen work and follow the navigation map in §1.3. Keep states inside the screen. Add a **demo mode** with labelled sample data, so the whole app can be clicked through before the backend or flags are involved.

**How Cursor makes Stitch buttons work, without creating another version:** move each Stitch screen's markup out of the iframe and straight into that screen's React file. Keep the look pixel-for-pixel: the same layout, the same Tailwind classes (served by the app's own Tailwind with the `plug.css` tokens, not Stitch's CDN), and the same text and icons. Then attach real handlers to its buttons. Do this **one screen at a time, replacing the iframe for that screen in the same commit**, so there is never a second copy of any screen. When the last screen is moved, delete `StitchScreen.tsx` and `catalog.ts`.

### 1.3 Navigation map: the spine (every screen must sit here)

**Tabs** (always visible except in onboarding and the Log Fuel flow): **Explore · Garage · ⛽ Log Fuel (raised) · Map It · Account**. Each tab keeps its own stack, and tapping the active tab again returns to its root.

| Area | Screen (Stitch #) | Primary action → goes to | Other exits |
|---|---|---|---|
| **Launch** | Splash (1) | auto after 1.5 s → **Explore** if signed in, else Welcome | — |
| **Onboarding** (no tabs) | Welcome (2) | Get started → How it works (3) | Explore as guest → Explore (16); Log in → Login (14) |
| | How it works (3) | Create account → Sign up (4) | Skip → Sign up |
| | Sign up (4) / Login (14) | Send code → OTP (5) | Back |
| | OTP (5) | Verify → new user: Profile (6); returning user: Explore | Resend; change number |
| | Profile (6) → Consent (7) → Permissions (8) | Continue each step | Permissions: "Not now" → still continues |
| | Add vehicle: Make (9) → Model/year (10) → Odometer (12) → Added (13) | Save → Added → **Explore** | "Can't find my car" → Not found (11) → Odometer; "Skip for now" → Explore |
| **Explore** tab | Home (15) — map + bottom sheet | Tap a pin/card → place sheet → Station detail (19) / Parts store (20) / Mechanic (21) / Facility (22) | Search bar → Search (49); chips: Fuel, Parts, Mechanics, Air & restroom, Car wash, **Tolls** (48); filter icon → Filters (18) as a sheet; bell → **Inbox** (50); "My car due" card → Vehicle overview (30); Map/List toggle → List (17) |
| | Station detail (19) | Directions → app picker sheet (Google Maps / Waze) | "Log fuel here" → Log Fuel with this station preselected; Back → Explore |
| | Parts store / Mechanic / Facility (20–22) | Directions | "Is this wrong?" → Map It with the place prefilled |
| | Guest (16) | = Home without the "My car" card, plus a "Create account" banner | Log Fuel / Map It / Garage → **sign-in sheet**, which returns to the same place after sign-in |
| **Log Fuel** (full screen, no tabs, ✕ closes back to where it started) | Scan (24) → Confirm (25) → Details (26) | Save → Saved (27; first fill shows confetti) | Offline → Saved offline (28); error → stays on 26 with a message; no vehicle → "Add a vehicle" → Make (9) and back |
| | Details (26) holds | vehicle chip, grade chips 87/90/Diesel, auto-detected station ("Not here? change"), litres, J$ amount | — |
| | Saved (27) | Done → back where you started | "See my car" → Vehicle overview (30) |
| **Garage** tab | My vehicles (29) | Tap car → Vehicle overview (30) | + Add vehicle → Make (9); empty state built in |
| | Vehicle overview (30) — hub | Cards: **Maintenance** (31), **History** (34), **Fuel spend** (35), **Documents** (36), **Parts for this car** (38) | ⋯ menu → Remove vehicle (confirm dialog, then back to 29) |
| | Maintenance (31) → Service item (32) | "Log this service" → Log service (33) → Save → back to 31 with a toast | — |
| | Documents (36) | Tap a document → Reminder (37) → Save → back to 36 with a toast | — |
| | Parts: Categories (38) → Results (39) → Part detail (40) | "Find nearby parts stores" → Explore filtered to parts stores | Car not ready → Coming soon (41) |
| **Map It** tab | Choose type (42) | Pick type → Place pin (43) | Header "My pins" → Contributions (46) |
| | Place pin (43) — drag the map under a fixed pin | Confirm location (disabled until GPS is good; weak GPS shows inline help) → Details (44) | GPS off → GPS help (56) |
| | Details (44): name, photo, what's here | Submit → Submitted (45) | — |
| | Submitted (45) | "Map another" → 42 | "See my pins" → Contributions (46) |
| | Contributions (46) | Tap a pending pin → Pending place (23) → Withdraw (confirm dialog) | "Help map your parish" → Parish (47) → Map It |
| **Account** tab | Account (51) | List: My pins (46), Inbox (50), Notifications (52), Privacy & data (53), Settings (54), Help (55), Sign out | Guest → sign-in sheet |
| | Privacy & data (53) | Download my data; Delete account (confirm dialog → Welcome) | — |
| **Anywhere** | Offline (57) | a **banner** across the top, not a page | Tap the banner → shows the waiting items |

**These are states inside screens, not routes.** Delete them as routes: loading skeleton (15b), empty map (15c), offline chip (15d), directions sheet (19b), withdraw dialog (23b), save error (26b), first save (27b), empty garage (29b), remove vehicle dialog (30b), weak GPS (43c), submitted toast (45c), approved (46b), empty search (49b), empty inbox (50b). Each one is a state of its parent screen, and demo mode can show them (§1.4).

### 1.4 How to build it, in order

| Step | Build | Done when |
|---|---|---|
| **P-1 Delete the plain-text version** | Delete every plain-text screen in `apps/plug/src/screens.tsx`: Splash through PoorGps, FuelError and PlugAdmin. Delete `Frame` and the plain-text `Shell`. Keep only the shared helpers they used (`api.ts`, `auth.tsx`, `offline.ts`, `push.ts`). Their API calls are reused when each Stitch screen is wired up in P-4. All routes in `App.tsx` point at the Stitch screens. | `screens.tsx` is gone; there is one screen per route, and it uses the Stitch design |
| **P-2 App shell** | `TabsLayout` with the 5 tabs and a separate stack per tab. `AppHeader` with title, a back button with a **fallback route** for each screen, and an optional right action (bell, ⋯, "My pins"). A full-screen layout for onboarding and Log Fuel. Shared `BottomSheet`, `Toast`, `ConfirmDialog` and `SignInSheet` (it remembers where to return). | Every screen has a working back, even when opened directly |
| **P-3 Demo mode** | `?demo=1` (or a toggle in Settings, dev builds only) switches `api.ts` to clearly labelled fixtures in `apps/plug/src/demo/` (a few stations with prices, one car with a schedule, two pins). It ignores flags. A "DEMO" ribbon is always visible. It is never on in production builds (Rule 4). | The owner can click every journey in §1.5 with the backend off |
| **P-4 Move each Stitch screen into the app** | For each screen in §1.3, move its Stitch markup into React exactly as designed (see §1.2). Replace the sample text with real or demo data, and wire every button to the map. Go area by area: Onboarding → Explore → Log Fuel → Garage → Map It → Account. Each screen has its loading, empty and error states inside it. Delete the iframe for that screen in the same commit. | Each screen looks identical to its Stitch screenshot; then `StitchScreen.tsx` and `catalog.ts` are deleted |
| **P-5 Fix the half-flows (U8)** | Model/year step; Confirm odometer; grade chips plus station auto-detect on Details; Log service and Reminder take the real item and return with a toast; Map It drag-pin, photo and "what's here"; Explore map plus bottom sheet with grade chips and sort | Each flow ends somewhere sensible, and never on a page with no button |
| **P-6 Gates** | Order: **guest → sign-in sheet** first, then **flag off → hide the entry point** (don't show a dead page). Signed-in users skip onboarding (U9). | A guest tapping Log Fuel sees sign-in, not "turned off" |
| **P-7 Dead-button check** | Every `<button>` and `<a>` has a handler or route, or is `disabled` with a reason. Add a Playwright test that walks the 8 journeys in demo mode and fails on any screen with no way out. | The test is green in CI |
| **P-8 Real data** | Switch demo off and connect to the API, which already exists. Then run the phone checks in §3. | Same journeys pass on a real phone |

### 1.5 The 8 journeys (acceptance: tap through all of them on a phone, without typing a URL)
1. New user: Splash → Welcome → sign up → OTP → profile → consent → permissions → add car (make → model/year → odometer) → Explore.
2. Guest: Welcome → Explore as guest → open a station → Directions → Waze. Tap Log Fuel → sign-in sheet → after sign-in, back to Log Fuel.
3. Log fuel: ⛽ → scan → confirm → details (station detected, 87 chosen) → save → Saved → "See my car".
4. Car care: Garage → car → Maintenance → oil change → Log service → back with toast. Then Documents → Fitness → set date → back.
5. Parts: Garage → car → Parts → Brakes → results → part → "Find nearby parts stores" → Explore filtered.
6. Map It: Map It → Mechanic → drag pin → details + photo → submit → See my pins → open pending → withdraw.
7. Explore: search "Total" → station; chips → Tolls; bell → Inbox; Filters sheet → apply → list.
8. Account: Account → Privacy & data → download; Settings → dark theme; Help; Sign out → Welcome.

---

## 2. Other open items
- **Commit.** The deployed backend code is still uncommitted: `explorer`, both auth hooks, `plug-core`, the drift test, `ci.yml`, and migrations `20261025180000`, `181000` and `182000`. Commit those now. Commit the app screens as P-1 and P-4 land.
- **Public stations have no parish (🟡).** 0 of 56 rows in `places.public_station` have a `pcode`, because the sync trigger reads `payload_json->>'pcode'`. Fix: use `places.parish_pcode(lat, lng)` in `places.sync_public_station`, then backfill. Until then, parish filters, "Help map your parish" and Dominion coverage are empty for stations.

## 3. Phone checks (after §1, with real data)
Run journeys 1–8 on a real phone, plus these: prices show after the first in-band fill; a reminder push arrives; a pin reaches the Dominion queue and approving it notifies the user; delete means the same number can't open the old garage; Dominion approve/merge/reject works in one click with shortcuts. Deploy to Vercel only when you say ship.

## 4. Owner tasks
- Decide on 2 close station pairs: `st_1ba3015a` / `st_2f35d794` (St Ann's Bay, 36 m, both unverified), and RUBiS HWT / TotalEnergies HWT Clock Tower (50 m, both verified, may be two real stations).
- Open Fleet bills, toll ledger and module checkout once while logged in.
- Map 20 real places through the full loop.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. **Demo data only in demo mode, always labelled, never in production builds.**
5. **One version of the app, ever.** The Stitch design is the app. Never build a second or "temporary" version of a screen. When a screen changes, replace it in place. Stitch's Tailwind CDN is never loaded; the app's own Tailwind and `plug.css` render the same classes.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change, recorded under the same version.

Mark a step **Done** only after its check passes in the real app, with the commit and deploy version.
