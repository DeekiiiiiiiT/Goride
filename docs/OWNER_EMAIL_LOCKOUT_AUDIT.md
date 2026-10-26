# Owner Email Switch — Login Lockout Audit

**Rev 6 · 2026-10-26** · Project `GoRide` (`csfllzzastacofsvcdsc`)
**Status:** OWN-R5 is live. O2 passed after the nightly job. Fleet team labels (OWN-R4) stay queued for their own audit.

**Verified 2026-10-26 04:25 UTC:**
- `fleet-core`, `fleet-fuel`, and `fleet-ops` are deployed with the authenticator gate.
- A password-level owner session (`aal1`, no authenticator step) calling `GET /fleet-core/admin-stats` returns **403** `mfa_required`.
- `POST /admin-login` and `GET /admin-check` stay public.
- roamdominion.co still shows the email-and-password login page (no Google button).
- `platform-role-consistency-nightly` succeeded at 04:20 UTC. `platform.role_consistency_problems()` returned 0 rows. `platform.assert_role_consistency()` raised nothing. One owner: `deekiiiiiii@gmail.com`.

The small screen change (do not load customer lists until the code is accepted, and do not open the map unless the session is `aal2`) is in the working tree. It goes out with the next Dominion site deploy. That deploy needs a commit, which was not made.

---

## Open

### OWN-R5 · Done

`requirePlatformStaff`, `assertPlatformStaffResponse`, and the hand-written platform staff and owner doors now return `403 { code: "mfa_required" }` unless the token is `aal2`. Fleet owners on shared routes are unchanged. The Deno test is `supabase/functions/_fleet-server/platform_mfa_gate.test.ts`, listed in `.github/workflows/ci.yml` after `dominion_access.test.ts`.

### O2 · Owner check · Done

Ran after `platform-role-consistency-nightly` (04:20 UTC on 2026-10-26). 0 problem rows, assertion clean, one owner.

### Queued · OWN-R4 · Fleet team labels (next Fleet Team audit)

Fleet team routes, `admin-stats` counts and the org backfill still use `user_metadata.role`. They grant no Dominion access.

---

## Rules to keep

- Change the owner **only** with `supabase/scripts/transfer_platform_ownership.sql`.
- Never set a profile `role` to `superadmin` to fix a login; Fleet reads that field.
- Access comes from `app_metadata` / `platform.user_roles` only, never `user_metadata`.
- A staff sign-in isn't finished until the **server** sees `aal2`.
