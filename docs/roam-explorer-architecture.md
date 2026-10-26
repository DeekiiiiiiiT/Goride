# Roam Plug — Free Launch

**Rev 33 · 2026-10-26 · CODE COMPLETE.**

**Fixed this round:**
- The Apple button now follows only `VITE_PLUG_APPLE`.
- The place-kinds drift test is in CI.
- `1b25907f` is pushed.

**Left:** push and deploy the last commit, then the owner's phone checks.

**What it is:** a free road-convenience app for Jamaica covering mechanics, parts stores, fuel prices, tyres and air, car wash, restrooms, tolls, roadside help, My Garage and reminders. Anyone can map a place, and the owner approves it in Dominion.

---

## 1. Ship the last commit (🟡)
- **Push `d393b73f`.** `main` is 1 commit ahead of `origin`.
- **Redeploy the Plug site.** The live bundle `index-DqRCWx8C.js` still contains the old `localStorage.getItem("plug-apple")` toggle, so it was built before `d393b73f`. The check after deploying: the live bundle no longer contains `"plug-apple"`.
- **`ci.yml` has an uncommitted change** that adds `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the "Catalog contract" step. It isn't a Plug change, so commit it on its own (Rule 10).

## 2. Yours
1. **Google phone test.** This is still unproven: promocomcast's last sign-in was 14:21, before the release, and it has no Plug profile yet.
   - On Android, Continue with Google should land on Explore signed in.
   - Tap every tab and tile.
   - Map a real mechanic, approve it in Dominion, then check it appears under Mechanics and that an Inbox message arrives.
2. **Supabase Auth:**
   - The redirect list includes `https://roamplug.app/` and `https://roam-plug.vercel.app/`.
   - "Confirm email" stays ON.
3. **Map real places.** There are still 0 non-fuel places and 0 submissions.
4. **Apple setup** (Services ID, Key ID, Team ID, .p8 key), then set `VITE_PLUG_APPLE=1` and redeploy.
5. **Decide the 2 close station pairs** in Dominion: `st_1ba3015a`/`st_2f35d794`, and RUBiS HWT/TotalEnergies HWT.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test **listed in ci.yml**.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval. No demo or sample data, and never claim a photo or detail is saved unless the server stored it.
5. One version of the app, ever. The Stitch design is the app.
6. Public reads go through the edge API. Check grants before adding a schema to the API list.
7. Run `tsc` on touched apps. Use one migration per change, applied before the code that reads it. Every abusable endpoint gets `hitLimit()`.
8. Fit tests cover every route, and tap targets are at least 44×44. The Plug Playwright suites run in CI against a stand-in, never the real Supabase.
9. Plug access is a server-side membership that never changes other roles. Any Roam account may join.
10. A Plug commit holds Plug files only.
11. Removing fake content must leave a way out.
12. Never show a part number, trim, engine, fitment or "guarantee" the catalog hasn't verified.
13. Sign-in is Google, Apple or email + password. The device's own option shows first, and the other sits under "More ways to sign in". There is no phone sign-in. Plug imports only `authClient.ts`, and Apple follows only `VITE_PLUG_APPLE`.
14. Plug is a road-convenience app. Explore opens on "All near you", and fuel is never the default or the centre button.
15. All 7 switches stay on. Signed in never shows less than signed out, and a switched-off section goes to "Paused for now".
16. Place kinds come from `PLACE_KINDS` in `@roam/plug-core`, which the grid, Map It, the server and the DB constraint share. Duplicates merge only within the same kind.

Mark an item **Done** only after its check passes on a real phone.
