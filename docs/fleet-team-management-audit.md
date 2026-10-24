# Fleet Team Management — Audit

**Rev 5 · 2026-10-24 · CLOSED**
All findings are fixed, live and smoke-tested in prod. Last commit is `be058c7b`.

**The rule:** Roam owns every driver and courier account. A fleet owns only the relationship (approve, pause, vehicle, remove). It never touches the login. Staff power comes only from an active seat. Decisions D1–D5 are unchanged.

---

## Left to do

1. **Push `be058c7b`** (main is 1 ahead of origin). The push redeploys the fleet functions, because `packages/auth-client` changed. The code is the same as what's live. Afterwards, check that no `failed closed` lines appear in any fleet function's logs.

## Accepted, not changed

- A suspended seat can take up to 60 s to bite on another server copy.
- If the pause lookup errors, work is allowed through.
- Two Deno test files fail a type check on fake clients. CI runs them with `--no-check`.
- Fleet `tsc` baseline is **464**.

## Verified 2026-10-24

- **Smoke test** (16:31 and 17:00 UTC, throwaway seat + test driver, then put back). Every step is in `platform.permission_audit_log`:
  - invite (new and existing account) → accept → role change → suspend → fresh sign-in 403 → reactivate → remove
  - pause / resume
  - remove with an open week (typed name, `workforce.removed`)
  - ownership transfer cancelled, then accepted and handed back
- **Prod after the test:** owner unchanged, 0 pending transfers, 4 open memberships (same as before), drift view 0 rows.
- **Logs:** no `failed closed` since 16:36 UTC.
- **Checks:** 22 team tests pass. The CI guard passes. `deno check` on the server auth files is clean.
- **Incident:** 95 owner/staff requests were refused, 16:02–16:36 UTC, across `fleet-core` and `fleet-fuel` (schema bug, fixed in Rev 4).

---

## Do-not list

- No `deleteUser`, password write or role write on another user from any route a fleet or enterprise token can reach. CI guard: [guard-customer-portal-auth.mjs](../scripts/guard-customer-portal-auth.mjs).
- Staff roles come from seats only, never from `app_metadata.role` or `user_metadata`.
- Server code reads memberships through `fleet_workforce_memberships`, never `schema("fleet")`. Guarded in CI.
- One permission catalog: [packages/auth-client/src/permissions.ts](../packages/auth-client/src/permissions.ts). Don't add a server copy back. Every `Role` needs an entry.
- After any auth deploy, check the logs of **all** fleet functions for `failed closed`, and make one real owner request.
- Keep the Fleet Tag card as it is.
