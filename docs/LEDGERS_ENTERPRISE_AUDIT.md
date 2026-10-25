# Ledgers Section — Enterprise Audit (Rev 2)

**Date:** 2026-10-25 · **Scope:** Business Finance → Ledgers · **Mode:** audit only, no code changed.
**Rev 2:** verifies the implementation of Rev 1. This document lists **open items only**.

## Verified done

- **Money:** cash counted once, refunds included in the tie-out, Uber toll taken from the statement, trip count = completed trips. Promotions are no longer posted, the Uber-style card is live, and "Net earnings (paid to bank)" is the footer.
- **Live data matches Uber:** `fleet.statement_week_rollup` returns Uber's numbers to the cent for Oct 5–11 and Oct 12–18 (Fare, Cancellation, Time at stop, Wait, Tip, Toll 2,535 / 4,910, Cash 22,470.65 / 19,139.16, Trips 45 / 61). UberX Priority is the residual and matches.
- **Server:** org and date filters now run in SQL, with a 5,000-row hard error and one call for the Earnings page. fleet-core v134 is deployed (18:25 UTC, after the edits).
- **UI:** one URL-backed period defaulting to the last full week, merged Fuel tab, money formatter, ARIA platform tabs, error + retry, empty platforms collapsed.
- **Cleanup:** dead code deleted (LedgerView, the unified "All" tab and its localStorage flag, the mapLedger… util), statementSummary types de-duplicated.
- **Checks:** finance-core 330/330 green (including the Oct 5 / Oct 12 goldens), fleet `tsc` = 464 (baseline), nightly control wired into finance-recon v30.

---

## Must fix before the next Uber CSV import

### L-01 · Critical · The importer double-counts Wait time, Time at stop, UberX Priority and Airport as "other"
- **Where:** `apps/fleet/src/utils/extractPaymentLedgerLines.ts:38-60` (`otherFareFromUberRow`), used by `csvHelpers.ts:1871`.
- **Cause:** the header is normalised with `.replace(/\s+/g, '')`, but `KNOWN_FARE_HEADERS` still contains spaces (`'fare:wait time at pickup'`, `'fare:time at stop'`, `'fare:uberx priority'`, `'fare:airport surcharge'`), so those four never match and are summed into `other` as well.
- **Reproduced:** a row with Wait 62.08, Stop 10 and Priority 30 gives `other = 102.08`. It should be 0.
- **Effect after the next import:** `fareBreakdown.other` → `trip_facts.fare_other` → the card's Fare block is overstated by Wait + Stop + Priority, and the import component-gap check flags every trip.
- **Fix:** normalise the known list the same way (strip spaces), and add a test that uses the real Uber header strings.

### L-02 · High · "Deposited on…" shows the previous week's deposit
- **Why:** Uber deposits on the Monday **after** the week. `buildStatementCards` only reads ledger rows inside Mon–Sun, so the `so.payout` row it finds belongs to the week before. Oct 12–18 would show "Deposited on 2026-10-12 · 67,384.03", which is Oct 5's money. The real one is Oct 19 · 33,757.62.
- The golden test dates its deposit Oct 19 with `bankRole` set, but production rows have neither, so the test does not catch this.
- **Fix:**
  - Read `actual_deposit` rows for end + 1 … end + 7.
  - Match a deposit to its week by amount = statement net (or by `periodStart`).
  - Backfill `bankRole='actual_deposit'` + `periodStart` on the 7 historical `so.payout` rows (Sep 28 → Oct 19).
  - Make the golden fixture use production-shaped rows.

### L-03 · High · A ✅ "Ties" badge appears when nothing was checked
- **Where:** `statementCard.ts:327-329`. When no bank row is observed, `tieOutDifference = 0`, so `ties = true`.
- **Affected:** every driver-scope card, every row of the driver table, and every Roam and InDrive card.
- **Fix:** use three states (`ties` / `off` / `not_checked`). Show "Not checked — no Uber deposit row" instead of ✅.

---

## Open — correctness

