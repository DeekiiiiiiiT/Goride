# Toll Architecture — Rebuild

**Rev 9 · 2026-11-12 · Status: Agreed in architecture (reviewer, rounds 8 and 9). Round 9 was the last review: further changes come from failing tests. Building waits for the owner's go.**

This file replaces the piecemeal toll fixes with one design for the whole toll section:
- **Part A** maps today's system. Every fact gives the file it comes from.
- **Part B** is the proposed new design (Rev 9), opening with B0, the invariants every build phase must prove by test.
- **Part C** is the reviewer's questions, with both sides' answers.
- **Part D** is the build phases, and **Part E** is what is still open.

**How we go back and forth:** the reviewer answers under each **Reviewer** line and comments under "Reviewer notes". Claude replies under **Claude**, checks every claim against the code, revises the design and logs the round at the bottom. Nothing is built until the reviewer and the owner both mark the design **Agreed**.

The reviewer has no app access, so every fact about today's system gives its file. Anything marked *(to check)* is not confirmed yet. Where Claude checked a reviewer's point against the code, the answer says **checked**.

Related: `docs/week-reconciliation-architecture-audit.md` (the week section that hosts Tolls as step 3). `docs/week-reconciliation-toll-review.md` (rounds 1–2 on two toll bugs) is superseded by this file.

**Rev 9 in short:** the reviewer confirmed Rev 8 (including the three corrected premises) and called round 9 **the last review**. Rev 9 folds in their four clarifications:
- **C1:** when a Roam ride's cash arrives late, the server checks whether the week is sealed and takes the right path;
- **C2:** the platform's share of a tag refund stays undecided until a person decides it;
- **C3:** a refund is split in proportion to who bore the toll;
- **C4:** a down correction gives the same answer before and after drivers are paid.

Checking them found two more cases, both closed:
- late cash for a week that was reopened after a provisional seal;
- a down correction of an already-decided toll in a reopened week, which was refused.

**Rev 8 in short:** the reviewer marked the design **Agreed in architecture** and cleared Phase 0 to start. Rev 8 closes the eight edge gaps they listed (G1.1–G1.8) and tracks two more (G1.9, G1.10). Checked against the code, three of the reviewer's premises were adjusted:
- a Roam cash **ride's** settlement posts the rider's payback (P5 + P6), not P3 (G1.4);
- a tag refund never means the fleet owes the platform money, because platforms pay back what they charged the rider (G1.6);
- a rider's arrears are on the rider's wallet, not tied to a ride, so an underpaid or unpaid ride's toll is decided at once instead of waiting (G1.2).

What changed:
- every charge has exactly one state;
- Roam cash rides never block a seal;
- the carried facts get their own table (`toll.carried_facts`), which every carry-forward posting refers to;
- P18 and P19 are split correctly;
- a new P20 records a Roam ride's cash that arrives after its week was sealed.

**Rev 7 in short:** the reviewer confirmed Rev 6 and named two last gaps. Both are closed:
- **G1, what a seal requires** (B6, I25). A week can't be sealed until every toll in it is decided, every payback has a final answer, no cash receipt is unchecked and no duplicate pair is open. Otherwise the seal is refused with `PENDING_NOT_RESOLVED`, naming each blocking record.
- **G2, a late fact for a week whose drivers are already paid** (B3, B5, B6, I26). Such a week can't be reopened, so the late fact is brought into the current open week with one command, `carry_forward`, and decided there. A platform take-back is absorbed by the fleet or charged to the driver in that week (P18).

Checking G1 found two more holes, also closed:
- no command existed to verify or reject a driver's cash receipt (`verify_cash_receipt` / `reject_cash_receipt`);
- late charges and corrections for a paid week were stuck in the same way as take-backs, so `carry_forward` covers every kind of late fact, not only take-backs.

O1–O3 are taken: a payout sweep that heals itself, an alert for a platform balance left in credit, and the payout clearing note.

**Rev 6 in short:** the reviewer approved Phase 0 to begin. Two items must be closed before Phase 0 *ends*, and both are now in the design:
- **EC1:** nightly check 3 now counts each ledger row in the week of the toll or payback it belongs to, so it still ties after cross-week reversals and week moves;
- **EC2:** for a Roam cash ride, the payback and its allocation are written and posted together, in one transaction, once the ride's cash is settled.

The eight smaller notes are in too. Checking them against the code found two facts (A13):
- Business Finance's bank record is one "money received" step that can be deleted or changed, so P10 and P11 fire together from it and are reversed with it;
- its save and delete routes take the company from the request body for the record key (a separate Business Finance bug, not fixed here).

**Rev 5 in short:** the reviewer said Rev 4 would be approved for Phase 0 once four accounting gaps were closed. All four are closed, and the money model (B5) is final:
- every payback posts in full when it arrives, so a leftover is never off the books;
- moving a toll between weeks reverses and re-posts it, so both weeks still tie;
- driver settlement is split into separate balanced entries;
- platform take-backs are defined within a week and across weeks.

Two facts found while checking (A12): the cash desk can pay a driver before tolls are sealed (Phase 0 now blocks that), and Business Finance's bank records aren't in the ledger.

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

# Part A — Today's system (facts)

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

## A1b. The money ledger today (checked for Rev 2)

There are two money stores:

1. **`ledger.entries`** is **double-entry.**
   - Each row has `debit_account_id`, `credit_account_id` and `amount_minor > 0`, so every row balances by construction.
   - Accounts live in `ledger.accounts` (`organization_id`, `account_key`, `account_class` ∈ asset / liability / equity / revenue / expense).
   - It is written through the `ledger_post_entry` RPC (`supabase/functions/_shared/unifiedLedger/postEntry.ts`), which is repeat-safe by `idempotency_key`.
2. **`ledger.financial_events`** is **single-sided.**
   - Each row is one amount with `direction` ∈ inflow / outflow / neutral, `domain` (toll, fuel, …) and an optional `ledger_entry_id`.
   - Toll money is read from here today (`toll_charged_from_financial_events.ts`, `driver_financial_periods.ts:874`, `projectionReadsEventsForTolls`).

Toll rows themselves are **not posted to the double-entry ledger.** The toll dual-write (`dualWriteToll.ts`) is switched off: the 12 Nov test log shows `kv_toll_ledger … skipped … flag_off`. Some toll events, such as `toll_charge_offset`, are posted.

**Known consequence:** in Aug 2026, 24 `toll_usage` events outlived their deleted toll rows and inflated a week by J$8,500. No check compares events against toll rows (`TOLL_TAG_INFLATION_AUDIT.md`).

## A2. The state of one toll

A single toll row carries about eight overlapping state fields:

- `status`
- `isReconciled`
- `tripId`
- `matchStatus` (`unmatched | matched | orphan_personal | ambiguous`)
- `matchTypeCode` (`PERFECT_MATCH | AMOUNT_VARIANCE | DEADHEAD_MATCH | PERSONAL_MATCH | POSSIBLE_MATCH`)
- `matchReasonCode`
- `resolution` (`personal | business | write_off | refunded`)
- `workflowStage` (9 values, `toll_workflow_stage.ts`)

On top of these, the linked claim's own status overrides the toll's stage (`toll_workflow_stage.ts`, rule 1).

Other records add their own states:
- the trip's `tollRefundResolution`: `cash_wash | phantom | expense_logged | pending`;
- the dispute refund's `status`: `unmatched | matched | auto_resolved`.

Values are also spelled inconsistently. Payment method appears as `tag_balance`, `Tag Balance`, `Cash` and `cash`.

## A3. Where "which bucket is this toll in" is decided

The same question is answered in five places that can disagree:

1. Browser: `resolveWizardBucket` / `bucketForBestMatch` (`apps/fleet/src/utils/tollBucket.ts`);
2. Server week check: `resolvePeriodBucket` (`packages/toll-core/src/tollPeriodBucket.ts`);
3. Toll Brain, a separate function (`supabase/functions/toll-brain/classify.ts`, plus `apps/fleet/src/utils/tollBrainClassify.ts`);
4. Server match suggestions (`toll_controller.tsx`);
5. Refund classifier, kept as 3 copies (`apps/fleet/src/utils/refundClassifier.ts`, `apps/driver/src/utils/refundClassifier.ts`, `packages/types/src/refundClassifier.ts`) plus a server port (`classifyRefundServer`).

**Seen on 12 Nov:** the server logged `[toll-readiness][shadow] client vs server mismatch` for the same week. The browser counted Deadhead 1 / Personal 1; the server counted Deadhead 0 / Personal 2.

## A4. Where toll money totals are computed

1. Tolls step check: `buildWeekReadiness` → `computeTollPeriodReadiness` (`toll_period_readiness_build.ts`, `packages/toll-core/src/tollPeriodReadiness.ts`);
2. Toll seal: `computeTollWeekNetting` (`packages/toll-core/src/tollWeekNetting.ts`, `toll_week_seal.ts`);
3. Driver week: `driver_financial_periods.ts` (~866–1136), with two paths (events vs key-value fallback) and the cash-wash total added in both.

Driver settlement takes only `tollCashWash` and `tollPersonal` from tolls (`driver_financial_periods.ts:1306–1309`).

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

## A8. Bugs found on 12 Nov, traced to the design

| Bug | Root cause in the design |
|---|---|
| A dispute refund with no toll can never be cleared, so Tolls never seals (WRA-42) | Each record type has its own status rules; no general "decided" outcome |
| One company sees another's tolls, refunds and claims (WRA-44) | Data stored without a required company; loaders filter by date only |
| Charge Driver skipped the week's safety check | One decision split across two servers, run by the browser |
| Opening Tolls made other tabs out of date | Reads that write (auto-match on open) |
| Toll decisions didn't trigger a week recalculation (WRA-43, under investigation) | Money lands in different stores; key-value claims have no trigger |
| Browser and server disagree on bucket counts | The same decision computed in 5 places |

## A9. Who actually receives toll money (checked for Rev 3)

Today's driver settlement shows the flow (`packages/finance-core/src/driverPeriodSettlement.ts`, `supabase/functions/_fleet-server/driver_financial_periods.ts` ~862–940):

- **Platform payouts go to the fleet.** The fleet pays each driver their share (`driverShare` → `netPayout`). So a toll the platform pays back on a **card / in-app** trip arrives in the platform payout, which goes to the **fleet**.
- **Cash trips put money in the driver's hand.** The rider pays the driver in cash, including the toll. The driver owes that cash to the fleet (`baseCashOwed`).
- **A toll the driver paid in cash counts as cash paid** (`cashPaid = baseCashPaid + tollCashWash`, line 111). Cash tolls that were "handled", and cash-trip tolls with no linked tag ("cash wash"), reduce what the driver owes.
- **Personal tolls are added to what the driver owes** (`cashOwed = baseCashOwed + tollPersonal`, line 110).

So **who received a toll payback depends on how the trip was paid, not on the platform**: card or in-app → fleet (in the platform payout); cash → driver (in hand). Roam is the same: its rides can be paid in cash (`supabase/functions/rides/fare/cashPayment.ts:91` charges `actual_tolls_minor` on a cash ride).


## A10. Ledger accounts today (checked for Rev 4)

- **How accounts are found** (`ledger._resolve_account_id`, base schema line 6177):
  - `org:<company>:<name>` → that company's own account, created on first use;
  - `user:<id>:driver:(digital|cash|debt)` → a driver's account;
  - `platform:receivable` / `platform:clearing` → shared system accounts;
  - anything else → looked up by key and currency **only, not by company**.
- **Toll money today posts to shared accounts that every company uses together:**
  - `platform:fleet_toll_expense` (`toll_financial_reset.ts:375`, `driver_financial_period_controller.tsx:782`);
  - `platform:driver_receivable` (`driver_financial_period_controller.tsx:872`);
  - `platform:clearing` (`dualWriteToll.ts:40`).

  Each entry row carries its company, so per-company sums work. **Account balances do not:** they mix every company.
