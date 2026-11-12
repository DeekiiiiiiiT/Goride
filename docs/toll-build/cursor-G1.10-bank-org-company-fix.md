# Cursor prompt — Bank confirmations + organization settings: company always from the sign-in

Read `docs/fleet-bank-org-settings-company-fix.md` first (problems F1–F5, done-tests 1–7). Fix exactly those. No migrations. Do not commit, branch or push.

## 1. One pure helper: `supabase/functions/_fleet-server/route_company.ts`
```ts
export type RouteCompany = { ok: true; orgId: string } | { ok: false; status: 400 | 403; code: "NO_COMPANY" | "COMPANY_MISMATCH" };
export function resolveRouteCompany(sessionOrgId: string | null, requestedOrgId: unknown): RouteCompany
```
- No session company → `{ ok: false, status: 400, code: "NO_COMPANY" }`.
- The request names a company (non-empty string after trim) that differs from the session one → `{ ok: false, status: 403, code: "COMPANY_MISMATCH" }`.
- Otherwise → `{ ok: true, orgId: sessionOrgId }`.

The session company is `getOrgId(c)` (`org_scope.ts:73`). **Never** use the request value as the company.

## 2. `supabase/functions/_fleet-server/register_fleet_bank_routes.ts`
- **PUT `/fleet-bank-confirms` (F1, F3):** use `resolveRouteCompany(getOrgId(c), body?.organizationId)`; on `ok: false` return `{ error: code }` with that status. **Delete the legacy write path** (the "Legacy fallback when session has no org id" branch, ~lines 82–107). The key and the stamp are both the session company. Keep `requirePermission("transactions.edit")`.
- **DELETE `/fleet-bank-confirms` (F2):** use `resolveRouteCompany(getOrgId(c), c.req.query("organizationId"))`. Keep the legacy driver-key **cleanup** (it already checks `belongsToOrg`), but run it only for the session company.
- **GET `/organization-settings` (F4):** use `resolveRouteCompany(getOrgId(c), c.req.query("organizationId"))`. Also return `{ data: null }`-style empty settings, not another company's values, when the stored record's `organizationId` stamp differs from the session company (today a record with no stamp is returned to anyone).
- **PUT `/organization-settings` (F5):** use `resolveRouteCompany(getOrgId(c), body?.organizationId)`, and **add a permission check** that lets only fleet owners, fleet managers and platform owners save. Use the existing middleware (`requirePermission` / `requireAnyPermission` from `rbac_middleware.ts`) with permission key(s) from `packages/auth-client/src/permissions.ts` that **exactly** those roles hold, and that `fleet_accountant`, `fleet_viewer` and `driver` do **not** hold. Check the catalog and say in your report which key(s) you chose and why. If no existing key fits exactly, use `requireAnyPermission("settings.edit", "toll.manage")` only if that set is owner + manager + platform owner, and report it.

## 3. Fleet app callers (done-test 7)
In `apps/fleet/src/services/api.ts`, `upsertOrganizationSettings`, the organization-settings read and the three `fleet-bank-confirms` calls (~lines 7851–7946) stop sending `organizationId`. Check the callers still compile: `FleetFinancialsPage.tsx`, `ImportsPage.tsx`, `TagInventory.tsx`, `BankStatementImport.tsx`, `SettlementSummaryView.tsx`. Don't change any screen layout.

## 4. Tests
- `supabase/functions/_fleet-server/route_company.test.ts` (Deno): every branch of `resolveRouteCompany`. Include: whitespace-only requested id = not named; requested = session = ok; a number or object in the body = not a string → treated as not named.
- If the repo has a pattern for testing Hono routes with a fake `rbacUser` (look in `_fleet-server/*.test.ts`), add route tests for done-tests 1, 3, 4, 5 and 6. If it doesn't, say so in your report; don't build a new framework.
- Add the new test file(s) to the right Deno step in `.github/workflows/ci.yml`.
- Rebuild the bundles of every edge function that includes `register_fleet_bank_routes.ts` (find them; probably fleet-core), with the repo's bundle script, and run the edge route manifest check.
- Run the fleet app's typecheck the way CI does for the files you touched.

## Run (once)
Deno tests, the bundle + manifest checks and the typecheck. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. State the permission key(s) you chose for F5. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
