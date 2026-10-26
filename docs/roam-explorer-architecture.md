# Roam Plug — Free Launch

**Rev 28 · 2026-10-26 · The live map is fixed: `20261026023000` is applied, all 56 stations have an address, and `/stations` returns 200. The saved-name fix is written. Google sign-in still doesn't reach Plug: a fresh test at 13:35 failed the same way, and the cause is in the code. New owner decision: sign-in becomes Google (Android) / Apple (Apple devices) / email + password. No phone numbers.**

**What it is:** a free public app for Jamaica, island-wide. Gas stations and prices, My Garage, parts, mechanics, facilities, tolls and reminders. Nothing is sold. The owner approves every mapped place in Dominion. Stitch project "Roam Plug" (`7833067736952351487`).

---

## 1. Google sign-in never reaches Plug (🔴)
**Seen:** at 13:35 UTC, on a fresh page, `promocomcast@gmail.com` logged in with Google twice, and Supabase recorded both logins.
- Plug then called `/explorer/garage` → **400 "Sign in required"**. That's the answer for a request with **no** user token. It isn't "can't use Plug".
- Plug never called `/join`, and the account still has no `explorer.profile` row.
- The app showed the sign-in prompt again, so `AuthProvider` has no session.

**Cause (from the code):**
- Plug imports `packages/auth-client/src/supabase.ts`. Importing that file **creates 17 Supabase clients** (driver, admin, haul, courier, dash, fleet, enterprise… and Plug), and every one has `detectSessionInUrl: true`.
- Google returns with the tokens in the URL **hash** (implicit flow), and Plug uses **hash routing** (`/#/explore`).
- Several clients race to read and clear that hash. Plug's own client (`sb-…-auth-plug`) is created **last**, so it never stores the session. The sign-in lands under another app's key, or is lost.

This explains both failed tests, and it would hit every Google user.

**Fix:**
- Plug gets its own small auth module that creates **only** `supabasePlugApp`. `api.ts`, `auth.tsx` and `scan.ts` import it, and never `supabase.ts`.
- Use `flowType: 'pkce'`. The return then comes as `?code=` in the query string, which the hash router never touches, and the Plug client swaps it for a session before the router starts.
- `redirectTo` = `${origin}/` with no hash.
- **Test:** a Playwright test loads the app with a stand-in `?code=` return and checks `/join` is called before `/garage`, then that Explore shows signed in.

**Done when:** the logs show `POST /explorer/join` → 200 straight after a Google login, and `explorer.profile` has a row for promocomcast.

## 2. New sign-in: no phone, three options (🔴, owner decision 2026-10-26)
Remove phone sign-up and login completely: the phone field, SMS code, OTP screen, "Continue with phone", and the `sendCode` / `verifyCode` paths. Welcome, Sign up, Login and the sign-in sheet show only:

| Option | Shown on | Notes |
|---|---|---|
| **Continue with Google** | Android only | Detect with `navigator.userAgentData?.platform === 'Android'`, falling back to `/Android/i.test(navigator.userAgent)`. |
| **Continue with Apple** | iPhone, iPad and Mac (Safari) only | Detect `/iPhone\|iPad\|Macintosh/` (iPadOS reports Macintosh). Uses `signInWithOAuth({ provider: 'apple' })` and the same PKCE return as item 1. **Owner:** turn on the Apple provider in Supabase Auth. That needs an Apple Developer Services ID, Key ID, Team ID and a .p8 key, plus the redirect URL. Until then, hide the button. |
| **Email + password** | Every device | `signUp` / `signInWithPassword`. Needs a **"Forgot password"** link (`resetPasswordForEmail`, which returns to Plug) and a check-your-email screen if email confirmation is on. |

- On a device that is neither Android nor Apple (Windows, Linux desktop), only email + password shows.
- Keep one screen for both sign-up and sign-in. Google and Apple create or sign in with the same tap. Email has a "New here? Create account" switch.
- Every option calls `/join` after sign-in, just as in item 1.
- Remove phone from Onboarding (Profile) and from Notification settings ("SMS alerts").
- Delete the `/signup` phone and `/otp` routes, or point them at the new screen. Update the 8 journeys, the fit test and the dead-button check.

**Done when:**
- An Android phone shows Google + email, an iPhone shows Apple + email, and a desktop shows email only.
- No screen asks for a phone number.
- `grep -ri "otp\|sendCode\|phone" apps/plug/src` finds only the stored profile field.

## 3. Ship what's waiting (🟠)
- **`main` is 1 commit ahead** (`259f2f92`, the `/v1` catalog path). Push it.
- **Uncommitted:** the saved-name fix (`explorer/index.ts:84-94`), plus edits to `api.ts` and `platform-catalog`. Commit them, then **deploy `explorer`**. Live is still v10 (04:49), which doesn't have the name fix.

## 4. Yours
1. **Phone test after 1–2:**
   - On Android: Google → Explore shows stations → Map It → the pin appears in the Dominion queue.
   - Also test email sign-up.
   - A brand-new account shows nothing that isn't its own.
2. **Apple provider setup** in Supabase (item 2).
3. **Map 20 real places**, and decide on the 2 close station pairs in Dominion.

---

## Rules that still apply
1. A Plug fill never writes to fleet fuel, reconciliation, gas card, settlement or ledger tables.
2. Reuse through packages. Edge copies need a mirror file and a Deno drift test.
3. Dominion holds master data only, never users, vehicles, fills or location trails.
4. Nothing user-mapped goes public before approval, except in-band prices. **No demo or sample data anywhere.**
5. One version of the app, ever. The Stitch design is the app. Mockup furniture from Stitch is not part of the design.
6. Public reads go through the edge API. Never add a schema to the API list without checking its grants.
7. Flags stay off by default. Run `tsc` on touched apps. Use one migration per change. Every paid or abusable endpoint gets `hitLimit()`. Apply a migration before deploying code that reads it.
8. Fit tests cover every route. Tap targets are at least 44×44. The journeys, fit and empty tests all run in CI, and tests never point at the real Supabase.
9. Plug access is written server-side only, as a Plug membership. It never changes an account's other roles. Any Roam account may join Plug.
10. A Plug commit holds Plug files only.
11. Removing fake content must leave a way out.
12. Never show a part number, trim, engine, fitment claim or "guarantee" that the catalog hasn't verified.
13. **Sign-in is Google (Android), Apple (Apple devices) or email + password. Plug never asks for a phone number.** Plug creates only its own auth client.

Mark an item **Done** only after its check passes on a real phone, with the commit and deploy version.
