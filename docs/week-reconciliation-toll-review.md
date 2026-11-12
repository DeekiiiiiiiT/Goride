# Week Reconciliation — Toll Review (with reviewer)

**Round 2 · 2026-11-12 · Status: WRA-42 and WRA-44 revised after the reviewer's answers. Waiting for the reviewer to confirm or mark Agreed.**

Two toll problems found by the browser done-tests on a private copy of the database. Each has a proposed fix. We'd like your view on the design before it's built, mainly where money is involved.

**How we go back and forth:** write your answers under each **Reviewer** line. We reply under **Claude**, change the proposed fix if needed, and add a new round at the bottom. Nothing is built until both findings say **Agreed**.

You have no app access, so every fact gives the file it comes from. Every reviewer claim is checked against the code before it changes a fix. Where we checked something for you, the answer says "checked".

The main audit is `docs/week-reconciliation-architecture-audit.md` (WRA-42, WRA-44 in Step 2).

---

## Background

Week Reconciliation closes one Monday–Sunday week in eight steps. Step 3 (Tolls) decides who pays each toll. **Seal tolls** unlocks only when every section has nothing left "to decide" and the toll sum ties: spend − reimbursed − charged − net loss = 0.

Tolls, trips, dispute refunds and claims are kept in a shared key-value store (`kv_store_37f42386`). Some of them are also written to SQL tables.

---

## WRA-42 · Critical · A dispute refund with no matching toll can never be cleared

**Status:** Revised in round 2. Waiting for the reviewer.

### What happens

- Uber files carry "Support Adjustment" lines. They are imported as dispute refunds (`DisputeRefund` in `packages/types/src/data.ts`; status `unmatched | matched | auto_resolved`).
- Any refund that is not matched counts as 1 "to decide" (`incrementDisputeRefundCount`, `packages/toll-core/src/tollPeriodCounts.ts`; "matched" means `matched` or `auto_resolved`, `tollPeriodDisputeHelpers.ts`).
- The only action on the screen is **Match**, which links the refund to an underpaid toll or an open claim (`DisputeRefundsList.tsx`, `DisputeMatchModal.tsx`). With no toll to link it to, the count never drops, so Seal tolls stays off for good.
- It also holds the driver's own week: an unmatched refund adds to `disputeRefundUnmatched` and to `tollWorkflowActionable` (`supabase/functions/_fleet-server/driver_financial_periods.ts`, around line 1004).
- Seen with the real sample Uber files for one driver's week: 2 dispute refunds, no toll in the system to link them to.
- The approved plan gave this section two buttons, **Match** and **Leave unlinked**. Leave unlinked was never built.
- **Found in round 2 (checked):**
  - Opening a week auto-matches every refund with `status === "unmatched"` and a driver (`dispute_refund_controller.tsx:1044`, when refund automation is on). Unless that check changes, it would quietly re-link a refund a person chose to leave unlinked.
  - Match and Unmatch on a dispute refund don't check whether the Tolls week is sealed. There is no locked or sealed check anywhere in `dispute_refund_controller.tsx`, so either can change a sealed week today.

### Proposed fix (revised, round 2)

1. **Three separate fields, one job each.**
   - `status` stays as the matching state (`unmatched | matched | auto_resolved`), unchanged.
   - New `resolution`: the human review (`null` or `left_unlinked`, with who, when and reason).
   - No `financial_treatment` field now. It is added only if finance later decides an unlinked refund is fleet income or owed back to the driver.
   - Every Leave unlinked, Undo and re-review is also written as a permanent history row, not only as the latest value.
2. **Shared rules for every check.** These live in `packages/toll-core/src/tollPeriodDisputeHelpers.ts`, with a copy in the edge code under the existing mirror rule:
   - `isDisputeRefundMatched(r)`: `matched` or `auto_resolved` (exists today);
   - `isDisputeRefundLeftUnlinked(r)`: `unmatched` and `resolution = left_unlinked`;
   - `isDisputeRefundActionable(r)`: `unmatched` and not left unlinked.

   Every place that compares status directly switches to these:
   - Tolls step count, `incrementDisputeRefundCount`;
   - driver week, `driver_financial_periods.ts:1004`;
   - auto-match, `dispute_refund_controller.tsx:1044`, which skips left-unlinked refunds;
   - list counts and filter, `DisputeRefundsList.tsx:104` (adds a "Left unlinked" filter next to "Unmatched");
   - `DisputeRefundDetailDialog.tsx:143`.

   A CI check fails if new code compares a dispute refund's `status` to `'unmatched'` directly.
