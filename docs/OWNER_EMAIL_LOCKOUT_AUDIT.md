# Owner Email Switch — Login Lockout Audit

**Rev 7 · 2026-10-26** · Project `GoRide` (`csfllzzastacofsvcdsc`)
**Status: CLOSED.** Nothing open. One item is queued for a different audit (below).

**Verified 2026-10-26:**
- **Server code gate:**
  - Committed in `88701cd6`.
  - `platform_mfa_gate.test.ts` passes (5/5) and is in `ci.yml`.
  - `fleet-core` v153, `fleet-fuel` and `fleet-ops` are deployed with `mfa_required`.
- **Dominion screen:**
  - Waits for `aal2` before loading data (committed).
  - Live roamdominion.co serves the code step and the owner hint.
- **Owner check:**
  - `platform-role-consistency-nightly` succeeded at 04:20 UTC.
  - 0 problems.
  - One owner: `deekiiiiiii@gmail.com`.

---

## Queued · OWN-R4 · Fleet team labels (next Fleet Team audit)

Fleet team routes, `admin-stats` counts and the org backfill still use `user_metadata.role`. They give no access to Dominion.

---

## Rules to keep

- Change the owner **only** with `supabase/scripts/transfer_platform_ownership.sql`.
- Never set a profile `role` to `superadmin` to fix a login. Fleet reads that field.
- Access comes from `app_metadata` or `platform.user_roles` only, never from `user_metadata`.
- A staff sign-in isn't finished until the **server** sees `aal2`. Keep `platform_mfa_gate.test.ts` in CI.
