# Fleet bank confirmations + organization settings — company fix

**Rev 2 · 2026-11-12 · Status: built (Cursor), checked (Claude), committed + pushed (`a9bad91f`, fix-only split); live with the next fleet-core deploy. Severity High.**

**Rev 2 check:** `resolveRouteCompany` (session company only; a different named company → 403; no company → 400) is used by all four routes; the legacy no-company write is removed; settings save needs `settings.edit` (owner, platform owner) or `toll.manage` (manager); accountant, viewer and driver hold neither. An older unstamped settings record is still shown, but only under the signed-in fleet's own key (no leak, no lost settings). 10 Deno tests pass; fleet typecheck 757 → 754 errors (none new; the rest predate this work).

Found while checking the toll design (`docs/toll-architecture.md` A13, item G1.10). The toll rebuild's Phase 0 can't exit until this is fixed, because its payout trigger reads these records.

**Goal:** a person signed in to one fleet can never read or change another fleet's bank confirmations or organization settings.

## What's wrong (checked 12 Nov in `supabase/functions/_fleet-server/register_fleet_bank_routes.ts`)

| # | Problem | Where | Fix (one) |
|---|---|---|---|
| F1 | **Saving a bank confirmation** builds its key from `body.organizationId` before the signed-in company. A user of fleet A with `transactions.edit` can overwrite fleet B's record. The stored record is then stamped A while its key says B. | PUT `/fleet-bank-confirms`, line 35 | The company is always the signed-in one. A body `organizationId` naming a different company → **403 `COMPANY_MISMATCH`**, nothing written. |
| F2 | **Deleting a bank confirmation** takes the company from the `organizationId` query value. It only checks the record's stamp, so a B record stamped A (from F1) can be deleted, and the error leaks whether a key exists. | DELETE `/fleet-bank-confirms`, line 120 | Same rule as F1 (query value). |
| F3 | **Legacy write with no company:** a signed-in user with no company can write `fleet_bank_confirm:<any driverId>:<week>` for any driver id. | PUT, lines 82–107 | Remove the legacy **write** path; a save without a company → 400. Legacy records stay readable. |
| F4 | **Reading organization settings** takes the company from the query value. A record without an `organizationId` stamp is returned to anyone. Those settings hold the fleet's Uber / Roam / InDrive organization ids, the toll low-balance default and the downtime cost. | GET `/organization-settings`, line 169 | Same rule as F1 (query value). |
| F5 | **Saving organization settings** takes the company from the body **and has no permission check at all**, so any signed-in user (a driver too) can change another fleet's platform ids. Imports use those ids. | PUT `/organization-settings`, line 200 | Same rule as F1. **Plus** only fleet owners and fleet managers (and platform owners) may save. |

**Platform staff:** a platform login with no fleet selected can no longer act on a fleet through these routes by naming it. Staff acting for a fleet will be governed separately (like the toll staff table, B7), not by a request field.

## Done-tests (written before the fix)
1. Signed in to fleet A, saving a bank confirmation with `organizationId` = B → refused (403), and B's record is unchanged.
2. Signed in to fleet A, saving with no `organizationId` or with A → saved under A's key, stamped A.
3. Signed in to fleet A, deleting with `organizationId` = B → refused (403), and B's record still exists.
4. Signed in with no company, saving a bank confirmation → refused (400); no driver-keyed record written.
5. Signed in to fleet A, reading organization settings with `organizationId` = B → refused (403), and nothing of B's returned.
6. A driver or a fleet viewer saving organization settings → refused (403). A fleet manager → saved.
7. The Imports page, the Fleet Financials page, the Bank Statement import and Tag Inventory still load and save for a fleet manager (their requests now leave the company out).
