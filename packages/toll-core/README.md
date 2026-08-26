# @roam/toll-core

Pure TypeScript toll domain helpers shared by fleet, admin, driver, and Deno edge.

**No React, no DOM, no sonner.** Apps thin-reexport from this package so call sites keep working.

## Fleet is canonical

When historical forks disagreed, fleet wins:

| Topic | Decision |
| --- | --- |
| `isTollCategory` | Usage / plaza charges only (`toll usage`, `tolls`, `toll`). Does **not** include top-ups or refunds. |
| `isTollLedgerCategory` | Broader matcher for Tag section / Toll Logs — includes top-up, refund, adjustment. |
| Orphan / personal-use | Undateable or unmatched orphan tolls are **not** auto-treated as the driver's personal expense. Use `classifyOrphanToll` (fleet semantics, including `ORPHAN_NEARBY_UNEXPLAINED`). |
| Date parsing | `parseTollDate` / `getTollTransactionDate` — bare `yyyy-MM-dd` is local calendar day (never UTC midnight). Wall-clock helpers `ymdToLocalDate` / `normalizeWallClockTime` live here. |
| Ledger types | Fleet `TollLedgerRecord` shape (incl. unlinked-refund fields). App-local `transactionToTollLedger` / `tollLedgerToTransaction` stay in apps when they need `FinancialTransaction` + plaza integrity helpers. |
| Official rates | Pure schedule migrate / select / publish / resolve from fleet `officialTollRate`. |

## Parity

Run `node scripts/check-toll-core-parity.mjs` (also in CI) to ensure app/edge shims stay re-exports rather than forked bodies.

## Deno

Edge may import source files via relative path, e.g.:

`../../../packages/toll-core/src/orphanTollClassifier.ts`

## Admin `useTollLogs`

Not unified into this package (React + fleet-only plaza/void helpers). Admin keeps a local hook fork; category kind uses `tollLogKindFromTx` from this package via the admin category helper re-export.