3. **Seal readiness means "no actionable items".** The Tolls step and the driver week count only `isDisputeRefundActionable`.
4. **The money stays visible.** In the driver week a left-unlinked refund keeps its amount, in its own line "Left unlinked: J$x (reason)". It is never added to `reimbursed`, never offsets toll losses, never zeroed and never dropped. Only the "to decide" count changes.
5. **Who can do it.** `toll.manage` plus a reason of 8+ characters. No second approver. There is no finer toll permission today (checked: `packages/auth-client/src/permissions.ts` has only `toll.manage` and `toll.view`). An amount threshold for approval is added only if finance asks.
6. **A new candidate brings it back for review.** If a toll or claim that could match a left-unlinked refund appears later, the refund shows "Left unlinked earlier · new possible match" and counts as "to decide" again. It is never re-matched automatically, and its earlier decision stays in history.
7. **Sealed weeks.** Leave unlinked, Undo, Match and Unmatch are refused on a sealed Tolls week. The change goes through the existing reopen first. This guard also closes the gap found in round 2 for Match and Unmatch.
8. **Recalculation.** Leave unlinked and Undo go through the same week change path as every other toll decision, so the week is recalculated. This depends on WRA-43, which is fixed first.

### Questions

1. Is "money unchanged" right? Uber pays the adjustment out with the driver's payout. If no toll matches, should it stay as it is, count as fleet income against toll losses, or be owed back to the driver?
   - **Reviewer:** "Money unchanged" is right for the toll tie-out, but too broad for the driver financial period. An unmatched Uber support adjustment is not a toll reimbursement; do not add it to `reimbursed` or use it to offset toll losses unless finance explicitly classifies it that way. Keep it visible in the driver week as informational/unallocated, not zeroed, not silently dropped. If finance wants "fleet income" or "owed back to driver," model that as a separate `financial_treatment`/disposition field, not as a side effect of Leave unlinked.
   - **Claude:** Agreed and taken: fix points 1 and 4. The driver week keeps the amount on its own "Left unlinked" line. `financial_treatment` is not built now, so no money rule changes in this fix.
2. Should Leave unlinked need an approver (like Waive), or is the preparer's reason enough?
   - **Reviewer:** No second approver by default. This is a no-money-change workflow decision, so `toll.manage` + required reason + immutable audit is enough. If finance wants segregation of duties, add an approval threshold by amount, not a blanket Waive-style approval. I'd also prefer a more specific permission than `toll.manage` if you have one, e.g. `toll.dispute.resolve`.
   - **Claude:** Agreed: no approver, reason required, permanent history (fix point 5). Checked: there is no finer toll permission. Permissions come only with roles, so a new one would change every role. We keep `toll.manage`.
3. If the matching toll arrives in a later upload, should a refund marked Leave unlinked be offered for matching again, or only after Undo?
   - **Reviewer:** It should be offered for matching again when a new candidate toll appears, but it should not auto-rematch and should not silently erase the prior decision. Keep `left_unlinked`, record the event, and surface "previously left unlinked — new candidate found" for re-review. If the week is already sealed, route it through reopen/adjustment rather than silently changing the sealed week.
   - **Claude:** Agreed: fix points 6 and 7. Checked while answering: auto-match today would re-link it (`dispute_refund_controller.tsx:1044`), and dispute Match/Unmatch have no sealed-week check at all. Both are now part of the fix.
4. Is there anything else that reads `status === 'unmatched'` that we should also update?
   - **Reviewer:** I can't verify call sites without the code, so treat this as an audit checklist. Search for raw `status === 'unmatched'`, `.eq('status', 'unmatched')`, SQL mirrors, exports, analytics, tests, readiness counts, list filters, driver financial periods, and notification/dashboard queries. Replace raw checks with centralized predicates (matched / actionable / left unlinked). Then make the Tolls step count and seal readiness use `isActionable`, not raw status.
   - **Claude:** Checked: there are no `.eq('status','unmatched')` queries and no SQL copy of dispute refunds. They live only in the key-value store. The full list of direct checks is in fix point 2. `dispute_refund_controller.tsx:724` and `:1329` only *write* `unmatched` (import and Unmatch), which is correct. The driver week's own `tollStatus = "unmatched"` (`driver_financial_periods.ts:1368`) is a different field, a toll's status, not a refund's.

---

## WRA-44 · High · The toll week check mixes every company's data

**Status:** Revised in round 2. Waiting for the reviewer. To be built as its own audit.

### What happens

- `buildWeekReadiness` (`supabase/functions/_fleet-server/toll_period_readiness_build.ts`) decides whether a week's tolls can be sealed. It receives the company id, but uses it only for the ledger totals.
- The rest is loaded for **all companies**:
  - tolls and trips: `findTollsInDateRange` / `findTripsInDateRange` (`toll_match_index.ts`), date filter only;
  - dispute refunds: `loadDisputeRefundRecords` (`toll_period_inputs.ts`), every refund;
  - claims: `loadAllByPrefix("claim:")`, every claim.
