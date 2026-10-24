# Roam Plug — Free Launch

**Rev 6 · 2026-10-24 · ⛔ NOT READY. Fix C1 and C2 first, because they are live in production now.**
This doc lists only what is still open. Work that is finished has been removed from it. The full design is in git history (Rev 5).

**What it is:** a free public app for Jamaica, island-wide. It offers gas stations and prices, My Garage maintenance logged at fuel-up, parts info, mechanics, air pumps, restrooms, tolls and document reminders. Nothing is sold. Every place a user maps is approved by the owner in Dominion. Gas stations use the existing Fleet station database, tagged `roam_plug` or `roam_fleet`. The theme is Sunset Orange, and the screens are in Stitch project "Roam Plug" (`7833067736952351487`).

---

## Checked 2026-10-24 (git, prod DB, live URLs)

**Already done:**
- Migrations `20261024200000` and `20261024210000` are applied and recorded.
- The `explorer` function (v2) and `platform-catalog` (v129) are deployed.
- All 7 `plug.*` flags are off.
- 56 verified stations have been copied to `places.public_station`.
- The new tables have RLS on and no anon grants.
- The fleet money trigger is in place.
- Fleet fills feed public prices through `plug_public_price.ts`.
- 75 Stitch screens are saved, including D1–D4.
- Places Review is in the Dominion `AdminPortal`.
- `apps/plug` typecheck: **0 errors**.

---

## Open items (most serious first)

### 🔴 Critical: live now, fix before anything else

| # | Problem | Fix |
|---|---|---|
| **C1** | **Any signed-in user can read fleet money data.** Migration `20261024210000` added `fleet` and `fuel` to the API schema list (`pgrst.db_schemas`). In prod, 14 fleet tables and views give SELECT to `authenticated` with RLS off: `expense_bills`, `expense_bill_lines`, `expense_bill_payments`, `finance_period_lines`, `finance_period_locks`, `finance_statement_alerts`, `module_purchases`, `workforce_memberships`, `toll_tag_assignments`, `ledger_entries` (a definer view, so it bypasses RLS), and others. Anyone who signs up for Plug with a phone number gets a signed-in session and can read every fleet's bills and ledger. | Add a new migration that takes `fleet` and `fuel` back out of `db_schemas`. The `explorer` function then reads stations and Petrojam prices through a small `places` RPC, or a `places` view of station facts only. Right after, test a real REST call with a user token (lesson from the 8MB incident). |
| **C2** | **Anyone can make themselves the owner.** `roleOf()` in `explorer/index.ts` falls back to `user_metadata.role`, which users can edit themselves. 20 of 46 users have no `app_metadata.role`. One `updateUser({ data: { role: 'platform_owner' } })` call unlocks `/admin/places` (approve, reject, merge) and `/admin/flags`, which turns global flags on. The app's own sign-up also writes the role into `user_metadata`. | Read the role only from `app_metadata` or the JWT claim set by `custom-access-token`. Set `explorer_user` on the server when the account is created (the `before-user-created` hook). Never trust `user_metadata`. |

### 🟠 High: the app is a clickable mock-up, not the app

| # | Problem | Fix |
|---|---|---|
| **H1** | **Screens are the Stitch HTML shown in an iframe**, with Stitch's Tailwind CDN and sample content (`StitchScreen.tsx` + `catalog.ts`). This breaks Rule 5 below. Real React screens exist in `screens.tsx` but no route uses them, apart from `/admin`. | Route to React components built on `@roam/ui`. Use the HTML as layout reference only. |
| **H2** | **Almost nothing saves.** Only sign-up/OTP and `POST /profile` call the backend. "Save fuel log" just goes to the Saved screen, so no fill is stored. Add vehicle, garage, schedule, service log, reminders, parts, Map It submit, inbox, export and delete never call the API, which already exists. Users see Stitch's sample cars, prices and pins, which breaks Rule 4. The Build log shows P1–P7 as "In repo", but none of their "done when" checks can pass. | Wire every screen to `explorer` / `platform-catalog`. Then re-run each phase's check (table below). |
| **H3** | **Fleet pieces are not reused.** The app doesn't use `OdometerScanner`, `CatalogVariantPicker`, `schedule_for_variant` or `parts_for_vehicle`. There is no Sunset Orange theme in `@roam/design-tokens`. | Move the shared logic into packages and import it from there. Add a `plug` theme to the tokens. |
| **H4** | **Duplicate stations.** Plug's matcher only looks at `verified` stations. A second fill at a `learnt` station creates another `learnt` station. Fleet matches learnt stations too. | Use the same candidate set and thresholds as the Fleet station resolution. |
| **H5** | **The source tag doesn't work for Fleet.** All 206 stations are `manual`. The Fleet save path never stamps `roam_fleet`, so new Fleet-learnt stations come in as `manual`, and the Station Database "Source" filter can't tell the two apart. | Stamp `origin_app = 'roam_fleet'` in the Fleet station write. Backfill using the station's first fill. |

