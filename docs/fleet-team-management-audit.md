# Fleet Team Management — Audit

**Rev 2 · 2026-10-24 · post-implementation check · open items only**
Rev 1 findings that are fixed are not repeated here (list at the end). Code is deployed (`fleet-core` v123, `custom-access-token` v134, `delivery` v894) but **nothing is committed** (37 files).

---

## The rule (unchanged)

Roam owns every driver and courier account. A fleet owns only the **relationship**: it can approve, pause, assign a vehicle, and remove someone from the fleet. It can never touch the login (password, delete, role). Staff are the fleet's own employees, on seats in `platform.user_roles`.
Decisions D1–D5 (2026-10-24): owner may send reset emails to staff only · managers approve + pause, owner removes + sets the Fleet Tag · removal with open money is allowed after a typed name · one fleet per service line · a driver becomes staff only through an invite they accept.

---

## 1. Critical — fix before anything else

**R2-01 — Any fleet owner can make themselves (or anyone) a Roam platform owner.**
`POST /update-user` ([register_residual_monolith_routes.tsx:9176](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L9176)) is gated only by `users.edit_role`, which every fleet owner has. It writes any `role` string into **any** account's `app_metadata.role` and `roles[]`, with no org check. Fleet signup is self-serve, so a stranger can sign up, then call `{ userId: <self>, role: "superadmin" }`. `pickRawRoleForRbac` ranks platform roles first, so on the next request they are `platform_owner`. *(This route was there before Rev 1; I missed it.)*
Fix: require `hasPlatformOwnerAccess`. The fleet and driver clients that call it ([apps/fleet/src/services/api.ts:3088](../apps/fleet/src/services/api.ts#L3088), [apps/fleet/src/components/admin/CustomerAccounts.tsx:293](../apps/fleet/src/components/admin/CustomerAccounts.tsx#L293), [apps/driver/src/services/api.ts:1710](../apps/driver/src/services/api.ts#L1710)) need a self-only "update my name" route or must be platform-only screens.
Test: a fleet-owner token → `POST /update-user` → 403; the target's `app_metadata` is unchanged.

**R2-02 — Any fleet owner can delete any Roam account by id.**
`POST /delete-user` ([:9236](../supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L9236)) is gated only by `users.remove` and calls `auth.admin.deleteUser(userId)` with no org check. That cascades through 35 tables (rider, driver and courier profiles, courier cash). *(Also missed in Rev 1.)*
Fix: platform owner only, or delete the route if the admin app uses `admin-operations/delete-user`.
Test: fleet-owner token → 403; the account still signs in.

**R2-03 — Suspended staff get full access back the next time they sign in.**
Suspending sets the seat to `suspended` and signs the person out ([team_staff_service.ts:520-551](../supabase/functions/_fleet-server/team_staff_service.ts#L520-L551)). But accepting the invite had copied the role into `app_metadata.role` ([:344-364](../supabase/functions/_fleet-server/team_staff_service.ts#L344-L364)). The RBAC seat lookup only reads `status = 'active'` seats ([rbac_middleware.ts ~531-575](../supabase/functions/_fleet-server/rbac_middleware.ts)), so it finds nothing and falls back to the old `app_metadata.role`, e.g. `fleet_manager` with the same org.
Fix: staff permissions come **only** from an active seat. If the person has a suspended seat in that org, or no seat, they resolve to `unassigned` (drivers keep `driver`). Stop mirroring staff roles into `app_metadata.role`.
Test: invite → accept → suspend → sign in again → every dashboard route returns 403.

**R2-04 — Invited staff have no way to accept.**
The Accept banner ([StaffInviteBanner.tsx](../apps/fleet/src/components/users/StaffInviteBanner.tsx)) only appears inside Team Management, which needs `nav.user_management`. A new invitee is `unassigned`, so the page blocks them and they never see the banner. Invitees who already have a Roam account also get **no email**: the invite only writes `pending_invites`, yet the toast says "Invite emailed" ([team_staff_service.ts:221-264](../supabase/functions/_fleet-server/team_staff_service.ts#L221-L264)). Enterprise has the same gap.
Fix: show pending invites on the first screen any signed-in user sees, in both the Fleet and Enterprise apps (before any permission gate). Send a notice email for existing accounts.
Test: invite a brand-new email → set password from the email → land on the app → Accept → menu appears. Then the same with an existing rider account.

---

## 2. High

**R2-05 — Removed or departed workers stay attached to the fleet on their login.**
Joining writes `app_metadata.organizationId` ([workforce_link.ts:158](../supabase/functions/_fleet-server/workforce_link.ts#L158), 269). Removing or leaving (`endWorkforceInOrg`, `unlinkCourierFromFleet`) never clears it, and RBAC reads it first. An ex-driver keeps resolving to the old fleet's org on every request.
Fix: when no open membership and no seat remains in that org, remove `app_metadata.organizationId`.
Test: remove Kenny → his next request has no fleet org; the fleet's history still shows his past weeks.

**R2-06 — Offboarding check leaks across fleets and over-counts cash.**
`GET /workforce/members/:userId/offboarding-check` ([workforce_lifecycle_routes.ts:166](../supabase/functions/_fleet-server/workforce_lifecycle_routes.ts#L166)) never checks that the person is in *your* fleet, so any owner can read any Roam user's money owed and cash held. The check itself ([workforce_offboarding.ts:46-78](../supabase/functions/_fleet-server/workforce_offboarding.ts#L46-L78)) adds up every week from every fleet, and **adds `cash_still_held` across weeks**. That figure is a carried balance, so the sum double-counts it (the same trap as the Rattray Sep 7 custody-carry bug).
Fix: require an open membership in the caller's org; filter periods to that org; use the latest week's `cash_still_held`, not the sum.

**R2-07 — "Pause in this fleet" doesn't stop anything.**
Pause writes `status = 'paused'` and `workforcePaused` in KV. Nothing reads either one, so a paused driver or courier keeps working. Only the vehicle is released.
Fix: driver trip start / check-in and Rush offer eligibility must refuse while the membership is `paused`.

**R2-08 — Ownership transfer can't finish, and wouldn't hand over control if it did.**
There is no screen to accept a transfer (the client has `startOwnershipTransfer` only). The owner must type a raw user id ([OwnerSecurityCard.tsx](../apps/fleet/src/components/settings/OwnerSecurityCard.tsx)). Accepting only changes `organizations.owner_id` ([team_staff_routes.ts:303-331](../supabase/functions/_fleet-server/team_staff_routes.ts#L303-L331)). The old owner keeps `app_metadata.role = admin` (still `fleet_owner`), and the new owner stays on their staff seat. Nothing is audit-logged, and there is no cancel.
Fix: pick the new owner from the staff list; show an accept screen; on accept, swap the seats (old owner → manager or removed), audit both sides, and add a cancel action.

**R2-09 — "Require two-factor" locks the owner out.**
Nothing ever writes `platform.identities.mfa_enrolled`, and there is no way to set up 2FA. Turning the switch on makes every removal and transfer fail with "turn on two-factor". The switch also always loads as off.
Fix: hide the switch until 2FA enrolment exists, or check the session's `aal2` instead of the flag.

---

## 3. Medium

- **R2-10 D5 is server-only.** A driver who accepts a staff seat keeps `app_metadata.role = driver`. The Fleet app works out roles from the token, so it shows them no dashboard even though the server allows it. Fix: the client gets its effective role from the server (or a token claim built from the seat).
- **R2-11 Every API call now does 1–2 extra lookups** (seat + membership in `requireAuth`). That works against the Disk IO plan; cache per user for ~60 s. The seat query is `limit(1)` with no order, so someone with seats in two orgs, or an owner who is staff elsewhere, can land in the wrong org. Prefer the seat that matches their own org, and make the choice deterministic.
- **R2-12 Join-request details are thin.** The "verification" badge reads `driver_profiles.onboarding_complete`, so couriers always show *pending*. `holdsVehicle` is always false. Memberships are always saved as `joined_via = fleet_tag`, and `join_request_id` is never stored.
- **R2-13 Removal UX.** The Drivers page and courier sheet use `window.prompt` and never show what is open. The Team page says "Nothing open" when the check *failed*. Amounts are raw numbers with no currency. The Driver app's **Leave fleet** acts on one tap with no confirmation.
- **R2-14 Legacy leftovers.** `GET /users` still filters on `user_metadata`. `unlinkCourierFromFleet` still reads and writes `user_metadata.organizationId`, and 9 accounts still carry it. The CI guard ([scripts/guard-customer-portal-auth.mjs](../scripts/guard-customer-portal-auth.mjs)) doesn't scan `register_residual_monolith_routes.tsx`, which is where R2-01/02 live.

## 4. Low

Activity tab shows raw codes (`team.staff.invited`) with no who or whom. The Join Requests tab has no count (`pendingJoins` is dead code). The Enterprise page's "What each role can do" lists fleet roles. Sending a reset email also signs the staff member out. Inviting the same person again with a different role creates a second seat.

---

## 5. Operational to-dos

1. **Commit** the 37 changed files. CI's `test-supabase-functions.yml` will then run the new Deno tests.
2. **Migration history:** `20261024120000_fleet_team_seats_and_membership` is live in prod but not recorded. `…133000_fleet_workforce_memberships_api` is recorded as `20261024141556`. Rename the local file to match and run `supabase migration repair` for the first, or a fresh replay will fail.
3. **Drift (1 row):** `deekiiiiiii+roam.fleet.review`, the owner of fleet `d99d4f11…`, has a fleet `driver_profiles` row with no membership. Either add the membership or set the profile to independent. Then schedule `fleet.workforce_membership_drift` as a check that must return 0 rows.
4. **Run** [supabase/scripts/unpin_platform_owner_org.sql](../supabase/scripts/unpin_platform_owner_org.sql). The platform owner is still pinned to your fleet.
5. **Type-check:** fleet `tsc` is **485** (baseline 500). One new error: [StaffInviteBanner.tsx:19](../apps/fleet/src/components/users/StaffInviteBanner.tsx#L19) uses `replaceAll`. Once fixed, the baseline is 484.
6. **Live smoke test after the fixes.** Prod has no `team.*` or `workforce.*` audit events yet, so none of this has run for real. Steps: invite → accept → change role → suspend → sign in (expect 403) → reactivate → remove; pause/resume a driver; remove a driver with something open.

---

## Do-not list

- No `deleteUser`, password write or role write on another user from any route a fleet or enterprise token can reach.
- Staff roles come from seats only; never from `app_metadata.role` or `user_metadata`.
- Ending a relationship clears every link (membership, profiles, KV, `app_metadata.organizationId`) but never the account or its history.
- Keep the Fleet Tag card as it is.

---

## Closed in this round (verified 2026-10-24)

C1 Remove deletes account · C2 invite overwrites password · C3 driver role changes · C4 Reset Password · H1 open team list · H2 user-editable membership in the staff list · H3 one membership table · H4 audit writes · H5 email invites, expiry and revoke · H6 unknown role = no access · H8 driver Leave fleet · M3 productLine · M4 claim-then-link · M6 manager permissions (D2) · M7 real status and ISO dates · M8 silent fallback · M10 claim-driver retired · Enterprise invite no longer shows a password.
