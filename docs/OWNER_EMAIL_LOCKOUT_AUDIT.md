# Owner Email Switch — Login Lockout Audit

**Rev 4 · 2026-10-26** · Project `GoRide` (`csfllzzastacofsvcdsc`)
**Status:** Lockout fixed and live. The login leak is closed on the live server. **3 items left:** deploy the Dominion site, make the server require the authenticator code, and one owner check. The Fleet team label move is queued for its own audit.

**Background:** on 2026-10-25 the owner moved from `sadikithomas@hotmail.com` to `deekiiiiiii@gmail.com`. Dominion's login read an old profile label and a stale "super admin" note, so everyone was refused. It now reads the trusted owner role.

**Verified 2026-10-26 00:30 UTC:**
- Live login reply is `{"error":"Incorrect credentials","attemptsRemaining":n}` for both a wrong password and a valid non-admin password.
- One owner; consistency check returns 0 rows.
- Migration `20261025232640` matches the repo.
- The owner has a verified authenticator and signed in with it today.
- The test is in CI.

---

## Open

### OWN-R5 · Medium-High: the authenticator code is only checked in the browser

`AdminPortal.tsx` shows `StaffMfaStep` until the session is `aal2`, but the Dominion API (`fleet-core`) never checks this. `rbac_middleware.ts` (`requireAuth`, `requirePlatformStaff`, `hasPlatformStaffAccess`) has no `aal` check.

`/admin-login` returns a token after the **password alone** (`aal1`). Anyone with the owner's password can call that route directly and use the token on every platform route, without the code. Now that Google is gone, the password is the only thing the server checks.

The delivery admin routes already do this correctly: `requireProductAdmin` → `enforceStaffMfa` in `supabase/functions/_shared/productAdmin.ts`.

**Fix:**
1. In `supabase/functions/_fleet-server/rbac_middleware.ts`, make `requirePlatformStaff()` (and any route using `hasPlatformStaffAccess` / `hasPlatformOwnerAccess`, e.g. `rate-limit-stats`) return `403 {code:"mfa_required"}` unless `jwtAssuranceLevel(authHeader) === "aal2"`. Reuse the `_shared/productAdmin.ts` helpers; don't write a second rule.
2. Keep `/admin-login` and `/admin-check` public. They are the steps *before* the code.
3. Add a Deno test: an `aal1` platform-owner token gets 403 and an `aal2` token passes. Add it to `ci.yml` next to `dominion_access.test.ts`.
4. Deploy `fleet-core`.

**Check:** sign in through `/admin-login` with curl (no code), then call `GET …/admin-stats` with that token → **403 mfa_required**. Do the same in the browser after entering the code → loads.

### OWN-R6 · Low: commit and deploy the Dominion site

The working tree still holds the Rev 3 changes uncommitted: login page, `App.tsx`, `adminLoginErrors.ts`, `dominion_access.ts`, the monolith route, `ci.yml`, the fuel route typing, and the staged migration rename.

The live roamdominion.co bundle (`App-BUM2JKsT.js`) is still the **old** page: it shows the Google button and the old "doesn't have access" hint, and looks for `no_platform_role`. That's harmless now that the server never sends it, but the site doesn't match the code.

**Fix:** commit, then deploy the Dominion site. **Check:** the live bundle has no `Sign in with Google` and contains `Recently changed the owner account`.

### O2 · Owner check

After 04:20 UTC on 2026-10-26, run `supabase/scripts/check_platform_role_consistency.sql`. Expect 0 rows and no error; this confirms the first nightly run.

### Queued · OWN-R4 · Fleet team labels (next Fleet Team audit)

Team list/role-change/remove, the enterprise team list, `admin-stats` counts and `admin/organizations/backfill` still read and write `user_metadata.role`. They grant no Dominion access. Move the data first, then the reads.

---

## Rules to keep

- Change the owner **only** with `supabase/scripts/transfer_platform_ownership.sql`.
- Never set a profile `role` to `superadmin` to fix a login; Fleet reads that field.
- Access comes from `app_metadata` / `platform.user_roles` only, never `user_metadata`.
- A staff sign-in isn't finished until the **server** sees `aal2`.
