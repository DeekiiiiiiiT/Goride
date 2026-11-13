# Toll Architecture — Rebuild

**Status (12 Nov 2026):** design **Agreed** (reviewer rounds 1–9 done). **Phase 0 complete and live.** **Phase 1 in progress.** This file now keeps only what is still needed: the goal, the agreed design (Part B), the remaining phases, what is still open, and the tracker for the current phase.

**History:** the full version, including today's old system mapped in detail, every reviewer round with its answers, and Phase 0's round-by-round build log, is in git at commit `142ee692` (`git show 142ee692:docs/toll-architecture.md`). Build prompts are in `docs/toll-build/`.

**How the build runs** (`docs/how-we-build-playbook.md`):
- **Cursor** does the easy bulk (tables, grants, plumbing, CI lists, tests from Claude's lists).
- **Claude** writes the prompts and the money-critical SQL, and checks every round.
- **The owner** runs live SQL, flips switches and deploys.

Related: `docs/week-reconciliation-architecture-audit.md` (Week Reconciliation hosts Tolls as step 3).

---

## 1. What the toll section is for

**Every toll the fleet's money paid for in a week gets one clear answer to "who bears this cost?", and the week's toll money adds up to the cent.**

A toll is paid one of two ways:
- by the **tag** on the car, from a prepaid tag account (the tag provider's statement lists every crossing);
- in **cash** by the driver, which the fleet then pays back or the driver keeps as their own cost.

Each toll's cost is borne by one or more of:
- **A platform**, which paid it back: the rider paid the toll through Roam, Uber, InDrive or a future platform;
- **The driver**: personal driving, or a deadhead the fleet charges to the driver;
- **The fleet**: business driving, an allowed deadhead, or a write-off.

The week adds up when spend = platform + driver + fleet, with nothing undecided. The tag account adds up separately: opening + top-ups − usage = closing.

**What "enterprise-grade" means here (reviewer, accepted):** nothing "never fails". Failures are contained, detected and recoverable, and **money is never silently wrong.** Every rule below is written so a test can prove it.

---

## 2. The platforms (it is not just Uber)

The toll section must serve **every** rideshare platform without code changes per platform: **Roam** (our own app, native), **Uber**, **InDrive**, and future ones such as Lyft.

| Source | How it tells us about tolls | How certain the link is |
|---|---|---|
| **Roam** (native) | The ride app detects each plaza crossing on a ride (geofence) and charges the rider the actual tolls: `rides.ride_toll_crossings`, `ride_requests.actual_tolls_minor` (`supabase/functions/rides/fare/tollGeofence.ts`, `cashPayment.ts:91`). | **Certain.** We know the ride, the plaza and the time. No guessing needed. |
| **Uber** | Weekly CSV. Each trip carries the toll amount Uber paid back (`trip.tollCharges`). Later, "Support Adjustment" lines pay back tolls missed the first time (imported today as dispute refunds). Trip times are precise: request, pickup and drop-off. | **Inferred.** Matched by vehicle and time. |
| **InDrive** | Trips have start/end times only ("TIMED", `toll_controller.tsx:382`). The code records no per-trip toll payback for InDrive: "trip-level toll_charge only exists for Uber trips" (`toll_controller.tsx:5533`). | **Inferred, weaker.** *(to check: does InDrive pay tolls back at all, and how?)* |
| **Future** (e.g. Lyft) | Unknown until added. | Must fit through the adapter contract (B9) without engine changes. |
| **Tag provider** | Toll usage statement (one row per crossing, paid from the tag account) and top-ups. | Certain about the crossing; says nothing about the trip. |
| **Driver (cash)** | Cash toll entries from the driver app, which has a toll receipt scan (`apps/driver/src/components/fleet/DriverExpenses.tsx`, view `toll_scan`). | Certain about the payment once the receipt is checked; the trip link is inferred. *(to check: is the receipt required today?)* |

**Key point:** Roam knows the answer directly; the other platforms need matching. Today the design is built around Uber's shape, and Roam's certain data comes in only through a manual "bridge" button (`POST /bridge-rides`, `toll_controller.tsx:9835`, run from `TollAutomationSettings.tsx`; no schedule found).

---
---

# Part A — Old system facts still needed (for Phases 3–5)

## A1. Where toll data lives

Most toll data is JSON in one shared key-value table (`public.kv_store_37f42386`), keyed by prefix, with some of it copied to SQL tables. Money goes to a third place.

| Record | Key-value prefix | SQL table | Company stored? |
|---|---|---|---|
| Toll (usage, cash, top-up, adjustment) | `toll_ledger:` | `fleet.toll_ledger` (has `organization_id`) | Yes |
| Trip (with Uber `tollCharges`, `tollRefundResolution`) | `trip:` | `fleet.trips` | Yes *(to check: on every record)* |
| Claim (underpaid toll, Charge Driver) | `claim:` | `fleet.claims` | Yes, stamped from the toll (`claim_service.ts:180`) |
| Dispute refund (Uber support adjustment) | `dispute-refund:` + `dispute-refund-dedup:` | none | **No.** The CSV row is saved as-is (`dispute_refund_controller.tsx` ~line 717); some have `batchId` |
| Toll payments against tolls/claims | — | `public.toll_settlement_allocations` | **No `organization_id` column** (base schema) |
| Toll tag | `toll_tag:` | `fleet.toll_tags`, `fleet.toll_tag_assignments` | Yes |
| Toll plaza | `toll_plaza:` | `fleet.toll_plazas` | — |
| Roam ride crossing | — | `rides.ride_toll_crossings` | via the ride |
| Toll week state | — | `public.toll_reconciliation_period` (+ `toll_period_audit`) | Yes |
| Sealed week figures | — | `ledger.week_statements` (`source_hash`, `engine_version`, `version`, `supersedes`) | Yes |
| Settings (≈15 switches) | `toll_reconciliation:settings` | — | **One record for all companies** |

Plus about 15 helper key types for repeat-safety, markers and backfill runs (`toll_pnl_offset_marker:`, `toll_charge_reversal:`, `toll_bridge:crossing:`, `toll_idempotency:` and others).

## A5. Who makes the changes

- Many money actions are run **by the browser, step by step.** For example, Charge Driver on a toll with no trip calls a toll "reject" on fleet-toll, then creates a claim on fleet-claims (`apps/fleet/src/utils/tollChargeSagas.ts`). If the second call fails, the first has already happened.
- **Opening the Tolls page changes data:** auto-match runs on every open (`useTollReconciliation.ts`, `POST /auto-match`), and the dispute refund list auto-matches when opened (`dispute_refund_controller.tsx:1044`).
- Changes to dispute refunds don't check whether the week is sealed. Other toll routes do, at 27 call sites.

## A6. Size

| Piece | Size |
|---|---|
| `toll_controller.tsx` | 10,507 lines |
| `toll_period_controller.tsx` | 1,398 |
| `dispute_refund_controller.tsx` | 1,681 |
| `ReconciliationWizard.tsx` (browser) | 1,961 |
| `useTollReconciliation.ts` (browser) | 858 |
| Server files about tolls / claims / disputes / refunds | 51 |
| Fleet app files about tolls / claims / disputes | 123 |
| `packages/toll-core` | 37 files |
| fleet-toll routes | 101, of which 25 are backfill / repair / backup |
| fleet-claims route list | 77, mostly toll routes, of which 26 are backfill / repair *(to check why)* |
| Switches | 12 in `toll_reconciliation:settings`, plus `fleetUsesTollBrain`, `projectionReadsEventsForTolls`, `isUnifiedTollSettlementEnabled` |
| Volume today | 6 drivers; at most 135 trips and 22 toll rows in any one week (live check, 10 Nov, `docs/week-reconciliation-architecture-audit.md`) |

About a quarter of the routes exist to repair or back-fill data. The reviewer's smell test, accepted: **if the new model needs repair routes, the model is wrong.**

## A7. Screens

- **Fleet:**
  - Toll Reconciliation (`pages/TollReconciliation.tsx` → `ReconciliationWizard.tsx`, 41 components in `toll-tags/reconciliation/`), also embedded as Week Reconciliation step 3;
  - Toll Logs, Toll Low Balance, Toll Rate Drift;
  - Toll Tags (list, detail, assign, bulk import);
  - Claimable Loss (`claimable-loss/LossList.tsx`), Driver Claims;
  - Data Center imports.
- **Driver app:** expenses (including the toll receipt scan), settlement tabs and the trip ledger.
- **Admin:** 11 files mention tolls (plazas and others).

---

# Part B — Design (agreed)

## B0. Invariants: the contract

Each invariant names the automated test that proves it. A phase can't exit until its rows pass in CI.

| # | Invariant | Proven by |
|---|---|---|
| I1 | Every toll ledger row balances | Two-sided `ledger.entries` rows, `amount_minor > 0`; `ledger_rows_balance` |
| I2 | Every toll ledger row points at a live, non-legacy toll record | Reference trigger; `ledger_ref_required`, nightly `ledger_vs_records` |
| I3 | Nothing posts into a sealed week | Sealed-week trigger (Phase 0); `sealed_week_refuses_post` |
| I4 | A charge's allocations never exceed its amount; a payback's never exceed its amount | Database checks; `allocations_cap`, `payback_allocations_cap`, `correct_amount_up`, `correct_amount_down` |
| I5 | "Decided" can't disagree with the money | Dispositions derived; `disposition_derived` |
| I6 | One command, one effect, from any client | `command_id` per company + stored answer + driver outbox; `replay_same_answer`, `driver_outbox_crash` |
| I7 | A stale screen can't overwrite a newer decision | Record versions → 409; `concurrent_decide` |
| I8 | An unrelated change never blocks a decision | `week_version` only on seal / reopen; `unrelated_import_no_conflict` |
| I9 | No cross-company read or write | Company from the user's token; no parameter; no service-key access; `two_company_suite`, `token_a_cannot_reach_b` |
| I10 | A sealed week never changes silently | `source_hash` + nightly recompute; `seal_recompute_equal` |
| I11 | The matcher explains itself and is repeatable | Pure + stored inputs; `matcher_golden_*` |
| I12 | One crossing is paid once | `source_ref` unique + `duplicate_of` + review list; `reimport_skips`, `roam_cash_duplicate`, `tag_cash_duplicate` |
| I13 | Legacy records never touch live math or the nightly checks | `is_legacy` excluded on both sides; `legacy_excluded` |
| I14 | Toll money is never counted twice | Cash-trip paybacks via `recovered_in_driver_cash`; `cash_trip_no_double_count` |
| I15 | A new platform needs no engine change | `engine_untouched_by_adapter` |
| I16 | A page read never writes | `toll_read` / `toll_write` split; CI route rule |
| I17 | One answer to "how much this week": the sealed result once sealed, the live result before; `after_seal` facts listed beside it, never folded in | One function `toll_read.week_result` (B8); `settlement_uses_sealed_week`, `after_seal_listed_not_counted` |
| I18 | Every **active** charge and every **active** payback can be decided; a reversed payback is terminal | Every intent exists; one test per intent |
| I19 | Unverified cash is never paid | `unverified_cash_not_posted` |
| I20 | Nothing sits undecided unnoticed | Aging alerts; `aging_alerts`, `after_seal_reversal_pages_at_7_days` |
| I21 | No repair routes | None shipped |
| **I22** | **Every toll account ties to its records every night, with no exceptions** | The nightly checks in B5; `nightly_ties_*`; `week_flow_matches_disposition` (check 3) |
| **I23** | **A week moved, reversed or corrected still ties in both weeks** | `correct_week_ledger_moves`, `reversal_in_and_across_weeks` |
| **I24** | **No driver is paid for a week before its tolls are sealed** | Settlement commands refuse; `pay_refused_before_toll_seal` |
| **I25** | **A week seals only when everything in it is decided** | Seal refuses with `PENDING_NOT_RESOLVED` + the blocking records; `seal_refuses_pending`, `seal_blocks_until_decided` |
| **I26** | **A late fact for a paid week is never stuck:** it is carried into the open week and decided there; the paid week never changes | `carry_forward`; `carry_forward_each_kind`, `taken_back_after_settlement` |

## B1. Principles (agreed; not reopened)

1. One record per thing, in SQL, with a required company.
2. Allocations are the truth; status is derived.
3. The server decides; the browser asks.
4. Reads never write.
5. Platforms are plug-ins.
6. Roam is native.
7. One function computes the week.
8. History is permanent.

## B2. The records

All tables are in the `toll` schema, with `organization_id uuid NOT NULL` on every table and every unique key starting with it. Reads go through `toll_read.*`, writes through `toll_write.*`, and system work through `toll_system.*`.

| Table | One row per | Key fields |
|---|---|---|
| `toll.charges` | A toll the fleet's tag or the driver's cash paid | vehicle, driver, plaza, `occurred_at`, `week_key`, `time_precision`, `amount_minor` > 0, `paid_by`, `source`, `source_ref` (unique), `evidence_status` (`unverified` \| `verified` \| `rejected`), `duplicate_of`, `after_seal`, **`adjusts_charge_id`**, `is_legacy`, `version`. |
| `toll.charge_changes` | Each amount or week correction | `charge_id`, field, old, new, **`pending`**, `decision_id` |
| `toll.platform_trips` | A trip from any platform (matching input) | `platform`, `platform_trip_id`, driver, vehicle, times, `time_precision`, `payment_method`, `is_legacy` |
| `toll.paybacks` | Money a rider paid for a toll | `platform`, `kind`, `platform_trip_id`, `reference` (unique), driver, date, `week_key`, `amount_minor` > 0, `reversal_of`, `received_by`, `after_seal`, `is_legacy`, `version` |
| `toll.allocations` | One slice of a charge's cost to one bearer | `charge_id`, `bearer`, `amount_minor`, `payback_id` (when platform), `reason`, **`provisional`**, `decision_id`, `reversed_by` |
| **`toll.carried_facts`** | One late fact carried from a sealed, paid week into an open week | `kind` (`charge` \| `payback` \| `take_back` \| `correction_up` \| `correction_down` \| `cash_recovered`), `original_id` (the charge, payback or charge change), `from_week`, `to_week`, `amount_minor`, `bearer?`, `decision_id`. **It is the counted week of the original fact (`to_week`), the record every leg of P18–P20 refers to (I2), and the only source of `week_result.carriedIn`** |
| `toll.payback_unlinked_decisions` | A person's decision that a payback, or its leftover, has no toll | `payback_id`, `amount_minor`, reason, `decision_id`, `reversed_by` |
| `toll.decisions` | Every command (append-only) | `command_id`, `intent`, `actor` (`user` \| `system` \| `staff`), **`actor_job`**, acting company for staff, reason, targets, versions, engine version, `response` (B3), `created_at` |
| `toll.suggestions` | One engine suggestion (append-only) | candidate ids, score parts, rules fired, engine version, `inputs`, inputs hash, `superseded_by` |
| `toll.tag_accounts` / `toll.tag_topups` | The tag account and its top-ups | account, amount, date, `source_ref` |
| `toll.platform_settings` | One row per platform per company | `pays_tolls_back`, `payback_mode`, `matching_window_seconds`, `auto_apply`, `adapter_version` |
| `toll.plaza_rules` | One row per plaza | `auto_duplicate_window_minutes`, `review_duplicate_window`, `changed_by`, `changed_at`. **set only by a platform owner**, through a `toll_system` function that writes an audit row (as for `staff_company_access` and `switch_state`); no direct table edits |
| `toll.staff_company_access` | One staff person allowed to act for one company | staff user, company, `granted_by`, `granted_at`, `revoked_by`, `revoked_at` (B7) |
| `toll.switch_state` | One row per company | `tolls_v2` (on / off), `changed_by`, `changed_at` (B11) |

**Dispositions (derived, never stored):**
- **Charge:**
  1. `duplicate`: confirmed as a duplicate of another charge. `confirm_duplicate` reverses any posting and allocations it had (P15). Final.
  2. `rejected`: a person rejected the cash receipt. Never posted. Final.
  3. `unverified`: a cash charge whose receipt isn't checked yet. Not posted (I19). **Blocks the seal.** It becomes `pending` once verified.
  4. `awaiting_cash`: a Roam cash-ride charge whose ride is still `awaiting_cash_settlement` (A13). Posted (P2 / P3), not yet allocated. **Does not block the seal** (B6).
  5. `decided`: Σ active allocations = amount.
  6. `pending`: anything else (Σ active allocations < amount).
- **Which week a charge or payback counts in:** the `to_week` of its `toll.carried_facts` row when it has one (G2), otherwise its `week_key`. This is the week used by the week result and by check 3.
- **Payback:** `pending` (none allocated, none left unlinked), `part_allocated`, `allocated`, `left_unlinked` (fully or the leftover), or **`reversed`**. When a payback is reversed:
  - all its active allocations **and** its unlinked decision are reversed with it (`reversed_by` = the reversal's decision);
  - every charge it covered goes back to `pending` for that amount;
  - the reversing payback itself (`reversal_of` set) has no disposition of its own and can't be allocated.

**Sealed weeks:** only in `ledger.week_statements` (`kind = 'toll_week'`), with `driver_settlement_status` and `platform_settlement_status` added.

**Roam:** `native_ride_charge` (system, `actor_job = native_ride_charge`) writes the charge. Then:
- **Card / in-app ride:** in the same transaction it writes the `native` payback and the platform allocation, and posts P4 and P6 together.
- **Cash ride:** at ride end it writes **the charge only** (P2 or P3). The payback and its allocation are **not written yet**. When the ride's cash is settled (`cash_settlement_status = 'settled'`, A13), one transaction (`actor_job = native_cash_settled`) writes the `native` payback (`received_by = driver`) and the allocation, and posts P5 and P6 together. So an allocation never exists without its P5, and `toll:payback_unallocated` can't go negative. Test: `roam_cash_payback_waits_for_settlement`.
- **`native_cash_settled` branches on the charge's counted week, never on the ride's state.**
  - **Week open, charge not decided:** write the `native` payback and post P5 + P6 (above).
  - **Week open, charge provisionally decided** (the week was sealed with it `awaiting_cash`, then reopened): first reverse the provisional allocation (P15), then post P5 + P6. *This case was found while checking C1.* Without it, P6 would push the allocations above the charge's amount (I4).
  - **Week sealed** (the charge must then be provisionally decided): write a `cash_recovered` row in `toll.carried_facts` for the current open week and post P20 (B6).
  - Test: `native_cash_settled_branches_on_seal`, covering all three cases.
- **How much of the toll a cash ride paid back** (from the settlement outcome, A13):
  - `exact` or `overpay`: the full actual toll;
  - `underpay`: the cash received covers the toll first, so the payback = the smaller of the toll and `cash_received_minor`. Any rest of the charge is decided as the fleet's at once;
  - `unpaid`: no payback. The whole charge is decided as the fleet's at once.
  - **Until the cash is settled, the charge's state is `awaiting_cash`.**

**Duplicates:** re-imports are stopped by `source_ref`. The auto rule is cross-source only (vehicle + plaza within the plaza window; no driver in the key). The review list covers the same vehicle and plaza on the same day. `roam_ride` and `tag_statement` win over `driver_cash`.

## B3. Commands

```
POST /toll/commands/{intent}
{ command_id, charge_id?, payback_id?,
  expected_charge_version?, expected_payback_version?,     // required per intent, table below
  amount_minor?, target_week?, reason_code, note }
→ 200 { decision_id, charge_version?, payback_version?,
        weeks: [ { week_key, week_version, delta } ] }     // one entry per week touched
→ 200 replay: the stored first answer
→ 409 { code, current_state, sealed_weeks? }               // names the sealed week(s)
```

- **On every 200 the client re-fetches current state.** A replay describes the moment of the first call.
- **The stored answer** is the exact first 200 body, at most 64 KB. A larger answer stores `decision_id`, the versions and the per-week deltas, with `truncated = true`; a replay of it still works.

**Intents (closed list) and the versions each requires:**

| Intent | Who | Requires | What |
|---|---|---|---|
| `link_payback` | person | charge + payback versions | Allocate a charge (or part) to a payback |
| `driver_pays` / `fleet_absorbs` | person | charge version | Allocate to the driver / fleet |
| `leave_payback_unlinked` | person | payback version, **or** the `toll.carried_facts` row's version for a P19 leftover | A payback, or its leftover, has no toll; reason required. A P19 leftover is decided on its carried row in the open week, because its payback sits in a sealed week |
| `undo_decision` | person | `decision_id` + `expected_charge_version` and `expected_payback_version` for **every distinct charge and payback** the decision touched. The server works out the touched records from the decision itself and checks each version; a missing or stale one → `VERSION_CHANGED` | **A person made the wrong call:** reverse that decision. The facts stay as they are. |
| `reverse_payback` | import or person | payback version | **The platform changed the facts:** it took the money back. A new positive payback with `reversal_of`; the original's allocations and unlinked decision are reversed |
| `correct_charge_amount` | person or import | charge version | Up, or down to ≥ allocations: applied, posting P16 (B5). **down below allocations** (for example, any down correction of a decided charge in a reopened week) **is applied, not refused.** The allocations are first reduced by the shortfall, split in proportion to each bearer (the C3 rule, B5), reversing that part of P6–P8. Then P16 posts. A reduced platform allocation leaves a leftover in `payback_unallocated` that must be decided (C2). `ALLOCATIONS_EXCEED_AMOUNT` stays only for a person's command whose expected allocations no longer match. Import into a sealed week: a `pending` change for a person. Person on a sealed week: `WEEK_SEALED` |
| `correct_charge_week` | person | charge version | Both weeks open: applied (ledger in B5). Either sealed: `WEEK_SEALED` with `sealed_weeks` naming which |
| `confirm_duplicate` / `release_duplicate` | person | both charge versions | Settle a review pair |
| `verify_cash_receipt` / `reject_cash_receipt` | person | charge version | Verify: **P3 posts at this moment** and the charge becomes `pending`. Reject: final, never posted; reason required |
| `carry_forward` | person (reconciliation owner) | the fact's version + the target week's open state; for a take-back, `bearer` (`fleet` \| `driver`) | Only for an `after_seal` fact whose week is **sealed and its driver settlements paid** (otherwise the answer is reopen). It writes a `toll.carried_facts` row (`to_week` = the current open week), and the fact is posted and decided there (B5). The sealed week is never touched. Any other case → `REOPEN_INSTEAD`. **One system case:** `native_cash_settled` carries a `cash_recovered` fact itself (B6) |
| `apply_suggestion` | person | charge + payback versions | Accept a suggestion |
| `auto_apply_suggestion` | system | (read at run time) | B4 |
| `native_ride_charge` | system | — | Roam ride end |
| `import_batch` | person or system | — (batch hash) | One import file |
| `seal_week` / `reopen_week` | approver | `week_version` | B6 |

**Locks:**
- The record version(s) are the lock; when two records are involved, the payback is locked before the charge.
- `week_version` is checked only by seal / reopen.
- Reopen holds an exclusive week lock, so imports get `WEEK_REOPENING`.

**Transaction order:**
1. company from the token;
2. permission;
3. `command_id` replay;
4. lock and versions;
5. weeks not sealed or reopening;
6. decision and allocations;
7. ledger;
8. versions and recalculation;
9. store the answer.

All or nothing.

**Conflicts:**

| Race | Result |
|---|---|
| Two people, same charge | Second gets `VERSION_CHANGED`, nothing written |
| An import brings a candidate while a person decides | Suggestion only |
| An import for a sealed week | Stored `after_seal` (facts) or as a `pending` change (corrections) |
| An import during a reopen | `WEEK_REOPENING`, retried |
| The same row in two batches | Unchanged skipped; changed amounts → corrections; key clash → `DUPLICATE_BATCH_ROW` with a row report |
| The same `command_id` from two users | The first answer |
| Retry after a timeout | The first answer |

**Clients:** Fleet makes the `command_id` per button press. The driver app gets a durable outbox.

## B4. Matching engine

- Pure, with stored inputs, append-only; runs only when data arrives.
- The window is the wider of the two precisions; never widened.
- Candidates exclude duplicates, legacy, `after_seal`, reversed and reversing paybacks.
- **Auto-apply only when all are true:** the company has it on (default off, shadow first), one candidate, a tight window, a score above the threshold, and neither side `date_only`. Recorded with `actor_job = auto_apply_suggestion`.
- Roam is native, not auto-apply.

## B5. Money: the ledger

**One ledger:** `ledger.entries` through `toll_system.post`. A row's **week** is `periodKeyFor(effective_at)` (ADR 0007), and `effective_at` is the time of the fact (the crossing, the trip, the decision). Ledger idempotency key: `toll:<company>:<command_id>:<line>`.

**Accounts (all `org:<co>:…`, created on first use by the existing rule):**

| Account | Class | Holds | Its balance must equal (nightly, I22) |
|---|---|---|---|
| `toll:tag_prepaid` | asset | Money on the tag account | The tag roll-forward closing |
| `toll:suspense` | asset | Charges not yet decided | Σ undecided part of non-legacy, non-`after_seal` charges |
| `toll:payback_unallocated` | liability | Payback money received or due but not yet given to a charge: pending, part-allocated leftovers, and left-unlinked amounts | Σ unallocated part of active paybacks |
| `toll:receivable_platform` | asset | Paybacks a platform owes the fleet (card / in-app) | Σ fleet-received paybacks whose payout isn't confirmed |
| `toll:recovered_in_driver_cash` | asset | Paybacks the driver received in cash, already inside their passenger cash | Σ driver-received paybacks of weeks not yet settled |
| `toll:receivable_driver` | asset | Tolls the driver must pay (personal, charged deadhead, shortfalls) | Σ driver allocations not yet settled |
| `toll:payable_driver` | liability | Verified cash tolls the fleet owes the driver | Σ verified cash charges not yet settled + Σ P19 driver credits not yet settled |
| `toll:expense` | expense | The fleet absorbs | Σ fleet allocations |
| `toll:platform_payout_clearing` | asset | The toll part of a confirmed platform payout, waiting for its bank deposit | Σ toll part of confirmed payouts not yet deposited. read from Business Finance's `fleet_bank_confirm:` records in the key-value store, not from `toll.*`. Because today's record is one "money received" step (A13), P10 and P11 post together and this balance is **0 every night** until Business Finance has separate steps |
| `bank` | asset | The fleet's bank, **ledger side** (see the hand-off below) | Not a toll check; Business Finance's |

**Postings.** Every row debits one account and credits another for the same amount.

| # | Event | Debit | Credit |
|---|---|---|---|
| P1 | Tag top-up | `toll:tag_prepaid` | `bank` |
| P2 | Tag crossing arrives | `toll:suspense` | `toll:tag_prepaid` |
| P3 | **A driver cash toll becomes verified**: `verify_cash_receipt`; an import that carries its own proof; or a Roam native crossing paid in cash, which is created verified because the crossing and amount are certain *(to check: how the ride app knows a plaza was paid in cash, not by tag)*. A Roam cash **ride's** settlement is not P3: it is the rider's payback, P5 + P6 | `toll:suspense` | `toll:payable_driver` |
| P4 | **Payback is recorded** (the fact from the platform's statement or the Roam ride; not the money in the bank, which is P10/P11), card / in-app. The full amount | `toll:receivable_platform` | `toll:payback_unallocated` |
| P5 | **Payback is recorded**, cash trip (Roam: only once the ride's cash is settled, B2) | `toll:recovered_in_driver_cash` | `toll:payback_unallocated` |
| P6 | Allocate a charge to a payback (`link_payback`, native, auto). For a Roam cash ride, always in the same transaction as its P5 (B2, EC2) | `toll:payback_unallocated` | `toll:suspense` |
| P7 | Allocate to the driver | `toll:receivable_driver` | `toll:suspense` |
| P8 | Allocate to the fleet | `toll:expense` | `toll:suspense` |
| P9 | `leave_payback_unlinked` | **no posting.** The amount is already in `toll:payback_unallocated` from P4/P5, visible and aged (PB1) | |
| P10 | Platform payout confirmed. The toll part = Σ fleet-received paybacks, net of take-backs, for that company, week and platform | `toll:platform_payout_clearing` | `toll:receivable_platform` |
| P11 | Payout deposit confirmed. Today the same trigger as P10, in the same transaction (A13) | `bank` | `toll:platform_payout_clearing` |
| P12 | **Driver settlement, event 1:** the driver hands over the week's passenger cash. Toll side: the cash-trip paybacks inside it | `bank` | `toll:recovered_in_driver_cash` |
| P13 | **Driver settlement, event 2:** the fleet settles toll amounts with the driver. Cash tolls it owes back | `toll:payable_driver` | `bank` |
| P14 | **Driver settlement, event 2:** tolls the driver owes, taken from the settlement | `bank` | `toll:receivable_driver` |
| P15 | Undo, week move | The exact reverse of the original rows (and, for a week move, new rows in the new week) | |
| **P16** | `correct_charge_amount` **down** by D (to ≥ allocations), tag charge | `toll:tag_prepaid` | `toll:suspense` |
| | … **down** by D, cash charge | `toll:payable_driver` | `toll:suspense` |
| | … **up** by D, tag charge (the charge becomes pending for D) | `toll:suspense` | `toll:tag_prepaid` |
| | … **up** by D, cash charge | `toll:suspense` | `toll:payable_driver` |
| **P17** | `reverse_payback`: the platform took a payback back. The reversing payback posts (a) the exact reverse of every active P6 of the original (Dr `toll:suspense`, Cr `toll:payback_unallocated`), then (b) the exact reverse of the original's P4 or P5 **for its full amount** (Dr `toll:payback_unallocated`, Cr `toll:receivable_platform` or `toll:recovered_in_driver_cash`). it uses up the unallocated / left-unlinked leftover first, then reverses allocations newest first, only as far as Z needs | see the row | |
| **P18** | `carry_forward` of a **take-back** of Z against a paid week. **Step a**, the part of Z that was leftover (never covered a toll; taken first): | `toll:payback_unallocated` | `toll:receivable_platform` (card) or `toll:recovered_in_driver_cash` (cash trip) |
| | **Step b**, the part of Z that had covered tolls, bearer = fleet | `toll:expense` | same as step a |
| | … step b, bearer = driver (charged in the open week) | `toll:receivable_driver` | same as step a |
| **P19** | `carry_forward` of a **down correction** D against a paid week. **Debit (who gets the money back):** tag charge → `toll:tag_prepaid` (the provider refunds the tag); cash charge → `toll:receivable_driver` (the driver was already reimbursed the full amount and now owes D back) | see the left | **Credit D split in proportion to each bearer's active allocation:** the driver's share → `toll:payable_driver` (the week is paid, so the driver is owed it in the next settlement, never a negative receivable); the fleet's share → `toll:expense`; the platform-covered share → `toll:payback_unallocated`. **Rounding:** each share is rounded down to the cent, and any cents left over go to the driver, then the fleet, then the platform. **The platform share is still undecided:** no unlinked decision is written. It counts in the open week's `unallocatedMinor`, so it ages at 14 days and blocks that week's seal until a person decides it (`leave_payback_unlinked` on the carried row). `tag_refund_excess` is only a label to help that person |
| **P20** | A Roam cash ride's cash settles **after** its week sealed with a provisional fleet decision (B6): the rider's cash covering the toll, carried as `cash_recovered` | `toll:recovered_in_driver_cash` | `toll:expense` |

**Notes on the postings:**
- **PB1, the excess payback.** P4/P5 post a payback's full amount when it arrives, and P6 moves only what is allocated. A leftover therefore stays in `toll:payback_unallocated`: the trial balance is whole from the first moment, and nothing is classified before a person looks.
  - The reviewer's option A (suspense until classified) is the same idea, applied at arrival rather than at the unlink.
  - Classifying leftovers as fleet income or a refund stays a later finance decision (`financial_treatment`, not built).
  - **Aging:** a leftover older than 14 days alerts the reconciliation owner.
- **PB3, settlement as separate events.**
  - P12 is the driver's cash coming in. P13 and P14 are the fleet settling the toll amounts. Each row balances on its own; the driver sees them net in one settlement run.
  - Driver settlement posts P12–P14 for the toll lines only. Its other money (driver share, fuel, and so on) keeps its own postings.
  - In practice P13 and P14 net into one bank movement. They are posted as separate rows so each account clears exactly.
- **The bank hand-off (reviewer Q2).** `bank` is the ledger-side fleet bank account. Business Finance keeps its bank confirmations in the key-value store today and posts nothing to the ledger (A12). The toll design posts P1, P11, P12 and P13/P14 to `bank`, and P10/P11 are triggered by Business Finance's existing confirmation records. When Business Finance moves to the ledger, it uses this same `bank` account. Until then, the toll side's `bank` movements are listed in the week result for Business Finance to tie against its deposits.
  - **two records of the same money, not one.** Until Business Finance moves to the ledger, the toll side's `bank` rows and Business Finance's key-value record are **two separate records of the same money**, joined only by this hand-off (`week_result.ledgerMovements.bankMinor`). A future auditor should not read `bank` as Business Finance's bank. It is the toll side's view of it.
- **The payout trigger.**
  - P10/P11 post only through one function, `toll_system.payout_received(company, week, platform, source_ref, source_version, amount_received)`. The toll postings depend only on this function, never on where the call comes from.
  - **Today the source is the key-value record:**
    - Business Finance's PUT and DELETE handlers call the function after their own write;
    - a nightly sweep compares every `fleet_bank_confirm:` record with what is posted and catches any missed call;
    - a **changed** record (new amount) reverses the old P10/P11 and posts again; a **deleted** record ("Unconfirm") reverses them (A13).
  - **The company is the record's stamped `organizationId`, never the key.** A record whose key company differs from its stamped company is refused and alerts (the A13 bug).
  - **When Business Finance moves to the ledger,** only the caller changes, to a ledger event. The function and the postings stay the same: a swap, not a rewrite.
- **P17 (reversing a payback, including its unlinked leftover).**
  - The leftover left unlinked had no posting of its own (P9): it simply stayed in `toll:payback_unallocated`. So nothing is posted to "reverse the unlinked decision". Step (b) takes the payback's **full** amount out of `toll:payback_unallocated`, and that includes the leftover.
  - After P17, the original payback's net effect on `toll:payback_unallocated` is zero.
  - **The credit never goes to `bank`.** This corrects the reviewer's note 7. A platform takes money back by netting it from a later payout, not by drawing on the fleet's bank. So step (b) lowers `toll:receivable_platform`, and the next payout's toll part (P10) is smaller by that much.
  - If the platform has already paid the original, `toll:receivable_platform` can go to a credit balance until the next payout nets it off. The nightly line for that account is signed, so this still ties.
  - For a cash-trip payback, the credit goes to `toll:recovered_in_driver_cash`. **
- **The payout clearing lifecycle (reviewer Q2).** `toll:platform_payout_clearing` holds only the **toll part** of a payout. The rest of the payout (fares, fees) is never in toll accounts. It fills at P10 and empties at P11, so its balance is always "toll money in confirmed payouts not yet deposited" and can't build up unexplained.

**G2, carrying a late fact into the open week.** Used only when the fact's week is sealed **and** its driver settlements are paid, so it can't be reopened (B6). The paid week stays exactly as sealed. The fact gets a `toll.carried_facts` row, is counted in the current open week and is listed there as "carried from week W". What it posts there:

| Late fact | In the open week |
|---|---|
| A late charge (tag crossing, verified cash) | P2 or P3, then decided like any charge (P6–P8) |
| A late payback | P4 or P5, then allocated or left unlinked like any payback |
| A **take-back** of a payback from the paid week | **P18.** The leftover part just clears (step a). The part that had covered tolls is absorbed by the fleet or charged to the driver in the open week (step b). The bearer is chosen by the reconciliation owner and is required. The original charge stays decided in the paid week, so there is nothing to re-decide |
| An **up** correction of D | A new charge of D with `adjusts_charge_id` = the original; posted (P2 / P3) and decided like any charge |
| A **down** correction of D | **P19.** Split in proportion to who bore the charge; the platform share is left for a person to decide |
| A Roam cash ride settled after a provisional seal | **P20** (B6), carried by the system |

- **The order of P19 is proportional,** and the platform share is undecided, not pre-classified. A reviewer once expected the platform to "net it from a future payout". It won't: the platform paid what it charged the rider, as below. So the leftover is settled by **a person's decision**, or by a later take-back if the platform corrects its own charge. Either way, it is never booked as fleet income automatically.
- **Why P19 never owes the platform.** A platform pays back what **it charged the rider**, not what the fleet's tag cost. A tag refund doesn't change what the rider paid, so nobody can claim it from the fleet. The platform-covered part of a refund is payback money that no longer covers a toll. That is a leftover, kept in `toll:payback_unallocated` like any other (PB1). If the platform later corrects its own charge, that arrives as its own take-back (P17 / P18).
- **Why P18's leftover is taken first:** the leftover never covered a toll, so taking it back costs no one anything.

- A carried payback reversal against a paid week is the reviewer's option A, made general so that no kind of late fact can get stuck.
- The reviewer's third reason, "recovered from platform", isn't a bearer. If the platform pays the money again, that is a new payback, and it is handled as one.

**PB2, moving a charge to another week** (`correct_charge_week`, both weeks open):
1. Reverse every ledger row of the charge in the old week: P2 or P3, and every P6–P8 from its allocations. Each reversal is tagged with the old week (`effective_at` in the old week) and points at its original.
2. Post the same rows again in the new week, with `effective_at` set to the corrected time.
3. Move the charge's allocations with it. They are the same allocations; only their ledger rows are re-posted.

Both weeks then tie (I23). Because the command refuses if either week is sealed (B3), the sealed-week trigger is never in the way. A sealed week is reopened first, and the move then goes through the same path. *(Reviewer's note: the old week can't be sealed at this point, so the reversal never touches a sealed week.)*

**PB4, reversals in the week result:**
- **Same week:** the original's allocations and its arrival are reversed (P17). The week's "paid back by platforms" total counts neither the original nor the reversal, and both show in the week's list as "taken back".
- **Different weeks:** the original week keeps its figures (if sealed, it stays sealed and unchanged). The **reversal lands in the week it arrived:** its reversing rows are dated in the new week, so that week shows "taken back from week W: −X", and the charges it uncovered appear there as pending again.
  - If the original week is still open, the uncovered charges go back to pending in their own week.
  - If it is sealed, the reversal is stored `after_seal` against the original week (shown as "new data after seal — reopen to include"), and the new week shows nothing of it until a person reopens or decides.

**Nightly checks (I22), per company.** Each check excludes `is_legacy` on both sides, and a failure is an alert, never a repair.
1. Each toll account's balance equals its line in the account table above. **Data sources:** `toll.*` for every account except `toll:platform_payout_clearing`, which is checked against Business Finance's `fleet_bank_confirm:` records in the key-value store.
2. Every toll ledger row has a live record, and every decided record's money is on the ledger.
3. **Week flow matches the week's answer.**
   - **Each ledger row is counted in the week of the record it belongs to, not the week it was posted.** Each leg of a row carries the record it belongs to (I2):
     - legs on `suspense`, `expense`, `receivable_driver`, `payable_driver` (P3, P7, P8, P16) and the `tag_prepaid` leg of P2 / P16 → **the charge's current `week_key`**;
     - legs on `payback_unallocated`, `receivable_platform` and `recovered_in_driver_cash` → **the payback that caused the row**. For P17 that is the **reversing** payback, so a take-back counts in the week it arrived. For P6 and its `undo_decision` reverse, it is the linked payback;
     - P1 top-ups → the top-up's week; P10/P11 → the payout's week; P12–P14 → the driver week they settle.
     - "the charge's week" and "the payback's week" mean the counted week (the `to_week` of its `toll.carried_facts` row when it has one, B2). **Every leg of P18, P19 and P20 refers to its `toll.carried_facts` row (I2) and counts in that row's `to_week`** (G1.8). Test: `check3_carried_facts`.
   - **For each open week, each account's change counted this way equals what `week_result` implies for that week:**
     - Δ`suspense` = `pending.amountMinor`;
     - Δ`expense` = `bearers.fleetMinor`;
     - Δ`receivable_driver` = Σ `drivers.owesFleetMinor`, less what P14 settled;
     - Δ`payable_driver` = Σ `drivers.fleetOwesMinor`, less what P13 settled;
     - Δ`recovered_in_driver_cash` = Σ `drivers.recoveredInPassengerCashMinor`, less what P12 settled;
     - Δ`payback_unallocated` = `paybacks.unallocatedMinor` + `paybacks.leftUnlinkedMinor` (paybacks recorded minus allocated, net of take-backs);
     - Δ`receivable_platform` = `paybacks.receivedMinor` (fleet-received) − `takenBackMinor` − the toll part of the week's P10;
     - Δ`tag_prepaid` = `tagAccount.topUpsMinor` − `tagAccount.usageMinor`.
   - **Why this holds** (the reviewer's trace, worked through):
     - Charge X in week W is linked to payback Y in W, and Y is taken back in W+1 while W is open.
     - P17's `suspense` leg counts in W (the charge's week), so W's Δ`suspense` = X = W's pending.
     - P17's payback legs count in W+1 (the reversing payback's week) and net to zero there, as W+1 shows `takenBack X` and no pending.
     - A week move is the same: the charge's `week_key` changes, so its old rows and their reversals both count in the new week and cancel, and only the re-posted rows remain.
   - Test: `week_flow_matches_disposition`, run on a same-week reversal, a cross-week reversal, a week move and a P16 correction.
4. For each sealed week: the recompute equals `source_hash`.
5. **`after_seal` control:**
   - **The list:** each `after_seal` fact with its `kind` (`charge`, `payback`, `reversal` or `correction`), `id`, `amountMinor`, `arrivedAt` and `relatedWeekKey` (the week it affects; for a cross-week reversal, the original payback's week).
   - **The check:** per affected week, **both the count and the sum** of `after_seal` charges and paybacks in `toll.*` equal that week's list.
   - These facts are in no week's totals and no account (they are never posted until included), so this line ties the gap to zero.
6. **Aging:**
   - undecided charges, unallocated payback leftovers and `after_seal` facts older than 14 days alert the reconciliation owner;
   - **an `after_seal` reversal older than 7 days pages the reconciliation owner.** The money has already left the fleet, but the sealed week can't show it until it is reopened;
   - a Roam cash ride whose cash is never settled shows here as an undecided charge (B10);
   - `toll:receivable_platform` **in credit for one platform for more than 30 days** pages the reconciliation owner. That means a take-back the platform never netted from a payout;
   - an unverified cash receipt older than 7 days alerts. It blocks its week's seal (B6).
7. **The payout sweep heals itself.** The nightly sweep calls `toll_system.payout_received` again for every `fleet_bank_confirm:` record whose `source_ref` + `source_version` doesn't match what is posted:
   - the same version is a no-op;
   - a changed version is reversed and posted again;
   - a deleted record is reversed.

   The call is repeat-safe, so healing is safe. **Every heal also raises an alert**, so a missed call from Business Finance is fixed *and* seen. A record refused for a key / company mismatch (A13) is never healed: it alerts only.

## B6. Seal = frozen snapshot

- **Seal before any driver payment.**
  - **Checked:** today's settlement pay / collect commands don't check the toll seal (A12), so the cash desk can pay before tolls are sealed.
  - **Phase 0 adds the refusal:** a pay or collect for a driver week whose toll week isn't sealed gets `TOLL_WEEK_NOT_SEALED`.
  - Driver settlement then reads only the sealed result.
- **Seal requires, at the moment of sealing**, in the week's counted records (B2):
  - every active charge is `decided` (`pending.charges = 0`);
  - no cash charge is `unverified`;
  - no duplicate review pair is open;
  - every active payback is in a final state: `allocated`, `left_unlinked` or `reversed`. Not `pending` and not `part_allocated` (`paybacks.unallocatedMinor = 0`; B8 defines the fields).

  - **`awaiting_cash` charges don't block.** In the same seal transaction, each one is decided `fleet_absorbs` with `provisional = true` (system, `actor_job = seal_week`) and listed in the sealed result.
    - If the ride's cash settles later, `native_cash_settled` carries a `cash_recovered` fact into the open week **by itself** (P20, for the cash that covered the toll). It doesn't need a person, and it doesn't need a reopen even when the drivers aren't paid yet.
    - A provisional decision changes only through P20, or by being reversed when its week is reopened and the cash then settles (B2, C1). If the cash never settles, it stays the fleet's cost, which is the same answer B10 gives for `unpaid`.
- **A down correction to a sealed week:**
  - **drivers not paid yet:** `carry_forward` → `REOPEN_INSTEAD`; the week is reopened, and `correct_charge_amount` applies it with P16, reducing the allocations in proportion first if needed (B3);
  - **drivers paid:** `carry_forward` → P19.

  Both paths use the same proportional split, so the answer doesn't depend on timing. Tests: `p19_before_settlement`, `p19_after_settlement`.

  Otherwise `seal_week` refuses with **`PENDING_NOT_RESOLVED`** and lists each blocking record (`kind`, `id`, `amountMinor`, `reason`). for a charge, `reason` is **its one state** (`pending` or `unverified`); otherwise `review_pair` or `unallocated_payback`, so the screen can show what stops the seal. `after_seal` facts can't exist before a seal, so they aren't part of this rule.
- **At seal:** a `ledger.week_statements` row (`kind = 'toll_week'`) with the result, `source_hash`, `engine_version`, who and when, and the settlement statuses.
- **After seal:** commands get `WEEK_SEALED`; the trigger refuses rows for that week; the nightly recompute must equal `source_hash`.
- **Reopen:** an approver, a reason, a new version, an audit row, an exclusive lock. Refused once driver settlements are paid. **"a correction" is `carry_forward`**: the late fact is brought into the open week (B3, B5), and the paid week never changes. A sealed week whose drivers aren't paid yet is reopened instead (`carry_forward` refuses it with `REOPEN_INSTEAD`). Warns when the platform has settled.

## B7. Company isolation

1. Company-facing `toll_read.*` / `toll_write.*` are called with the **user's own token**, passed through by the server (a change from the service key, proven by a Phase 0 test).
2. The company comes from `auth.jwt -> 'app_metadata' ->> 'organizationId'` only, never `user_metadata`. There is no company parameter, and a token without one fails closed.
3. The service key has no access to those functions or to `toll.*` tables.
4. `toll_system.*` takes an explicit company and only the service key can call it. CI fails if a user request handler calls one.
5. **Staff acting for a company:**
   - Access comes from `toll.staff_company_access`, never from the client.
   - **Granted or revoked only by a platform owner** (not the staff person), each grant and revoke written as an audit row.
   - **Every staff function reads the table on every call**, so a revoke takes effect on the next call, not the next sign-in.
   - Every staff decision records `actor = staff`, the staff id and the acting company.
6. Row security on every `toll` table, keyed on the token's company.
7. **CI:**
   - the two-company suite;
   - `token_a_cannot_reach_b` (B's ids tried through query, body and joins);
   - no company parameters;
   - `staff_revoke_next_call`.

## B8. The week function and its contract

- **The week:** ADR 0007, Monday–Sunday America/Jamaica, through `periodKeyFor`. A charge's week is the week of `occurred_at`; a payback's is its trip's, or its own date.
- **One function, `toll_read.week_result(week_key)`:**
  - it returns the **stored sealed result** (from `week_statements`) when the week is sealed, and the **live result** when it is open;
  - it says which in `state`;
  - every consumer calls only this function. Driver settlement refuses a live result (I24).

**The contract (versioned; published in `packages/toll-core` as the source of truth):**

```ts
interface TollWeekResultV1 {
  contractVersion: 1;
  companyId: string;
  weekKey: string;                 // Monday, ADR 0007
  state: 'open' | 'sealed';
  weekVersion: number;
  factsHash: string;
  engineVersion: string;
  spend:      { tagMinor: number; cashMinor: number; totalMinor: number };
  bearers:    { platformMinor: number; driverMinor: number; fleetMinor: number };
  pending:    { charges: number; amountMinor: number };   // count and undecided amount of charges whose ONE state (B2) is 'pending', in the counted week. Excludes unverified, awaiting_cash, rejected, duplicate
  unverified: { charges: number; amountMinor: number };   // in the counted week; blocks the seal
  awaitingCash: { charges: number; amountMinor: number }; // in the counted week; Roam cash rides not yet settled; does not block; decided provisionally at seal
  paybacks:   { receivedMinor: number; allocatedMinor: number;
                unallocatedMinor: number;          // pending + part-allocated leftovers NOT yet decided; must be 0 to seal
                leftUnlinkedMinor: number;         // decided "no toll"; final, not part of unallocatedMinor
                takenBackMinor: number };          // reversals landing this week
  carriedIn:  Array<{ kind: 'charge' | 'payback' | 'take_back' | 'correction_up' | 'correction_down' | 'cash_recovered';
                      id: string; fromWeekKey: string; amountMinor: number;
                      bearer?: 'fleet' | 'driver' }>;  // counted in this week's totals; read straight from toll.carried_facts
  tagAccount: { openingMinor: number; topUpsMinor: number;
                usageMinor: number; closingMinor: number };
  drivers: Array<{
    driverId: string;
    owesFleetMinor: number;               // receivable_driver: personal, charged deadhead, shortfalls
    fleetOwesMinor: number;               // payable_driver: verified cash tolls
    recoveredInPassengerCashMinor: number;// recovered_in_driver_cash: already inside their passenger cash
  }>;
  afterSeal:  Array<{ kind: 'charge' | 'payback' | 'reversal' | 'correction'; id: string;
                      amountMinor: number; arrivedAt: string;
                      relatedWeekKey: string }>;   // the week it affects; never in the totals
  ledgerMovements: { bankMinor: number };  // for Business Finance to tie (B5 hand-off)
}
```

- A change to the contract is a new version. Consumers name the version they read.
- Week Reconciliation step 3 shows it, and every button is one command. Step 4 reads `tagAccount`. Driver settlement reads `drivers` from the sealed result.

## B9. Platform adapter contract

```
Trip    { platform_trip_id, driver_ref, vehicle_ref, request_time?, pickup_time?, dropoff_time?,
          time_precision, payment_method, toll_payback_amount?, currency }
Payback { reference, date, amount (> 0), driver_ref?, platform_trip_id?, reversal_of?, received_by? }
Settings{ pays_tolls_back, payback_mode, matching_window_seconds, timezone }
```

| `payback_mode` | On import |
|---|---|
| `per_trip` | A trip's `toll_payback_amount` becomes a `trip_line` payback |
| `adjustments` | Paybacks arrive as separate `adjustment` rows |
| `none` | Trips are matching hints only |
| `native` | Roam; no import |

- Adjustments are always accepted alongside a platform's main mode.
- Batch identity = company + a hash of the normalized, sorted rows.

## B10. Cash tolls

- An advance until decided; only verified receipts post.
- Roam cash only once settled (B2).
- Rarely auto-applied; duplicates held.
- **Roam cash rides never hold up a seal.**
  - **`underpay` / `unpaid`:** the toll not covered by the rider's cash is decided **at once**, at cash settlement, as `fleet_absorbs` (system, `actor_job = native_cash_settled`, reason `rider_arrears`).
    - **Checked:** a rider's arrears are a negative balance on the rider's wallet, not tied to a ride (`supabase/functions/rides/admin/riderArrears.ts`, `cashSettlement/arrearsCheck.ts:26`).
    - So paying off arrears later can never be matched to one ride's toll. Waiting for it would hold the charge open forever.
  - **Still `awaiting_cash` at seal:** decided provisionally (B6), and recovered automatically if the cash settles later (P20).
  - The 14-day aging alert still covers any `pending` cash charge.

## B11. Moving over

1. **The switch.**
   - `toll.switch_state.tolls_v2` per company.
   - **Every toll request checks it once, at the top, on the server,** and routes to the old handlers or the new functions. One request is never split between the two.
   - **Old write handlers also check it, inside their own write:** when it is on, they refuse with `SWITCHED_TO_V2`, so an old request still in flight at flip time can't write after the flip.
   - The flip is one row update by a platform owner, with an audit row.
   - Test `tolls_v2_flip_no_gap`: writes in flight during a flip land in exactly one system.
2. **Old weeks stay sealed:**
   - served from `ledger.week_statements`;
   - `is_legacy` copies for search only;
   - untraceable dispute refunds go to the unassigned list with a named owner.
3. **No week straddles:** the open week is sealed in the old system first (fixing old blockers such as WRA-42 there), or the switch happens at a week boundary with no open week.
4. **Side by side:** 14 nights to the cent per week and per driver, per company.
5. **Retire** old paths after 30 days unused.

## B12. Observability

- **Phase 0:** the metrics, their names and the alert thresholds are **defined**:
  - per intent: count, errors, p99;
  - 409s per code;
  - per company: pending charges, unallocated paybacks, `after_seal` facts, review list, ages;
  - nightly check history.
- **Phase 1:** the dashboards are live, in the place the existing calculator and worker metrics are shown *(to check before Phase 1)*.
- **Phase 3:** live for the first company on `tolls_v2`.
- the payout sweep **heals itself and alerts** (B5 check 7). The heal count per night is a metric, and any heal is an alert.

---

---

# Part D — Build phases

| Phase | What | Done when (all by CI tests) | Status |
|---|---|---|---|
| 0 Foundations | Schemas, accounts, posting rules, ledger guard, command core, seal / reopen, nightly checks 1–7, payout trigger, pay-before-seal refusal, contract, CI guards, `pnpm test:toll` | All Phase 0 tests green | **Done 12 Nov, live** |
| 1 Core + Roam hooks | The week's toll answer (sealed or live); `native_ride_charge` / `native_cash_settled` and the rides hooks; driver settlement reads the sealed result; metric views |  I10, I14, I17, I19 green; shortfall and **excess** (leftover in `payback_unallocated`, aged) tested; recompute = `source_hash`. P16 tested up and down; P5/P6 order proven for Roam card and cash; a Roam cash ride that is never settled sits in suspense, is aged, and posts no allocation; underpay posts only what the cash covered. `seal_blocks_until_decided`; a sealed week refuses commands (`WEEK_SEALED`); reopen after driver payment refused and `carry_forward` used instead; `carry_forward` on an unpaid sealed week → `REOPEN_INSTEAD`. P3 fires at verification, for a manual verify, a proven import and a Roam cash-paid crossing (G1.4); a Roam card ride and a Roam cash ride each post P5 / P6 at the right moment; underpay and unpaid are decided at once; P20 after a provisional seal (`p20_cash_after_seal`). `native_cash_settled_branches_on_seal` (open, reopened after a provisional seal, sealed)  | **Done 12 Nov, live** (`512492ff`) |
| 2 Adapters | Tag statement, top-ups, driver cash (receipt, outbox), Uber, InDrive; matcher; batch imports; carry-forward |  I11–I13, I15, I18, I20, I23 green; end to end: a corrected tag statement (up and down), a Roam-cash + driver-cash duplicate, **an Uber reversal in the same week and across weeks** (`reversal_in_and_across_weeks`), **a mis-dated crossing moved between weeks** (`correct_week_ledger_moves`). P17 on a payback with an unlinked leftover; check 3 passes for a week with a cross-week reversal; a changed and a deleted bank record reverse P10/P11. `taken_back_after_settlement`: an Uber take-back against a sealed and paid week lands in the open week as P18 (fleet and driver cases), with the right accounts, `carriedIn` and `takenBackMinor`, and the paid week's `source_hash` unchanged; `carry_forward_each_kind` for a late charge, late payback, up and down correction; verify / reject a cash receipt. `p19_settled_driver`, `p19_platform_share` (a charge partly `driver_pays`, partly linked), `p19_cash_charge`, `p18_partial_payback`, `p17_partial_takeback`, `check3_carried_facts`; G1.9 answered. `p19_platform_share_ages`, `p19_proportional_split` (40/40/20, D = 10 → 4/4/2, plus a rounding case), `p19_before_settlement`, `p19_after_settlement`, `correct_down_below_allocations`  | |
| 3 Commands + screens | Every intent; Week Reconciliation steps 3–4 and the toll pages call commands only; dashboards. **Stitch screens first** | No browser-run sequences; `actor_job` on every system decision; per-week deltas; dashboards live for the first company | |
| 4 Side by side | Old weeks from `week_statements`; legacy copy; unassigned list; open-week precondition or fallback; 14-night comparison | `tolls_v2_flip_no_gap`; two-company suite (one on, one off) with `week_flow_matches_disposition` on both; 14 clean nights → on for that company. Week Recon tests 5 and 13 close here | |
| 5 Retire | Old routes, key-value toll records, repair routes, old switches removed | I21; 30 days unused; restore drill: sealed weeks recompute to their `source_hash` | |

---

# Part E — Still open

**Facts to confirm:**
1. How InDrive handles tolls (before Phase 2).
2. Whether every Uber / InDrive export says cash or card per trip (before Phase 2).
3. That Uber's passenger cash includes the rider's toll on a cash trip (before Phase 2 exits; confirmed for Roam).
4. Whether any platform ever takes back a **cash-trip** toll (G1.9, before Phase 2 exits). If none does, the cash-trip credit is removed from P17 and P18.
5. Whether a bank record's `weekStartYmd` is the trips' week or the week the money landed (P10, before Phase 2).
6. Whether the driver app requires a receipt for a cash toll today (before Phase 2).
7. Whether every `trip:` record carries a company, why the fleet-claims route list includes toll routes, whether `POST /claims` has a sign-in check (`claims_controller.tsx:34`), and which screens outside Fleet write toll data (before Phase 4).

**Tracked (not blocking):**
- `toll:platform_payout_clearing` is always 0 today, because Business Finance records a payout in one step, so P10 and P11 fire together. It starts to matter when Business Finance has two steps.

---

# Part F — Tracker

## Live now (12 Nov)
- **Database:** Phase 0 and Phase 1 are live (`docs/toll-build/toll_v2_phase0_LIVE_apply.sql`, `toll_v2_phase1_LIVE_apply.sql`).
- **Server code:** deployed from `main` (`512492ff`, CI green).
- **Switches:** `tolls_v2` **off** for every company. `toll_seal_before_pay` **on** for deekiiiiiii's Fleet (undo: `docs/toll-build/toll_seal_before_pay_OFF.sql`).
- **Still to see live (Phase 0 done-test 6):** the first real payout for a week after 14 Sep must be refused with "Tolls for this week aren't sealed yet"; the owner sends a screenshot. Nothing is payable today: the 5 fleet-owes weeks are Kenny Gregory Rattray's clean-up weeks, which the Pay list hides on purpose.
- **Small separate item (not toll):** the Pay list header says "showing 0 of 5", because its total still counts the hidden clean-up weeks (`sum_settlement_queue_totals`).

## Build facts to remember
- The `toll` schema also holds old `brain_policies` and `settlement_allocations`; leave them alone.
- Toll ledger rows: `product = 'roam_fleet'`; key `toll:<co>:<command_id>:<line>`; accounts `org:<co>:toll:*` + `org:<co>:bank`, created by `toll_system.ensure_accounts` with the right types; ledger accounts need a real company row.
- The org-level seal is `ledger.week_statements` `kind 'toll_week'`, `driver_id '*'`.
- **Fleet permissions live in code** (`packages/auth-client/src/permissions.ts`). The database mirrors them: `toll.manage` = owner or an active fleet_owner / fleet_manager seat; `toll.view` adds fleet_accountant. A drift test guards it.
- The live API exposes `platform`, `recon`, `public` and others, **but not `fleet`**.
- Events that happen after a seal (payout P10 / P11, settlement P12–P14) are dated when they happen.
- Running `deno test` writes into `node_modules/.deno` (`deno.json` `nodeModulesDir: true`) and can break the local Fleet app; `pnpm install` repairs it.

## Metric and alert definitions (B12; views in Phase 1, dashboards in Phase 3)

| Metric | Source | Alert |
|---|---|---|
| `toll_command_total{intent, outcome}` | Fleet route, per call (200, or the 4xx / 5xx code) | — |
| `toll_command_p99_ms{intent}` | Fleet route timing | p99 > 2 s for 15 min → watch |
| `toll_command_409_total{code}` | Fleet route (`VERSION_CHANGED`, `PENDING_NOT_RESOLVED`, …) | `VERSION_CHANGED` > 20 / hour for one company → watch |
| `toll_nightly_failed{company, check}` | `toll.nightly_results` (ok = false) | any → **page** (`toll.alerts`, kind `nightly_check`) |
| `toll_pending_charges{company}` + oldest age | `toll.v_live_charges` state `pending` | over 14 days → watch |
| `toll_unverified_receipts{company}` + oldest age | state `unverified` | over 7 days → watch |
| `toll_unallocated_payback_minor{company}` + oldest age | `toll.v_active_paybacks` | over 14 days → watch |
| `toll_after_seal{company}` + oldest age | `after_seal` charges and paybacks | over 14 days → watch; a take-back over 7 days → **page** |
| `toll_receivable_platform_credit{company}` | the account's natural balance < 0 | watch; over 30 days → **page** |
| `toll_review_pairs_open{company}` | `toll.duplicate_reviews` status `open` | — |
| `toll_payout_heals{company}` | `payout_healed:` alerts per night | any → watch |

**Where alerts go:** `toll.alerts`, one open alert per company and problem. The bell and SMS escalation (like Week Recon's `recon.alerts`) arrive with the Phase 1 dashboards.

## Phase 1 (core + Roam hooks)

**Facts from the code (checked):**
- **Crossings** are `rides.ride_toll_crossings`: ride id, plaza id / name, amount, `crossed_at`, GPS (baseline :30921). They have **no vehicle, driver, tag or payer**. They are written by the Toll Brain (`toll-brain/index.ts:236`) or the local fallback (`fare/tollGeofence.ts:116`), and each one adds to `ride_requests.actual_tolls_minor`.
- **Tag or cash is not known anywhere** in the ride system. Both of today's paths hard-code `paymentMethod: "fleet_account"`, and the ride has **no vehicle column** (the vehicle comes from the driver's fleet context at sync time).
- **The rider pays the ESTIMATED toll inside the quote** (`fare_breakdown.estimated_tolls_minor`, added before surge), plus max(0, actual − estimated) at the end (`computeFinalFare.ts:21`). A lower actual is not refunded.
- **Who receives card money:** the fleet (`org:<id>:digital`) **only when `organizations.fleet_org_payout_enabled`**; otherwise the driver's digital wallet (`_shared/fleetOrgPayout.ts:39`). Cash goes to the driver in hand.
- **Hooks:** ride end, every completion (card or cash), is `handleTerminalRideLedgerAndSync` (`rides/index.ts:643`). The cash ride's first stop is the `awaiting_cash_settlement` branch of `applyRideTransition` (`rideLifecycle.ts:116`). Cash settled is the end of `processCashSettlement` (route `registerCashSettlementRoutes.ts:135`).
- **Passenger cash (A11) confirmed for Roam:** driver settlement uses `cash_received_minor`, which includes the toll part (`rideToFleetTrip.ts:84`). Uber is still to confirm (Part E #8).
- **Today's old path** (Toll Brain live materialize + `POST /bridge-rides`) writes KV `toll_ledger` usage rows. With `tolls_v2` on, a company must get the v2 path only (B11), or each crossing counts twice.

**Live data look (12 Nov, owner ran it):** 93 Roam rides (all JMD), **0 toll crossings ever**, 0 rides with a toll estimate, 0 waiting for cash, and **no fleet has fleet payout on**. All real toll money today is Uber + tag.

**Owner's decision (12 Nov): core first, then Uber / tag.** Phase 1 builds the shared core every platform needs, plus small Roam hooks proven on made-up rides. Phase 2 (tag statement, Uber, driver cash) follows at once, where real weeks can prove it.

**Design decisions from the facts (one each):**
- **Roam tag or cash:** tag if the driver's assigned vehicle had an active toll tag at `crossed_at`, otherwise cash. A cash crossing is created `verified` (P3), because the crossing and the amount are certain (G1.4).
- **Roam card `received_by`:** `fleet` when the fleet's `fleet_org_payout_enabled` is on; otherwise `driver` (the money goes to the driver's wallet). Cash is always `driver`.
- **Roam payback amount** = what the rider paid for tolls = estimated + max(0, actual − estimated). Any part above the actual crossings (estimate higher than actual, or an estimate with no crossing) is **left unlinked by the system** (`actor_job = native_ride_charge`, reason `roam_estimate_over_actual`). It is certain and structural, so no person is needed, and it doesn't age.
- **Service-only entry points:** the rides service calls `public.toll_sys_*` wrappers (service key only). The R6 contract test keeps `public.toll_v2_*` for signed-in users only and adds the rule that `public.toll_sys_*` is for the service key only. Each wrapper is a no-op unless the company has `tolls_v2` on, so there are never two systems for one company.
- **Dashboards** move to Phase 3 with the screens (playbook: screens come from Stitch). Phase 1 makes the metrics queryable as SQL views.

**Phase 1 rounds:**

| Round | What | Who | Status |
|---|---|---|---|
| P1-R1 | The week's toll answer: `toll_system.week_result(company, week)` → `TollWeekResultV1`; `public.toll_v2_week_result(week)` for users (company from the token); the seal freezes it (`amounts_minor` + `source_hash`); check 3 covers every account; check 4 recomputes it | Claude builds, Cursor tests | **Built by Claude 12 Nov** (`20261112221623_toll_v2_week_result.sql`): live / sealed result, user read with `toll.view` (owner, manager, accountant), and the seal freezes the full result. The facts hash leaves out `afterSeal` and the tag opening / closing (they depend on earlier weeks that may still be open, so including them would cause false alarms). Claude's smoke test passes, and the full `pnpm test:toll` passes. Check 3 still covers suspense / expense / payback_unallocated; extending it to every account is folded into P1-R4 (it needs the settlement lines). **Closed 12 Nov:** Cursor's test (7 sections, 44 checks) passes in `pnpm test:toll`. Claude corrected one expectation that only passed by coincidence: the week's bank movement is the deposit in minus the top-up out (+4,000 − 8,000), not "the deposit". |
| P1-R2 | `native_ride_charge` and `native_cash_settled` (3-way branch, C1), plus the `public.toll_sys_*` wrappers | Claude builds, Cursor tests | **Built by Claude 12 Nov** (`20261112222929_toll_v2_roam_native.sql`). Claude's smoke test passes (off, card estimate = actual, card estimate > actual, cash underpay, cash after a provisional seal → P20, cash after a reopen → provisional reversed), with nightly checks clean. **Found while testing:** sealing a week that hasn't ended left no open week for late facts. So `seal_week` now refuses `WEEK_NOT_ENDED` (409; error mapper updated), and the existing toll tests moved to 2024 dates. A sealed week's own charges are never touched by a late cash settlement (not even `awaiting_cash`). **Open (P1-R4):** for a card ride with fleet payout off, the money sits in the driver's wallet, and the payback is recorded `received_by driver`; settlement must be checked to collect it. A ride whose crossings span two weeks is assumed to be one week. **Closed 12 Nov:** Cursor's test (15 cases, 48 checks, nightly checks after each) passes, plus a contract check that `public.toll_sys_*` is service-key only. **Added after:** tag or cash is now decided in the database (the API can't read `fleet.toll_tag_assignments`): tag if the ride's car had an active tag at the crossing, else cash; car unknown → cash **unverified** (not posted, blocks the seal until a person checks). `public.toll_sys_tolls_v2_on` lets the old Roam paths skip v2 companies. |
| P1-R3 | Rides hooks: ride end and cash settled call the wrappers; the old Toll Brain / bridge-rides paths skip v2 companies | Cursor | **Closed 12 Nov.** Hooks: `rideLifecycle.ts` (cash ride → `awaiting_cash_settlement`) and the end of `handleTerminalRideLedgerAndSync` (`rides/index.ts`, every completion). Toll Brain skips its KV ledger / bridge marker / dual write for v2 companies; `/bridge-rides` skips them (`skippedV2`). 16 new Deno tests and 11 ride-lifecycle tests pass (the 3 type errors in the rides code predate this work). Claude moved the cash-path re-read inside the never-break-the-ride guard. If the v2 check itself fails, the Toll Brain keeps the old path (logged). |
| P1-R4 | Driver settlement reads the sealed toll result for v2 companies (look first); check 3 covers every account; the card-ride-to-driver-wallet question | Claude + Cursor | **Database side built by Claude 12 Nov** (`20261112230351_toll_v2_settlement_lines.sql`): per-driver lines in the result; the seal writes each driver's `kind 'toll'` statement (reopen writes drafts; versions and `restated` like `publishWeekStatement`; drivers with no tolls get zeros); `public.toll_sys_driver_week_tolls`; check 3 covers every Phase 1 account (a take-back counts the original + in its week and − in the take-back's week); **changed from the plan:** recompute is a database trigger on allocations / charges / paybacks that queues `period_projection_refresh` outbox rows for v2 companies only, which covers every path. Claude's smoke tests pass, and the full `pnpm test:toll` passes from a reset. The wallet question is moved to a separate business finding. **Closed 12 Nov:** the switch point is at `driver_financial_periods.ts:~1317` (`resolveTollInputs`). It is v2-only, records `tollSource` on the period, and a failed v2 lookup throws (never falls back to old numbers). The seal / reopen route runs `runSealSideEffects`. Claude's checks pass: the toll suite incl. `toll_v2_settlement_lines.sql`, the 21 settlement + mapper tests, and the 68 existing settlement / period tests. **Deploy rule:** every rebuild now asks `toll_sys_tolls_v2_on`, so **the P1 migrations must be live BEFORE this code deploys**, or all settlement rebuilds fail. |
| P1-R5 | Metric views + a Roam gap alert; `pnpm test:toll`; code review; commit; **live migrations first, then deploy**; close-out | All | **Database side built by Claude 12 Nov** (`20261112232007_toll_v2_metrics_and_roam_gap.sql`): `toll_system.company_metrics` + `public.toll_v2_metrics()` (toll.view, own company); `roam_gap_alerts` in the nightly run (a ride with an unrecorded crossing → `roam_gap:` watch alert; v2 only; a missing switch time means all rides). Claude's smoke test passes, and the full `pnpm test:toll` passes from a reset. **Cursor test prompt:** `docs/toll-build/cursor-P1-R5-metrics-gap-tests.md`. Cursor's metrics test passes. **`/code-review` 12 Nov: 10 findings, all in the P1 toll work.** Claude fixed the database ones: #5 the gap alert uses the hook's filter (fleet attribution, cash / card); #9 the refresh trigger also refreshes the old driver / week when a toll moves; #10 `public.toll_sys_week_drivers` (one call per company-week, frozen lines read directly when sealed). Server fixes #1, #2, #3 / #4, #6, #7, #8, #10: `docs/toll-build/cursor-P1-review-fixes.md`. **Design note (#3 / #4):** since P1-R4, settlement for a v2 company reads only v2, so old KV toll rows can't double count money. The old Roam paths skip only rides v2 will record (shared predicate); when in doubt they keep the old write. Cursor's server fixes check out: 47 review-fix tests, 52 existing settlement / period tests, `pnpm test:toll`; the shared rule is inlined in the fleet-toll bundle. **LIVE DATABASE 12 Nov:** the owner ran `docs/toll-build/toll_v2_phase1_LIVE_apply.sql` (4 migrations + logbook; first proven on a copy rebuilt without them, where every toll test passed against the result): `logbook_rows 4`, `v2_check_ready true`, `week_drivers_ready true`. **DEPLOYED 12 Nov:** `512492ff` on `main`. Edge functions, recon worker, Fleet site, CI, Parts SQL checks (now running every toll SQL test) and function tests all green. **Phase 1 COMPLETE.** |

## P1-R4 look-first (12 Nov)

**How settlement uses tolls today (checked):** everything is in `rebuildDriverFinancialPeriod` (`driver_financial_periods.ts:834`). It is combined in `computePeriodSettlement` (`packages/finance-core/src/driverPeriodSettlement.ts:164`), called at DFP:1301, :1720 (statement pass) and :2443 (cash resync). **Only two toll numbers move money:**
- `tollPersonal` (= `tollChargedToDriver`) is added to what the driver owes;
- `tollCashWash` (= `tollCashWashEligible`) is credited as cash paid back.

Spend and reimbursed are reported and checked only. The rider's toll on a cash trip is already inside `passengerCash`.

**Close checks:** week close needs a **per-driver** `ledger.week_statements` `kind 'toll'` row, closed (`closeInvariants.ts:299`). Its `amounts_minor` keys are `totalSpend, chargedToDriver, reimbursed, netLoss, cashWashSpend, tagSpend`. The checks are TOLL_SPEND / CHARGED mismatch against the period and the identity spend − reimbursed − charged − netLoss = 0.

**Recompute:** `runSealSideEffects` (`seal_side_effects.ts:18`) rebuilds every open driver week of an org-week. `ledger.financial_outbox` (`period_projection_refresh`) rebuilds one driver week.

**P1-R4 plan (one fix each):**
1. **Per-driver lines in the result:** `TollWeekResultV1.drivers[]` gains `spendMinor, tagSpendMinor, cashSpendMinor, platformMinor, fleetMinor` (additive). Mapping: `tollPersonal = owesFleetMinor`, `tollCashWash = fleetOwesMinor`, `tollSpend = spendMinor`, `tollReimbursed = platformMinor`.
2. **The v2 seal also writes each driver's `kind 'toll'` statement** (closed) from the sealed result: totalSpend = spend, chargedToDriver = owesFleet, reimbursed = platform, netLoss = fleet, cashWashSpend = fleetOwes, tagSpend = tagSpend. So today's close checks pass unchanged. Reopen writes a draft version for each.
3. **One seam in settlement:** `loadDriverWeekTollInputs`. For a v2 company it reads the driver's line through a service-only RPC (`public.toll_sys_driver_week_tolls`); otherwise it keeps today's code exactly.
4. **Recompute:** the v2 seal / reopen route calls `runSealSideEffects`. Roam native decisions insert `period_projection_refresh` outbox rows for the driver and week.
5. **Check 3** extended to every account.

**Separate business finding (not toll; own check later):** with `fleet_org_payout_enabled` off, a Roam **card** ride's full fare goes to the driver's wallet, and settlement never recovers the fleet's share (`rideToFleetTrip.ts:26` card → `cashCollected 0`; no wallet input in settlement). For toll v2 the card payback stays `received_by driver`.

## Phase 2 (adapters: tag, top-ups, driver cash, Uber, InDrive)

**Look first (12 Nov): code (checked)**
- **Tag statement:** parsed in the **browser** today (`BulkImportTollTransactionsModal.tsx:420`), with columns tag id, plaza name, lane id, date & time and amount. It has **no per-crossing ID**. Duplicates are found by a content fingerprint only (`reconTollImport.ts:81`). The server receives pre-cooked rows (`recon_import_routes.ts`).
- **Top-ups:** a TransJam CSV **with a transaction ID**, plus manual entry (`LogTollTopupModal.tsx`).
- **Driver cash:** the driver app scans the receipt with OCR, then saves it as a pending cash toll (`DriverExpenses.tsx`). **The photo isn't enforced**, and tolls are **not** in the driver app's offline queue. Fleet approves through `/toll-reconciliation/approve`.
- **Uber:** the per-trip toll payback comes from `payments_transaction` column `Paid to you:Trip balance:Refunds:Toll`. **Payment method is inferred** (non-zero `Cash Collected` → Cash). **No pickup time** (request and drop-off only). Support adjustments carry no trip, and **today's import drops the sign** (`csvHelpers.ts:1456` `Math.abs`), so a take-back would become a refund.
- **Uber cash includes the rider's toll:** in every sample cash trip, Paid to you = earnings + Toll − Cash Collected. So the cash holds the toll and Uber credits it back. This is consistent with A11 / Part E #3; it gets confirmed on a real week in Phase 2.
- **InDrive:** generic trip CSV, request / drop-off only; optional `tollCharges` and `paymentMethod`. **No InDrive toll refunds exist** in the code or the data.
- **Bank confirm `weekStartYmd` = the trips' (statement) week**, not the deposit week (`ledgerBankSettled.ts:17`). P10 is correct as built.

**Look first: live data (owner ran `phase2_r0_live_look.sql`)**
- One company. The old ledger holds 121 tag crossings (no refs; 80 linked to trips), 201 driver cash tolls (183 with a receipt number, 174 with a photo, **132 still pending**), 11 top-ups (10 with a ref) and 2 `fleet_account`. That's about 3–19 toll rows a week.
- **20 tag pairs share vehicle + day + amount + plaza** (genuine second crossings).
- Uber trips with a toll payback: 103 cash, 142 card, **21 with no payment method** (no cash collected).
- 48 Uber support adjustments: 0 linked to a trip, 0 negative. No pickup times on Uber trips.

**Decisions (one each)**
1. **Parsing moves to the server** (B1 "the server decides"). Each adapter is a pure parser in `packages/toll-core/src/v2/adapters/`, with golden-file tests built from the real sample exports.
2. **Tag row identity** = tag + plaza + lane + date-time to the minute + amount, plus an occurrence number among identical rows in the same file. A re-import of the same file is a no-op; two genuine identical crossings both count. Cross-file look-alikes go to the review list (B2).
3. **Uber `received_by`:** cash trip → `driver`; card or no payment method (no cash collected) → `fleet`.
4. **Uber precision:** `minute`; matching window request → drop-off, plus the en-route and post-trip margins of today's matcher (−45 / +15 min). Never auto-applied when only one side is precise (B4).
5. **Uber support adjustment:** a positive amount → an `adjustment` payback (no trip; matched by driver + date). A **negative** amount → `reverse_payback` against the matched original (P17 / P18). The sign is always kept.
6. **InDrive:** trips are matching hints only (`payback_mode 'none'`) until an InDrive file shows a toll payback. Its `tollCharges`, if ever present, are read as `per_trip`.
7. **Driver cash:** a receipt photo is **required**, and the submission goes through the driver app's offline queue (I6, `driver_outbox_crash`). It arrives `unverified` (no posting) until `verify_cash_receipt`.
8. **Old import bug (separate, small):** the old Uber import's `Math.abs` on support adjustments. It is harmless today (no negatives) and fixed when the old path retires (Phase 5); v2 never repeats it.

**Where Phase 2 stands (12 Nov, end of day):** P2-R1 and P2-R2 closed and committed (`0bece3c8` on `parts-auto-match`, not pushed). The import core migration `20261113001948_toll_v2_import_core.sql` is **local only**; it goes live with the rest of Phase 2 in P2-R6. **P2-R3 built 13 Nov (SQL smoke run still due); see the round table.**

**P2-R3 starting brief (for a fresh chat):**
- **Read first:** B4 (matching rules), B2 (`toll.suggestions`: append-only), B3 (`apply_suggestion` is a P2-R4 intent, not this round), and the adapter row shapes in `packages/toll-core/src/v2/adapters/types.ts`.
- **What it matches:** a tag or driver-cash **charge** to a platform **trip** (`toll.platform_trips`: same vehicle, `occurred_at` inside request → dropoff, widened only by the coarser of the two time precisions), and a trip's **payback** to the charge(s) on that trip. Roam crossings are native and are never matched.
- **Build:**
  1. A pure engine in `packages/toll-core/src/v2/matcher/`. Inputs → candidates, each with score parts, the rules fired and an `engine_version`. No clock, no I/O.
  2. A SQL side that stores suggestions append-only with their inputs, runs after `import_batch` writes (only when data arrives), and leaves `auto_apply` off by default (shadow first).
- **Excluded from candidates:** duplicates, legacy, `after_seal`, and reversed or reversing paybacks.
- **Then:** a Cursor test prompt (golden cases plus SQL storage tests).
- **Open owner facts still due before Phase 2 exits:** Part E #3 and #4 (checked on a real week in P2-R6).

**Phase 2 rounds**

| Round | What | Who | Status |
|---|---|---|---|
| P2-R1 | **Import core:** `import_batch` (batch identity = company + hash of the sorted normalized rows; per-row `source_ref`; insert charges / paybacks / top-ups / trips; amount changes → `charge_changes`, sealed weeks → `after_seal` or a pending change; cross-source duplicate rule + review pairs; P1–P5 posted on insert; a row report) | Claude builds, Cursor tests | **Built by Claude 13 Nov** (`20261113001948_toll_v2_import_core.sql`): `import_batch` intent (people) + `public.toll_sys_import` (system); per-row statuses; the same batch replays its first report; corrections applied only when nothing depends on them; sealed weeks → `after_seal` (top-ups: refused, the week must be reopened); cross-source duplicates by rank (roam_ride > tag_statement > driver_cash) within the plaza window, else review pairs; same-source look-alikes never flagged; negative Uber adjustments reported (`take_back_needs_person`), never stored. `toll.charges.evidence` added. Claude's smoke test passes (all 7 cases, nightly checks clean), and the full `pnpm test:toll` passes from a reset. **Closed 13 Nov:** Cursor's test (10 sections, 61 checks) passes. Claude had its end-of-test "settle pass" removed (it could hide an import bug); the test's stand-in decisions now post like real ones, and the nightly checks run after every section and pass on what the import left behind. |
| P2-R2 | **Adapters (pure parsers):** tag statement, top-up provider, Uber (`payments_transaction` + `trip_activity`, incl. support adjustments with sign), InDrive, driver cash receipt. Golden-file tests from the real sample exports | Cursor | Built by Cursor 12 Nov (108 tests pass). Claude found 9 fixes (junk amounts, refs that change with tag-number format or row number, unmapped plaza used as id, adjustments on trips, 1970 dates, dropped activity-only trips, InDrive cash/ids): `docs/toll-build/cursor-P2-R2b-adapter-fixes.md`. **Closed 12 Nov:** all 9 fixed, checked by Claude, 118 tests pass with exact-row checks. |
| P2-R3 | **Matcher:** pure engine in toll-core (B4: candidates, score parts, rules fired, engine version, stored inputs); suggestions stored append-only; `auto_apply` off by default (shadow first) | Claude builds, Cursor tests | **Built by Claude 13 Nov; smoke run passes.** **Engine** (`packages/toll-core/src/v2/matcher/`, `toll-matcher-v1`): pure; windows −45 min / on trip / +15 min, widened only by the coarser precision (60 s for minute); date_only → same day; adjustments by driver, 0–7 days. Score = window + amount (on `remaining_minor`) + sole candidate. Auto-apply is computed (all six B4 conditions) but never acted on. Each suggestion stores its exact `inputs`, and `scorePair(inputs)` repeats the score (I11). 12 smoke cases pass; type check clean. **Database** (`20261113011349_toll_v2_matcher.sql`): triggers queue records in `toll.match_queue` whenever data arrives (charges, paybacks, trips, allocations, unlinked decisions, seal / reopen; never Roam native). `toll_sys_match_claim` hands the engine the records **in scope**, plus the neighbours that keep competitor counts complete. In scope = the changed records + their candidates now + their partners in open suggestions. *Found by the smoke run:* scoring only the changed record left the first crossing marked "only candidate, 100" after a second crossing arrived on the same trip. `toll_sys_match_store` stores append-only: unchanged / replaced (superseded) / withdrawn (a `withdrawn` row supersedes a pair that is no longer a candidate). Both are service key only. **Runner:** `_fleet-server/toll_v2_matcher_run.ts` (claim → engine → store; a sweep across companies). P2-R5 wires it into the import route and a schedule. **Smoke run (13 Nov, local, real engine):**
- one crossing → 100; nothing new → no claim; a second crossing → both 90 "competing" (the first replaced); the trip moved → both withdrawn;
- 4 stored suggestions re-score to the same answer from their stored `inputs`;
- an allocation queues its charge; only `service_role` can call the RPCs; nightly checks ok;
- full `pnpm test:toll` from a reset: all pass (130 toll-core tests).

**Cursor's tests (13 Nov):** done and green (toll-core 178 tests: 38 golden matcher cases; 5 runner tests; `toll_v2_matcher.sql`). Claude's check found two gaps in the SQL test:
1. It deleted a raw reversal payback before the nightly checks.
2. It never checks the claim's contents: scope, hops, `remaining_minor`, `reversed`, `week_sealed`.

Sent as `docs/toll-build/cursor-P2-R3b-matcher-test-fixes.md`.

**Closed 13 Nov.** Cursor's P2-R3b report failed one check. Claude found three of its own mistakes in the test and fixed them in `toll_v2_matcher.sql`:
1. **The second-crossing check (Claude's prompt was wrong).** A pair is re-scored when **either** side is in scope. Crossing A comes back through the scoped payback, not into `focal.charge_ids` itself. The test now checks that A is in the bundle and that both pairs are stored, none skipped.
2. **Remaining amount:** 150, not 300. The test had left out the platform allocation.
3. **Hand-made money rows:** section 2b.4's hand-made allocations, its sealed-week row and the reversal probes now sit in a block that undoes itself. Before, the nightly suspense check failed on them (2750 vs 2850).

Full `pnpm test:toll` from a reset: all green. **P2-R3 is closed.** The migration is local only and nothing is committed. **For P2-R4:** `apply_suggestion` must refuse an unverified receipt, a sealed week or stale versions. A carried (`after_seal`) fact is never suggested; a person decides it. |
| P2-R4a | **Everyday decisions:** link_payback, driver_pays, fleet_absorbs, leave_payback_unlinked, undo_decision, apply_suggestion, verify / reject cash receipt, confirm / release duplicate; plus the **I4 guard** (it didn't exist: triggers refuse any write that takes a charge's or payback's slices over its amount) | Claude core, Cursor tests | **Built by Claude 13 Nov** (`20261113023100_toll_v2_decisions.sql`). Shared pieces: week lock (the one seal takes) → record locks payback-first + versions → states → sealed weeks; `allocate` / `reverse_allocation` post at the crossing time. Undo covers only decisions that wrote allocations or unlinked rows; the others answer `not_undoable` with a hint. Auto-apply stays off (shadow). New refusals: `NOT_FOUND` (404), `WRONG_STATE`, `AFTER_SEAL`, `AMOUNT_TOO_LARGE`, `ALLOCATIONS_EXCEED_AMOUNT` (409; added to the server's error map). **Smoke run** (`docs/toll-build/p2_r4a_decisions_smoke.sql`): every intent, replay, stale versions, undo twice, a stale suggestion, a duplicate confirm, then the week **seals cleanly**, every decision is refused after the seal, and the nightly checks are ok. **Full suite:** 3 old tests fail, none a code bug. `toll_v2_commands` still expects `link_payback` to be unbuilt. `week_result` and `settlement_lines` hand-build charges allocated over their amount, which the new guard now refuses. **Closed 13 Nov.**
- Cursor fixed the 3 old tests the right way: each impossible slice got its own posted charge, and the totals rose by exactly those amounts, with the sum written in.
- Cursor wrote `toll_v2_decisions.sql` (10 sections), the error-map cases and the CI wiring.
- Claude added a nightly check after **every** section (Cursor had one only at the end), plus the missing payback-lowered guard probe. All pass.
- Full `pnpm test:toll` from a reset: green. Local only; not committed. |
| P2-R4b | **Decisions that change facts:** reverse_payback (P17), correct_charge_amount (P16 + proportional), correct_charge_week (PB2), carry_forward (P18 / P19 / P20, late charge / payback), leave_payback_unlinked on a carried P19 leftover | Claude core, Cursor tests | |
| P2-R5 | **Driver app:** receipt required + toll offline outbox; the import route on the Fleet server (file → adapter → `import_batch`, user token) | Cursor | |
| P2-R6 | Phase 2 exits (Part D) end to end on a real week's files; confirm Uber cash includes the toll; `/code-review`; live migrations first, then deploy | All | |

## Later phases
- Each phase gets its round list here when it starts. Before Phase 3, Claude writes the Stitch prompt and the owner makes the screens.
- Week Reconciliation: WRA-41 (Fuel, test 6) and the 9t re-run don't wait on tolls; tests 5 and 13 close at Phase 4.
