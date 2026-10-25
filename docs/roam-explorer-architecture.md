# Roam Plug — Free Launch

**Rev 13 · 2026-10-24 · App code is done and checks are green. Left: commit, deploy `explorer`, rate-limit the odometer scan, then the phone checks. Do not deploy the app to Vercel until you say ship.**
This doc lists only what is still open. Earlier revisions are in git history.

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

**Verified this round (2026-10-24):** `tsc` clean. `check-dead-buttons` now fails on any `data-act` without a handler. `check-demo-leaks` passes. Both Playwright tests pass (8 journeys with demo on, public screens with demo off), and all of them are in `ci.yml`. A grep for demo ids finds them only behind `demoOn()`.

---

## 1. Open (do in this order)

| # | What | Why | Done when |
|---|---|---|---|
| O1 | **Commit the Plug work.** These files are uncommitted: `apps/plug/**` (with the new `act-kind.ts`, `facts.ts`, `fill.ts`, `scan.ts` and `check-demo-leaks.mjs`), `e2e/plug-journeys.spec.ts`, `supabase/functions/explorer/index.ts` and `.github/workflows/ci.yml`. Commit them on their own, separate from the unrelated finance and settlement changes in the same working tree. | CI only protects what is committed. | `git status` shows no Plug files. |
| O2 | **Rate-limit `POST /explorer/odometer-scan`.** Every call is a paid OpenAI request, and the app is free and public. Fuel logs and pins already use `hitLimit()`, but the scan doesn't. Add `hitLimit(sb, user.id, "scan", 30)` and refuse files over about 5 MB. | One account could run up the OpenAI bill. | A 31st scan in an hour gets 429. |
| O3 | **Deploy `explorer`.** Live is v6, which doesn't have `/odometer-scan`, so the scanner fails on a real phone. | The R3 scan is only in local code. | The new version is listed, and a scan with a real photo returns a reading. |

## 2. Phone checks (demo off, after §1)
Run journeys 1–8 on a real phone:
1. New user: Splash → Welcome → sign up → OTP → profile → consent → permissions → add car → Explore.
2. Guest: Explore as guest → station → Directions → Waze. Log Fuel → sign-in sheet → back to Log Fuel.
3. Log fuel: ⛽ → scan → confirm → details (station detected, 87 chosen) → save → Saved → "See my car".
4. Car care: Garage → car → Maintenance → oil change → Log service → back with toast. Then Documents → Fitness → date → back.
5. Parts: Garage → car → Parts → Brakes → results → part → "Find nearby parts stores" → Explore filtered.
6. Map It: Mechanic → drag pin → details + photo → submit → See my pins → pending → withdraw.
7. Explore: search "Total" → station; Tolls; bell → Inbox; Filters → apply → list.
8. Account: Privacy & data → download; Settings → dark theme; Help; Sign out → Welcome.

While you go, check these too:
- **Your own data on every screen.** `fill.ts` fills each screen by swapping out known Stitch sample text, such as "2019 Toyota Roomy" and "8241-HY". Any sample text that isn't on its list will still show. Look at each screen for a name, number or plate that isn't yours.
- **The scan.** A real dashboard photo fills Confirm. A bad photo asks you to type the reading.
- **GPS.** With GPS off, Map It shows Poor GPS and a fill shows Save error. Neither should drop a pin or fill on Kingston.
- **Switched-off sections** don't appear on screen.
- **The rest of the loop:**
  - Prices show after the first in-band fill.
  - A reminder push arrives.
  - A pin reaches the Dominion queue, and approving it notifies the user.
  - After delete, the same number can't open the old garage.
  - Dominion approve, merge and reject each work in one click.

## 3. Owner tasks
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

Mark an item **Done** only after its check passes in the real app, with the commit and deploy version.