- **No toll chart, no bank account and no platform-payout account exist** for fleet money in the ledger. Fleet postings otherwise use one broad account, `org:<company>:fleet`.
- `ledger.post_entry` (base schema line 6558):
  - requires a company, refuses a zero or negative amount, and is repeat-safe;
  - **its `idempotency_key` is unique across all companies**;
  - **it has no sealed-week check.**
  - Balance convention: a debit lowers `balance_minor`, a credit raises it.

## A11. The week, and seal before settlement (checked for Rev 4)

- **One week rule already exists:** ADR 0007 (`docs/adr/0007-one-week-rule.md`). `periodKeyFor(event, America/Jamaica)` in `@roam/finance-core` (`packages/finance-core/src/periodKey.ts`) puts every dollar in a Monday 00:00 – Sunday 23:59:59 Jamaica week. Week Reconciliation uses the same rule.
- **Seal already comes before the driver close:**
  - A driver week can't close without the sealed toll statement (`TOLL_STATEMENT_MISSING`, `packages/finance-core/src/closeInvariants.ts:301`).
  - In Week Reconciliation, Tolls (step 3) must be complete before Settlement (step 7) and Close (step 8).
  - **The cash desk is not covered:** a settlement payment can go out before the toll seal (checked in Rev 5, A12).
- **The cash a driver owes already includes the rider's toll on cash trips.** The driver's cash owed is the platform statement's passenger cash (`cashCollected = cashBase.passengerCash`, `driver_financial_periods.ts:1275`). Today's "cash wash" only adds the cash the driver paid at the plaza to `cashPaid`. It never adds the rider's toll to what the driver owes, because it is already there. *(to confirm against one real Uber statement: that its passenger cash includes the toll.)*


## A12. Settlement payments and the bank (checked for Rev 5)

- **Driver settlement payments don't check the toll seal today.** The pay / collect commands (`supabase/functions/_fleet-server/settlement_commands.ts`) check the outstanding amount (`assertExpectedOutstanding`, line 123) and the week's own lock (`assertPeriodCasClaimed`, line 153), but nothing about tolls. So the cash desk **can** pay a week before its toll seal. Only the driver-week *close* needs the sealed toll statement (A11).
- **Business Finance's bank confirmations live in the key-value store,** not the ledger (`fleet_bank_confirm:org:<company>:<week>:<platform>` keys, `register_fleet_bank_routes.ts:73`). No ledger account represents the fleet's bank today (A10).

## A13. The bank record and Roam cash rides (checked for Rev 6)

- **Business Finance's bank record is one step, not two.** Checked in `register_fleet_bank_routes.ts:23-79`:
  - The PUT stores one record per company, week and platform: `status: "confirmed"`, `amountReceived`, `bankDateYmd`, `confirmMethod` (manual or statement). It means "this money is in the bank". There is no separate "payout confirmed" step before it.
  - The amount is the **whole payout**, not its toll part.
  - The record can be **overwritten** (a second PUT, possibly with a different amount) or **deleted** (DELETE, "Unconfirm", line 113).
  - Nothing in the ledger changes when it does. The route comment says the record is "ops only — never feeds Cash Returned / Settlement" (line 10).
- **Bug found in passing (Business Finance, not toll):** the PUT and DELETE build the record's key from `body.organizationId` / the `organizationId` query value before the signed-in company (lines 35 and 120). So a user of company A with `transactions.edit` can write or delete company B's bank record key. `stampOrg` then sets the stored record's `organizationId` to A (`org_scope.ts:89`), so the key and the record can disagree. This is outside the toll section. It goes to the owner as its own item (Part E), and the toll side never trusts the key's company (B5).
- **Roam cash rides settle in steps.** Checked in `supabase/functions/rides/cashSettlement/`:
  - When the ride ends, the ride moves to `awaiting_cash_settlement` with `cash_settlement_status = 'pending'` (`cashSettlementLifecycle.ts:25`).
  - Only when the cash is recorded does it become `completed`, `cash_settlement_status = 'settled'`, with `cash_received_minor` and an outcome (`cashSettlementLifecycle.ts:37`).
  - The outcome is `exact`, `overpay`, `underpay` (the rider owes the rest as arrears) or `unpaid` (nothing received) (`computeOutcome.ts:15-55`).
  - The fare includes the actual tolls (`computeFinalFare.ts:17-22`).

---

# Part B — Proposed design (Rev 9)

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
| I18 | Every **active** charge and every **active** payback can be decided; a reversed payback is terminal (Rev 6 wording) | Every intent exists; one test per intent |
| I19 | Unverified cash is never paid | `unverified_cash_not_posted` |
| I20 | Nothing sits undecided unnoticed | Aging alerts (charge suspense, unallocated paybacks, `after_seal`; Rev 6: `after_seal` **reversals** at 7 days); `aging_alerts`, `after_seal_reversal_pages_at_7_days` |
| I21 | No repair routes | None shipped |
| **I22** | **Every toll account ties to its records every night, with no exceptions** (Rev 5) | The nightly checks in B5 (Rev 7: seven); `nightly_ties_*`; Rev 6: `week_flow_matches_disposition` (check 3) |
| **I23** | **A week moved, reversed or corrected still ties in both weeks** (Rev 5) | `correct_week_ledger_moves`, `reversal_in_and_across_weeks` |
| **I24** | **No driver is paid for a week before its tolls are sealed** (Rev 5) | Settlement commands refuse; `pay_refused_before_toll_seal` |
| **I25** | **A week seals only when everything in it is decided** (Rev 7, G1) | Seal refuses with `PENDING_NOT_RESOLVED` + the blocking records; `seal_refuses_pending`, `seal_blocks_until_decided` |
| **I26** | **A late fact for a paid week is never stuck:** it is carried into the open week and decided there; the paid week never changes (Rev 7, G2) | `carry_forward`; `carry_forward_each_kind`, `taken_back_after_settlement` |

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
| `toll.charges` | A toll the fleet's tag or the driver's cash paid | vehicle, driver, plaza, `occurred_at`, `week_key`, `time_precision`, `amount_minor` > 0, `paid_by`, `source`, `source_ref` (unique), `evidence_status` (`unverified` \| `verified` \| `rejected`), `duplicate_of`, `after_seal`, **`adjusts_charge_id`** (Rev 7: set when the charge is a carried correction), `is_legacy`, `version`. (Rev 8: the Rev 7 `carried_to_week` column is replaced by `toll.carried_facts`.) |
| `toll.charge_changes` | Each amount or week correction | `charge_id`, field, old, new, **`pending`** (Rev 5: true for an import's correction to a sealed week; only a person applies it, after reopening), `decision_id` |
| `toll.platform_trips` | A trip from any platform (matching input) | `platform`, `platform_trip_id`, driver, vehicle, times, `time_precision`, `payment_method`, `is_legacy` |
| `toll.paybacks` | Money a rider paid for a toll | `platform`, `kind`, `platform_trip_id`, `reference` (unique), driver, date, `week_key`, `amount_minor` > 0, `reversal_of`, `received_by`, `after_seal`, `is_legacy`, `version` |
| `toll.allocations` | One slice of a charge's cost to one bearer | `charge_id`, `bearer`, `amount_minor`, `payback_id` (when platform), `reason`, **`provisional`** (Rev 8: true only for the seal's automatic decision on a Roam cash ride still awaiting cash, B6), `decision_id`, `reversed_by` |
| **`toll.carried_facts`** (Rev 8, G1.8) | One late fact carried from a sealed, paid week into an open week | `kind` (`charge` \| `payback` \| `take_back` \| `correction_up` \| `correction_down` \| `cash_recovered`), `original_id` (the charge, payback or charge change), `from_week`, `to_week`, `amount_minor`, `bearer?`, `decision_id`. **It is the counted week of the original fact (`to_week`), the record every leg of P18–P20 refers to (I2), and the only source of `week_result.carriedIn`** |
| `toll.payback_unlinked_decisions` | A person's decision that a payback, or its leftover, has no toll | `payback_id`, `amount_minor`, reason, `decision_id`, `reversed_by` |
| `toll.decisions` | Every command (append-only) | `command_id`, `intent`, `actor` (`user` \| `system` \| `staff`), **`actor_job`** (Rev 5: required when actor = system, e.g. `native_ride_charge`, `native_cash_settled`, `import_batch:<batch>`, `auto_apply_suggestion`, `nightly_check`), acting company for staff, reason, targets, versions, engine version, `response` (B3), `created_at` |
| `toll.suggestions` | One engine suggestion (append-only) | candidate ids, score parts, rules fired, engine version, `inputs`, inputs hash, `superseded_by` |
| `toll.tag_accounts` / `toll.tag_topups` | The tag account and its top-ups | account, amount, date, `source_ref` |
| `toll.platform_settings` | One row per platform per company | `pays_tolls_back`, `payback_mode`, `matching_window_seconds`, `auto_apply`, `adapter_version` |
| `toll.plaza_rules` | One row per plaza | `auto_duplicate_window_minutes`, `review_duplicate_window`, `changed_by`, `changed_at`. Rev 6: **set only by a platform owner**, through a `toll_system` function that writes an audit row (as for `staff_company_access` and `switch_state`); no direct table edits |
| `toll.staff_company_access` | One staff person allowed to act for one company | staff user, company, `granted_by`, `granted_at`, `revoked_by`, `revoked_at` (B7) |
| `toll.switch_state` | One row per company | `tolls_v2` (on / off), `changed_by`, `changed_at` (B11) |

**Dispositions (derived, never stored):**
- **Charge (Rev 8, G1.1: one closed list, exactly one state per charge, checked in this order):**
  1. `duplicate`: confirmed as a duplicate of another charge. `confirm_duplicate` reverses any posting and allocations it had (P15). Final.
  2. `rejected`: a person rejected the cash receipt. Never posted. Final.
  3. `unverified`: a cash charge whose receipt isn't checked yet. Not posted (I19). **Blocks the seal.** It becomes `pending` once verified.
  4. `awaiting_cash`: a Roam cash-ride charge whose ride is still `awaiting_cash_settlement` (A13). Posted (P2 / P3), not yet allocated. **Does not block the seal** (B6).
  5. `decided`: Σ active allocations = amount.
  6. `pending`: anything else (Σ active allocations < amount).
