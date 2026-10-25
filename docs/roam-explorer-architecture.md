# Roam Plug — Free Launch

**Rev 15 · 2026-10-24 · Scan cap is live (explorer v7, `f0c278d0`). The mobile polish is built and nothing scrolls sideways, but it's uncommitted, tap targets are still small on most screens, and there are no app icons. Then the phone checks. Do not deploy to Vercel until you say ship.**
This doc lists only what is still open. Earlier revisions are in git history.

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

**Verified 2026-10-24:**
- `tsc` is clean, and `check-dead-buttons` and `check-demo-leaks` pass.
- Playwright: both journey tests and the 360 px fit test pass.
- A sweep of all 50 routes at 320 px and 360 px found **no sideways page scroll anywhere**.
- Safe areas, keyboard inset, scroll lock, toast placement, reduced motion and focus rings are in.

---

## 1. Open (in this order)

| # | What | Done when |
|---|---|---|
| M1 | **Commit the mobile polish on its own.** These are uncommitted: `apps/plug/index.html`, `capacitor.config.ts`, `src/index.css`, `live/maps.tsx`, `nav.ts`, `shell/*` (including the new `viewport.ts`), `OdometerScanScreen.tsx`, `public/manifest.webmanifest`, `e2e/plug-mobile-fit.spec.ts` and `playwright.plug.config.ts`. | `git status` shows no Plug files. |
| M2 | **Tap targets under 44 px on 45 of 50 screens.** The fit test only measures the tab bar and the sign-in sheet, so these got through. The worst are listed below. Fix them by enlarging the hit area with padding or `tap-target`, leaving the visual size the same. | Extend `plug-mobile-fit.spec.ts` to every route in `App.tsx` at 360 px, failing on anything under 44×44. It is green. |
| M3 | **No app icons.** The manifest has no `icons`, and there's no `favicon.svg` or `apple-touch-icon`. Android won't offer "Install app", and iOS uses a screenshot as the home-screen icon. **Needs the owner's logo.** | 192 px, 512 px and maskable 512 px PNGs, plus a 180 px apple-touch-icon, are in `dist/`. |

**M2, worst offenders:**
- **Back buttons** 24–41 px wide: Documents edit, Documents, Fuel spend, Vehicle overview, Map It, Profile.
- **Chips and tabs** 28–36 px tall: Explore filters and voice, History, Inbox, Fuel spend periods, Parts tiers, Fuel details grade chips.
- **Small controls:**
  - Settings theme radios: 20×20.
  - OTP "Edit phone number": 24×24.
  - Parish "add location": 32×32.
  - Notification toggles: 56×32.
  - Log service ticks: 40 tall.
  - Footer links on Account and Login: 20–32 tall.
  - Map pin close and info: 36×36.

## 2. Owner decision
- **Small text.** Every screen has labels under 12 px in the Stitch design itself, up to 42 on the station list. Raising them changes the look, so Cursor correctly left them. Decide: keep as designed, or allow a minimum of 12 px for small labels.
- **Phone app.** There are no `ios/` or `android/` projects yet, so Plug runs only in the browser or as an installed web app. Native items (status bar, Android back button, splash) start when you run `cap add`.

## 3. Phone checks (demo off, after §1)
Run journeys 1–8 on a real phone, both in the browser and after Add to Home Screen:
1. New user: Splash → Welcome → sign up → OTP → profile → consent → permissions → add car → Explore.
2. Guest: Explore as guest → station → Directions → Waze. Log Fuel → sign-in sheet → back to Log Fuel.
3. Log fuel: ⛽ → scan (real dashboard photo) → confirm → details → save → Saved → "See my car".
4. Car care: Garage → car → Maintenance → oil change → Log service → toast. Documents → Fitness → date → back.
5. Parts: Garage → car → Parts → Brakes → results → part → "Find nearby parts stores".
6. Map It: Mechanic → drag pin → details + photo → submit → See my pins → pending → withdraw.
7. Explore: search "Total" → station; Tolls; Inbox; Filters → apply → list.
8. Account: Privacy & data → download; Settings → dark theme; Help; Sign out.

Also check these:
- No sample name, plate or number that isn't yours on any screen (`fill.ts` swaps only known sample text).
- With GPS off, there's no pin or fill on Kingston.
- The keyboard never covers a field or the Save button.
- Switched-off sections are hidden.
- Prices show after the first in-band fill.
- A reminder push arrives.
- A pin reaches Dominion, and approving it notifies the user.
- After delete, the same number can't open the old garage.

## 4. Owner tasks
- Decide on 2 close station pairs:
  - `st_1ba3015a` / `st_2f35d794` (St Ann's Bay, 36 m apart, both unverified).
  - RUBiS HWT / TotalEnergies HWT Clock Tower (50 m apart, both verified).
- Open Fleet bills, the toll ledger and module checkout once while logged in.
- Map 20 real places through the full loop.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. Demo data appears only in demo mode, always labelled, never in production, and never as a fallback.
5. One version of the app, ever. The Stitch design is the app. Change screens in place, and never load Stitch's Tailwind CDN.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change. Every paid or abusable endpoint gets `hitLimit()`.
8. Fit tests cover every route, not a sample. Tap targets are at least 44×44, made with padding, not by resizing the design.

Mark an item **Done** only after its check passes in the real app, with the commit and deploy version.
