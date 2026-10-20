# Week Reconciliation — Guided Wizard & Service-Line Split

**Audit + target architecture · Rev 1 · 2026-10-19**
**Scope:** Business Finance → Week Reconciliation (`/week-reconciliation`), the CSV imports that feed it, Close Week, Driver Settlements and Courier Settlements.
**Status:** Audit only. No code was changed. Prod was read with `SELECT` statements only (project `csfllzzastacofsvcdsc`).

---

## 0. Executive summary

**What you asked for:** a wizard that takes a user from "pick a week" to "week closed". It should tell them what to upload, in what order, and when to go into the Fuel and Toll lanes. Rideshare and Delivery should be reconciled separately, the same way Driver Settlements and Courier Settlements are separate.

**What the audit found:** the lanes themselves are in good shape. Fuel and Tolls each already have a hard-gated step wizard (`fuelPeriodGating.ts`, `tollPeriodGating.ts`). Close Week already has a single vocabulary for blockers, plus seal, freeze and reopen. **What's missing is the layer underneath the lanes: the system has no idea whether a week's input data has arrived.** Nothing records "the toll usage CSV for Oct 5–11 is in", so nothing can tell the user it's missing. A week with no toll data reconciles to $0 and passes as clear.

Three facts from prod decide the design:

| # | Fact (measured 2026-10-19) | Why it matters |
|---|---|---|
| 1 | `fleet.trips.service_line` is **NULL on all 3,804 trips**. `fleet.toll_ledger.service_line` is **NULL on 219 / 337 rows (65%)**, including all 11 top-ups. Fuel is 546/546 attributed because it got a resolver. | A Rideshare/Delivery split can't be built on columns that are empty. Attribution has to come first. |
| 2 | `fleet.import_batches` holds only `merged_import` (Uber bundle) and `trip_reimport`. **Toll usage, toll top-up and fuel statement imports never create a batch record.** | Coverage for 3 of the 5 sources you listed can't be computed today. |
| 3 | No `rush_delivery` trips exist (`RUSH_TRIP_PROJECTION` is off). Courier Settlements is a rolling "last 7 days" query capped at `.limit(2000)`. | The Delivery track has nothing to reconcile yet. Build the framework for both lines, but put Delivery behind its prerequisites (§7). |

**Recommendation:** don't rewrite the lanes. Add one new concept, the **Reconciliation Run**, keyed by `(organization, service_line, week_key)`. It owns three things:

1. **Sources.** A list of required inputs per org, computed from a manifest. Each source has coverage per day, built from the actual rows rather than from upload claims.
2. **Steps.** The existing Fuel and Toll wizards, embedded and scoped to one line, plus three new steps: Attribution, Trips & Earnings, Tag Account.
3. **Close.** The existing Close Week flow, scoped to one line, with new `SOURCE_*` blockers.

The wizard is a UI over that run. Every gate is evaluated on the server; the browser never decides a step is complete.

---

## 1. What "fully reconciled" means for a week

A week is fully reconciled for a service line when **all five** of these are true:

1. **Complete.** Every required source covers every day of the week (Mon–Sun, `America/Jamaica`, per ADR 0007 in `packages/finance-core/src/periodKey.ts`). A day with no rows counts only if it is covered by a statement whose period includes that day, or if someone has attested that there was no activity.
2. **Attributed.** Every money row in the week has a service line or has been explicitly resolved. `Rideshare + Delivery + Unattributed = Total` holds, and Unattributed = 0.
3. **Lane-clean.** The Earnings, Tolls and Fuel lanes have no actionable items left, and each step's inputs haven't changed since it was completed.
4. **Tied.** Lane statements tie to the engines. This is the existing `checkCloseInvariants` set: `TOLL_IDENTITY_UNBALANCED`, `FUEL_ENGINE_DRIFT`, `EARNINGS_GROSS_IDENTITY`, `SETTLEMENT_PNL_MISMATCH` and so on.
5. **Signed.** Close Week has frozen the driver periods (or courier statements) and written the lock.

Items 3–5 already exist. Items 1 and 2 don't, and they are what this audit specifies.

### 1.1 Input inventory — Rideshare

| # | Source | How it arrives today | Where it lands | Required? | Covers |
|---|---|---|---|---|---|
| R1 | **Uber weekly bundle**: `trip_activity`, `payments_transaction`, `payments_driver`, `payments_organization` (required) + 5 analytics files (optional) | Data Center → Platform → Uber (`ImportsPage.tsx`, merged flow) | `fleet.trips`, payment ledger lines, canonical events, `fleet.import_batches` (`merged_import`) | Yes, if the org has Uber drivers | Earnings, cash, Uber toll reimbursements |
| R2 | **InDrive trip export** | Data Center → Platform → InDrive | `fleet.trips` (`platform='InDrive'`) | Yes, if the org has InDrive drivers | Earnings |
| R3 | **Roam trips** | Native, written by the driver app | `fleet.trips` (`platform='Roam'`) | Automatic, no upload | Earnings |
| R4 | **Toll usage (tag account statement)** | Data Center → Toll → Toll Usage (`BulkImportTollTransactionsModal`, mode `usage`) | `fleet.toll_ledger` (`type='usage'`, `tag_balance`) | Yes, if any vehicle has a tag | Toll spend |
| R5 | **Toll top-ups** | Data Center → Toll → Toll Top-up (same modal, mode `topup`) | `fleet.toll_ledger` (`type='top_up'`) | Yes, if any tag was funded | Tag account balance |
| R6 | **Cash tolls** | Driver-submitted / manual (174 of 203 cash rows have no batch) | `fleet.toll_ledger` (`cash`) | Automatic, review only | Toll spend |
| R7 | **Fuel card statement, Roam-issued card** | **Uploaded by Roam**, not by the fleet (`ImportsPage.tsx:1657`) | `fleet.fuel_entries` | Yes, if the org has Roam cards | Fuel spend |
| R8 | **Fuel card statement, own card (self-serve)** | Data Center → Fuel, only when `hasSelfServeJaa` | `fleet.fuel_entries` | Yes, if self-serve. *Not fully built; placeholder only, per your note.* | Fuel spend |
| R9 | **Cash fuel / receipts** | Driver app (OCR) | `fleet.fuel_entries` | Automatic, review only | Fuel spend |

### 1.2 Input inventory — Delivery (Roam Rush)

| # | Source | State today |
|---|---|---|
| D1 | **Rush deliveries** projected into `fleet.trips` (`service_line='rush_delivery'`) | Projection is off, so prod has 0 rows |
| D2 | **COD remittance** (courier ↔ Roam, Layer A′) | Live, but intentionally separate from fleet settlement (`scripts/check-remittance-separation.mjs`). Recon may **display** it and must never settle it. |
| D3 | **Courier fuel** | Blocked: courier vehicles live in `delivery.courier_vehicles`, not `fleet.vehicles` (fuel split audit, Q1) |
| D4 | **Courier tolls** | Same vehicle problem as D3 |
| D5 | **Fleet-owner tier-2 cut on courier gross** | Earnings-policy engine. Courier Settlements shows gross only |

