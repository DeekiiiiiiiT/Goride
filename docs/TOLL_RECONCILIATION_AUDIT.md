# Toll Reconciliation Audit

Audit-only pass over the Toll Reconciliation workflow (landing page → period wizard),
covering `apps/fleet/src/components/toll-tags/reconciliation/*`,
`apps/fleet/src/hooks/useTollReconciliation*.ts`, `apps/fleet/src/utils/toll*.ts`, and the
backend in `supabase/functions/_fleet-server/toll_controller.tsx` +
`toll_period_controller.tsx`.

No code was changed. Findings are ordered by severity within each section.

---

## 1. Data integrity bugs

### 1.1 Confirmed: duplicate/synthetic "cash" toll rows inflate Toll Spend (already found this session)
Vehicle `5179KZ`'s `fleet_toll_ledger` rows with `payment_method = 'cash'`, `metadata.source =
'migration'`, `metadata.originalCategory = 'Tolls'` are almost certainly not real tolls:
- The display `plaza` column has **12+ different capitalizations/spellings** of "Transjam(aican)
  Highways" going back to Dec 2025 (`Transjam Highways`, `TransJam Highways`, `TransJamaican
  Highways`, `TransJamaica Highways`, `TRANSJAM Highways`, `TransJama Highways`,
  `TRANSJAMAICA HIGHWAYS`, …) — not a pattern a real toll-operator export produces.
- Most reference fabricated trip ids (`manual_3b9dfd47`, `manual_ff614ea2`, …) instead of real
  trip UUIDs.
- At least one row has a corrupted field (`vehicleClass: "W03"`, a lane code, not a class).
- They land in tight multi-row bursts with no `batch_id`, unlike the legitimate tag-statement
  import (which always carries a `batch_id`).
- One exact duplicate is provable: two rows (`3c282f73…`, `419794d1…`) share identical
  `lane`, `collector`, `metadata.plaza`, and matched-trip candidate, but different underlying
  ledger ids and import timestamps 4 days apart. The same signature (same
  date+amount+lane+collector, different ids/timestamps) recurs at least 3 more times across the
  full history (Apr 5, Apr 6–7, May 15 2026) — this is a recurring leak, not a one-off.

**Action needed:** find and stop whatever process is writing these rows (search for a
demo/seed/test-fixture script pointed at production, or a legacy "Expense Tracker" migration path
that re-runs periodically). Until stopped, every week's Toll Spend / Net Toll Loss number is
overstated by whatever this batch contributes that week.

### 1.2 `/toll-ledger/backfill` de-dup only works within a single source record
`toll_controller.tsx:4288-4399`. `transactionToTollLedgerServer` sets the new ledger row's `id` to
the *source* `transaction.id` (`toll_controller.tsx:3711`, `:3763`), and the backfill's
`skipExisting` check compares against previously-migrated ledger ids
(`toll_controller.tsx:4332-4336`). This correctly no-ops on a literal re-run of the same source
row. But it does **nothing** to catch two distinct source `transaction:*` records that describe
the same physical toll (different `tx.id`, identical toll details) — which is exactly the shape
of the 1.1 duplicates. There is no content-based dedup key (e.g. `date + amount + lane + collector`
or `date + amount + plaza + paymentMethod`) anywhere in the import path.

### 1.3 Two different "is this toll in the period" implementations that can disagree
- `useTollReconciliation.ts:32-41` (`inPeriodFleetDay`) — used to trim the hook's fetched rows to
  the period.
- `tollWeekPeriod.ts:382-388` (`isTollInWizardPeriod` / `tollWeekKey`) — used everywhere else
  (`pReconciledInPeriod`, `underpaidReconciledTolls`, `buildPeriodTollIdSet`, claim/dispute
  scoping, `assertTollInWizardPeriod`).

`ReconciliationWizard.tsx:1005` builds `periodTolls` (the array that feeds the Toll Spend card)
from `pUnreconciled`/`pReconciled` — the hook's `inPeriodFleetDay`-trimmed set — **not** the
`isTollInWizardPeriod`-filtered `pReconciledInPeriod` that every other computation in the same
file uses. On any toll that these two date functions disagree about (DST edges, a toll dated with
a bare `yyyy-MM-dd` vs one with a time component), the **Toll Spend card can show a different set
of tolls than the Underpaid/Dispute/gating pipeline in the same screen** — i.e. the totals at the
top of the page and the rows in the tabs below could silently stop agreeing with each other for a
given edge-case toll.

### 1.4 `toll_period_controller.tsx` and the client duplicate the same business rules in two languages
The file's own header comment admits this: "Deno runtime cannot import the client's utils bundle
… the small set of rules this endpoint needs are mirrored locally below, each with a comment
pointing at its client twin that must be kept in sync." That's true of ~10 functions
(`isDisputeRefundMatched`, `isActionablePartialShortfallServer`, `hasMatchedDisputeRefundServer`,
`isTollCoveredByDisputeRefundServer`, `isVisiblePartialShortfallClaimServer`,
`applyUnderpaidClaimCounts`, `resolveClaimDate`, `weekKeyFor`, etc.), each a hand-copied
reimplementation of a client function with no shared test asserting they stay identical. Any
future change to one of the client-side rules (e.g. in `tollWeekPeriod.ts` or
`tollPeriodGating.ts`) silently drifts from the server's period-list counts unless someone
remembers to edit both — this is exactly the class of bug that produced 1.3.

### 1.5 `_legacyTransactionId` and top-level `plaza` vs `metadata.plaza` can disagree, silently
In the confirmed-duplicate rows (1.1), the ledger's own `plaza` column ("Transjam Highways") does
not match `metadata.plaza` ("Vineyards West"/"Vineyards East"). Nothing in the read path
reconciles these two fields or flags the mismatch — the UI trusts the top-level `plaza` column for
display, so a bad importer can write a nonsense `plaza` string while the "real" plaza sits unused
in `metadata`. Worth a data-quality check (or a NOT NULL/consistency constraint) that the two
agree, or a periodic health-check query.

---

## 2. Performance — "takes 2 minutes to load"

### 2.1 `GET /toll-reconciliation/periods` always scans full org history, unscoped
`toll_period_controller.tsx:302-328`. On every visit to the landing page this endpoint:
- Loads **every** toll ledger row + **every** trip via `loadAllTollLedgerWithTrips()` (no date
  bound at all — see the function's own comment "Toll ledger stays unbounded").
- Loads **every** claim via `loadAllByPrefix("claim:")` (sequential 1000-row-page loop,
  `toll_controller.tsx:1155-1186`).
- Loads **every** dispute refund via `loadDisputeRefundRecords()`.
- Loads up to **100,000** canonical ledger events via `listAllUnifiedCanonicalEvents` (
  `toll_period_controller.tsx:292-299`).
- Only *after* all of that is loaded does it filter by `driverId` (`:311-313`, `:321-322`, `:325`,
  `:328`) — selecting a single driver on the landing page does not reduce the actual DB/network
  work at all, it just throws most of it away after fetching it.

This is architecturally O(all-time data for the whole org) on every single page load, with no
caching layer. On this project's current tiny dataset (11.4k KV rows total) it's fast, but it is
exactly the shape of endpoint that goes from "fine in dev" to "2 minutes in production" as a real
fleet's history grows — there is no upper bound and no incremental/cached path.

### 2.2 `computeTollFleetLossForPeriod` re-filters the entire event set once per period
`toll_period_controller.tsx:494-498` calls `computeTollFleetLossForPeriod(scopedFleetLossEvents,
…)` inside a `.map()` over every period. That function
(`tollFleetLossNetting.ts:144-165`) does a full `.filter()` pass over the *entire* events array
(up to the 100k rows from 2.1) on every call. With P periods and E events this is O(P × E) instead
of O(E) (bucket events by week once, then look up). For a fleet with a year of history and tens of
thousands of toll-adjacent ledger events, this is the single most likely quadratic-ish cost center
in the endpoint.

### 2.3 The wizard re-derives Net Toll Loss from scratch instead of trusting what the server already sent
`ReconciliationWizard.tsx:119-147`. `period.financials.netTollLoss` is already computed
server-side by the exact-same-formula endpoint in 2.1/2.2 and passed in as a prop. Despite that,
opening a period wizard fires a **second**, independent computation: a sequential pagination loop
(`for i of 40`, up to 40 sequential awaited `api.getCanonicalLedgerEvents` calls, 500 rows each,
20,000-row hardcoded cap) that re-fetches the same class of canonical events and re-runs
`computeTollFleetLossNetting` client-side. This is pure duplicated work on every single period
open, and it's a sequential-await loop, not parallelized — for any period with more than 500
relevant events it directly adds N/500 sequential round trips to the wizard's load time.

### 2.4 `useTollReconciliation.fetchData` is a "parallel" Promise.all where two branches are secretly sequential chains
`useTollReconciliation.ts:236-282`.
- `fetchFleetTimezone()` is `await`-ed **before** the `Promise.all` even starts (`:251`) — a fully
  blocking round trip that isn't parallelized with anything.
- Inside the `Promise.all`, `fetchAllUnreconciled` (`:82-110`) and `fetchTripsInRange` (`:61-79`)
  each run their own internal `while(true)`/loop of sequential, awaited page fetches (100 rows and
  500 rows per page respectively). So the "8 parallel requests" is really "6 parallel requests + 2
  parallel *chains* of sequential requests" — the wizard's load time is bounded by whichever of
  those two chains is longest, not by a single round trip.

### 2.5 Every mount fans out into several more independent, uncoordinated network calls
On top of 2.3 and 2.4, opening a period wizard also independently fires, with no shared
loading/coordination:
- `useClaims()` — its own fetch.
- `RematchCandidatesQueue` (`RematchCandidatesQueue.tsx:22-45`) — its own `useEffect` fetch,
  rendered unconditionally above the stepper.
- `repairUnlinkedApplySplits` (`ReconciliationWizard.tsx:880-899`) — a POST to
  `/toll-reconciliation/unlinked-refunds/repair-split`, fired unconditionally on every mount for
  every period, not gated behind "only if there's something to repair."
- `TollAutomationSettings` — renders in the header on every mount and fetches automation settings.

None of these are batched, deduped, or gated behind a single loading state — the perceived load
time is the sum/max of an uncoordinated fan-out of 10+ independent requests (landing-page load,
then this fan-out again every time a period is opened), several of which are themselves internally
sequential (2.2–2.4). This combination is the most likely explanation for multi-minute loads on a
fleet with real history, even though nothing here is a single "smoking gun" query.

### 2.6 No caching/memoization between landing page and wizard
The landing page already computed `period.financials` and `period.counts` server-side
(2.1). Opening the same period in the wizard throws all of that away and recomputes an
overlapping-but-not-identical version of the same numbers client-side from raw rows. There's no
shared cache (React Query is present in the codebase — `useQueryClient` is imported in
`ReconciliationWizard.tsx` — but only used for invalidation, not for caching any of this section's
own reads).

---

## 3. Correctness / UX bugs

### 3.1 `repairUnlinkedApplySplits` runs unconditionally on every mount, for every period, silently
`ReconciliationWizard.tsx:880-899`. This "repair" call runs every time *any* period is opened, not
just when something is actually out of sync. Combined with 2.5, it's both a performance and a
correctness smell — a repair job that runs unconditionally on every read path suggests the write
paths that create the inconsistency in the first place aren't fully trusted, and masks the
underlying bug rather than fixing it.

### 3.2 Suggestion source drifts after an in-session unreconcile
`useTollReconciliation.ts:395-429` (`unreconcile`). Initial suggestions come from the server via
`convertServerSuggestions` (rich fields: `confidenceScore`, `vehicleMatch`, `driverMatch`,
`dataQuality`, `windowHit`, `isAmbiguous`, `reasonCode`). After an unreconcile, suggestions for
that one toll are instead regenerated **client-side** via `findTollMatches(updatedTx, trips)`
(`tollReconciliation.ts:84+`), which does not populate the same enrichment fields the server
suggestion does. A toll unreconciled mid-session can show a suggestion card with different
confidence/quality signals than the same toll would show on a fresh page load — until the next
full `fetchData()` call overwrites it.

### 3.3 `"Test"` button ships in the reconciliation wizard header for all users
`ReconciliationWizard.tsx:107-111, 1343-1345`. `handleRunTest` calls `runScenarioTest()` and pops
a plain `alert()` with the result — a raw dev/QA scaffolding control with no visibility gate
(no env check, no permission check), sitting in the same button row as "Link all ready" and
"Reset Period" for every fleet admin. At minimum this should be hidden outside non-prod
environments; an `alert()` in production React code is also just bad UX on its own.

### 3.4 `Vineyards East` toll amount inconsistency between payment methods
Not confirmed as a bug, but worth a manual check: the legitimate tag-statement batch prices
"Vineyards East" at **-$780** (`toll_ledger` batch `be49c887`), while the suspect cash rows in
1.1 price the same "Vineyards East/West" crossing at **-$850**. If these are ever meant to
reconcile 1:1 (e.g. cash fallback should match the tag price for the same plaza/class), the $70
delta per crossing across many weeks adds up and should be checked against the toll operator's
actual posted rate card.

### 3.5 `useTollReconciliationPeriods` has no error/backoff differentiation for partial failures
`useTollReconciliationPeriods.ts:67-89`. A single failed `getTollReconciliationPeriods()` call
sets `loadError` and stops — reasonable — but there's no retry/backoff, and the landing page's
`refresh` is the only recovery path (`PeriodLandingPage.tsx` doesn't surface a "Retry" affordance
tied to `loadError`, only a static error message). A transient timeout on the expensive 2.1 query
currently reads to the user exactly like "the fleet server is down."

---

## 4. Maintainability / risk (not bugs today, but will produce bugs)

### 4.1 Business rules duplicated 2–3x with no shared tests
Beyond 1.4, the same "actionable vs informational", "matched dispute refund", "period week key"
rules appear in: `tollPeriodGating.ts` (client), `tollWeekPeriod.ts` (client), and
`toll_period_controller.tsx` (server, Deno-only reimplementation). There is no automated test
asserting the client and server versions produce identical output for the same input. Every
"Mirrors X" comment in the server file is a manual promise, not an enforced one.

### 4.2 Hardcoded pagination caps scattered through the fetch paths
`fetchAllUnreconciled`'s page loop has no hard cap (relies on `hasMore`); `getTollReconciled`/
`getTollUnclaimedRefunds` are capped at `limit: 1000`; the wizard's canonical-events loop caps at
`40 * 500 = 20,000`; the period endpoint caps canonical events at `100_000`. These numbers aren't
derived from anything and aren't centralized — a fleet that legitimately exceeds any one of them
gets silently truncated data (e.g. "Reconciled" or "Unclaimed Refunds" quietly missing rows past
row 1000) with no warning surfaced to the user.

### 4.3 `PLATFORM_OPTIONS` excludes a platform the data model already supports
`ReconciliationWizard.tsx:59-60` — `PlatformFilter` and `PLATFORM_OPTIONS` only cover
`'all' | 'Uber' | 'InDrive' | 'Roam'`, but `tollFinancialOverview.ts`'s `PlatformBucket` already
models `'Unlinked'` as a first-class bucket (and the cards show an "Unlinked" split). There's no
way to filter the wizard down to just Unlinked-platform tolls even though the rest of the type
system supports it.

---

## Suggested priority order

1. **1.1 / 1.2** — find and kill the source writing synthetic "Transjam Highways" cash rows; this
   is actively corrupting real financial totals every week.
2. **2.1 / 2.2** — scope the periods endpoint's loads by a bounded lookback window (or add a real
   cache) and pre-bucket fleet-loss events by week once instead of re-filtering per period; this
   is the architectural reason load time will keep getting worse.
3. **2.3 / 2.4 / 2.5** — collapse the wizard's redundant Net-Toll-Loss refetch and the
   uncoordinated fetch fan-out into the single `useTollReconciliation` load, and parallelize the
   two internally-sequential pagination loops.
4. **1.3** — pick one "is this toll in the period" function and use it everywhere in
   `ReconciliationWizard.tsx`, including for `periodTolls`.
5. Everything else in sections 3–4 as time allows.

---

## Remediation status (2026-08-25 — `fix/toll-recon-audit`)

| ID | Status | Notes |
|----|--------|-------|
| 1.1 | Done | Quarantine signature + exclude from spend/netting; dry-run `GET /toll-ledger/quarantine-report` (no hard delete) |
| 1.2 | Done | Content fingerprint on live write + backfill |
| 1.3 | Done | Toll Spend uses `filterTollsToWizardPeriod` + quarantine gate |
| 1.4 / 4.1 | Done | `tollPeriodMirrorParity.test.ts` golden contracts for mirrored rules |
| 1.5 | Done | Plaza SSOT on write (OCR plaza over highway merchant) |
| 2.1 | Done | 26-week lookback + keep actionable older periods; driverId/from/to on fleet-loss load |
| 2.2 | Done | Pre-bucket fleet-loss by week; `computeTollFleetLossFromEvents` |
| 2.3 | Done | Wizard trusts `period.financials.netTollLoss` (no client refetch) |
| 2.4 | Done | Timezone in `Promise.all`; larger unreconciled pages |
| 2.5 | Done | Lazy rematch/automation; repair gated on Unlinked signal |
| 2.6 | Done | Periods via React Query |
| 3.1 | Done | Repair only when unclaimed refunds + Unlinked counts |
| 3.2 | Done | Unreconcile waits for server suggestions (fleet + admin) |
| 3.3 | Done | Test button `import.meta.env.DEV` only |
| 3.4 | Documented | Vineyards East tag $780 vs cash OCR $850 — `isSuspiciousVineyardsCashRate`; ops rate-card check still manual |
| 3.5 | Done | Landing Retry wired to refresh |
| 4.2 | Done | `tollReconCaps.ts` + truncation banner |
| 4.3 | Done | Unlinked in platform filter |

**Still needs your OK:** hard-delete/archive of quarantined production rows after reviewing quarantine-report output.