| ID | Sev | Issue | Fix |
|---|---|---|---|
| L-04 | Med | Driver cards drop that driver's Uber rows. `eventsForDriver` (`statementCard.ts:300`) filters by the trip_facts driver ID (Roam UUID `73e5b1dc…`), but `payout_cash` and `REFUNDS_TOLL` rows use the Uber driver UUID (`52ff47da…`). Driver cards always fall back to trip cash and trip toll and are never observed. The values match today only by coincidence. | Pass the expanded ID variants (`expandStatementSummaryDriverIds`) into `assemblePlatformStatement` and filter on the set. |
| L-05 | Med | Organisation UUID hard-coded in shared finance code (`statementCard.ts:109`). | Remove after the L-02 backfill; rely on `bankRole` only. |
| L-06 | Med | Clicking a statement line only filters the Trip Ledger if that tab was never opened. `TripLedgerPage` reads `platform` / `status` from the URL in `useState` init only, and the tab stays mounted. A stale `page=` param also carries over. | Listen to `popstate` in `TripLedgerPage`, re-read the filters and reset page to 0. |
| L-07 | Med | Roam and InDrive cards are wrong. (1) The InDrive "service fee" reads `statementTollExpense`, which is always 0. (2) Roam "Net to fleet" = fare − cash, so it shows 0 for cash trips, and there is no commission line. (3) The migration set `net_to_driver = amount` on all 214 Roam trips (no commission field exists), so the Trip Ledger shows gross as "Net income". | Add the platform fee to the rollup (InDrive `indriveServiceFee`, Roam commission from the pricing rules). Until it exists, show "Net — no commission recorded", not a number. |
| L-08 | Med | "Carried from week" never appears. Nothing writes `trip.carriedFromWeek`, and there are 0 rows in the DB. | Set it where closed-week Uber differences are posted into the open week (commit 98e4832d path / `uber_locked_week_gaps_open_week`). |
| L-09 | Med | The Fuel Expenses server reads at most 500 rows and then pages in memory (`register_residual_monolith_routes.tsx:2409-2445`), so totals are silently wrong above 500. The fills tie-out sums only the first 500 fills in the browser. Search and export are still missing. | Push limit/offset and SUM into SQL, return a `truncated` flag, and add search + export like the other tabs. |
| L-10 | Med | `/ledger/statement-summary` still uses `requireAuth()` without `requireOrg`. With no org, the ledger query runs with no `organizationId` (all organisations, date window). The planned CI guard against unscoped calls was not added. | Use `requireAuth({ requireOrg: true })` and add an assert script in `ci.yml`. |

## Open — UX and cleanup (low)

- **L-11:** the driver table shows raw driver UUIDs; it should show names.
- **L-12:** these Rev 1 design items are not built yet:
  - week status chips (Imported / Reconciled / Closed)
  - last-import time when a card doesn't tie
  - week-over-week deltas
  - PDF export
  - a Fleet/Driver scope toggle on Ledgers (it was removed; only the Earnings overlay has driver scope)
  - an "(estimated)" marker on UberX Priority while `prioritySource = 'residual'`
- **L-13:** cleanup still to do:
  - the `@deprecated` shims in `apps/fleet/src/components/database/*`
  - the `periodWeekOptions.ts` copies in fleet and admin
  - the KV fallback for trip stats
  - the legacy toll alias fields still in `StatementCardModel`
  - 33 old Uber `promotion` ledger rows (now unused; leave them or reverse them through Week Reconciliation)

## Operational

1. **Commit:** all of this work is uncommitted, including the migration and the new finance-core files.
2. **Migration file versions:** fix these before any `supabase db push` or fresh replay.
   - Production recorded `statement_trip_facts` as **20261025182452**, but the repo file is `20261025140000_…`. Rename the file.
   - Two repo files share **20261025193000** (`explorer_profile_email` and `uber_locked_week_gaps_open_week`). Production has `explorer_profile_email` at **20261025135507**, so rename that file to match.
3. **Frontend:** the card file was edited after the edge deploy. Confirm the roamfleet.co bundle was redeployed; I couldn't check that from here.
4. **History:** the 11 fare-drift weeks and 4 toll-drift weeks are marked "historical" by the nightly control. Oct 12's ledger still lacks the 52.50 cancellation; per-trip cancellation rows only appear on the next import or re-projection. The card is correct because it reads trips. Any restatement goes through Week Reconciliation with the owner's approval.

## Exit checks

- Re-import the Oct 12 CSV in staging. Expect `other = 0` on every trip and Fare block = 52,933.27 (L-01).
- The Oct 12 card shows "Deposited Oct 19 · 33,757.62 ✅" (L-02).
- The Kenny driver card shows "Ties" only when a driver-level bank row exists; otherwise it shows "Not checked" (L-03, L-04).
- Statement → Cancellation opens the Trip Ledger with 4 cancelled trips even after the Trip tab was visited (L-06).