### 🟡 Medium

| # | Problem | Fix |
|---|---|---|
| M1 | `places.sync_public_station` only removes `rejected`, `closed` or `duplicate` stations, and those statuses don't exist (the real ones are verified, unverified, learnt and anomaly). A station that is un-verified, marked as an anomaly or deleted stays on the public map. | Remove the station from the public table whenever its status is not `verified`, and on DELETE. |
| M2 | A mock location is recorded but not acted on. The user hash falls back to the pepper `"roam-plug"` when the secret is missing. | Hold mock-location fills for review. Refuse to start without `PLUG_USER_HASH_PEPPER`. |
| M3 | Not shipped: `roam-plug.vercel.app` returns **404**. These changes are uncommitted: `App.tsx`, `StitchScreen.tsx`, `catalog.ts`, `PlacesReview.tsx`, `explorer/index.ts`, and the new Stitch files and scripts. | Commit, then deploy to Vercel after C1, C2 and H1–H2 are done. |

### Owner tasks (no code)
- Review the ~2 possible duplicate stations in the Station Database.
- Confirm the app id `co.roam.plug` before the first store build.
- After the fixes: map 20 real places through the full loop, then follow the release order (owner account → Play internal testing → iOS → public).

---

## Rules that still apply

1. A Plug fill never writes to fleet fuel, reconciliation, gas cards, settlement or ledger tables.
2. Reuse through packages, don't copy. Edge code uses a mirror file plus a Deno drift test.
3. Dominion holds master data only. It never stores Plug users, vehicles, fills or location trails.
4. Nothing a user maps goes public before the owner approves it, except in-band prices at existing stations. No fake data in production.
5. Stitch HTML is reference only. Never ship it.
6. Public reads go through the edge API using cached read models. No grants to `anon` or `authenticated` on raw tables. Don't expose new schemas to the API without checking their grants.
7. Flags stay off by default. Run `tsc` for every touched app (fleet baseline 500). Add one new migration per change and never edit an applied migration.

## Build log (Cursor: update this; Claude checks it against git and prod)

| Phase | Status | Blocked by |
|---|---|---|
| P0 Backend | ⚠️ Service wrappers, public-map rule, and station source are on the database. Fleet and fuel are still on the public API until the edge functions ship and the schema migration runs. | Function deploy, then `20261025171000` |
| P1 Onboarding + add vehicle | ⚠️ Phone screens are React. Sign-up no longer sends a role. Not checked with a real code. | Owner allowlist, pepper secret |
| P2 Explore + fuel prices | ⚠️ Checked in the running app: explore, search, station, directions, and tolls show live data. Prices say "No price yet" because none are published. Not Done. | Published prices |
| P3 Log fuel | ⚠️ Screen is React and gated. A save was not checked on a signed-in phone. | Flag allowlist, pepper, explorer deploy |
| P4 Garage + care | ⚠️ Screen is React and gated. Own logs are not checked. | Flag allowlist |
| P5 Parts | ⚠️ Screen is React and gated. Coming soon is not checked. | Flag allowlist |
| P6 Map It | ⚠️ Screen is React and gated. A pin was not submitted. | Flag allowlist, pepper |
| P7 Account + data | ⚠️ Screens are React. Export and delete were not run. | Pepper, explorer deploy |
| P8 Dominion Places Review | ⚠️ Menu no longer treats a blank role as owner. The token hook that writes `explorer_user` is not deployed. | custom-access-token deploy |
| P9 Release | ❌ Not deployed. `roam-plug.vercel.app` stays off until you say ship. | Your go-ahead |

No phase is Done. A phase is Done only after its check passes in the real app, with the commit and deploy version.
