# Cursor prompt — Toll Phase 1, P1-R1: week result tests

Claude built `supabase/migrations/20261112221623_toll_v2_week_result.sql`. **Do not change any migration.** If a test shows it is wrong, report it and stop.

Read it first. What it gives you:
- `toll_system.week_result_live(company, week)` → the `TollWeekResultV1` JSON (contract: `packages/toll-core/src/v2/weekResultV1.ts`), computed from the records.
- `toll_system.week_result(company, week)` → the frozen result when the week's latest `toll_week` statement is closed (`state: 'sealed'`), else the live one (`state: 'open'`). `afterSeal` is always current.
- `public.toll_v2_week_result(p_week date)` for signed-in users. The company comes from the token. Readers are the owner, a fleet manager, or a fleet accountant (`toll.view`); a viewer or driver gets `FORBIDDEN`. A non-Monday gets `BAD_REQUEST`.
- `factsHash` = md5 of the week's own facts. It **leaves out** `afterSeal` and the tag account's `openingMinor` / `closingMinor` (they depend on earlier weeks). The seal stores the result in `ledger.week_statements.amounts_minor` and the hash in `source_hash`, and nightly check 4 recomputes it.

## Write `supabase/tests/toll_v2_week_result.sql`
Same style as the other toll tests (`BEGIN … ROLLBACK`, made-up `auth.users` and companies, money posted with `toll_system.post`, as in `toll_v2_postings.sql`). Act as a user with `SET LOCAL ROLE authenticated` + `request.jwt.claims` (as in `toll_v2_commands.sql`). Seats need `platform.roles` rows named `fleet_manager`, `fleet_accountant`, `fleet_viewer`; insert them if missing.

1. **Every field on one fixture week (W):** a tag top-up (also one in W−1), two tag charges, one cash charge for driver D1, a card payback and a cash payback (received by D1), allocations to platform, driver (D1) and fleet, one `pending` charge, one `unverified` cash charge, one `awaiting_cash` charge, a payback left partly unlinked (`payback_unlinked_decisions`), a take-back (reversing payback in W), one `carried_facts` row with `to_week = W`. Assert **each number** in `spend`, `bearers`, `pending`, `unverified`, `awaitingCash`, `paybacks` (all five), `carriedIn`, `tagAccount` (all four, including the W−1 opening), `drivers` (D1's three numbers) and `ledgerMovements.bankMinor`. Work them out by hand in comments.
2. **Exact shape:** the top-level keys of the result are exactly `contractVersion, companyId, weekKey, state, weekVersion, factsHash, engineVersion, spend, bearers, pending, unverified, awaitingCash, paybacks, carriedIn, tagAccount, drivers, afterSeal, ledgerMovements` (compare with `jsonb_object_keys`; no more, no less). Add a comment that this list must match `TollWeekResultV1`.
3. **Sealed read:** as the owner, seal W with `public.toll_v2_command('seal_week', …)`. `public.toll_v2_week_result(W)` then has `state 'sealed'`, `weekVersion 1`, the same numbers as before, and `factsHash` = the statement's `source_hash`.
4. **After the seal:**
   - an `after_seal` charge for W and an `after_seal` reversing payback whose original is in W both appear in `afterSeal` (kinds `charge` / `reversal`, `relatedWeekKey` = W), and the totals don't change;
   - a new tag charge in an **earlier open** week changes the live `tagAccount.openingMinor`, but **not** `factsHash`, and check 4 for W stays ok;
   - inserting a live charge into W directly (as postgres) makes check 4 for W fail.
5. **Hash sensitivity:** on an open week, changing any one fact (a charge amount, an allocation's bearer, a payback amount) changes `factsHash`; reading twice without changes gives the same hash.
6. **Who may read:**
   - owner, active `fleet_manager` seat and active `fleet_accountant` seat can read;
   - a `fleet_viewer` seat → `FORBIDDEN`;
   - no seat (a driver) → `FORBIDDEN`;
   - expired accountant seat → `FORBIDDEN`;
   - a company-B token reads company B's (empty) week, never A's numbers;
   - no company in the token → `NO_COMPANY`;
   - non-Monday → `BAD_REQUEST`.
7. **Grants:**
   - `anon` and `service_role` can't EXECUTE `public.toll_v2_week_result`;
   - `authenticated` can't EXECUTE `toll_system.week_result_live`, `toll_system.week_result` or `toll_system.user_can_view_tolls`;
   - `service_role` can EXECUTE `toll_system.week_result`.

Add the file to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step). `pnpm test:toll` picks it up by name.

## Run (once; Docker Desktop open)
`pnpm test:toll`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Do not commit, branch or push. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
