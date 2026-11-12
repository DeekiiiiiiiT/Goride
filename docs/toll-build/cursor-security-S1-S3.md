# Cursor prompt — Security fixes S1–S3 (12 Nov code review)

Read `docs/code-review-security-fixes-12nov.md` first (problems S1–S3, done-tests 1–7). Fix exactly those. Do not commit, branch or push.

## S1 — the alert phone never touches the sign-in phone
1. **Migration:** `npx supabase migration new staff_alert_phones` (real current UTC time). Create:
   - `fleet.staff_alert_phones`: `organization_id uuid NOT NULL REFERENCES public.organizations(id)`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `phone text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$')`, `set_by uuid NOT NULL`, `set_at timestamptz NOT NULL DEFAULT now()`, `PRIMARY KEY (organization_id, user_id)`;
   - row security on, no grants to `anon` / `authenticated`, `GRANT SELECT, INSERT, UPDATE, DELETE` to `service_role` (the server reads and writes it).

   If the `fleet` schema doesn't exist, use `public` and say so. Don't copy any existing `auth.users.phone` values into it.
2. **`supabase/functions/_fleet-server/team_staff_service.ts`, `setStaffAlertPhone`:**
   - remove `auth.admin.updateUserById` completely;
   - upsert into the table for `(organizationId, targetId)`; an empty number deletes the row;
   - permission:
     - target is the owner → only the owner may set it (`actorId === targetId`), else 403 "Only the owner can set the owner's alert number.";
     - target is a staff member of this fleet → allowed for the current admin route's permission, or for the person themself;
     - anyone else → 403 (keep today's message).
   - Keep the audit row.
3. **Reads:** the team list (`team_staff_service.ts` ~lines 472 and 488) and the SMS alerts (`recon_alerts.ts` ~line 110) read `alertPhone` from the table for that fleet, **not** from the sign-in phone. A person with no row has no alert number.
4. **Tests:** update `team_staff_alert_phone.test.ts` (Deno) so it proves no `updateUserById` call, the owner rule, staff and self allowed, and that reads come from the table (use fakes, as the existing test does).

## S2 — nobody approves their own request
In `recon_routes.ts` POST `/approvals/:id/approve` (~line 2405), pass `preparedBy: request.prepared_by` and `approver: actor` into `decideApprove` (find it; it's pure). Same person → `{ go: false, code: "SAME_PERSON" }`, and the route returns **403** `{ error: "SAME_PERSON", message: "Someone else must approve this." }` **before** the claim, so nothing changes.
- Compare by the same id the request stores in `prepared_by`; check what `actorFromContext` returns.
- Add cases to `recon_approvals.test.ts` (or the test that covers `decideApprove`).
- Check whether the **reject** route needs the same rule: rejecting your own request is fine (it's a cancel), so leave it, and say so.

## S3 — the week guard signs in first and stays inside the fleet
In `recon_week_version_guard.ts`:
1. When the header is present on a changing method, run the same sign-in as the routes (`requireAuth({ strict: true })` from `rbac_middleware.ts`) **before** reading the run. Compose it, e.g. `return requireAuth({ strict: true })(c, async () => { …check…; await next(); …claim… })`. No sign-in → the middleware's 401, with no run data.
2. Load the run with `.eq("id", runId).eq("organization_id", <signed-in company from getOrgId(c)>)`. Check the column's type in `recon.week_runs` (it may be text). Not found → 409 `WEEK_NOT_READY` (same message as today).
3. `claim_week_change` runs only for that same run (it already uses `parsed.runId`, which is now proven to be the signed-in fleet's).
4. Don't change the header format or the opt-in behaviour (no header → untouched).
5. Tests: extend the guard's Deno test (or add `recon_week_version_guard.test.ts`) with fakes:
   - no sign-in → 401 and no run read;
   - another fleet's run → `WEEK_NOT_READY` and no claim;
   - own fleet's run at the right version → the route runs and the claim is called.
6. Rebuild the bundles that include the guard (fleet-toll, fleet-pay, fleet-fuel, and any other; `scripts/assert-recon-week-guard-bundled.mjs` lists them) with `scripts/build-edge-bundle.mjs`, and run `node scripts/assert-recon-week-guard-bundled.mjs` and the edge route manifest check.

## Run (once)
- the Deno tests you touched;
- `node scripts/validate-migration-sql.mjs`;
- apply the migration locally (`npx supabase migration up`; Docker Desktop open);
- the bundle and manifest checks;
- `pnpm --filter @roam/fleet typecheck`, counting only **new** errors in files you touched.

If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
