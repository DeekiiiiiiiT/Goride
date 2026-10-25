# Roam Plug — Free Launch

**Rev 17 · 2026-10-25 · Most of Rev 16 is built and the checks pass locally. Three things are left: (1) none of it is committed or live, (2) Stitch sample content still shows on about 25 screens, and (3) `/join` is too open.**
This doc lists only what is still open. Earlier revisions are in git history.

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

**Checked 2026-10-25:**
- Plug `tsc` is clean, the dead-button check passes, and the Playwright suite has 4 passed and 1 skipped.
- The tests now use stand-ins (`e2e/plug-stand-in.ts`), and the demo code is gone.
- The fake status bar is gone, `theme-color` is cream, the bars are solid, the map pins cluster, the icon font is self-hosted, and the Google button and `/join` are in the code.
- The `explorer.profile.email` migration is applied in production.
- All 7 `plug.*` flags exist and are off.

---

## 1. Ship it (🔴, nothing above is live yet)
| What I saw | Fix |
|---|---|
| All Plug work is uncommitted, so it isn't live. `roam-plug.vercel.app` still serves `theme-color #a33900`, the old head. | Commit **only** these: `apps/plug`, `e2e/plug-*`, `supabase/functions/explorer`, `packages/plug-core`, `20261025193000_explorer_profile_email.sql`, `supabase/config.toml` and `ci.yml`. Keep the finance and fleet changes in the same working copy out of this commit. Push, and Vercel deploys it. |
| Live `explorer` is **v8**, and that version has no `/join` route. A Google sign-up on the live site would be refused. | Deploy `explorer` after the commit. Check: `POST /explorer/join` with a role-less test account returns `{ ok: true }`. |

## 2. Stitch sample content still shows (🔴, goal B not finished)
`fill.ts` blanks a fixed list of known sample strings (`SAMPLES`). That list can't keep up, because everything not on it still shows. I opened every route as a brand-new account with no car, no pins and no fills. These still showed made-up content:

| Screen | Still shows |
|---|---|
| My Contributions, Approved, Submitted, Withdraw, Parish | "Road Scout — Level 3", "Island Rank #18", "340/500 XP", "14 Places / 11 Approved / 42 Prices", "Top 5%", badges ("Parish Pioneer #1", "Drivers Saved ~$14k"), and 4 dated sample pins |
| Service item / Log service | "Precision Auto Works · 4.9★ (128 reviews)", "J$9,800", "84,612 km", "Last 79,400 km in May", and a sample service history |
| Documents & Renewals | "Insurance overdue by 3d", the expiry dates 12 Jun 2027 and 10 Dec 2024, "962 days left", and "TAJ Synced" |
| Notification settings | "SMS alerts (+1 876 555-0192)" |
| Account | "85%", and "Road Scout" in the help line |
| Search (no results) | "312 Verified pumps active", "+25 XP" |
| Fuel spend | "3 km/day" and a weekly chart with sample dates |
| Garage schedule / History / Remove | sample dates (14 Sep, 12 May, 28 Feb, 28 Apr) |
| Stock photos (about 12 screens) | Welcome hero, Sign up, Guest map, Station detail, Directions, Mechanic, Facility, Pending place, Fuel scan, Confirm odometer, Missing chassis, Document edit and Map details |

**Fix:** remove the sample content from the generated screens themselves, rather than adding more strings to `SAMPLES`. Each value is either rendered from the API or replaced with an empty state. The XP, levels, ranks, badges, "Top 5%" and "Drivers saved" have no data source, so delete those blocks. Replace the stock photos with a plain surface or an icon, and keep only your logo and the empty-state illustrations. After that, `SAMPLES` and `clearSamples` can be deleted.
**Done when:** a Playwright test opens every route with an empty account and finds none of the strings above, and no `lh3.googleusercontent.com/aida-public` photo is visible.
**Owner choice:** the "How it works" intro shows example cards ("Fesco White River J$208.50", "Toyota Probox"). Keep them if they're clearly labelled as examples, otherwise remove them.

## 3. `/join` is too open (🟠)
There are **20 accounts in production with no role**, created by other Roam apps (Fleet, Rush and others) before a role was set. Any one of them can call `/join` and become a Plug user. This writes `role: explorer_user` over the empty role, which can block that person's real app onboarding later.
**Fix:** grant only when the account was created within the last ~15 minutes **and** its only sign-in is Google, or when Plug itself started the sign-in (check a short-lived nonce Plug stores before the redirect). Add a `plug-core` test for an old role-less account, which should be refused.

## 4. Owner tasks
- **Link Google to your owner account.** Right now it has no Google sign-in, so "Continue with Google" would create a second, plain account. Do this in Supabase → Authentication → Users → your user, or sign in once with the same email address.
- **Check the redirect list in the Supabase dashboard.** `config.toml` now lists `roam-plug.vercel.app/**`, but the hosted list in the dashboard is the one that counts.
- **Logo for app icons.** The manifest still has no icons. Once you send the logo, add 192, 512 and maskable 512 PNGs, plus a 180 px apple-touch-icon.
- **Small text:** labels under 12 px come from the Stitch design. Keep them, or allow 12 px as the minimum.
- **Decide on 2 close station pairs:**
  - `st_1ba3015a` / `st_2f35d794` (St Ann's Bay, 36 m apart).
  - RUBiS HWT / TotalEnergies HWT Clock Tower (50 m apart).
- **Map 20 real places** through the full loop.

## Phone checks (after 1–3 are live)
On your phone at roam-plug.vercel.app:
1. It looks like Roam Driver: no second status bar, no orange strip, and nothing behind the tabs.
2. Continue with Google → Explore signed in → Map It → drop a pin → it shows in the Dominion queue under your account.
3. With a new Google account, no screen shows a name, number, date or photo that isn't yours.
4. Run the 8 journeys: sign up, guest browsing, log fuel with a real photo, car care, parts, Map It → withdraw, Explore/search/tolls/inbox, and account/privacy/sign out.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. **No demo or sample data anywhere.** A value with no real source is removed, not faked or hidden at runtime.
5. One version of the app, ever. The Stitch design is the app. Mockup furniture from Stitch (status bars, sample people, numbers and photos) is not part of the design.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change. Every paid or abusable endpoint gets `hitLimit()`.
8. Fit tests cover every route. Tap targets are at least 44×44, made with padding.
9. Roles are only ever written server-side. `/join` grants `explorer_user` only to a **new** role-less Plug sign-up.
10. A Plug commit holds Plug files only.

Mark an item **Done** only after its check passes on a real phone, with the commit and deploy version.
