# Roam Plug — Free Launch

**Rev 25 · 2026-10-25 · The Parts screens now show catalog facts only. Locally, Plug `tsc` is clean, the dead-button check passes, and Playwright passes 6 tests, with 1 skipped. The tests point at `example.supabase.co`. This is not Done. It still needs a push, a deploy, and a pass on a real phone.**

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

---

## 1. Commit
The CI wiring is committed locally (`playwright.plug.config.ts`, `e2e/plug-journeys.spec.ts`, `PartDetailScreen.tsx`). It is not pushed, so the live CI still runs only `plug-empty` until this branch is pushed.

## 2. Parts catalog facts
The sample part numbers, fit guarantees, store counts, progress percent, directory, and WhatsApp lines are off the Parts screens. A part shows its name, number, fit note, older numbers, and specs only when `/parts` sent them. "100% fit" and "Exact factory part" show only after a confirmed install. With no approved seller, the screen says "No sellers listed yet" and offers Parts stores. Coming soon shows this account's car, or Add a car. The empty-account check now fails on a part number, a percentage, or an invented match or store count the stand-in did not supply.

Not Done until the phone check below passes on the deployed version.

## 3. Yours
1. **Push this branch and deploy, then on your phone at roam-plug.vercel.app:**
   - Continue with Google → Explore → Map It → the pin appears in the Dominion queue.
   - A brand-new account shows nothing that isn't its own.
   - The 8 journeys pass.
2. **Map 20 real places.**
3. **Decide on the 2 close station pairs in Dominion:** St Ann's Bay `st_1ba3015a` / `st_2f35d794`, and RUBiS HWT / TotalEnergies HWT.

**This PC:** `pnpm install` was run, and the local Plug suite passed.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. **No demo or sample data anywhere.** A value with no real source is removed, not faked or hidden at runtime.
5. One version of the app, ever. The Stitch design is the app. Mockup furniture from Stitch (status bars, sample people, places, numbers, part numbers, dates and photos) is not part of the design.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change. Every paid or abusable endpoint gets `hitLimit()`.
8. Fit tests cover every route. Tap targets are at least 44×44, made with padding. The journeys, fit and empty tests all run in CI, and tests never point at the real Supabase.
9. Roles are only ever written server-side. `/join` grants `explorer_user` only to a new role-less Plug sign-up.
10. A Plug commit holds Plug files only.
11. Removing fake content must leave a way out. If a button goes with it, add an empty state with a next step.
12. Never show a part number, fitment claim or "guarantee" that the catalog hasn't verified.

Mark an item **Done** only after its check passes on a real phone, with the commit and deploy version.
