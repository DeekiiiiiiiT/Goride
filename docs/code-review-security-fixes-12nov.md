# Code review security fixes (12 Nov)

**Rev 3 · 2026-11-12 · Status: committed + pushed (`092626e5`, `af8ade97`, `b259b3ca`); migration `20261112210943` LIVE (owner ran `docs/toll-build/staff_alert_phones_LIVE_apply.sql`: `platform.staff_alert_phones` created, signed-in users cannot read it). Code live with the next fleet-core deploy. Earlier: S1–S3 built (Cursor) and checked (Claude): 16 Deno tests pass, the week guard is in every lane bundle. Uncommitted. Before deploying fleet-core: run migration `20261112210943_staff_alert_phones` live. **Live check 12 Nov: the API does NOT expose `fleet`**, so the table moved to `platform` (exposed; next to `platform.user_roles`) before anything went live.**

**Rev 2 check:** S1: no `updateUserById` left; alert numbers are upserted into or deleted from `platform.staff_alert_phones` per fleet; the owner rule is enforced; the team list and SMS alerts read the table; self-service is allowed by the route, and the service still refuses anyone who is not the owner or staff of that fleet. S2: `decideApprove` returns `SAME_PERSON` 403 before the claim; `prepared_by` and the approver come from the same `actorFromContext`, so the comparison holds. Reject is unchanged on purpose. S3: the guard runs `requireAuth` strict first, then loads the run by id + signed-in company; not found → `WEEK_NOT_READY` with no run data.

**Goal:** no staff admin can take over another person's account, nobody approves their own request, and no fleet can change another fleet's week.

Source: `/code-review` on 12 Nov (findings #1–#3; checked by Claude against the code).

| # | Problem (checked) | Fix (one) |
|---|---|---|
| S1 | **Account takeover through the "alert phone".** `setStaffAlertPhone` (`supabase/functions/_fleet-server/team_staff_service.ts:633`) writes the number onto the person's **sign-in phone** (`auth.admin.updateUserById(..., { phone })`, line 651). Anyone with `users.edit_role` can do it, to the **owner** too. Phone codes and recovery then go to the admin's phone. A person in two fleets gets their phone changed by the other fleet's admin. The team list (lines 472, 488) and the SMS alerts (`recon_alerts.ts:110`) read the number back from the sign-in phone. | Store alert numbers in a new per-fleet table, `platform.staff_alert_phones (organization_id, user_id, phone, set_by, set_at)`, with one row per fleet and person. **Never** write `auth.users.phone`. The team list and SMS alerts read the table. **The owner's number can be set only by the owner;** a staff member's number by an admin of that fleet, or by the person themself. |
| S2 | **Approving your own request.** `POST /approvals/:id/approve` (`recon_routes.ts:~2405`) never compares the approver with the request's `prepared_by`. A user with both `recon.prepare` and `recon.approve` sends a reopen or close and approves it at once, and the history shows it as approved by a second person. | `decideApprove` gets the preparer and the approver. Same person → **403 `SAME_PERSON`** ("Someone else must approve this."), and nothing changes. |
| S3 | **The week-version guard crosses fleets and leaks to anyone.** `reconWeekVersionGuard` (`recon_week_version_guard.ts:27`) runs **before** sign-in on fleet-toll / fleet-pay / fuel routes, loads the week run **by id only**, and after a successful change bumps that run's version. A fleet-A user sending fleet B's run id moves B's week (B's open screens get "week changed", B's approvals go stale), and someone not signed in learns a run's state and version from the 409. | The guard first confirms the sign-in (the same `requireAuth` the route uses), then loads the run by id **and** the signed-in company. Not found for this company → 409 `WEEK_NOT_READY` with nothing about the run. |

## Done-tests (written before the fix)
1. An admin sets a staff member's alert number → the alert number shows in the team list; that person's sign-in phone is unchanged.
2. An admin tries to set the owner's alert number → refused. The owner sets their own → saved.
3. The same person in fleets A and B: fleet A's admin sets an alert number → only fleet A's alerts use it, and fleet B's list is unchanged.
4. Week Recon SMS alerts go to the alert number from the table, never to a sign-in phone.
5. A person who prepared a reopen presses Approve on it → refused (403); the request is still pending. Another approver → approved.
6. Fleet A user sends a change with fleet B's `x-recon-week` → 409 `WEEK_NOT_READY`, fleet B's version unchanged, and no history row for B.
7. No sign-in + an `x-recon-week` header → 401, with no week state in the reply.
