# Courier Cash: Missing Column Audit

**Status:** Fixed and checked in production, 2026-10-14
**Project:** GoRide (`csfllzzastacofsvcdsc`)
**Where you saw it:** Roam Rush Ops → Money → Courier cash

---

## 1. What you saw

The Courier cash page showed a red error:

> column courier_remittance_accounts.threshold_source does not exist

Production logs show this error many times on 2026-10-14, the last one at 15:05 UTC.
They stop after the fix went in at 15:26 UTC.

## 2. The cause in one sentence

The code expected two database columns that were **never added to production**.
The code was correct. The database was missing changes the code relied on.

## 3. How it happened

On 2026-09-15 the Courier cash work was finished in code and marked "Landed".
Two of its database changes never reached production:

| Change file (in the repo) | What it adds | In production before the fix? |
|---|---|---|
| `20260915180000_remittance_exceptions_courier_fleet_id.sql` | `courier_fleet_id` on the COD exception queue | **No** |
| `20260915210000_remittance_threshold_source.sql` | `threshold_source` on courier cash accounts (records whether the pause limit is the default or set by hand on the desk) | **No** |

The clue is in production's change history. At 21:16 that day, someone ran a change
called `remittance_pgrst_reload`. It only told the API to **refresh its view of the
database**. But the column it was meant to pick up had never been created.
The refresh made it look finished when it wasn't.

Why nothing caught it:

- Changes were applied to production through the Supabase connection, which stamps
  them with **new timestamps**. So the repo's file numbers and production's history
  never match, and "is everything applied?" can't be answered by comparing the two.
- The earlier reviews checked the code and the tests, which run on a fake database.
  Neither one looked at production's actual tables.

## 4. What it broke (more than one page)

Every part of the system that reads a courier's cash balance asks for `threshold_source`.
So every one of these would have failed in production:

| What | Where in code | What would happen |
|---|---|---|
| Courier cash page (Balances, Reports) | `admin/pricingRoutes.ts:1337` | The error you saw |
| Confirming an "I've paid" report | `remittance/settleRemittance.ts:104` | Can't confirm, balance never moves |
| Write-offs | `remittance/writeOffRemittance.ts:101` | Can't write off |
| Stopping a courier who holds too much cash | `remittance/pauseGate.ts:26` | Check errors out for every courier |
| Recording cash on a cash delivery | `remittance/collectOnDelivery.ts:140` | Collection fails (see below) |
| Courier app balance | `courierConsumerRoutes.ts:1517` | Courier can't see what they owe |

**The worst case was a hidden one.** When recording a cash collection fails, the code
is supposed to save it to an exception queue so a person can fix it. But saving to that
queue needs `courier_fleet_id`, the *other* missing column. And the code didn't check
whether that save worked. So a failed cash collection would have **disappeared with
no record anywhere**.

**No money was lost.** The last cash entry is from 2026-09-15 17:02 UTC. No orders
have been delivered since. The exception queue is empty, and there is 1 courier account
with a 0 balance. The problems were waiting for the first live cash delivery.

## 5. What was done

### 5.1 Database (production)

Applied both missing changes in their original order. Both only **add** things, and both
are safe to run more than once.

1. `remittance_exceptions_courier_fleet_id`: adds `courier_fleet_id`.
2. `remittance_threshold_source`: adds `threshold_source` (default `'seeded'`), a rule
   allowing only `'seeded'` or `'override'`, and updates `apply_remittance_event` so
   new accounts are marked `'seeded'`.

Before applying, the live `apply_remittance_event` was compared with the new one.
The only difference is the `threshold_source` stamp, so nothing newer was overwritten.

### 5.2 Code: a failed exception save can no longer go unnoticed

- `supabase/functions/delivery/remittance/exceptions.ts`: `parkException` now checks
  the result of every database call and throws if the row wasn't saved.
- `supabase/functions/delivery/remittance/collectOnDelivery.ts`: if saving the exception
  also fails, it logs `[COD] collection lost — park failed` with the order, the courier
  and both errors, and returns `park_failed` instead of falsely claiming `parked`.
  Delivery still never fails because of cash bookkeeping. That rule (D-7) is kept.

### 5.3 A check that would have caught this

- `supabase/tests/remittance_schema_checks.sql`: lists every column the Courier cash code
  uses, and also checks the `threshold_source` rule and the function stamp. It only reads,
  so it is **safe to run against production**. It stops with an error naming any column
  that is missing.
- Run it: `supabase db query --linked -f supabase/tests/remittance_schema_checks.sql`
- **Rule:** when Courier cash code starts using a new column, add it to this file in the
  same commit.

### 5.4 Docs

- `docs/CASH_ARCHITECTURE_ONBOARDING.md`: added a correction to the change log. "Landed"
  meant landed in code, not in production.

## 6. Proof it works

| Check | Result |
|---|---|
| Columns exist in production | Yes. The 1 existing account reads `threshold_source = 'seeded'` |
| `apply_remittance_event` stamps the column | Yes |
| `threshold_source` rule exists | Yes |
| Both changes recorded in production history | `20261014152639 remittance_exceptions_courier_fleet_id`, `20261014152645 remittance_threshold_source` |
| API request for the exact columns the desk asks for | **HTTP 200** (was HTTP 400 "column does not exist") |
| New schema check on production | Passes |
| Same check with a made-up column | Fails with `missing delivery.courier_remittance_accounts.zz_fake_column`, so the check really catches gaps |
| Courier cash tests (Deno, with type checking) | **21 passed, 0 failed**, including 4 new `parkException.test.ts` tests |

## 7. Still open

| # | Item | Why it matters | Suggested next step |
|---|---|---|---|
| O-1 | **50 repo change files have no matching name in production's history.** None are Courier cash. Production has 46 `history_align` / `history_align_rename` entries from an earlier clean-up that renamed old changes, so most of the 50 are probably renamed, not missing. That isn't proven. | The same kind of gap could exist elsewhere, e.g. fuel, tolls, rides or vehicle catalog. | Check each one by looking for the actual table or column it creates in production, not by name. The list can be regenerated by comparing `supabase/migrations/*.sql` names with `supabase_migrations.schema_migrations.name`. |
| O-2 | The schema check is not in automatic CI yet. | It only helps if someone runs it. | Add it as a step that runs against production after each deploy, or run it by hand before each release. |
| O-3 | Commit and deploy the code changes. | The database fix is live. The code change in 5.2 is only on your machine: the deployed `delivery` function still ignores a failed exception save. Now that the column exists, that save works, so this is protection against the next gap, not a live bug. | Commit the files in section 8, then deploy the `delivery` edge function. |

## 8. Files changed

- `supabase/functions/delivery/remittance/exceptions.ts`
- `supabase/functions/delivery/remittance/collectOnDelivery.ts`
- `supabase/functions/delivery/remittance/parkException.test.ts` (new)
- `supabase/tests/remittance_schema_checks.sql` (new)
- `docs/CASH_ARCHITECTURE_ONBOARDING.md`
- `docs/courier-cash-schema-drift-audit.md` (this file)

## 9. Lesson

**"Landed" has to mean "checked in production", not "the code and tests are done."**
Tests run on a fake database, so they can't see a change that never reached the real one.
Any feature that adds a column should end with a check like section 5.3 run against
production.