- **Which week a charge or payback counts in (Rev 8):** the `to_week` of its `toll.carried_facts` row when it has one (G2), otherwise its `week_key`. This is the week used by the week result and by check 3.
- **Payback:** `pending` (none allocated, none left unlinked), `part_allocated`, `allocated`, `left_unlinked` (fully or the leftover), or **`reversed`** (Rev 5). When a payback is reversed:
  - all its active allocations **and** its unlinked decision are reversed with it (`reversed_by` = the reversal's decision);
  - every charge it covered goes back to `pending` for that amount;
  - the reversing payback itself (`reversal_of` set) has no disposition of its own and can't be allocated.

**Sealed weeks:** only in `ledger.week_statements` (`kind = 'toll_week'`), with `driver_settlement_status` and `platform_settlement_status` added.

**Roam:** `native_ride_charge` (system, `actor_job = native_ride_charge`) writes the charge. Then (Rev 6, EC2):
- **Card / in-app ride:** in the same transaction it writes the `native` payback and the platform allocation, and posts P4 and P6 together.
- **Cash ride:** at ride end it writes **the charge only** (P2 or P3). The payback and its allocation are **not written yet**. When the ride's cash is settled (`cash_settlement_status = 'settled'`, A13), one transaction (`actor_job = native_cash_settled`) writes the `native` payback (`received_by = driver`) and the allocation, and posts P5 and P6 together. So an allocation never exists without its P5, and `toll:payback_unallocated` can't go negative. Test: `roam_cash_payback_waits_for_settlement`.
- **Rev 9 (C1): `native_cash_settled` branches on the charge's counted week, never on the ride's state.**
  - **Week open, charge not decided:** write the `native` payback and post P5 + P6 (above).
  - **Week open, charge provisionally decided** (the week was sealed with it `awaiting_cash`, then reopened): first reverse the provisional allocation (P15), then post P5 + P6. *This case was found while checking C1.* Without it, P6 would push the allocations above the charge's amount (I4).
  - **Week sealed** (the charge must then be provisionally decided): write a `cash_recovered` row in `toll.carried_facts` for the current open week and post P20 (B6).
  - Test: `native_cash_settled_branches_on_seal`, covering all three cases.
- **How much of the toll a cash ride paid back** (from the settlement outcome, A13):
  - `exact` or `overpay`: the full actual toll;
  - `underpay`: the cash received covers the toll first, so the payback = the smaller of the toll and `cash_received_minor`. Any rest of the charge is decided as the fleet's at once (Rev 8, B10);
  - `unpaid`: no payback. The whole charge is decided as the fleet's at once (Rev 8, B10).
  - **Until the cash is settled, the charge's state is `awaiting_cash` (Rev 8, B2).**

**Duplicates:** re-imports are stopped by `source_ref`. The auto rule is cross-source only (vehicle + plaza within the plaza window; no driver in the key). The review list covers the same vehicle and plaza on the same day. `roam_ride` and `tag_statement` win over `driver_cash`.

## B3. Commands

```
POST /toll/commands/{intent}
{ command_id, charge_id?, payback_id?,
  expected_charge_version?, expected_payback_version?,     // required per intent, table below
  amount_minor?, target_week?, reason_code, note }
→ 200 { decision_id, charge_version?, payback_version?,
        weeks: [ { week_key, week_version, delta } ] }     // Rev 5: one entry per week touched
→ 200 replay: the stored first answer
→ 409 { code, current_state, sealed_weeks? }               // Rev 5: names the sealed week(s)
```

- **On every 200 the client re-fetches current state.** A replay describes the moment of the first call.
- **The stored answer** is the exact first 200 body, at most 64 KB. A larger answer stores `decision_id`, the versions and the per-week deltas, with `truncated = true`; a replay of it still works.

**Intents (closed list) and the versions each requires (Rev 5):**

| Intent | Who | Requires | What |
|---|---|---|---|
| `link_payback` | person | charge + payback versions | Allocate a charge (or part) to a payback |
| `driver_pays` / `fleet_absorbs` | person | charge version | Allocate to the driver / fleet |
| `leave_payback_unlinked` | person | payback version, **or** (Rev 9, C2) the `toll.carried_facts` row's version for a P19 leftover | A payback, or its leftover, has no toll; reason required. A P19 leftover is decided on its carried row in the open week, because its payback sits in a sealed week |
| `undo_decision` | person | `decision_id` + `expected_charge_version` and `expected_payback_version` for **every distinct charge and payback** the decision touched (Rev 6). The server works out the touched records from the decision itself and checks each version; a missing or stale one → `VERSION_CHANGED` | **A person made the wrong call:** reverse that decision. The facts stay as they are. |
| `reverse_payback` | import or person | payback version | **The platform changed the facts:** it took the money back. A new positive payback with `reversal_of`; the original's allocations and unlinked decision are reversed |
| `correct_charge_amount` | person or import | charge version | Up, or down to ≥ allocations: applied, posting P16 (B5). **Rev 9 (found while checking C4): down below allocations** (for example, any down correction of a decided charge in a reopened week) **is applied, not refused.** The allocations are first reduced by the shortfall, split in proportion to each bearer (the C3 rule, B5), reversing that part of P6–P8. Then P16 posts. A reduced platform allocation leaves a leftover in `payback_unallocated` that must be decided (C2). `ALLOCATIONS_EXCEED_AMOUNT` stays only for a person's command whose expected allocations no longer match. Import into a sealed week: a `pending` change for a person. Person on a sealed week: `WEEK_SEALED` |
| `correct_charge_week` | person | charge version | Both weeks open: applied (ledger in B5). Either sealed: `WEEK_SEALED` with `sealed_weeks` naming which |
| `confirm_duplicate` / `release_duplicate` | person | both charge versions | Settle a review pair |
| `verify_cash_receipt` / `reject_cash_receipt` (Rev 7) | person | charge version | Verify: **P3 posts at this moment** (Rev 8, G1.4) and the charge becomes `pending`. Reject: final, never posted; reason required |
| `carry_forward` (Rev 7, G2) | person (reconciliation owner) | the fact's version + the target week's open state; for a take-back, `bearer` (`fleet` \| `driver`) | Only for an `after_seal` fact whose week is **sealed and its driver settlements paid** (otherwise the answer is reopen). It writes a `toll.carried_facts` row (`to_week` = the current open week), and the fact is posted and decided there (B5). The sealed week is never touched. Any other case → `REOPEN_INSTEAD`. **One system case (Rev 8):** `native_cash_settled` carries a `cash_recovered` fact itself (B6) |
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

## B4. Matching engine (unchanged from Rev 4)

- Pure, with stored inputs, append-only; runs only when data arrives.
- The window is the wider of the two precisions; never widened.
- Candidates exclude duplicates, legacy, `after_seal`, reversed and reversing paybacks.
- **Auto-apply only when all are true:** the company has it on (default off, shadow first), one candidate, a tight window, a score above the threshold, and neither side `date_only`. Recorded with `actor_job = auto_apply_suggestion`.
- Roam is native, not auto-apply.

## B5. Money: the ledger (Rev 5: final; Rev 6 adds P16, P17, the bank trigger and the check fixes)

**One ledger:** `ledger.entries` through `toll_system.post`. A row's **week** is `periodKeyFor(effective_at)` (ADR 0007), and `effective_at` is the time of the fact (the crossing, the trip, the decision). Ledger idempotency key: `toll:<company>:<command_id>:<line>`.

**Accounts (all `org:<co>:…`, created on first use by the existing rule):**

| Account | Class | Holds | Its balance must equal (nightly, I22) |
|---|---|---|---|
| `toll:tag_prepaid` | asset | Money on the tag account | The tag roll-forward closing |
| `toll:suspense` | asset | Charges not yet decided | Σ undecided part of non-legacy, non-`after_seal` charges |
| `toll:payback_unallocated` (Rev 5) | liability | Payback money received or due but not yet given to a charge: pending, part-allocated leftovers, and left-unlinked amounts | Σ unallocated part of active paybacks |
| `toll:receivable_platform` | asset | Paybacks a platform owes the fleet (card / in-app) | Σ fleet-received paybacks whose payout isn't confirmed |
| `toll:recovered_in_driver_cash` | asset | Paybacks the driver received in cash, already inside their passenger cash | Σ driver-received paybacks of weeks not yet settled |
| `toll:receivable_driver` | asset | Tolls the driver must pay (personal, charged deadhead, shortfalls) | Σ driver allocations not yet settled |
| `toll:payable_driver` | liability | Verified cash tolls the fleet owes the driver | Σ verified cash charges not yet settled + Σ P19 driver credits not yet settled (Rev 8) |
| `toll:expense` | expense | The fleet absorbs | Σ fleet allocations |
| `toll:platform_payout_clearing` | asset | The toll part of a confirmed platform payout, waiting for its bank deposit | Σ toll part of confirmed payouts not yet deposited. **Rev 6:** read from Business Finance's `fleet_bank_confirm:` records in the key-value store, not from `toll.*`. Because today's record is one "money received" step (A13), P10 and P11 post together and this balance is **0 every night** until Business Finance has separate steps |
| `bank` | asset | The fleet's bank, **ledger side** (see the hand-off below) | Not a toll check; Business Finance's |

**Postings.** Every row debits one account and credits another for the same amount.

| # | Event | Debit | Credit |
|---|---|---|---|
| P1 | Tag top-up | `toll:tag_prepaid` | `bank` |
| P2 | Tag crossing arrives | `toll:suspense` | `toll:tag_prepaid` |
| P3 | **A driver cash toll becomes verified** (Rev 8, G1.4: P3 fires at the moment of verification, whatever that moment is): `verify_cash_receipt`; an import that carries its own proof; or a Roam native crossing paid in cash, which is created verified because the crossing and amount are certain *(to check: how the ride app knows a plaza was paid in cash, not by tag)*. A Roam cash **ride's** settlement is not P3: it is the rider's payback, P5 + P6 | `toll:suspense` | `toll:payable_driver` |
| P4 | **Payback is recorded** (the fact from the platform's statement or the Roam ride; not the money in the bank, which is P10/P11), card / in-app. The full amount | `toll:receivable_platform` | `toll:payback_unallocated` |
| P5 | **Payback is recorded**, cash trip (Roam: only once the ride's cash is settled, B2) | `toll:recovered_in_driver_cash` | `toll:payback_unallocated` |
| P6 | Allocate a charge to a payback (`link_payback`, native, auto). For a Roam cash ride, always in the same transaction as its P5 (B2, EC2) | `toll:payback_unallocated` | `toll:suspense` |
| P7 | Allocate to the driver | `toll:receivable_driver` | `toll:suspense` |
| P8 | Allocate to the fleet | `toll:expense` | `toll:suspense` |
| P9 | `leave_payback_unlinked` | **no posting.** The amount is already in `toll:payback_unallocated` from P4/P5, visible and aged (PB1) | |
| P10 | Platform payout confirmed (Rev 6: through the payout trigger below). The toll part = Σ fleet-received paybacks, net of take-backs, for that company, week and platform | `toll:platform_payout_clearing` | `toll:receivable_platform` |
| P11 | Payout deposit confirmed. Today the same trigger as P10, in the same transaction (A13) | `bank` | `toll:platform_payout_clearing` |
| P12 | **Driver settlement, event 1:** the driver hands over the week's passenger cash. Toll side: the cash-trip paybacks inside it | `bank` | `toll:recovered_in_driver_cash` |
| P13 | **Driver settlement, event 2:** the fleet settles toll amounts with the driver. Cash tolls it owes back | `toll:payable_driver` | `bank` |
| P14 | **Driver settlement, event 2:** tolls the driver owes, taken from the settlement | `bank` | `toll:receivable_driver` |
| P15 | Undo, week move | The exact reverse of the original rows (and, for a week move, new rows in the new week) | |
| **P16** (Rev 6) | `correct_charge_amount` **down** by D (to ≥ allocations), tag charge | `toll:tag_prepaid` | `toll:suspense` |
| | … **down** by D, cash charge | `toll:payable_driver` | `toll:suspense` |
| | … **up** by D, tag charge (the charge becomes pending for D) | `toll:suspense` | `toll:tag_prepaid` |
| | … **up** by D, cash charge | `toll:suspense` | `toll:payable_driver` |
| **P17** (Rev 6) | `reverse_payback`: the platform took a payback back. The reversing payback posts (a) the exact reverse of every active P6 of the original (Dr `toll:suspense`, Cr `toll:payback_unallocated`), then (b) the exact reverse of the original's P4 or P5 **for its full amount** (Dr `toll:payback_unallocated`, Cr `toll:receivable_platform` or `toll:recovered_in_driver_cash`). **Rev 8, a partial take-back of Z:** it uses up the unallocated / left-unlinked leftover first, then reverses allocations newest first, only as far as Z needs | see the row | |
| **P18** (Rev 7; Rev 8 two steps, G1.7) | `carry_forward` of a **take-back** of Z against a paid week. **Step a**, the part of Z that was leftover (never covered a toll; taken first): | `toll:payback_unallocated` | `toll:receivable_platform` (card) or `toll:recovered_in_driver_cash` (cash trip) |
| | **Step b**, the part of Z that had covered tolls, bearer = fleet | `toll:expense` | same as step a |
| | … step b, bearer = driver (charged in the open week) | `toll:receivable_driver` | same as step a |
| **P19** (Rev 7; Rev 8 rewritten, G1.5 / G1.6) | `carry_forward` of a **down correction** D against a paid week. **Debit (who gets the money back):** tag charge → `toll:tag_prepaid` (the provider refunds the tag); cash charge → `toll:receivable_driver` (the driver was already reimbursed the full amount and now owes D back) | see the left | **Credit D split in proportion to each bearer's active allocation (Rev 9, C3; replaces Rev 8's "driver first, in order"):** the driver's share → `toll:payable_driver` (the week is paid, so the driver is owed it in the next settlement, never a negative receivable); the fleet's share → `toll:expense`; the platform-covered share → `toll:payback_unallocated`. **Rounding:** each share is rounded down to the cent, and any cents left over go to the driver, then the fleet, then the platform. **The platform share is still undecided (Rev 9, C2):** no unlinked decision is written. It counts in the open week's `unallocatedMinor`, so it ages at 14 days and blocks that week's seal until a person decides it (`leave_payback_unlinked` on the carried row). `tag_refund_excess` is only a label to help that person |
| **P20** (Rev 8, G1.2) | A Roam cash ride's cash settles **after** its week sealed with a provisional fleet decision (B6): the rider's cash covering the toll, carried as `cash_recovered` | `toll:recovered_in_driver_cash` | `toll:expense` |

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
  - **Rev 6: two records of the same money, not one.** Until Business Finance moves to the ledger, the toll side's `bank` rows and Business Finance's key-value record are **two separate records of the same money**, joined only by this hand-off (`week_result.ledgerMovements.bankMinor`). A future auditor should not read `bank` as Business Finance's bank. It is the toll side's view of it.
- **The payout trigger (Rev 6, decoupled from its source).**
  - P10/P11 post only through one function, `toll_system.payout_received(company, week, platform, source_ref, source_version, amount_received)`. The toll postings depend only on this function, never on where the call comes from.
  - **Today the source is the key-value record:**
    - Business Finance's PUT and DELETE handlers call the function after their own write;
    - a nightly sweep compares every `fleet_bank_confirm:` record with what is posted and catches any missed call;
    - a **changed** record (new amount) reverses the old P10/P11 and posts again; a **deleted** record ("Unconfirm") reverses them (A13).
  - **The company is the record's stamped `organizationId`, never the key.** A record whose key company differs from its stamped company is refused and alerts (the A13 bug).
  - **When Business Finance moves to the ledger,** only the caller changes, to a ledger event. The function and the postings stay the same: a swap, not a rewrite.
- **Rev 6, P17 (reversing a payback, including its unlinked leftover).**
  - The leftover left unlinked had no posting of its own (P9): it simply stayed in `toll:payback_unallocated`. So nothing is posted to "reverse the unlinked decision". Step (b) takes the payback's **full** amount out of `toll:payback_unallocated`, and that includes the leftover.
  - After P17, the original payback's net effect on `toll:payback_unallocated` is zero.
  - **The credit never goes to `bank`.** This corrects the reviewer's note 7. A platform takes money back by netting it from a later payout, not by drawing on the fleet's bank. So step (b) lowers `toll:receivable_platform`, and the next payout's toll part (P10) is smaller by that much.
  - If the platform has already paid the original, `toll:receivable_platform` can go to a credit balance until the next payout nets it off. The nightly line for that account is signed, so this still ties.
  - For a cash-trip payback, the credit goes to `toll:recovered_in_driver_cash`. *(Rev 8: a tracked fact in Part E, G1.9; if no platform does, the cash-trip credit is removed from P17 and P18.)*
- **The payout clearing lifecycle (reviewer Q2).** `toll:platform_payout_clearing` holds only the **toll part** of a payout. The rest of the payout (fares, fees) is never in toll accounts. It fills at P10 and empties at P11, so its balance is always "toll money in confirmed payouts not yet deposited" and can't build up unexplained.

**G2, carrying a late fact into the open week (Rev 7, `carry_forward`).** Used only when the fact's week is sealed **and** its driver settlements are paid, so it can't be reopened (B6). The paid week stays exactly as sealed. The fact gets a `toll.carried_facts` row (Rev 8), is counted in the current open week and is listed there as "carried from week W". What it posts there:

| Late fact | In the open week |
|---|---|
| A late charge (tag crossing, verified cash) | P2 or P3, then decided like any charge (P6–P8) |
| A late payback | P4 or P5, then allocated or left unlinked like any payback |
| A **take-back** of a payback from the paid week | **P18.** The leftover part just clears (step a). The part that had covered tolls is absorbed by the fleet or charged to the driver in the open week (step b). The bearer is chosen by the reconciliation owner and is required. The original charge stays decided in the paid week, so there is nothing to re-decide |
| An **up** correction of D | A new charge of D with `adjusts_charge_id` = the original; posted (P2 / P3) and decided like any charge |
| A **down** correction of D | **P19.** Split in proportion to who bore the charge; the platform share is left for a person to decide (Rev 9) |
| A Roam cash ride settled after a provisional seal | **P20** (B6), carried by the system |

- **Rev 9, the order of P19 is proportional** (C3), and the platform share is undecided, not pre-classified (C2). On C2 the reviewer expects the platform to "net it from a future payout". It won't: the platform paid what it charged the rider, as below. So the leftover is settled by **a person's decision**, or by a later take-back if the platform corrects its own charge. Either way, it is never booked as fleet income automatically.
- **Why P19 never owes the platform (Rev 8, correcting G1.6's premise).** A platform pays back what **it charged the rider**, not what the fleet's tag cost. A tag refund doesn't change what the rider paid, so nobody can claim it from the fleet. The platform-covered part of a refund is payback money that no longer covers a toll. That is a leftover, kept in `toll:payback_unallocated` like any other (PB1). If the platform later corrects its own charge, that arrives as its own take-back (P17 / P18).
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
1. Each toll account's balance equals its line in the account table above. **Data sources (Rev 6):** `toll.*` for every account except `toll:platform_payout_clearing`, which is checked against Business Finance's `fleet_bank_confirm:` records in the key-value store.
2. Every toll ledger row has a live record, and every decided record's money is on the ledger.
3. **Week flow matches the week's answer (Rev 6, EC1: replaces the Rev 5 per-week sum, which broke on cross-week reversals and week moves).**
   - **Each ledger row is counted in the week of the record it belongs to, not the week it was posted.** Each leg of a row carries the record it belongs to (I2):
     - legs on `suspense`, `expense`, `receivable_driver`, `payable_driver` (P3, P7, P8, P16) and the `tag_prepaid` leg of P2 / P16 → **the charge's current `week_key`**;
     - legs on `payback_unallocated`, `receivable_platform` and `recovered_in_driver_cash` → **the payback that caused the row**. For P17 that is the **reversing** payback, so a take-back counts in the week it arrived. For P6 and its `undo_decision` reverse, it is the linked payback;
     - P1 top-ups → the top-up's week; P10/P11 → the payout's week; P12–P14 → the driver week they settle.
     - **Rev 7 / Rev 8:** "the charge's week" and "the payback's week" mean the counted week (the `to_week` of its `toll.carried_facts` row when it has one, B2). **Every leg of P18, P19 and P20 refers to its `toll.carried_facts` row (I2) and counts in that row's `to_week`** (G1.8). Test: `check3_carried_facts`.
   - **For each open week, each account's change counted this way equals what `week_result` implies for that week:**
     - Δ`suspense` = `pending.amountMinor`;
     - Δ`expense` = `bearers.fleetMinor` (Rev 7: which includes P18 step-b fleet take-backs and provisional seal decisions, less P19 fleet shares and P20 recoveries);
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
5. **`after_seal` control (Rev 5; Rev 6 names its rows):**
   - **The list:** each `after_seal` fact with its `kind` (`charge`, `payback`, `reversal` or `correction`), `id`, `amountMinor`, `arrivedAt` and `relatedWeekKey` (the week it affects; for a cross-week reversal, the original payback's week).
   - **The check:** per affected week, **both the count and the sum** of `after_seal` charges and paybacks in `toll.*` equal that week's list.
   - These facts are in no week's totals and no account (they are never posted until included), so this line ties the gap to zero.
6. **Aging:**
   - undecided charges, unallocated payback leftovers and `after_seal` facts older than 14 days alert the reconciliation owner;
   - **Rev 6: an `after_seal` reversal older than 7 days pages the reconciliation owner.** The money has already left the fleet, but the sealed week can't show it until it is reopened;
   - a Roam cash ride whose cash is never settled shows here as an undecided charge (B10);
   - **Rev 7 (O1):** `toll:receivable_platform` **in credit for one platform for more than 30 days** pages the reconciliation owner. That means a take-back the platform never netted from a payout;
   - **Rev 7:** an unverified cash receipt older than 7 days alerts. It blocks its week's seal (B6).
7. **Rev 7 (O2), the payout sweep heals itself.** The nightly sweep calls `toll_system.payout_received` again for every `fleet_bank_confirm:` record whose `source_ref` + `source_version` doesn't match what is posted:
   - the same version is a no-op;
   - a changed version is reversed and posted again;
   - a deleted record is reversed.

   The call is repeat-safe, so healing is safe. **Every heal also raises an alert**, so a missed call from Business Finance is fixed *and* seen. A record refused for a key / company mismatch (A13) is never healed: it alerts only.

## B6. Seal = frozen snapshot

- **Seal before any driver payment (Rev 5, I24).**
  - **Checked:** today's settlement pay / collect commands don't check the toll seal (A12), so the cash desk can pay before tolls are sealed.
  - **Phase 0 adds the refusal:** a pay or collect for a driver week whose toll week isn't sealed gets `TOLL_WEEK_NOT_SEALED`.
  - Driver settlement then reads only the sealed result.
- **Seal requires, at the moment of sealing (Rev 7, G1, I25)**, in the week's counted records (B2):
  - every active charge is `decided` (`pending.charges = 0`);
  - no cash charge is `unverified`;
  - no duplicate review pair is open;
  - every active payback is in a final state: `allocated`, `left_unlinked` or `reversed`. Not `pending` and not `part_allocated` (`paybacks.unallocatedMinor = 0`; B8 defines the fields).

  - **Rev 8 (G1.2): `awaiting_cash` charges don't block.** In the same seal transaction, each one is decided `fleet_absorbs` with `provisional = true` (system, `actor_job = seal_week`) and listed in the sealed result.
    - If the ride's cash settles later, `native_cash_settled` carries a `cash_recovered` fact into the open week **by itself** (P20, for the cash that covered the toll). It doesn't need a person, and it doesn't need a reopen even when the drivers aren't paid yet.
    - A provisional decision changes only through P20, or by being reversed when its week is reopened and the cash then settles (B2, C1). If the cash never settles, it stays the fleet's cost, which is the same answer B10 gives for `unpaid`.
- **Rev 9 (C4), a down correction to a sealed week:**
  - **drivers not paid yet:** `carry_forward` → `REOPEN_INSTEAD`; the week is reopened, and `correct_charge_amount` applies it with P16, reducing the allocations in proportion first if needed (B3);
  - **drivers paid:** `carry_forward` → P19.

  Both paths use the same proportional split, so the answer doesn't depend on timing. Tests: `p19_before_settlement`, `p19_after_settlement`.

  Otherwise `seal_week` refuses with **`PENDING_NOT_RESOLVED`** and lists each blocking record (`kind`, `id`, `amountMinor`, `reason`). Rev 8 (G1.1): for a charge, `reason` is **its one state** (`pending` or `unverified`); otherwise `review_pair` or `unallocated_payback`, so the screen can show what stops the seal. `after_seal` facts can't exist before a seal, so they aren't part of this rule.
- **At seal:** a `ledger.week_statements` row (`kind = 'toll_week'`) with the result, `source_hash`, `engine_version`, who and when, and the settlement statuses.
- **After seal:** commands get `WEEK_SEALED`; the trigger refuses rows for that week; the nightly recompute must equal `source_hash`.
- **Reopen:** an approver, a reason, a new version, an audit row, an exclusive lock. Refused once driver settlements are paid. **Rev 7 (G2): "a correction" is `carry_forward`**: the late fact is brought into the open week (B3, B5), and the paid week never changes. A sealed week whose drivers aren't paid yet is reopened instead (`carry_forward` refuses it with `REOPEN_INSTEAD`). Warns when the platform has settled.

## B7. Company isolation

1. Company-facing `toll_read.*` / `toll_write.*` are called with the **user's own token**, passed through by the server (a change from the service key, proven by a Phase 0 test).
2. The company comes from `auth.jwt() -> 'app_metadata' ->> 'organizationId'` only, never `user_metadata`. There is no company parameter, and a token without one fails closed.
3. The service key has no access to those functions or to `toll.*` tables.
4. `toll_system.*` takes an explicit company and only the service key can call it. CI fails if a user request handler calls one.
5. **Staff acting for a company (Rev 5: governed):**
   - Access comes from `toll.staff_company_access`, never from the client.
   - **Granted or revoked only by a platform owner** (not the staff person), each grant and revoke written as an audit row.
   - **Every staff function reads the table on every call**, so a revoke takes effect on the next call, not the next sign-in.
   - Every staff decision records `actor = staff`, the staff id and the acting company.
6. Row security on every `toll` table, keyed on the token's company.
7. **CI:**
   - the two-company suite (Rev 5: one company with `tolls_v2` on and one off);
   - `token_a_cannot_reach_b` (B's ids tried through query, body and joins);
   - no company parameters;
   - `staff_revoke_next_call`.

## B8. The week function and its contract

- **The week:** ADR 0007, Monday–Sunday America/Jamaica, through `periodKeyFor`. A charge's week is the week of `occurred_at`; a payback's is its trip's, or its own date.
- **One function, `toll_read.week_result(week_key)` (Rev 5: I17 made exact):**
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
  pending:    { charges: number; amountMinor: number };   // Rev 8 (G1.3): count and undecided amount of charges whose ONE state (B2) is 'pending', in the counted week. Excludes unverified, awaiting_cash, rejected, duplicate
  unverified: { charges: number; amountMinor: number };   // Rev 8: in the counted week (Rev 9 wording); blocks the seal
  awaitingCash: { charges: number; amountMinor: number }; // Rev 8: in the counted week (Rev 9 wording); Roam cash rides not yet settled; does not block; decided provisionally at seal
  paybacks:   { receivedMinor: number; allocatedMinor: number;
                unallocatedMinor: number;          // Rev 7: pending + part-allocated leftovers NOT yet decided; must be 0 to seal
                leftUnlinkedMinor: number;         // decided "no toll"; final, not part of unallocatedMinor
                takenBackMinor: number };          // reversals landing this week
  carriedIn:  Array<{ kind: 'charge' | 'payback' | 'take_back' | 'correction_up' | 'correction_down' | 'cash_recovered';
                      id: string; fromWeekKey: string; amountMinor: number;
                      bearer?: 'fleet' | 'driver' }>;  // Rev 7 (G2): counted in this week's totals; Rev 8: read straight from toll.carried_facts
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
                      relatedWeekKey: string }>;   // Rev 6: the week it affects; never in the totals
  ledgerMovements: { bankMinor: number };  // for Business Finance to tie (B5 hand-off)
}
```

- A change to the contract is a new version. Consumers name the version they read.
- Week Reconciliation step 3 shows it, and every button is one command. Step 4 reads `tagAccount`. Driver settlement reads `drivers` from the sealed result.

## B9. Platform adapter contract (unchanged from Rev 4)

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
- **Rev 8 (G1.2), Roam cash rides never hold up a seal.** This replaces Rev 6's "pending indefinitely".
  - **`underpay` / `unpaid`:** the toll not covered by the rider's cash is decided **at once**, at cash settlement, as `fleet_absorbs` (system, `actor_job = native_cash_settled`, reason `rider_arrears`).
    - **Checked:** a rider's arrears are a negative balance on the rider's wallet, not tied to a ride (`supabase/functions/rides/admin/riderArrears.ts`, `cashSettlement/arrearsCheck.ts:26`).
    - So paying off arrears later can never be matched to one ride's toll. Waiting for it would hold the charge open forever.
  - **Still `awaiting_cash` at seal:** decided provisionally (B6), and recovered automatically if the cash settles later (P20).
  - The 14-day aging alert still covers any `pending` cash charge.

## B11. Moving over

1. **The switch (Rev 5: the mechanism).**
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

- **Phase 0 (Rev 5, softened):** the metrics, their names and the alert thresholds are **defined**:
  - per intent: count, errors, p99;
  - 409s per code;
  - per company: pending charges, unallocated paybacks, `after_seal` facts, review list, ages;
  - nightly check history.
- **Phase 1:** the dashboards are live, in the place the existing calculator and worker metrics are shown *(to check before Phase 1)*.
- **Phase 3:** live for the first company on `tolls_v2`.
- **Rev 7 (O2):** the payout sweep **heals itself and alerts** (B5 check 7). The heal count per night is a metric, and any heal is an alert.

---

# Part C — Questions and answers

## Rounds 2–4 (answered, kept for the record)

| # | Outcome |
|---|---|
| R2 | Paybacks merged; allocations are the truth; auto-link off by default; old weeks as sealed; cash = verified advance; adapter minimum `date_only`; one week path, ledger primary, no repair routes |
| R3 | Suspense + aging; reopen lock, batch report, `command_id` per company; company from the token; open-week precondition + fallback |
| R4 | Separate cash legs with shortfall / excess; token pass-through, `app_metadata` only, staff lookup, "A can't reach B" test; duplicate rules per plaza; Phase 0 blockers settled from code (A10, A11) |

## Round 5

1. Is `toll:recovered_in_driver_cash` the right way to stop the cash-trip double count?
   - **Reviewer:** Yes, provided the settlement postings are split into two real events (PB3) and the cash-trip payback stays `received_by = driver`.
   - **Claude:** Agreed. P12–P14 are now separate balanced rows, and `received_by` is unchanged.
2. New `bank` and `platform_payout_clearing` accounts, with deposit matching left to Business Finance?
   - **Reviewer:** Yes, the right boundary, if the clearing account has a defined lifecycle and it's stated whether `bank` is Business Finance's bank account.
   - **Claude:** Agreed. **Checked:** Business Finance keeps bank confirmations in the key-value store and posts nothing to the ledger (A12). So `bank` is the ledger-side bank account that Business Finance will use when it moves to the ledger; until then, the week result lists the toll side's bank movements for it to tie. The clearing account holds only the toll part of a confirmed payout (P10 → P11), so it can't build up unexplained.
3. Excess payback remainder: unposted, or posted now?
   - **Reviewer:** Must post now (PB1). Option A: an unlinked-payback suspense account, aged, classified later.
   - **Claude:** Agreed, slightly earlier: every payback posts its full amount when it arrives (P4/P5) into `toll:payback_unallocated`, and only allocations move out of it. The leftover is therefore in suspense from the first moment, aged at 14 days, with nothing classified.
4. Is Rev 4 approved for Phase 0?
   - **Reviewer:** Not yet. Four blockers: PB1 excess posting, PB2 week-move ledger, PB3 two settlement events, PB4 reversal behaviour. "Rev 4 with PB1–PB4 in it is approved for Phase 0."
   - **Claude:** All four are in Rev 5:
     - **PB1:** P4/P5/P6/P9;
     - **PB2:** the B5 "moving a charge" steps, with I23. Note: the old week can't be sealed when a move happens, because the command refuses that; so the reversal never touches a sealed week;
     - **PB3:** P12–P14;
     - **PB4:** the B2 dispositions and the B5 "reversals in the week result" rules, with I23.

     **Asking for Phase 0 approval.**

## Round 6

1. P4/P5: post a payback's full amount when it is recorded, into `toll:payback_unallocated`?
   - **Reviewer:** Agreed, and better than the round-5 suggestion: it correctly uses a liability, and the trial balance is whole from the first moment. Rename "arrives" to "is recorded" so the fact isn't confused with the cash.
   - **Claude:** Done. P4/P5 now say "Payback is recorded" and point to P10/P11 for the money.
2. P10 triggered by Business Finance's existing confirmation records?
   - **Reviewer:** Acceptable, and the right boundary. Name the data source of check 1, and decouple the trigger from its source.
   - **Claude:** Done (B5, the payout trigger and check 1). **Checked; two corrections to the premise (A13):**
     - the record is one "money received in the bank" step, so P10 and P11 post together and the clearing account is 0 each night until Business Finance has two steps;
     - the record can be changed or deleted, so the trigger reverses and re-posts. "A key appearing" alone would have left a deleted confirmation posted.
     - Found in passing: the bank-confirm save and delete build their key from a company id sent by the browser (Part E, for the owner).
3. Phase 0 approval?
   - **Reviewer:** "Phase 0 is approved to begin." EC1 and EC2 are Phase 0 **exit** criteria, along with the eight smaller notes.
   - **Claude:** Thank you. EC1, EC2 and all eight notes are in Rev 6, so the design is ready to be marked **Agreed**. Building still waits for the owner's go.

## Round 9 (last review)

**Reviewer:** "Rev 8 correctly closes G1.1–G1.8, the three premise corrections you made are right, and the architecture remains Agreed … This round is the last review … Ship it." C1 and C2 must be folded in before the middle of Phase 0; C3 and C4 are Phase 2 tests.

| Item | Reviewer | Claude (Rev 9) |
|---|---|---|
| C1 `native_cash_settled` branch | Branch on the week's seal state: open → P5 + P6, sealed → P20 | **Agreed** (B2). **One more case found:** a week sealed with a provisional decision and then reopened. The cash must first reverse the provisional allocation (P15), or P6 breaks I4. Three cases, one test |
| C2 P19 platform share | Keep it undecided, aged, until the platform nets it or a person decides | **Agreed that it stays undecided** (no unlinked decision written; it counts in the open week's `unallocatedMinor`, ages, and blocks that week's seal). **Premise adjusted:** the platform won't net it, because it paid what it charged the rider (round 8). So a person decides it, on the carried row (`leave_payback_unlinked` now accepts a carried-fact version, because the payback itself is in a sealed week) |
| C3 proportional split | Proportional, not in order | **Agreed** (P19). Rounding: each share rounded down; leftover cents to the driver, then the fleet, then the platform |
| C4 before / after settlement | Two tests | **Agreed** (B6). **Gap found:** on the reopen path, a down correction of an already-decided toll was refused (`ALLOCATIONS_EXCEED_AMOUNT`), so the reviewer's path couldn't work. `correct_charge_amount` now reduces the allocations in proportion first, then posts P16 (B3) |
| Wording | "in the counted week" on every count field | Done (B8) |

## Round 8

**Reviewer:** "The architecture is Agreed … Phase 0 can start now." Eight edge gaps to close (G1.1–G1.3 before Phase 0 exits, G1.4 before Phase 1, G1.5–G1.8 before Phase 2) and two to track.

| Item | Reviewer | Claude (Rev 8) |
|---|---|---|
| G1.1 one charge state | The states overlap: an unverified charge also counts as pending | **Agreed.** One closed list of six, in a fixed order (B2): `duplicate`, `rejected`, `unverified`, `awaiting_cash`, `decided`, `pending` |
| G1.2 unsettled Roam cash blocks the seal | Pick a timeout default, a separate state, or a hard block | **Option A within option B.** A separate `awaiting_cash` state that doesn't block. At seal it is decided as the fleet's, provisionally, and recovered automatically by P20 if the cash comes. **Premise adjusted:** Rev 7 didn't block forever, because a person could decide; but it needed a person every time. **Checked:** a rider's arrears are on the rider's wallet, not tied to a ride, so underpay and unpaid are decided at once (B10) |
| G1.3 `pending.charges` definition | Write it into the contract | B8: the `pending` state only; `unverified` and `awaitingCash` get their own fields |
| G1.4 P3 timing | P3 fires at verification | **Agreed** (B3, P3). **Premise corrected:** a Roam cash ride's settlement doesn't post P3. It posts the rider's payback (P5 + P6). P3 is the driver paying the plaza in cash |
| G1.5 P19 after the driver is paid | Credit `payable_driver` for the settled part | **Agreed, and simpler:** `carry_forward` only runs on paid weeks, so the driver's share always goes to `payable_driver`. **Same problem found on the debit side:** a down correction of a *cash* toll debited `payable_driver`, which is also already settled. It now debits `receivable_driver` (the driver was already paid the full amount) |
| G1.6 P19 platform share | The fleet owes the platform D | **Gap agreed, premise corrected:** the platform pays back what it charged the rider, so a tag refund creates no debt to the platform. The platform-covered share becomes a leftover in `payback_unallocated` (PB1), and comes last after the driver's and the fleet's shares |
| G1.7 P18 partial payback | Clear the leftover too | **Agreed:** P18 has two steps, and the leftover is taken first. The note that the fleet "absorbs the full amount" is corrected: it absorbs only the part that had covered tolls. A partial take-back in an open week (P17) uses the same order |
| G1.8 P18 / P19 legs have no record | `toll.carried_facts` | **Agreed:** the table is added, it replaces Rev 7's `carried_to_week` column, and it is the only source of `carriedIn` |
| G1.9 cash-trip take-back | Track it | Part E, before Phase 2 |
| G1.10 Business Finance bug | Give it a severity and a target | Part E: High; fixed before Phase 0 exits; its own fix |

## Round 7

| Item | Reviewer | Claude (Rev 7) |
|---|---|---|
| **G1** seal requirements missing | A real hole: a week can seal with pending charges, drivers get paid, and the week is then stuck. Add the rule, `PENDING_NOT_RESOLVED` and I25 | **Agreed; checked:** B6 had no seal rule. Added (B6, I25) with **two more conditions found while checking**: no `unverified` cash receipt, and no open duplicate pair. **Also found:** no command existed to verify or reject a cash receipt, so an unverified receipt could never leave that state. Added `verify_cash_receipt` / `reject_cash_receipt`. Field note: in B8 `unallocatedMinor` already excludes left-unlinked money, so the condition is `unallocatedMinor = 0` (the reviewer's "unallocated = leftUnlinked" assumed the other meaning). Both meanings are now written into the contract |
| **G2** "a correction" undefined | Option A: `absorb_taken_back` in a later week, as a fleet loss or a driver charge | **Option A, made general:** one intent, `carry_forward`. **Checked:** late *charges* and *corrections* for a sealed, paid week had the same stuck path as take-backs, so one intent covers every kind of late fact (B5 table). Take-back = P18; down correction = P19; the rest use the normal postings in the open week. "Recovered from platform" isn't a bearer: a repaid amount is a new payback |
| O1 receivable in credit | 30-day page | B5 check 6 |
| O2 sweep: alert or heal | Either, but say which | **Self-heal + alert** (B5 check 7, B12). Never heals a key / company mismatch |
| O3 clearing always zero | Note it | Part E, and already in the account table |

## Round 6 items

| Item | Rev 6 |
|---|---|
| **EC1** check 3 breaks across weeks | **Agreed; the reviewer's trace is right.** Check 3 now counts each ledger leg in the week of the charge or payback it belongs to: P17's payback legs go to the reversing payback's week. Spelled out per account against `week_result` (B5 check 3). Test `week_flow_matches_disposition` |
| **EC2** Roam cash P5/P6 order | **The second option:** a cash ride writes only the charge at ride end. The payback and allocation are written and posted together (P5 + P6) when the ride's cash is settled (A13, B2). Underpay and unpaid rules are stated. Test `roam_cash_payback_waits_for_settlement`. Never settled → pending in suspense, aged (B10) |
| N1 `bank` = toll-side view | B5 bank hand-off: two records of the same money, joined by the hand-off |
| N2 `after_seal` reversals | Page at 7 days (B5 check 6, I20) |
| N3 check 5 rows | `kind`, `id`, `amountMinor`, `arrivedAt`, `relatedWeekKey`; ties count and sum (B5 check 5, B8 contract) |
| N4 I18 wording | "Every active charge and active payback; a reversed payback is terminal" |
| N5 `undo_decision` versions | `decision_id` + a version per distinct charge and payback; the server works out the touched records (B3) |
| N6 amount correction posting | P16, up and down, tag and cash (B5) |
| N7 reversing an unlinked leftover | P17. **Partly corrected:** nothing posts to undo P9, because it never posted; the full-amount reverse of P4/P5 takes the leftover out. The credit goes to `receivable_platform`, **never `bank`**, because platforms net take-backs from a later payout (B5) |
| N8 plaza rule owner | A platform owner, through a `toll_system` function with an audit row (B2) |

## Round 5 significant items

| Item | Rev 5 |
|---|---|
| S1 Flip mechanism | B11 step 1: server routes per request + old writes refuse when on; `tolls_v2_flip_no_gap` |
| S2 Staff governance | B7 item 5: granted / revoked by a platform owner, audited, read every call; `staff_revoke_next_call` |
| S3 Cash-desk seal | **Checked: it can pay today without the seal** (A12). Phase 0 builds the refusal (B6, I24) |
| S4 Week result contract | B8 `TollWeekResultV1` |
| S5 Which system job | `toll.decisions.actor_job` |
| S6 `after_seal` control line | B5 nightly check 5 |
| S7 Which week is sealed | 409 carries `sealed_weeks` |

**Smaller fixes, all taken:**
- `response` capped at 64 KB, with `truncated`;
- `week_delta` per week;
- required versions per intent;
- `pending` flag on import corrections to a sealed week;
- `is_legacy` excluded on both sides of the nightly checks;
- I17 = one function returning sealed or live;
- `undo_decision` vs `reverse_payback` contrasted;
- the flip tested in the two-company suite;
- dashboards softened (defined in Phase 0, live in Phase 1);
- `actor_job`;
- `after_seal` listed beside the week answer.

---

# Part D — Build phases (Rev 9 exits)

| Phase | What | Done when (all by CI tests) |
|---|---|---|
| 0 Foundations | Schemas (`toll`, `toll_read`, `toll_write`, `toll_system`); token pass-through; staff access table; `org:<co>:toll:*` accounts + `bank`; `toll_system.post` with reference, writer and sealed-week triggers; command framework; **the settlement pay / collect refusal before toll seal**; recalculation scheduling; nightly checks 1–6; metric and alert definitions; Rev 6: `toll_system.payout_received` and the plaza-rule function | I1–I9, I16, I22, I24 green; token pass-through test; postings **P1–P17** each covered by a test; the week rule wired to `periodKeyFor`. **Rev 6 (reviewer's exit criteria):** EC1 `week_flow_matches_disposition`; EC2 `roam_cash_payback_waits_for_settlement`; `after_seal_reversal_pages_at_7_days`; check 5 ties count and sum with the named row shape. **Rev 7:** I25 `seal_refuses_pending` on all four conditions, with `PENDING_NOT_RESOLVED` listing the blocking records (kind, id); `carry_forward` designed and P18 / P19 covered by posting tests; check 7 (sweep heals and alerts). **Rev 8:** one closed charge state (G1.1), with `PENDING_NOT_RESOLVED` using it; `awaiting_cash` doesn't block and gets its provisional seal decision (G1.2, `seal_provisional_awaiting_cash`); the `pending.charges` definition (G1.3); `toll.carried_facts` in the reference trigger; Business Finance key bug fixed (G1.10, its own fix). **Rev 9 (before the middle of Phase 0):** C1's three-way branch and C2's undecided leftover written into the command framework's specs |
| 1 Roam slice | `native_ride_charge` (card and cash) and `native_cash_settled`; week function; seal; settlement reads the sealed result; dashboards live | I10, I14, I17, I19 green; shortfall and **excess** (leftover in `payback_unallocated`, aged) tested; recompute = `source_hash`. **Rev 6:** P16 tested up and down; P5/P6 order proven for Roam card and cash; a Roam cash ride that is never settled sits in suspense, is aged, and posts no allocation; underpay posts only what the cash covered. **Rev 7:** `seal_blocks_until_decided`; a sealed week refuses commands (`WEEK_SEALED`); reopen after driver payment refused and `carry_forward` used instead; `carry_forward` on an unpaid sealed week → `REOPEN_INSTEAD`. **Rev 8:** P3 fires at verification, for a manual verify, a proven import and a Roam cash-paid crossing (G1.4); a Roam card ride and a Roam cash ride each post P5 / P6 at the right moment; underpay and unpaid are decided at once; P20 after a provisional seal (`p20_cash_after_seal`). **Rev 9:** `native_cash_settled_branches_on_seal` (open, reopened after a provisional seal, sealed) |
| 2 Adapters | Tag statement, top-ups, driver cash (receipt, outbox), Uber, InDrive; matcher; batch imports | I11–I13, I15, I18, I20, I23 green; end to end: a corrected tag statement (up and down), a Roam-cash + driver-cash duplicate, **an Uber reversal in the same week and across weeks** (`reversal_in_and_across_weeks`), **a mis-dated crossing moved between weeks** (`correct_week_ledger_moves`). **Rev 6:** P17 on a payback with an unlinked leftover; check 3 passes for a week with a cross-week reversal; a changed and a deleted bank record reverse P10/P11. **Rev 7 (I26):** `taken_back_after_settlement`: an Uber take-back against a sealed and paid week lands in the open week as P18 (fleet and driver cases), with the right accounts, `carriedIn` and `takenBackMinor`, and the paid week's `source_hash` unchanged; `carry_forward_each_kind` for a late charge, late payback, up and down correction; verify / reject a cash receipt. **Rev 8:** `p19_settled_driver`, `p19_platform_share` (a charge partly `driver_pays`, partly linked), `p19_cash_charge`, `p18_partial_payback`, `p17_partial_takeback`, `check3_carried_facts`; G1.9 answered. **Rev 9:** `p19_platform_share_ages`, `p19_proportional_split` (40/40/20, D = 10 → 4/4/2, plus a rounding case), `p19_before_settlement`, `p19_after_settlement`, `correct_down_below_allocations` |
| 3 Commands + screens | Every intent; seal / reopen; `TollWeekResultV1` published; Week Reconciliation steps 3–4 and the toll pages call commands only | No browser-run sequences; `actor_job` on every system decision; per-week deltas; dashboards live for the first company |
| 4 Side by side | Old weeks from `week_statements`; legacy copy; unassigned list; open-week precondition or fallback; 14-night comparison | `tolls_v2_flip_no_gap`; the two-company suite with one company on and one off, **with `week_flow_matches_disposition` on both** (Rev 6); 14 clean nights → on for that company |
| 5 Retire | Old routes, key-value toll records, repair routes, old switches removed | I21; 30 days unused; restore drill: sealed weeks recompute to their `source_hash` |

---

# Part E — Still open

**Facts to confirm (Claude; none block Phase 0):**
1. How InDrive handles tolls.
2. Whether every `trip:` record carries a company.
3. Why the fleet-claims route list includes the toll routes.
4. Whether `POST /claims` has a sign-in check (`claims_controller.tsx:34`).
5. Which screens outside Fleet write toll data.
6. Whether the driver app requires a receipt for a cash toll today.
7. Whether every Uber / InDrive export says cash or card per trip.
8. That Uber's passenger cash includes the rider's toll on a cash trip (before Phase 1 ends).
9. Where the existing calculator and worker metrics are shown (before Phase 1).
10. (Rev 6) Whether the `weekStartYmd` on a bank record is the week the trips happened or the week the money landed. P10 needs the trips' week (before Phase 2).
11. (Rev 6) Whether any platform ever takes back a cash-trip toll (P17, before Phase 2).

**Tracked (Rev 7, not blocking):**
- **O3:** `toll:platform_payout_clearing` is always 0 today, because P10 and P11 fire together from Business Finance's one-step record (A13). It isn't load-bearing yet. It starts to matter when Business Finance records "payout confirmed" and "deposit received" as two steps. Owner: the toll build; review when Business Finance moves to the ledger.
- **G1.9 (Rev 8):** whether any platform ever takes back a **cash-trip** toll. Owner: the toll build; answer before Phase 2 exits. If none does, the cash-trip credit (`toll:recovered_in_driver_cash`) is removed from P17 and P18. If one does, the design must state how a take-back works when the driver has already handed over that cash (P12).
- **Roam plaza payment method (Rev 8, G1.4):** how the ride app knows a plaza was paid in cash rather than by tag. Before Phase 1 exits.

*Resolved in Rev 5:* the cash desk can pay before the toll seal (A12; the refusal is built in Phase 0); Business Finance's bank records are not in the ledger (A12).
*Resolved in Rev 6:* the bank record is one step that can change or be deleted (A13); Roam cash rides settle in steps with four outcomes (A13).

**For the owner (outside the toll section, its own item):** the Business Finance bank-confirm save and delete build their record key from a company id sent by the browser (`register_fleet_bank_routes.ts:35`, `:120`). A user of one company with edit rights could overwrite or delete another company's bank confirmation (A13). The toll trigger is protected against it (B5), but the route itself needs its own fix.
- **Rev 8 (G1.10): severity High.** It is a cross-company write and delete on financial records, needing only the `transactions.edit` permission.
- **Target:** fixed before Phase 0 exits, because Phase 0's payout trigger reads these records.
- **Owner:** a separate Business Finance fix with its own audit, not part of this toll file.

**For the reviewer:** nothing open. Round 9 was the last review round; Rev 9 folds in C1–C4.

---

# Part F — Build tracker (started 2026-11-12)

The build follows `docs/how-we-build-playbook.md`: Data → Server → Tests, one round at a time.
- **Cursor** does the easy bulk: tables, grants, plumbing, CI lists, tests written from Claude's lists.
- **Claude** writes each prompt and the money-critical SQL: postings, triggers, the command core, the seal rule and the nightly checks. Claude also checks every round.
- **The owner** runs live SQL and flips switches.

The full plan is the approved build plan for this session. Its round list is below.

## F1. Build facts found (checked 12 Nov)

- **A `toll` schema already exists.** It holds `toll.brain_policies`, `toll.settlement_allocations` and `toll.mirror_settlement_from_public` (baseline `20260320000000_baseline_prod_schema.sql`). New objects are added beside them, with no name clashes.
- **`ledger.post_entry`:**
  - toll uses `product = 'roam_fleet'`, because the product check has no toll value;
  - the key is `toll:<co>:<command_id>:<line>`, because the key is unique across companies;
  - `org:<uuid>:*` accounts are created on first use.
- **`ledger.entries` has 3 AFTER triggers** that keep week totals by `ledger.jamaica_week_start(effective_at)`. That function is the SQL twin of `periodKeyFor`, and a drift test keeps the two equal.
- **`ledger.week_statements.driver_id` is `NOT NULL`,** and `kind` allows fuel / toll / earnings / courier_earnings / settlement (baseline :23583, :23596). The org-level `toll_week` row (B6) uses `driver_id = '*'`, so the unique key still works, and `kind` is widened to include `toll_week`. *R0 confirms prod matches the baseline.*
- **Company from the sign-in:** `public.jwt_org_id()` also reads `user_metadata`, which B7 forbids. A new `toll_read.current_company()` reads `app_metadata` only and fails closed.
- **No `command_id` pattern exists today.** The append-only trigger is copied from Week Recon's `recon.run_events`.
- **I24 narrowed (from the code; B6 said "pay or collect"):**
  - the refusal goes on **pay, write-off and batch runs**;
  - **collect** (cash coming in) is deliberately never gated today (`settlement_commands_controller.tsx:355`, `settlement_period_freeze.ts:103`), and refusing money coming in would be wrong;
  - the refusal ships behind a per-company switch, `toll_seal_before_pay`, which starts off.
- **Switches:** `tolls_v2` lives in `toll.switch_state` (B11). `toll_seal_before_pay` is a KV feature flag, as `recon_v2` is (`_fleet-server/feature_flags.ts`).
- **Old-system companies** keep today's seal check, `probeTollPeriodSealed` (`toll_period_writable.ts:97`).

## F2. Phase 0 rounds

| Round | What | Who | Status |
|---|---|---|---|
| — | Commit the 12 Nov Week Reconciliation fixes (owner's call) | Owner | Open |
| R0 | Look at live data: `supabase/tests/toll_v2_r0_live_look.sql`, read-only | Owner runs, Claude reads | **Done 12 Nov.** No clashes. `toll` holds only `brain_policies` + `settlement_allocations` (280 rows) + 1 function; no `org:%:toll%` or `org:%:bank%` accounts; `week_statements.driver_id` is NOT NULL and the kind check matches the baseline (so `driver_id = '*'` is used for `toll_week`); nightly jobs are pg_cron SQL calls (the toll nightly check will be one cron line); one company has toll weeks (3; latest sealed 2026-09-14, latest 2026-10-12) |
| R1 | Data: schemas, tables, row security, grants, `toll_week` statement kind; schema checks test. Prompt: `docs/toll-build/cursor-R1-data-layer.md`. **Two tables added while specifying** (needed by B6's seal rule and B2's audit rows): `toll.duplicate_reviews` (open / confirmed / released pairs) and `toll.audit_log`. `toll.plaza_rules` has no company (national data, set by a platform owner). `awaiting_cash` is stored on the charge (set at ride end, cleared at cash settlement) | Cursor | **Built 12 Nov** (`20261112183806_toll_v2_foundations.sql`). Claude checked: the migration matches the spec, and the schema test passes locally and checks what it claims. **R1b fix sent** (`docs/toll-build/cursor-R1b-company-links.md`): links between toll tables didn't carry the company, so the database would accept a cross-company link; every link becomes `(organization_id, id)`, plus `paybacks.updated_at` NOT NULL. **Before going live (R7):** confirm no existing `week_statements` row has `driver_id = '*'`, or the new check fails on prod |
| R2 | Money core: `toll.posting_rules` P1–P20, `toll_system.post`, ledger triggers I2 / I3 / writer; posting tests | Claude builds, Cursor tests | **Core built by Claude 12 Nov** (`20261112184544_toll_v2_money_core.sql`): 30 posting rules (P9 has no posting; P15 / P17 = `reverse`). `ensure_accounts` sets account types itself, because the ledger makes every `org:` account an "asset". I2 and I3 are checked inside `toll_system.post`. A guard trigger on `ledger.entries` (owner rights, because it fires on every ledger insert) refuses toll-account rows from any other writer and refuses deletes. Claude's local smoke test passes (replay, conflict, balances, references, cross-company, writer-only, permanent, sealed week, other ledger writes unaffected), and the R1 test still passes. Found: ledger accounts need a real company row (FK to `organizations`), so tests create made-up companies. **Cursor test prompt:** `docs/toll-build/cursor-R2-posting-tests.md` |
| R3 | Command framework (B3 order, replay, versions), `seal_week` / `reopen_week` (G1), `carry_forward` stub; fleet-toll v2 route with the user's token | Claude core, Cursor plumbing | **R2 closed 12 Nov** (Cursor's 14-check posting test passes on Claude's run; the money file is unchanged). **R3 core built by Claude** (`20261112185355_toll_v2_command_core.sql`): `public.toll_v2_command` runs as the user; company from the token only; the command row is the replay lock (its answer is stored once; refusals roll back and store nothing); `seal_week` with the G1 rule and the provisional decision for `awaiting_cash`; `reopen_week` refused once drivers are paid; `carry_forward` refusals only; `public.toll_v2_enabled`. **Found while building:** Fleet permissions live in code (`packages/auth-client/src/permissions.ts`; `toll.manage` = platform owner, fleet owner, fleet manager), and the database permission tables are not used for them. So `toll_system.user_can_manage_tolls` mirrors the part that grants it: company owner, or an active seat as fleet owner / manager. Without this, any signed-in user of a company (a driver too) could call the command directly. Platform staff come later, via the staff table. R6 adds a drift test on the catalog. Claude's local test passes (owner, blockers, provisional, replay, versions, reopen, company param, non-manager refused), and the R1 / R2 tests still pass. **Cursor prompt:** `docs/toll-build/cursor-R3-commands.md` |
| R4 | I24: `TOLL_WEEK_NOT_SEALED` on pay / write-off / runs behind `toll_seal_before_pay` | Cursor | **R3 closed 12 Nov:** Cursor's command test (31 checks) and error-mapper test (18) pass on Claude's run. The fleet-toll route uses the user's own token, checks the switch first and passes the body through. Its sign-in middleware matches the other three toll apps. **Prompt:** `docs/toll-build/cursor-R4-pay-before-seal.md`. v2 companies use the latest `toll_week` statement; others use `probeTollPeriodSealed`; failures count as not sealed |
| R5 | Nightly checks 1–7, `payout_received`, plaza-rule function, schedule, metric definitions | Claude SQL, Cursor wiring | **R4 closed 12 Nov:** the switch is off by default; it refuses when unsure; pay, write-off and batch pay go through one gate, plus settle-from-balance on both weeks; collect is never gated; 28 tests pass on Claude's run. Payout-backfill and legacy-weeks are left alone (they record history; repair routes are retired in Phase 5). Edge: a manager whose token has no company claim gets the old-system check (harmless while v2 is off). **R5 built by Claude** (`20261112191942_toll_v2_nightly_and_payouts.sql`): `toll.alerts` (shape of `recon.alerts`), `toll.nightly_results`, `toll.payout_postings`; `nightly_checks` 1–5 and 7; aging alerts (check 6: 14 days, 7 for unverified receipts, a **page** for an after-seal take-back at 7 days, receivable-in-credit `watch` → `page` at 30 days); `week_summary` / `week_hash` (seal now freezes these, and check 4 recomputes them); `nightly_run` on pg_cron (`toll-v2-nightly`, 04:25 UTC). **Changed from the plan:** the payout trigger is a database trigger on the key-value table itself, not a call added to Business Finance's handlers. So Business Finance's code is untouched, and a toll failure can never break their save (it alerts instead). **Found while building:** (1) events that happen after a seal by design (payout P10 / P11, settlement P12–P14) are dated when they happen, or I3 would refuse them; (2) a take-back's rows carry both the original and the reversing payback id, so check 3 counts them in the reversing week; (3) Claude's smoke test caught a real bug: alerts were resolved in the same run they were raised (fixed with clock time). Claude's smoke test passes, and the R1–R3 tests still pass. Staff revocation (`staff_revoke_next_call`) moves to the phase that builds staff access. **Cursor prompt:** `docs/toll-build/cursor-R5-nightly-tests.md` |
| R6 | `TollWeekResultV1` in `packages/toll-core/src/v2/`, week-rule drift test, 2 CI rules, `pnpm test:toll` runner | Cursor | **R5 closed 12 Nov:** Cursor's nightly test (12 sections, 38 checks, including the 4 week-flow cases with real numbers) passes on Claude's run, along with the other three toll tests. **Prompt:** `docs/toll-build/cursor-R6-contract-ci-runner.md`. Contract types; week-rule drift (one JSON case list checked by both vitest and SQL); `toll.manage` role drift; database contract guards (no company parameter, no service key on user functions, `toll_system` closed, `search_path` set); edge guard (no `toll_system` / `toll` schema from edge code); two-session concurrency test (I7); `pnpm test:toll` |
| R7 | Local proof → `/code-review` → push (owner) → live migrations (switches off) → switch on `toll_seal_before_pay` + screenshots; G1.10 Business Finance key fix (own doc); close out | All | **R6 closed 12 Nov:** Claude ran `pnpm test:toll --keep-db`, and all pass: 6 SQL files, two-session race test, toll-core vitest (93), Deno (30). The edge guard and the week-rule `--check` pass. The race test uses a fixed company and relies on the runner's reset (a re-run without reset passes but doesn't race the second case). **All Phase 0 building is done locally; nothing is committed or live.** **`/code-review` (12 Nov) toll findings, fixed by Claude:** #6 the settle-from-balance *resume* path (finishing an offset whose first half is written) no longer re-checks the toll seal, which could have left a driver's balance one-sided; the fresh path still checks. #7 one retry on the v2 switch lookup before failing closed. Settlement Deno tests pass (41); fleet-pay rebuilt. The review's other 8 findings are in non-toll uncommitted work (team staff, Week Recon, maintenance); they go to their own audits. **Committed + pushed 12 Nov (owner said "do everything"):** `c13b125d` (47 toll-only files, split from the other uncommitted work: the bundles were rebuilt in a throwaway copy, so they leave out the Week Recon guard with finding #3) + `aefb68d9` (public functions revoked from anon + authenticated before the explicit grant, the repo's guard pattern). Pushed to `parts-auto-match`; all 6 pre-push checks pass. A branch push doesn't deploy. **LIVE DATABASE 12 Nov:** the pre-check was all clear. The owner ran `docs/toll-build/toll_v2_phase0_LIVE_apply.sql` (the 4 migrations in one transaction + logbook lines; Claude first proved it on a toll-free local copy, where all toll tests passed against the result). The live verify (`toll_v2_phase0_LIVE_verify.sql`) shows 21 tables, 30 rules, 3 schemas, 4 logbook rows, nightly job `25 4 * * *` active, the ledger guard and both bank-confirm triggers enabled, 0 switches on, 0 toll rows, and an ordinary ledger write still works (rolled back). **Server code** (fleet-toll v2 route, fleet-pay gate) goes live with the owner's normal deploy; until then the pay switch can't be tried. **Pre-deploy 12 Nov:** the live check found 11 Week Recon migrations from 11 Nov missing on the live database (the 2 maintenance-discount ones were live). The owner ran `docs/toll-build/week_recon_11nov_LIVE_apply.sql` (proven on a local copy without them): alerts table present, 13 logbook rows for 11 Nov. All 18 migrations the branch needs are now live; what remains is the deploy to main (owner). **G1.10:** its own doc, `docs/fleet-bank-org-settings-company-fix.md` (F1–F5: bank confirmation save / delete, the legacy no-company write, and organization settings read / save, which had **no permission check at all**). Cursor prompt: `docs/toll-build/cursor-G1.10-bank-org-company-fix.md`. **Next:** (1) ~~owner types `/code-review`~~ done; (2) owner commits and pushes when they choose; (3) live migrations, with a pre-check that no `week_statements` row has `driver_id = '*'`; (4) switch on `toll_seal_before_pay` + try it; (5) G1.10 |

## F2b. Metric and alert definitions (B12, Phase 0 = defined; live in Phase 1)

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

## F3. Phase 0 done-tests (written before building)

1. With company A's sign-in, nothing of company B's tolls can be read or changed.
2. Pressing the same button twice changes the money once, and both answers are the same.
3. Two people deciding the same toll: the second is told it changed, and nothing is written.
4. Money can't be posted into a sealed toll week.
5. A week with an undecided toll, an unchecked cash receipt or an open duplicate pair can't be sealed, and the message lists each one.
6. With the switch on, the cash desk can't pay a driver for a week whose tolls aren't sealed, but can still take cash in.
7. Every posting P1–P20 balances and lands in the right accounts. On a clean test week every nightly check passes. Each planted mistake is caught by the right check.
8. A toll moved between weeks, and a payback taken back in a later week, both still tie in both weeks.
9. A bank confirmation saved posts the toll payout; changing it re-posts; deleting it reverses. A record whose key names another company is refused and alerts.

## F4. Phases 1–5

Each phase gets its own round list here when it starts. Before Phase 3, Claude writes the Stitch prompt and the owner makes the screens.

Week Reconciliation:
- WRA-41 (Fuel, test 6) and the 9t re-run don't wait on tolls.
- Tests 5 and 13 close at Phase 4.

---

## Reviewer notes

- **Round 2 (Rev 1):** right direction; a sketch. Six gaps + B3 inconsistency.
- **Round 3 (Rev 2):** a step change; two blocking + four significant gaps.
- **Round 4 (Rev 3):** architecturally complete; three Phase 0 blockers + S1–S6.
- **Round 5 (Rev 4):** best so far; four accounting blockers (PB1–PB4) + S1–S7. "Rev 4 with PB1–PB4 in it is approved for Phase 0." "This round's changes are the last ones that are about the money model. Everything after this should be about the build and the operations."
- **Claude:** Round 5 accepted. PB1–PB4, S1–S7 and every smaller fix are in Rev 5. Two facts found while checking (A12): the cash desk can pay before the toll seal (now refused, I24), and Business Finance's bank records aren't in the ledger (the `bank` hand-off). One reviewer premise corrected: a week move never reverses a sealed week, because the command refuses that case.
- **Round 6 (Rev 5):** "Phase 0 is approved to begin." Two Phase 0 exit criteria (EC1 check 3 across weeks, EC2 Roam cash P5/P6 order) + eight small notes. "Every remaining change should come from a failing CI test, not from a new review round."
- **Claude:** All taken in Rev 6. Checked against the code (A13): the bank record is one step that can change or be deleted (so P10 and P11 fire together and reverse with it), and Roam cash rides settle with four outcomes. Note 7 partly corrected: a take-back never credits `bank`, and P9 has nothing to reverse.
- **Round 7 (Rev 6):** "very close to Agreed". G1 (seal requirements) and G2 (correction after driver payment) must close; O1–O3 are tracked. "If Rev 7 lands with G1 and G2 in it, consider the architecture approved and start Phase 0."
- **Claude:** Both closed in Rev 7. While checking G1 and G2, found and closed two more holes: no command to verify or reject a cash receipt, and late charges or corrections for a paid week had no path either (one `carry_forward` covers every kind).
- **Round 8 (Rev 7):** "The architecture is Agreed … You have my approval to begin Phase 0 today." Eight edge gaps (G1.1–G1.8) and two tracked items (G1.9, G1.10).
- **Claude:** All closed or tracked in Rev 8. Three premises adjusted after checking (G1.2 arrears on the rider's wallet, G1.4 Roam ride settlement is P5 + P6 not P3, G1.6 the platform is never owed a tag refund). One more gap found: a cash-toll down correction debited an already-settled account.

---

## Rounds

| Round | Date | What changed |
|---|---|---|
| 1 | 2026-11-12 | First draft: today mapped (A1–A8), design proposed, 7 questions. |
| 2 | 2026-11-12 | Allocations, commands, double-entry on `ledger.entries`, snapshots on `week_statements`, company-required functions, adapter contract, old weeks as sealed. |
| 3 | 2026-11-12 | Card → fleet / cash → driver; company from the user's token; corrections; charge precision; record-version locks; stored inputs; duplicates; driver outbox; migration precondition. |
| 4 | 2026-11-12 | A10 / A11; invariants on top; every account named; cash-trip double count fixed; seal before settlement; reversals; week moves; observability; restore drill. |
| 5 | 2026-11-12 | Reviewer: four accounting blockers (PB1–PB4) + S1–S7. **Rev 5:** A12 (settlement payments don't check the toll seal; bank records not in the ledger; checked). B0 adds I22–I24. B5 final: paybacks post in full at arrival into `toll:payback_unallocated` (excess handled, PB1); week moves reverse and re-post with both weeks open (PB2); settlement as separate balanced events P12–P14 (PB3); reversal rules in and across weeks (PB4); every account paired with the nightly balance it must equal; `after_seal` control line; bank hand-off and payout clearing lifecycle. B2 reversed disposition, `actor_job`, staff and switch tables. B3 required versions per intent, per-week deltas, `sealed_weeks`, 64 KB answers. B6 refusal of pay / collect before toll seal. B7 staff governance. B8 `TollWeekResultV1` contract, one function sealed-or-live. B11 flip mechanism. B12 softened. Asking for Phase 0 approval. |
| 6 | 2026-11-12 | Reviewer: **Phase 0 approved to begin**; EC1 + EC2 are exit criteria; 8 small notes. **Rev 6:** A13 (bank record = one step, changeable and deletable; Roam cash settlement outcomes; bank-confirm key takes its company from the browser; checked). B5: check 3 counts each leg in its record's week (EC1, `week_flow_matches_disposition`); P16 amount corrections; P17 payback take-back (never to `bank`); decoupled payout trigger `toll_system.payout_received`, P10+P11 together; `bank` = toll-side view; check 1 data sources; check 5 row shape; `after_seal` reversals page at 7 days. B2: Roam cash payback and allocation written together at cash settlement (EC2); plaza rules owner-only with audit. B3 `undo_decision` versions. B8 `relatedWeekKey`. B10 never-settled cash. I18 / I20 / I22 wording. Phase exits updated. Asking the reviewer to mark the design Agreed. |
| 7 | 2026-11-12 | Reviewer: very close to Agreed; G1 + G2 must close; O1–O3 tracked. **Rev 7:** B6 seal requirements (all decided, no unverified cash, no open duplicate pair, no unallocated payback) → `PENDING_NOT_RESOLVED`, I25. `verify_cash_receipt` / `reject_cash_receipt` (gap found while checking). Charge states `unverified` / `rejected` / `duplicate`. G2 as one `carry_forward` intent for every late fact against a sealed and paid week, I26, P18 (take-back absorbed by fleet or driver), P19 (down correction); `carried_to_week`, `adjusts_charge_id`, `carriedIn`; check 3 counts carried facts in their carried-to week. B8 `unallocatedMinor` / `leftUnlinkedMinor` defined. O1 30-day credit page; O2 sweep self-heals + alerts (check 7); O3 in Part E. Phase exits updated. Asking the reviewer to mark Agreed. |
| 8 | 2026-11-12 | Reviewer: **Agreed in architecture; Phase 0 cleared to start**; G1.1–G1.8 edge gaps, G1.9–G1.10 tracked. **Rev 8:** one closed charge state with `awaiting_cash`; Roam cash rides never block a seal (provisional fleet decision at seal + P20 recovery; underpay / unpaid decided at once, because arrears are on the rider's wallet: checked); `pending.charges` defined, plus `unverified` / `awaitingCash` fields; P3 at verification; `toll.carried_facts` replaces `carried_to_week`; P17 partial order; P18 two steps; P19 rewritten (debit by who is refunded, credit driver → fleet → platform leftover; no debt to the platform); P20; Business Finance key bug rated High, target before Phase 0 exits. Phase exits updated. |
| 9 | 2026-11-12 | Reviewer: Rev 8 confirmed, still Agreed; **last review**; C1–C4 + a wording fix. **Rev 9:** `native_cash_settled` branches three ways (open / reopened after a provisional seal / sealed → P20); P19 platform share stays undecided, aged and seal-blocking, decided on the carried row; P19 split in proportion with a rounding rule; down corrections below allocations reduce the allocations in proportion and then post P16 (the reopen path was refused before); count fields say "in the counted week". |
