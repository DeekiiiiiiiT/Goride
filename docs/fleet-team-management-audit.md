# Fleet Team Management — Audit

**Rev 4 · 2026-10-24 · closed**
R3-01 and R3-02 are fixed and live. All fleet functions were redeployed between 16:24 and 16:36 UTC, and rides v737, matching v156 and delivery v895 at 16:26.

**The rule:** Roam owns every driver and courier account. A fleet owns only the relationship. Staff power comes only from an active seat. Decisions D1–D5 are unchanged.

---

## Closed this rev

**R4-01.** `fleet_admin`, `fleet_ops`, `enterprise_admin`, and `enterprise_ops` are in the shared permission map with empty lists. `deno check` on `workforce_invite_routes.ts` reports no TS2739. The `fuel_driver_spend` TS2339 is finance work and was left alone.

**R4-02.** A change under `packages/auth-client/**` starts the edge deploy and redeploys the same fleet functions as `_fleet-server/`: fleet-core, fleet-fuel, fleet-toll, fleet-ops, fleet-claims, fleet-pay, and evidence-cleanup. No production redeploy was required. Empty lists do not change who can do what.

**Smoke, 17:00 UTC, then put back.** Throwaway staff seat and the test driver only. The real operator was not touched.

- Fresh sign-in after suspend: the company request returned 403 on the first try. Turning the seat back on returned 200 on the first try.
- Remove with an open week: the check showed `unsettled_week`, typing the name removed them from the fleet, the Roam account remained, and the log row is `workforce.removed` with the week still open. The throwaway week was then deleted and the test driver put back, so it does not sit on the books.
- Ownership transfer accepted: the seat became the owner, and the log shows `team.ownership.accepted` and `team.ownership.handed_over`. It was handed straight back. The original owner is the owner again.
- Invite of an existing Roam account: the invite said `existingAccount: true`, they signed in and accepted, and the seat was removed afterward. The 16:33 run had already done this for an account created in August.

No `failed closed` lines in the function logs from 16:55–17:15 UTC. Owner requests during the run returned 200.

**Accepted, not changed.** A suspended seat can take up to 60 seconds to bite on another server copy. If the pause lookup errors, work is allowed through. Two Deno test files fail a type check on fake database clients; CI runs them without that check. Fleet `tsc` stays at **464** (was 484).

**Incident note (correcting Rev 3):** the lockout hit every fleet function that bundles the sign-in check, not only `fleet-core`. Prod logs show 95 refused lookups in about 34 minutes: `fleet-core` 16:02–16:20 UTC and `fleet-fuel` 16:20–16:36 UTC. There have been none since the 16:36 redeploy, and every response since is 200 or a normal 401.

---

## Do-not list

- No `deleteUser`, password write or role write on another user from any route a fleet or enterprise token can reach. CI guard: [guard-customer-portal-auth.mjs](../scripts/guard-customer-portal-auth.mjs).
- Staff roles come from seats only, never from `app_metadata.role` or `user_metadata`.
- Server code reads memberships through `fleet_workforce_memberships`, never `schema("fleet")`. Guarded in CI.
- One permission catalog: [packages/auth-client/src/permissions.ts](../packages/auth-client/src/permissions.ts). Don't add a server copy back.
- After any auth deploy, check the logs of **all** fleet functions for `failed closed`, and make one real owner request.
- Keep the Fleet Tag card as it is.

---

## Closed (verified 2026-10-24)

- **Rev 4:**
  - R3-01: access lookup uses the public view, live, no failures since 16:36
  - R3-02: pause check is in the live rides, matching and delivery bundles
  - old `user_metadata.organizationId` (8 → 0) and mirrored staff roles (2 → 0) cleaned up
  - `GET /users` and the client `getUsers` / `updateUser` removed
  - the guard now runs in CI
  - one permission catalog for apps and server: the extra courier/nav permissions it brings aren't checked by any server route, so access doesn't change
- **Rev 3:** R2-01 to R2-14 and all Rev 2 Low items.
- **Rev 2:** C1–C4, H1–H6, H8, M3, M4, M6–M8, M10, Enterprise invite password.
