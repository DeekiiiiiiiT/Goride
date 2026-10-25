# Roam Plug — Free Launch

**Rev 18 · 2026-10-25 · The app is live. Engineering items from Rev 17 are closed. What is left is on your phone and in Dominion.**

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

## Closed
- **Site.** `roam-plug.vercel.app` and `roamplug.app` serve the cream theme (`#fff8f2`), the Plug icon, and the welcome screen. Explore shows real stations. The old orange strip (`#a33900` as the page theme) is gone. Fake ranks, the sample phone number, and Stitch stock photos are not in the live app. How it works keeps the teaching cards, labelled Example.
- **Sign-in.** `explorer` is v9 and has `/join`. Continue with Google on the live site reaches Google and is allowed to return to `https://roam-plug.vercel.app`. A Plug account is granted only when Plug itself started a fresh Google sign-up. An existing Roam account is refused.
- **Owner login.** `deekiiiiiii@gmail.com` is the owner and already has Google. The same account still has the fleet-manager mark, so Fleet sign-in is not blocked.
- **Icons and type.** Home-screen icons are 192, 512, maskable 512, and the 180 px apple icon. Plug text is at least 12 px.
- **Close stations.** The two close pairs stay on the map until you decide in Dominion. They were not merged or deleted.

## Still yours
1. On your phone at roam-plug.vercel.app: it looks like Roam Driver, Continue with Google, Explore, Map It, the pin shows in the Dominion queue under your account, a brand-new Google account shows no fake name, number, date or photo, and the 8 journeys pass.
2. Map 20 real places through drop-pin and your approval. No sample places.

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