### 1.3 Dependency order (why the wizard has an order at all)

```
 Trips (R1,R2,R3) ──┬──► Toll matching (trip ↔ toll, refunds, deadhead) ──┐
                    │                                                      │
 Toll usage (R4) ───┘                                                      ├──► Settlement preview ──► Close
 Top-ups (R5) ──────────► Tag account roll-forward ───────────────────────┤
                                                                           │
 Fuel stmt (R7/R8) ─┬──► Fuel recon (data quality → … → finalize) ────────┘
 Odometer/trips ────┘
```

**Uploads can happen in any order.** Forcing "upload trips, then tolls" adds friction and doesn't improve correctness. **Reviews can't happen in any order:** Toll review needs trips and toll usage, and Fuel review needs the fuel statement. Correctness comes from two rules: (a) a step can't start until the sources it reads are complete, and (b) a step goes **stale** when any of those sources changes afterwards (§4.6). The wizard *recommends* an upload order and *enforces* a review order.

---

## 2. What exists today

| Piece | File | State |
|---|---|---|
| Hub page | `apps/fleet/src/components/fleet-financials/WeekReconciliationPage.tsx` (157 lines) | Two tabs (Fuel, Tolls) that lazy-mount the full lane pages. No shared week and no sources. |
| Fuel lane | `pages/FuelManagement.tsx` (2,846) + `utils/fuelPeriodGating.ts` | Period landing (your screenshot) and a 6-step hard-gated wizard. State lives in `public.fuel_reconciliation_period` (34 rows). |
| Toll lane | `components/toll-tags/reconciliation/ReconciliationDashboard.tsx` → `ReconciliationWizard.tsx` + `utils/tollPeriodGating.ts` | Its own period landing and a 6-step hard-gated wizard. **`public.toll_reconciliation_period` has 0 rows** in prod. |
| Gate machine | `computeGatedStepStates` (toll) and `computeFuelGatedStepStates` (fuel) | The same algorithm, written twice, client-side. |
| Close Week | `pages/CloseWeekPage.tsx` (1,692), `services/weekCloseApi.ts`, `utils/weekCloseBlockers.ts` | Lanes `fuel/toll/settlement`, a blocker vocabulary, preview/sync/close/reopen/retry-freeze. Lock key `(org, week_key)`. |
| Imports | `components/imports/ImportsPage.tsx` (3,110) | One catalogue for every import. Uber/InDrive bundle merge is client-side. Toll is a separate modal. |
| Driver Settlements | `DriverSettlementsPage.tsx` (2,533) | Mature, with service-line filter pushed into SQL (`dfp_service_line_matches`). |
| Courier Settlements | `components/couriers/CourierSettlementsPage.tsx` (180) | Read-only summary. No week, statement, close or lock. |