- Seen on the test copy: a company with no tolls and no Uber files was refused *"2 dispute refunds, J$500 residual"*. Those are another company's numbers for the same week.
- Not yet checked in live. The effect: in any week where two companies both have tolls, refunds or claims, each sees the other's items and neither can seal Tolls.
- **Which records carry a company (checked in round 2):**
  - tolls: yes (`organizationId` on the record; Charge Driver copies it from the toll, `claim_service.ts:180`);
  - claims: yes (stamped the same way);
  - dispute refunds: **no**. The import saves the CSV row as-is, without a company (`dispute_refund_controller.tsx` around line 717). Many carry `batchId`, the upload they came from, and every upload records its company (`fleet.import_batches.organization_id`).

### Proposed fix (revised, round 2)

1. **Guard first.** Inside `buildWeekReadiness`, drop any toll, trip, refund or claim whose company isn't the week's company, before counting. That alone stops this bug from shipping.
2. **Then the shared loaders.** `findTollsInDateRange`, `findTripsInDateRange`, `loadDisputeRefundRecords` and the claim loader take a **required** company id and refuse to run without one. "All companies" is never the default. Every caller is updated.
3. **Company is a stored snapshot.** A record belongs to the company saved on it, never to the driver's *current* company. New dispute refunds get the company stamped at import.
4. **Old dispute refunds.** Back-fill the company from `batchId` → `fleet.import_batches.organization_id`, the upload they came from. Refunds with no batch, or whose batch is gone, are marked **unassigned**:
   - they are left out of every company's seal check;
   - they are listed in an admin report to be sorted by hand;
   - they are never silently counted in anyone's numbers, and never deleted.
5. **Tests.** A two-companies-same-week test for the week check, and a CI check that fails if a toll, trip, refund or claim loader is called without a company.
6. Company-prefixed storage keys are not part of this fix. That would move every record and is a larger change than the bug needs.

### Questions

1. Fix scope: filter only inside the week check first, or fix the shared loaders (`findTollsInDateRange`, `loadDisputeRefundRecords`, the claim loader) so every caller is safe?
   - **Reviewer:** Do both, in this order: add an immediate company guard inside the week check so this bug cannot ship, then fix the shared loaders so `companyId` is required at the repository boundary. Do not make "all companies" the default. Long-term, filtering only inside the week check leaves every other caller unsafe.
   - **Claude:** Agreed and taken as written: fix points 1 and 2.
2. Old records without a company: back-fill them from the driver's company, or treat them as belonging to no one and leave them out?
   - **Reviewer:** Back-fill only where ownership is deterministic from the record itself or a stable historical link. Do not back-fill from the driver's current company, because drivers can move. If ownership cannot be determined, put the record in an explicit `unassigned`/quarantine bucket, exclude it from company-scoped seal checks, and show it in an admin remediation report. Do not silently include it in every company's numbers.
   - **Claude:** Agreed. Checked: the stable link exists. A refund's `batchId` points to its upload, and the upload stores its company. Fix point 4.
3. Do you know of other toll paths that load by date or key prefix with no company filter (auto-match, suggestions, seal)?
   - **Reviewer:** I can't confirm without the code, but I'd audit every path that uses date-range loaders or prefix scans: auto-match, suggestions, seal, exports, driver financial periods, background jobs, SQL mirrors, claim loaders, and any `loadAllByPrefix("claim:")`-style call. Add a static guard/test that forbids tenant-facing loaders without a required `companyId`, plus a two-company same-week regression test.
   - **Claude:** Agreed: fix point 5. The full list of callers is the first job of the WRA-44 audit. Making the loaders require a company means every unsafe caller fails to build, so none can be missed.

### Reviewer's general flag

- **Reviewer:** "counts as informational in both places" needs to be precise. Informational in the driver week must still preserve the amount and show why it is unallocated; otherwise the fix can hide a real payout adjustment instead of just clearing the action count.
- **Claude:** Agreed: WRA-42 fix point 4 now says exactly that.

---

## Not part of this review

Two more problems from the same test run are being debugged against the running app. They don't need a design review:
- **WRA-43:** toll decisions don't trigger a week recalculation. This is fixed first, because WRA-42's Leave unlinked depends on it (reviewer's point, agreed).
- **WRA-41:** the Fuel step doesn't find some weeks.

---

## Rounds

| Round | Date | What changed |
|---|---|---|
| 1 | 2026-11-12 | First version sent to the reviewer. |
| 2 | 2026-11-12 | Reviewer's answers added and checked against the code. **WRA-42:** split into status / resolution (no `financial_treatment` yet); shared rules replace direct status checks (5 places listed); driver week keeps the amount on a "Left unlinked" line; a new possible match brings it back for review; sealed weeks refuse Leave unlinked, Undo, Match and Unmatch (new: Match/Unmatch had no sealed check); auto-match skips left-unlinked refunds (new); `toll.manage` kept (no finer permission exists). **WRA-44:** guard in the week check first, then loaders require a company; old refunds back-filled from their upload's company, the rest marked unassigned with an admin report; two-company test + CI check. |