**Lessons the codebase already records** (don't re-learn these):
- Correct engine numbers break at *boundaries*: where they are persisted, paged, totalled or gated (settlement audit).
- Attribution is a fact and allocation is a policy; never merge the two. Every screen should show `R + D + U = Total` (fuel split audit).
- An SQL check is only as good as the writers that keep its input up to date (settlement audit, N-8).
- Gate on `tsc`. Vitest strips types and esbuild doesn't typecheck (three occurrences). Deno tests must be listed in `ci.yml` by name.

---

## 3. Findings

Severity: **Critical** means money can be closed wrong or the requested feature can't be built. **High** means wrong numbers or lost data are possible. **Medium** means friction or a latent risk.

### WR-C1 — Nothing knows whether a week's inputs have arrived · Critical
**Evidence:** `weekCloseApi.preview()` returns `fuel`, `toll`, `blockers`; none of them concern input completeness. `import_batches` only records trip bundles. No table, view or endpoint answers "is toll usage for 2026-10-05 in?". The closest thing is `TOLL_STALE_ZERO_SEAL`, which catches tolls that arrive *after* a $0 seal. That is the same problem discovered after the damage.
**Failure:** someone forgets the toll usage CSV for a week. Toll identity is `0 − 0 − 0 − 0 = 0`, so the lane is "Clear". Fuel and earnings tie, and the week closes. When the CSV arrives later, it needs a reopen and a restatement, possibly after the driver has already been paid.
**Fix:** source requirements + coverage (§4.3–4.4) and the `SOURCE_*` close blockers (§4.8).

### WR-C2 — Service line is empty on trips and most tolls · Critical (for the split)
**Evidence (prod):**

| table | rideshare | NULL |
|---|---|---|
| `fleet.trips` | 0 | **3,804** |
| `fleet.toll_ledger` | 118 | **219** (153 cash usage, 55 tag usage, 11 top-ups) |
| `fleet.fuel_entries` | 546 | 0 |

Column added in `20260901130200_rush_fleet_bridge_phase2.sql`. Fuel was healed by a resolver hooked into `kv_store.tsx`. Trips and tolls never got one; the only toll write reference is in `toll_controller.tsx` (4 hits).
**Failure:** a line-filtered recon puts 3,804 trips in neither tab. If NULL is treated as rideshare, delivery rows land in rideshare as soon as Rush projection turns on.
**Fix:** §4.7. Trips are deterministic from `platform` (Uber/InDrive/Roam → rideshare, Roam Rush → rush_delivery) and need a trivial backfill. Tolls use a resolver chain with `service_line_source`, copied from fuel.

### WR-C3 — Toll CSV import is client-side, non-atomic and leaves no batch · Critical
**Evidence:** `BulkImportTollTransactionsModal.tsx:963-1044` loops `await api.saveTransaction(...)` once per row from the browser, then (`:1046-1059`) reads `vehicle.tollBalance` from a client snapshot and writes back `old + change`.
- **Partial imports:** closing the tab or a network error at row 40 of 120 leaves 40 rows written and no record of which ones.
- **Lost updates on balance:** two imports, or an import plus any other balance write, overwrite each other's change. A re-import after a partial failure double-applies the balance change for the rows that already landed.
- **No batch record:** `currentBatchId` is stamped on rows, but `api.createBatch` is never called (prod: 0 toll batches). The import can't be listed, counted as coverage, or rolled back as a unit.
**Fix:** server-side staged import with one commit transaction. Tag balance becomes a derived value (`Σ toll_ledger`), not a stored field (§4.5).

### WR-H1 — Toll dedupe silently drops legitimate tolls · High
**Evidence:** `BulkImportTollTransactionsModal.tsx:758-778`. If a row's Txn ID is *not* found, the code still checks the fingerprint `date|amount|vehicleId` against existing rows, and a match sets `isValid: false`. There is no override.
**Failure:** a driver pays the same plaza at the same price twice in one day (a round trip), and one of those tolls already exists. That could be a cash entry from the driver app, or the first leg from an earlier overlapping statement. The second leg, *which has its own unique Txn ID*, is dropped, and toll spend is under-stated.
**Also:** the existing-row read is `getTollLogs({ limit: 10000 })`, so once the fleet has more than 10,000 rows, dedupe stops seeing older ones. On any error it logs and imports without any dedupe (`:789-792`, fails open).
**Fix:** a provider reference number is authoritative. A fingerprint match is a *warning the user can override*, never a silent block. Dedupe runs on the server against an indexed unique key.

### WR-H2 — `import_batches.period_start/end` is not a period · High
**Evidence (prod):** all 49 `merged_import` rows have `period_end = period_start` (a span of 0 days), on random weekdays. The real trip span is in `payload_json.dataPeriodStart/End`. For example, the batch with `period_start = 2026-10-13` covers trips **2026-10-05 → 10-11**.
Also: `period_start = 2026-04-12` has **15 completed batches with 15 different fingerprints**. Re-exports of the same Uber week aren't recognized as the same coverage, because `contentFingerprint` is byte-level and Uber exports aren't byte-stable.
**Fix:** add explicit `coverage_start/coverage_end` (the statement period the provider declares) and `data_start/data_end` (min/max row date), plus `week_keys date[]` and a **semantic key** (for Uber, `organizationUuid + statement period`). Backfill from `payload_json` (§4.4).

### WR-H3 — A zero-activity day looks the same as a missing import · High
**Evidence (prod, last 5 weeks):** zero trips on every platform on **Sep 28 (Mon), Oct 9 (Fri), Oct 12 (Mon), Oct 14 (Wed)**. Sep 28 and Oct 12 still have a toll row, which suggests the vehicle was moving. Today nobody can tell whether those were days off or days missing from the export.
**Fix:** day-level coverage strips. A day is *covered* if a statement's declared period includes it, even with zero rows, or if a user attests "no activity" with a reason. Attestations are shown to the approver at close.

### WR-H4 — Three week pickers, no shared week object · High (UX + correctness)
**Evidence:** Fuel has its own landing (Open weeks / Outstanding / In Progress / Completed, as in your screenshot). Tolls has its own `PeriodLandingPage`. Close Week is a third page. The hub passes `initialWeekStart` to both lanes, but each lane keeps its own state. `toll_reconciliation_period` has 0 rows, so the toll lane's per-week status lives somewhere else (derived/KV), unlike fuel's.
**Failure:** the user selects the same week three times. Each lane can show a different "done" picture, and nothing joins them.
**Fix:** one `recon.week_runs` row per (org, line, week) that owns the week. The lanes are opened *inside* a run with the week fixed (they skip their landing pages).

### WR-H5 — Delivery has no reconcilable week · High (for the Delivery track)
**Evidence:** `rush_settlement_routes.ts:71-96` uses `since = now − 7 days` (a rolling window, not a Mon–Sun week), `.limit(2000)` (silently truncates), and gross only. There are no courier statements, no close and no lock. Prod has 0 `rush_delivery` trips.
**Fix:** a courier week statement (`ledger.week_statements` with `kind='courier_earnings'`) keyed to `periodKeyFor`. The Delivery run unlocks only when its prerequisites are met (§7).

### WR-H6 — Close and lock are per org-week; the split needs per line-week · High (design)
**Evidence:** `ledger.week_close_locks(organization_id, week_key)`; `week_close_runs` has the same key.
**Tension:** the fuel split audit recorded "*Settlement stays the driver-week; do not split it per line.*" You now want reconciliation split the same way settlements are. These are reconcilable, because Courier Settlements is *already* a separate desk with separate money (§4.9):
- **Rideshare close** = today's Close Week, scoped to `service_line='rideshare'`. It owns `driver_financial_periods`.
- **Delivery close** = new. It owns courier week statements and never touches `driver_financial_periods`.
- **Org week closed** = every applicable line is closed. This is derived and never stored separately.
The lock key becomes `(org, service_line, week_key)`. Rideshare-only orgs (2 of 3 in prod) see no difference.

### WR-M1 — Roam-issued fuel statements block the fleet with no visibility · Medium
The fleet owner can't upload R7, Roam does. Today the fleet sees "Fuel gaps 1 to review" with no sign that the statement just hasn't been posted yet. The wizard needs a **Waiting on Roam** state, with when it was expected and a "Notify Roam" action, and Roam ops need a queue showing which org-weeks are waiting.

### WR-M2 — Tag account is never reconciled · Medium
11 top-ups total $40,500 and tag usage totals $43,685 over the fleet's lifetime. Nothing checks `opening + top-ups − tag usage = closing` against the provider's statement balance, so lost top-ups, double-posted usage and provider fees go undetected. **Top-ups also aren't a driver or line cost.** They move cash into a prepaid account. Top-ups are saved as `type: 'Expense'`, category `Toll Top-up` (`:999`). **Verify** that Business Finance P&L doesn't count both the top-up expense and the tag usage it funds. That would be a double count. Not verified in this pass.

### WR-M3 — Late data doesn't invalidate steps across sources · Medium
Fuel has `computed_from_hash` and tolls have `readiness_hash`, but each lane only hashes its own rows. Trips imported *after* toll review change the toll matches (deadhead, refunds), and nothing flags the toll step. **Fix:** each step records the input hash of every source it reads (§4.6).

### WR-M4 — Week boundary at import time · Medium (verify)
ADR 0007 defines the week as Mon–Sun in `America/Jamaica`, and `periodKeyFor` says "*Statements must be split at import.*" The Uber bundle data spans look like Uber's own week rather than the fleet week: `2026-10-13 → 10-18` (Tue → Sun), and `2026-09-29 → 10-04`. Check whether trips between Monday 00:00 and the Uber cut-off land in the right fleet week, and whether `CASH_SOURCE_MISMATCH` cases cluster on Mondays. The upload preview should always show **"N rows fall in the neighbouring week"**.

### WR-M5 — `ImportsPage.tsx` can't be embedded as-is · Medium
At 3,110 lines, it holds platform merge, AI mapping, the fuel JAA path, batch commit, delete/export centres and toll backup. Don't mount it inside the wizard. Extract one **source uploader** per source behind a common contract (§4.5). The Data Center keeps working by mounting the same uploaders.

### WR-M6 — Gate logic is duplicated and runs in the browser · Medium
`computeGatedStepStates` and `computeFuelGatedStepStates` are copies of each other, and both run in the browser. A wizard spanning five stages needs **one** gate engine, evaluated on the server and mirrored to the client only for display (the edge mirror + drift-test pattern).

---

## 4. Target architecture

### 4.1 Principles

1. **One new concept, not a new engine.** The Reconciliation Run coordinates the existing lanes and engines. It never computes money itself. (Per the financial integrity audit: don't add an eighth money engine.)
2. **Coverage comes from rows plus statements, never from upload claims alone.** A batch claims; the rows and the declared statement period prove.
3. **The server owns every gate.** The client renders gate state and never advances it.
4. **Attribution before reconciliation.** Line-scoped numbers are only shown once `R + D + U = Total` is computed. Unattributed is a visible bucket, never a silent default.
5. **Uploads are staged, previewed, then committed atomically.** Nothing reaches a ledger from a browser row loop.
6. **Steps go stale when their inputs change.** A completed step is "complete for input hash X".
7. **The run is keyed by line.** `(org, service_line, week_key)`. Rideshare-only orgs never see a line chooser.
8. **Make invariants unrepresentable where possible** (settlement close lesson): unique keys, generated columns and CHECK constraints over JS assertions.

### 4.2 Domain model

```
ReconciliationRun  (org, service_line, week_key)            ← new, owns the week
 ├─ SourceRequirement[]  (from manifest × org config)       ← new
 │    ├─ coverage: Mon..Sun → covered | zero_attested | missing | spill
 │    ├─ batches[] → fleet.import_batches (extended)
 │    └─ status: not_applicable | missing | partial | received | attested_none | waived | waiting_external
 ├─ Step[]  (attribution, trips_earnings, tolls, tag_account, fuel, settlement_preview)
 │    ├─ actionable / informational counts   ← from the existing lane counters
 │    ├─ input_hash_at_complete               ← staleness
 │    └─ deep link → the existing lane wizard step, week fixed
 └─ Close  → existing week-close, scoped to service_line
```

### 4.3 Source manifest (data, not code paths)

A single registry in `packages/finance-core/src/reconSources.ts`, mirrored to edge with a Keep-in-sync header and a Deno drift test (existing pattern). Every place that needs the list (wizard, close blockers, Data Center, Roam ops queue) reads it.

```ts
type SourceKind = 'upload' | 'native' | 'driver_submitted' | 'external_dependency';
type CoverageMode = 'daily_rows' | 'statement_period' | 'none';

interface ReconSourceDef {
  id: 'uber_bundle' | 'indrive_trips' | 'roam_trips' | 'toll_usage' | 'toll_topup'
    | 'cash_tolls' | 'fuel_card_roam' | 'fuel_card_self' | 'cash_fuel'
    | 'rush_deliveries' | 'cod_remittance';
  line: 'rideshare' | 'rush_delivery' | 'org';     // 'org' = shared (e.g. tag account)
  kind: SourceKind;
  label: string;                                     // "Uber weekly reports"
  requiredWhen: (org: OrgReconProfile, week: WeekKey) => 'required' | 'optional' | 'not_applicable';
  coverage: CoverageMode;
  fileSignatures?: FileSignatureId[];                // reuse detectFileType outcomes
  requiredFiles?: string[];                          // uber: trip_activity, payments_* ×3
  feeds: StepId[];                                   // which steps go stale when it changes
  howToGetIt?: { provider: string; steps: string[] } // in-app instructions
}
```

`OrgReconProfile` is derived on the server from facts that already exist: `organizations.service_lines`, drivers with Uber or InDrive IDs, vehicles with an active toll tag, cards by issuer (Roam vs self-serve, from `selfServeCompanyCodes`) and module flags. **The user never configures what is required. The system infers it, and the user can only *waive* a requirement, with a reason.**

### 4.4 Data model

New schema `recon` (RLS by `organization_id`, wrappers with `security_invoker`; see the RLS rule in the settlement audit).

```sql
-- One row per org × line × week
create table recon.week_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_line    text not null check (service_line in ('rideshare','rush_delivery')),
  week_key        date not null check (extract(isodow from week_key) = 1),  -- Monday only
  state           text not null default 'collecting'
                  check (state in ('collecting','reconciling','ready_to_close','closed','reopened')),
  version         bigint not null default 1,          -- optimistic concurrency
  opened_by       text, opened_at timestamptz default now(),
  closed_at       timestamptz, closed_by text,
  close_run_id    uuid references ledger.week_close_runs(id),
  unique (organization_id, service_line, week_key)
);

-- Required inputs for the run (materialized from the manifest; re-derived on read)
create table recon.run_sources (
  run_id          uuid references recon.week_runs(id) on delete cascade,
  source_id       text not null,
  requirement     text not null check (requirement in ('required','optional','not_applicable')),
  status          text not null check (status in
                  ('missing','partial','received','attested_none','waived','waiting_external','not_applicable')),
  coverage        jsonb not null default '{}',   -- {"2026-10-05":"covered","2026-10-06":"missing",...}
  input_hash      text,                          -- hash of source rows in the week
  row_count       int, amount_minor bigint,
  attested_by text, attested_at timestamptz, attest_reason text,   -- for attested_none / waived
  primary key (run_id, source_id)
);

-- Step completion is "complete for these inputs"
create table recon.run_steps (
  run_id          uuid references recon.week_runs(id) on delete cascade,
  step_id         text not null,
  actionable      int not null default 0,
  informational   int not null default 0,
  completed_at    timestamptz, completed_by text,
  inputs_hash_at_complete text,                  -- composite of feeding run_sources.input_hash
  primary key (run_id, step_id)
);

-- Append-only activity log (who uploaded / attested / waived / completed / reopened)
create table recon.run_events (
  id bigserial primary key, run_id uuid not null, at timestamptz default now(),
  actor text not null, kind text not null, payload jsonb not null default '{}'
);
```

**Extend `fleet.import_batches`.** Don't add a parallel table:

```sql
alter table fleet.import_batches
  add column source_id      text,            -- manifest id
  add column service_line   text,
  add column coverage_start date,            -- declared statement period (provider's)
  add column coverage_end   date,
  add column data_start     date,            -- min/max row date actually present
  add column data_end       date,
  add column week_keys      date[],          -- every fleet week touched
  add column file_sha256    text,
  add column semantic_key   text,            -- e.g. uber:<orgUuid>:<stmtStart>:<stmtEnd>
  add column rows_parsed int, add column rows_committed int,
  add column rows_duplicate int, add column rows_rejected int, add column rows_spilled int,
  add column supersedes     text references fleet.import_batches(id);
create index on fleet.import_batches (organization_id, source_id) include (week_keys);
create unique index import_batches_semantic_live
  on fleet.import_batches (organization_id, semantic_key)
  where status = 'committed' and semantic_key is not null;   -- one live import per statement
```

**Backfill:** `data_start/end` from `payload_json->>'dataPeriodStart'/'dataPeriodEnd'`, `source_id='uber_bundle'` for `merged_import`, and `week_keys` from the data span. Leave the old `period_start/period_end` in place (Delete Center reads them) and mark them deprecated in a comment.

**Coverage computation** is a SQL function, so the list and its totals can't disagree (settlement lesson N-8):

```
recon.compute_source_coverage(org, line, source_id, week_key) → jsonb
  for each day d in week:
    covered        if exists committed batch with coverage_start ≤ d ≤ coverage_end
    covered        if rows exist for d (native/driver_submitted sources)
    zero_attested  if run_events has attest_none for (source, d)
    missing        otherwise
```

### 4.5 Unified import pipeline

Every uploadable source goes through the same four server calls. The wizard and the Data Center both use them.

```
POST /recon/imports                       { sourceId, weekKey?, fileName, sha256 }   → importId (status=staged)
PUT  <signed storage URL>                 (raw file → storage bucket recon-imports/<org>/<importId>)
POST /recon/imports/:id/parse             → server parses, writes recon.import_staging_rows,
                                             returns preview:
                                             { new, duplicate:{byRef, byFingerprint}, conflicting,
                                               rejected:[{row, reason}], spill:[{weekKey, rows}],
                                               totals_minor, coverage_start/end }
POST /recon/imports/:id/commit            { idempotencyKey, overrideFingerprintDupRowIds?: [] }
                                           → ONE transaction: insert ledger rows + batch status
                                             'committed' + recompute run_sources + mark stale steps
POST /recon/imports/:id/rollback          { reason }  → reverses via correcting rows, never DELETE
```

Rules:
- **Dedupe on the server, against a unique index.** For tolls, `unique (organization_id, provider_ref)` where the reference is present. A Txn ID that doesn't match is *new*. A fingerprint match is reported as `duplicate.byFingerprint` and **the user can override it per row** (fixes WR-H1).
- **No stored tag balance.** `vehicle.tollBalance` becomes a view, `Σ toll_ledger.amount where payment_method='tag_balance'` per tag. This removes the read-modify-write in WR-C3. Keep the column as a cache written only by a trigger if a screen needs it.
- **Semantic dedupe for statements.** Re-uploading the same Uber week shows "**This replaces the Oct 5–11 import from 13 Oct** — 3 rows changed, 0 new". It commits as a superseding batch, so you no longer get 15 parallel batches.
- **Spill is explicit.** Rows outside the selected week are listed by week with a choice: "Import into their own weeks" (default) or "Don't import". A row is never silently re-dated.
- **Phase it.** The Uber/InDrive merge is complex client-side code with verification already built in. In P1, *wrap* it: after its commit, call `POST /recon/imports/:id/register` with coverage metadata. Move parsing to the server in a later phase. Tolls go to the full staged pipeline first, because that import is the most dangerous today.

### 4.6 Step gate engine (server)

One function in `finance-core` (mirrored to edge) replaces both `computeGatedStepStates` copies:

```ts
evaluateRun(run, sources, stepCounts) → {
  stage: 'collect' | 'attribute' | 'reconcile' | 'settle' | 'close',
  steps: Array<{ id, status: 'locked'|'ready'|'in_progress'|'complete'|'stale',
                 lockedBy?: { kind:'source'|'step', id, label }, actionable, informational }>,
  nextAction: { kind, targetId, label }      // drives the wizard's primary CTA
}
```

- A step is **locked** while any source in its `feeds` is `missing`, `partial` or `waiting_external`, or while an earlier step is not complete.
- A step is **stale** when `inputs_hash_at_complete ≠ current composite hash`. It shows a banner, "3 new toll rows since you reviewed Tolls", and returns to `in_progress`.
- `nextAction` is the **one** thing the wizard highlights. It is computed on the server so every surface agrees.

**Steps per line:**

| Stage | Step id | Rideshare | Delivery | Backed by |
|---|---|---|---|---|
| Collect | `sources` | ✓ | ✓ | new |
| Attribute | `attribution` | only if U ≠ 0 | ✓ | new (§4.7) |
| Reconcile | `trips_earnings` | ✓ | ✓ | existing blockers `CASH_SOURCE_MISMATCH`, `EARNINGS_*`, Uber "missing trip_activity" warnings |
| | `tolls` | ✓ | if tagged courier vehicles | existing toll wizard, 6 sub-steps |
| | `tag_account` | if tags funded | — | new roll-forward (WR-M2) |
| | `fuel` | ✓ | when D3 is solved | existing fuel wizard, 6 sub-steps |
| Settle | `settlement_preview` | Driver Settlements | Courier Settlements | existing / new |
| Close | `close` | Close Week (rideshare) | Courier close | existing / new |

### 4.7 Service-line attribution

Copy the fuel design. It's proven, with 12/12 Deno tests, a CI guard, and a kill switch.

| Table | Resolver chain → `service_line_source` |
|---|---|
| `fleet.trips` | `platform` → `platform` (deterministic; Uber/InDrive/Roam = rideshare, Roam Rush = rush_delivery). **Backfill all 3,804 in one migration.** Add a CHECK so a trip row can't be NULL. |
| `fleet.toll_ledger` usage | ① matched `trip_id` → that trip's line (`trip`); ② vehicle has exactly one line (`vehicle`); ③ driver has exactly one line (`driver`); ④ otherwise `unattributed` |
| `fleet.toll_ledger` top-up | `org` (shared). A top-up funds an account and doesn't belong to a line. Shown in the `tag_account` step, never in a line's toll spend. |
| `fleet.fuel_entries` | existing resolver, unchanged |

- Hook it at the write choke point (as fuel did in `kv_store.tsx`) so future write paths are covered automatically.
- **Unattributed is a visible bucket.** Both-lines orgs see an Attribution step listing those rows with a one-click "Rideshare / Delivery / Split…" choice. The choice writes `service_line_source='manual'` plus who and when.
- **Allocation is a separate, explicit policy.** For a genuinely shared cost (one fill-up on a vehicle that did both lines), the owner picks a policy per org, e.g. trip-mix or km-mix. `allocateSharedCostsByTripMix` already exists and is never applied. Until a policy is chosen, shared rows stay unattributed and **block both lines' close**. Never apply a silent default.
- The invariant appears on every line-scoped screen: `Rideshare $X + Delivery $Y + Unattributed $Z = Total $T`.

### 4.8 Close Week integration

- Add a `sources` lane to `CloseLane` (`'sources' | 'fuel' | 'toll' | 'settlement'`) and route `SOURCE_*` codes to it in `laneForBlockerCode`.
- New blocker codes (add them to `BLOCKER_LABELS`):

| Code | Severity | Label |
|---|---|---|
| `SOURCE_MISSING` | block | "{Source} not uploaded for this week" |
| `SOURCE_PARTIAL` | block | "{Source} missing {n} day(s): {days}" |
| `SOURCE_WAITING_EXTERNAL` | block | "Waiting on Roam for the gas card statement" |
| `SOURCE_WAIVED` | warn | "{Source} waived by {who}: {reason}" (shown to the approver) |
| `SOURCE_ATTESTED_NONE` | warn | "No activity attested for {days}" |
| `STEP_STALE` | block | "{Step} reviewed before new data arrived — re-review" |
| `LINE_UNATTRIBUTED` | block | "{n} rows (${x}) not assigned to Rideshare or Delivery" |

- Ship them as **`warn` for two closed weeks first**, then flip to `block`. That's the same rollout pattern as the toll recon enforce flip (`docs/toll-recon-enforce-flip.md`).
- `POST /settlements/week-close` takes `serviceLine`. The lock key moves to `(org, service_line, week_key)`. Migration: existing locks get `service_line='rideshare'`.
- Reopen also reopens the run (`state='reopened'`) and keeps all source and step history.

### 4.9 Rideshare vs Delivery: how the split works end to end

```
                    ┌──────────── Business Finance (org week) ────────────┐
                    │  week closed  ⇔  every applicable line run closed    │
                    └──────────────┬───────────────────────┬──────────────┘
              Rideshare run (org, rideshare, W)     Delivery run (org, rush_delivery, W)
              sources: R1–R9                        sources: D1–D5
              steps: tolls, tag, fuel, earnings     steps: deliveries, tolls*, fuel*, courier earnings
              close: Close Week → driver_financial_ close: Courier close → week_statements
                     periods frozen                        (kind='courier_earnings') frozen
              desk: Driver Settlements              desk: Courier Settlements
                                    ▲                    ▲
                                    └── shared: tag account (org), unattributed rows, allocation policy
```

- **Rideshare-only org (2 of 3 today):** no chooser and no Attribution step. It behaves exactly like the rideshare track.
- **Delivery-only org:** only the Delivery track.
- **Both:** a segmented control `Rideshare · Delivery` at the top of the hub, each with its own counts, and shared items appearing in both until resolved.
- **A person who drives both lines** gets a driver-week (rideshare) and a courier-week (delivery). The two never net against each other inside recon. Netting is a settlement-desk policy question (open question Q3).
- **COD stays out.** The Delivery run shows Layer A′ COD balances read-only for context and links to the remittance desk. It never adds COD into fleet numbers (`check-remittance-separation.mjs` must keep passing).

### 4.10 API surface (new)

```
GET  /recon/weeks?line=rideshare&status=outstanding|in_progress|completed&year=
     → [{ weekKey, line, state, progress:{done,total}, nextAction, blockers:n, unexplainedMinor,
          sources:[{id,status}] }]                 ← landing list, ONE query (SQL function)
GET  /recon/runs/:line/:weekKey                    → evaluateRun() result + sources + steps
POST /recon/runs/:line/:weekKey/sources/:sourceId/attest-none  { days[], reason }
POST /recon/runs/:line/:weekKey/sources/:sourceId/waive        { reason }      (approver role)
POST /recon/runs/:line/:weekKey/sources/:sourceId/request      → notifies Roam ops (R7)
POST /recon/runs/:line/:weekKey/steps/:stepId/complete         { expectedInputsHash }
POST /recon/runs/:line/:weekKey/attribution                    { rows:[{id, line|split}] }
(imports: §4.5)   (close/reopen: existing week-close routes + serviceLine)
```

Every mutation takes `expectedVersion` (optimistic concurrency on `week_runs.version`) and an idempotency key. Register the routes in the fleet-core manifest and refresh `routes.generated.json` in the same commit (that's the edge deploy check).

### 4.11 Roles

| Permission | Who | Can |
|---|---|---|
| `recon.view` | finance viewers | See runs |
| `recon.prepare` | preparers | Upload, attest, attribute, complete steps |
| `recon.approve` | approvers | Waive sources, close and reopen |
| (Roam ops) `recon.external_sources` | Roam staff | See the cross-org queue of "waiting on Roam" weeks, upload R7 for an org |

The hub's visibility rule today is `fuel-reconciliation || toll-tags`; it becomes `recon.view`. Maker/checker is optional per org: if on, the person who waived can't close.

---

## 5. UX design

### 5.1 Information architecture

```
Business Finance
 └─ Week Reconciliation                       (landing: list of weeks)
     ├─ [Rideshare | Delivery]                (only for both-lines orgs)
     └─ /week-reconciliation/:line/:weekKey   (the run, i.e. the wizard)
          ├─ /sources[/:sourceId]
          ├─ /attribution
          ├─ /trips-earnings
          ├─ /tolls[/:tollStep]               (existing toll wizard, week fixed)
          ├─ /tag-account
          ├─ /fuel[/:fuelStep]                (existing fuel wizard, week fixed)
          ├─ /settlement
          └─ /close
```

Every state is a URL, so a link in Slack opens the exact step. Reuse the existing clamp rule (`clampFuelStepToGates`): a deep link to a locked step opens the current step instead.

### 5.2 Landing (replaces the Fuel/Tolls tabs)

Keep what works in your screenshot: the KPI band, Outstanding / In Progress / Completed, and per-week cards. Change what each card says. It should name **the next thing to do** rather than show six lane chips.

```
┌ Week Reconciliation ──────────────────────────────── [Rideshare ▾ | Delivery] ─┐
│ OPEN WEEKS 3     NEEDS DATA 2     UNEXPLAINED $47,350     OLDEST Sep 7 (36d)    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [Outstanding 2]  [In progress 1]  [Completed 31]                                 │
│                                                                                  │
│ ┌ Oct 5 – Oct 11, 2026 ·  8 days open ─────────────────────────────────────────┐ │
│ │ ●●●○○○  Step 2 of 6 · Collect data                                           │ │
│ │ Missing: Toll usage · Gas card statement (waiting on Roam)                   │ │
│ │ Mon Tue Wed Thu Fri Sat Sun   ← coverage strip, all sources combined         │ │
│ │  ■   ■   ■   ■   ▢   ■   ■    ▢ = gap on Fri Oct 9                          │ │
│ │                                          [ Upload toll usage → ]  (primary)   │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- The primary button is `nextAction.label` from the server, always one verb plus one object.
- "Needs data" is a KPI because it is the most common blocker and is invisible today.

### 5.3 The run: three-column layout

```
┌─ ← Weeks   Rideshare · Oct 5 – Oct 11, 2026                    Saved · 2 min ago ┐
├──────────────┬──────────────────────────────────────────────┬─────────────────────┤
│ STEPS        │                                              │ THIS WEEK           │
│ ✔ 1 Data     │   (active step panel)                        │ Spend      $28,350  │
│ ● 2 Tolls  4 │                                              │ Unexplained $28,350 │
│ 🔒 3 Tag acct│                                              │ ─────────────────── │
│ 🔒 4 Fuel    │                                              │ Rideshare  $28,350  │
│ 🔒 5 Settle  │                                              │ Delivery        $0  │
│ 🔒 6 Close   │                                              │ Unassigned      $0  │
│              │                                              │ = Total    $28,350 ✓│
│ Activity ▸   │                                              │ Sources  5/6 ✓      │
└──────────────┴──────────────────────────────────────────────┴─────────────────────┘
```

- **Left:** a vertical stepper. Locked steps show *why* on hover and on focus (fixes the earlier U-1 pattern of reasons hidden in a `title`). Example: "Waiting for: Toll usage".
- **Right rail:** the invariant `R + D + U = Total` and the source score. It stays visible on every step.
- On phones, the rails collapse into a top progress bar plus a "Week facts" sheet. Keep the 16px gutter and no horizontal scroll.

### 5.4 Step 1: "Gather this week's data"

```
Gather this week's data                     Recommended order ↓  · You can upload in any order
────────────────────────────────────────────────────────────────────────────────────────
① Uber weekly reports                    ✔ Received  · 76 trips · uploaded 13 Oct by Kenny
   Mon Tue Wed Thu Fri Sat Sun                              [View import] [Replace]
    ■   ■   ■   ■   ◪   ■   ■    ◪ Fri: no trips — [Confirm no activity] or [Upload]

② InDrive trips                          ✔ Received  · 1 trip

③ Roam trips                             ● Automatic · 1 trip (no upload needed)

④ Toll usage (tag statement)             ✖ Missing                                 ◀ next
   ┌──────────────────────────────────────────────────────────────┐
   │  Drop your toll usage CSV here, or [Browse]                   │
   │  Where do I get this?  ▸ T-Tag portal → Statements → Export  │
   └──────────────────────────────────────────────────────────────┘
   [No tag tolls this week]

⑤ Toll top-ups                           ○ Optional · none this week  [Upload]

⑥ Gas card statement (Roam card)         ⏳ Waiting on Roam · expected by Wed 14 Oct
                                            [Remind Roam]

⑦ Cash tolls & fuel receipts             ● Automatic · 3 driver submissions to review later
────────────────────────────────────────────────────────────────────────────────────────
                                    [ Continue to Tolls → ]  (disabled until ④ resolved)
```

Behaviours:
- **Drop anywhere.** A file dropped on the page is auto-detected (reuse `detectFileType`) and routed to the right card: "This looks like **Toll usage** — upload it there?" A wrong-card drop is caught before parsing.
- **Uber bundle checklist.** One drop zone takes all 9 files and ticks the 4 required ones. "Missing payments_driver.csv" appears before anything is parsed.
- **Preview before commit** (modal):
  ```
  Toll usage · tag_statement_oct.csv
  118 rows  →  112 new · 4 already imported (same Txn ID) · 2 possible duplicates ⚠
  2 rows belong to Oct 12–18 → will be added to that week
  Total $43,120.00
  ⚠ Possible duplicates (same day, plaza amount, vehicle — different Txn ID):
    Oct 7  Spanish Town  $410  5678 AB   [Keep both ✓]  [Skip]
  [Cancel]                                                   [Import 114 rows]
  ```
- **"No activity" needs a reason** and is listed at close: "Fri Oct 9 — no trips (vehicle in garage), confirmed by Kenny".
- **Waive** is available only to approvers, needs a reason, shows as an amber `warn` at close, and is recorded in Activity.
- **Waiting on Roam** never blocks the steps that don't need the gas card. Tolls can be reviewed while fuel waits.

### 5.5 Embedded lane steps (Tolls and Fuel)

- Mount the existing wizards with the week fixed and their landing pages hidden. Both components already accept `initialWeekStart` and `embedded`. Add `hideLanding` and a `serviceLine` scope.
- Their internal steps (Needs Review → … → Unlinked Refunds; Data quality → … → Finalize) appear as **sub-steps** under the parent step in the left stepper, so the user always sees one map.
- When the lane finishes, the wizard moves on with a summary toast: "Tolls reconciled · $3,185 charged to drivers · 2 refunds linked."

### 5.6 Tag account step (new, small)

```
Tag account · T-Tag 0042 (5678 AB)
  Opening balance (from last closed week)   $12,400
+ Top-ups this week                          $5,000
− Tag usage this week                       −$4,315
= Expected closing                          $13,085
  Statement closing balance  [ $13,085 ]  ✓ ties          (entered or parsed from CSV)
```

A difference creates an actionable item with three choices: "Missing top-up?", "Provider fee", or "Investigate".

### 5.7 Close step

Reuse the Close Week confirm dialog (per-driver amounts are already shown) and add an **Evidence** section listing every source with its batch, every attestation and every waiver. That turns the close into an audit pack. Add **Download week pack (PDF/CSV)** for the accountant.

### 5.8 Microcopy rules

- Tell the user what to do next, not what state the system is in: "Upload toll usage", not "Toll source: missing".
- Always name the day and the money: "Missing Fri Oct 9", "$410 not assigned to a line".
- Never call something a "blocker" in the UI. Use "Needs your attention" for block and "Note" for warn.
- Keep the backend/UI vocabulary split documented in `toll-naming-convention` (backend "unclaimed" = UI "Unlinked Refunds").

### 5.9 States to design (checklist for the UI developer)

Empty org (no sources configured) · first week ever (no opening tag balance) · week with zero activity · upload parsing (progress) · parse error (row-level list, downloadable) · partial coverage · stale step after late import · two users in the same run (version conflict: "Kenny just imported Toll usage — refresh") · reopened week (banner + diff since close) · line switch with unsaved attribution · permission-denied step · edge route 404 (reuse `isWeekCloseUnavailable` pattern) · mobile.

---

## 6. Controls, invariants and tests

| # | Control | Where | Gate |
|---|---|---|---|
| K1 | `R + D + U = Total` per source per week | SQL function, displayed and asserted | vitest + SQL fixture |
| K2 | Coverage from rows + declared period only | `recon.compute_source_coverage` | Deno test with fixtures: zero-day with and without statement |
| K3 | One live import per semantic key | partial unique index | migration test |
| K4 | Toll provider ref unique per org | unique index on `toll_ledger` | migration test + import test "different Txn ID, same fingerprint ⇒ both kept" |
| K5 | Step stale when inputs change | `evaluateRun` | Deno + vitest parity on shared fixtures (source-anchored, like `verify_service_line_filter_parity.mjs`) |
| K6 | Trips can't have NULL `service_line` | CHECK after backfill | migration |
| K7 | Close refuses with `SOURCE_*`/`STEP_STALE`/`LINE_UNATTRIBUTED` | `checkCloseInvariants` | finance-core tests; warn→block flip after 2 weeks |
| K8 | COD never enters fleet recon numbers | `check-remittance-separation.mjs` extended to `recon/` | CI |
| K9 | Gate engine client/server mirror can't drift | Keep-in-sync header + Deno drift test | CI (**list it in `ci.yml` explicitly**, since Deno doesn't glob) |
| K10 | Typecheck delta = 0 | `tsc` on fleet | CI; record the same-session baseline first |
| K11 | Every SQL change dry-run | `supabase db lint` / shadow apply | CI (nonexistent-column migrations have shipped twice) |

**Retro-report (no writes):** run coverage over the 31 locked fuel weeks and 37 closed earnings weeks and list any closed week with a missing source. Don't reopen anything automatically. Hand the list to the owner.

---

## 7. Delivery track prerequisites

Don't build a Delivery wizard that can only ever show $0. Unlock it per org when **all** of these are true:

1. `RUSH_TRIP_PROJECTION` is on for the org and `rush_delivery` trips exist (D1).
2. A courier week statement exists (`week_statements.kind='courier_earnings'`), built with `periodKeyFor`, replacing the rolling 7-day `since` and the `.limit(2000)` (WR-H5).
3. The courier vehicle bridge (`delivery.courier_vehicles` → `fleet.vehicles`, or a mapping) exists, so fuel and tolls can be attributed (D3/D4). Until then, Delivery fuel and tolls show "Not tracked for couriers yet" rather than $0.
4. `rush_settlement` has passed the 5-day sign-off in `docs/rush-fleet-reconciliation-week.md`.

Before that, the Delivery tab shows a **readiness card** listing these four items with their status, not an empty wizard.

---

## 8. Phased plan

Each phase ships on its own, is behind a flag where it changes behaviour, and ends with `tsc` + vitest + Deno (listed in `ci.yml`) green.

| Phase | Deliverable | Fixes | Notes |
|---|---|---|---|
| **P0 Foundations** (no UI change) | Trip `service_line` backfill + CHECK; toll resolver + `service_line_source`; `import_batches` columns + backfill from `payload_json`; toll imports write a batch row | C2, H2, part of C3 | Pure data. Run K1 conservation on prod after. |
| **P1 Sources panel (read-only)** | `recon.compute_source_coverage`, `GET /recon/weeks`, coverage strips on the existing hub landing | C1 (visibility), H3 | Immediate value. Users can see the gaps before the wizard exists. |
| **P2 Toll import rebuild** | Staged server import, provider-ref unique index, override-able fingerprint warnings, derived tag balance | C3, H1 | Highest data-loss risk, so it comes before the wizard. |
| **P3 Run + wizard shell (Rideshare)** | `recon.*` tables, `evaluateRun`, run page with Sources step + embedded Toll/Fuel lanes (`hideLanding`), attest/waive | H4, M3, M6 | Flag `recon_wizard`. The old tabs stay reachable for 2 weeks. |
| **P4 Close integration** | `sources` lane, `SOURCE_*`/`STEP_STALE` blockers (warn → block), lock key with `service_line`, evidence pack | C1 (enforced), H6 | Follow the enforce-flip runbook. |
| **P5 Tag account + Trips & Earnings step** | Roll-forward step; earnings step wrapping `CASH_SOURCE_MISMATCH` + Uber warnings; verify P&L top-up treatment | M2, M4 | |
| **P6 Roam external-source queue** | Roam ops view of "waiting on Roam" org-weeks, notify action | M1 | |
| **P7 Delivery track** | Courier week statement, Delivery run + close, Attribution step, allocation policy | H5, §7 | Only after §7 prerequisites. |
| **P8 Self-serve gas card** | `fuel_card_self` source fully built | — | Per your note: last. |

---

## 9. Open questions for the owner

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Should a week be closeable when a source is **waived**, or must waivers go to a second approver? | Closeable, waiver shown as `warn`, approver role only |
| Q2 | Shared costs on a vehicle used for both lines: allocate by trip mix, km mix, or always manual? | Manual until chosen; unattributed blocks both closes |
| Q3 | Someone who drives both lines: should rideshare and courier balances ever net against each other at payout? | No netting, two statements |
| Q4 | Is any vehicle actually used for both lines? (If not, the allocation work in Q2 can be skipped.) | Assume no until a vehicle has both lines |
| Q5 | What does the toll provider's statement give us: a closing balance, a statement ID? (Decides how much of the tag roll-forward can be automatic.) | Manual closing-balance entry |
| Q6 | Roam-issued gas card statements: what's Roam's commitment for upload day (e.g. by Wednesday for the prior week)? | Expected by Wednesday; overdue warning after that |
| Q7 | Should Business Finance's P&L for a week stay "provisional" until every line is closed? | Yes, with a "provisional" badge |

---

## 10. Appendix

### 10.1 Prod evidence (read-only queries run 2026-10-19)

```sql
-- service_line population
select 'trips', coalesce(service_line,'NULL'), count(*) from fleet.trips group by 2 ...
-- → trips NULL 3804 · toll_ledger NULL 219 / rideshare 118 · fuel_entries rideshare 546
-- → orgs: rideshare ×2, rideshare+rush_delivery ×1

-- import batch types
select type, status, count(*) from fleet.import_batches group by 1,2;
-- → merged_import completed 43 / error 4 · trip_reimport 2 · (no toll / fuel types)

-- batch period shape
-- → all merged_import: period_end = period_start (span 0), starts Mon×16 Sun×15 Tue×8 Thu×5 Fri×2 Wed×1
-- → 2026-04-12: 15 completed batches, 15 distinct contentFingerprints

-- toll_ledger by type
-- usage/cash 203 (−$77,360; 174 no batch; 153 no line) · usage/tag 121 (−$43,685; 55 no line)
-- top_up/tag 11 (+$40,500; 11 no line) · usage/fleet_account 2 (−$550)

-- lane state tables
-- fuel_reconciliation_period: locked 31 · open 2 · reopened 1
-- toll_reconciliation_period: 0 rows
-- week_statements: earnings closed 37 / draft 92 / restated 145; fuel closed 32; toll closed 37

-- zero-trip days, all platforms (Sep 14 – Oct 18): Sep 14, Sep 28, Oct 9, Oct 12, Oct 14
```

### 10.2 Files referenced

- `apps/fleet/src/components/fleet-financials/WeekReconciliationPage.tsx`
- `apps/fleet/src/utils/fuelPeriodGating.ts`, `apps/fleet/src/utils/tollPeriodGating.ts`
- `apps/fleet/src/components/toll-tags/reconciliation/{ReconciliationDashboard,ReconciliationWizard,GatedReconciliationStepper}.tsx`
- `apps/fleet/src/pages/{CloseWeekPage,FuelManagement,TollReconciliation}.tsx`
- `apps/fleet/src/services/weekCloseApi.ts`, `apps/fleet/src/utils/weekCloseBlockers.ts`
- `apps/fleet/src/components/imports/ImportsPage.tsx` (catalogue `:1638-1676`, batch commit `:804-831`)
- `apps/fleet/src/components/vehicles/BulkImportTollTransactionsModal.tsx` (dedupe `:706-794`, import loop `:963-1059`)
- `apps/fleet/src/utils/csvHelpers.ts` (`detectFileType` `:280`)
- `apps/fleet/src/components/couriers/CourierSettlementsPage.tsx`
- `apps/fleet/src/components/layout/fleetNavModel.ts` (`:141-142`, `:254-277`)
- `supabase/functions/_fleet-server/rush_settlement_routes.ts` (`:71-96`)
- `packages/finance-core/src/periodKey.ts` (ADR 0007)
- Related audits: `FUEL_SERVICE_LINE_SPLIT_AUDIT.md`, `DRIVER_SETTLEMENT_WEEK_RECONCILIATION_AUDIT.md`, `ROAMFLEET_RUSH_INTEGRATION_AUDIT.md`, `docs/FINANCIAL_INTEGRITY_AUDIT.md`, `docs/CLOSE_VOCABULARY.md`, `docs/toll-recon-enforce-flip.md`, `docs/rush-fleet-reconciliation-week.md`
