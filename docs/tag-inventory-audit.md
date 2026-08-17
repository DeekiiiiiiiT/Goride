# Tag Inventory Audit — Data Wiring & UI/UX Review

## Remediation status (2026-08-17)

| # | Finding | Status |
|---|---------|--------|
| 1 | Recovered/Net Loss without pooling, dispute, unlinked credits | Done — `sumTagUsageFinancials` + ctx in Tag Detail / history |
| 2 | View in Reconciliation dropped vehicle | Done — nav focus + driver preselect + banner |
| 3 | Non-atomic assign/unassign | Done — `POST /toll-tags/assign` and `/unassign` with rollback |
| 4 | Write-on-read / date-filter writes | Done — sync only on load or Recalculate; date filter is local |
| 5 | Balance may include other-tag history | Done — disclosure banner + This tag only toggle |
| 6 | No pagination; all claims client-side | Done — Load more (25) on transactions; logs support limit |
| 7 | One-click hard delete | Done — reasoned void + force for reconciled |
| 8 | No burn/trend | Done — $/week + sparkline |
| 9 | Provider verify under-emphasized | Done — Verify CTA + last-checked staleness |
| 10 | Jargon with no legend | Done — column glossary tooltips |
| 11 | Long single scroll | Done — sticky header + Overview / Transactions / Assignment tabs |
| 12 | No CSV export | Done |
| 13 | Full-card skeleton on date click | Done — period summary only pulses; balance stays |
| 14 | Different Tag unexplained | Done — banner + toggle + row badge |

**Data recovery:** Live `fleet.toll_ledger` was empty because `saveTollLedgerEntry` skipped `kv.set` (and fleet dual-write) when legacy money KV writes were off. Imports now always persist via `kv.set`. Restored **227** historical rows from `ledger.kv_money_backup_20260811`. Kenny Aug 10–16 still has **2 tag charges vs 13 Uber trips with tolls** — re-import Aug 11–16 to clear remaining Unlinked Refunds.

---

**Scope:** `apps/fleet/src/pages/TagInventory.tsx`, `TollTagDetail.tsx`, `TollTagList.tsx`, `TollTopupHistory.tsx`, `AssignTagModal.tsx`, `utils/tollTagLedger.ts`, `utils/tollReconciliation.ts`, and the backend `GET /toll-logs` handler in `supabase/functions/_fleet-server/toll_controller.tsx`.

**Method:** Static read-through of the actual wiring — component → API client → edge function → KV store — cross-checked against the two screenshots supplied (T-Tag `212100286450` detail view). No code was modified; this is audit-only, as requested.

**Verdict up front:** the balance math (top-ups minus tag usage) is solid and correctly excludes cash/card/fleet-account tolls. But the **Recovered / Net Loss figures on this page are computed with a different, simpler code path than the rest of the reconciliation product**, and that path is missing pieces the rest of the app treats as mandatory. That's the headline finding below. There's also one confirmed dead link and a couple of non-atomic writes worth knowing about.

---

## 1. Data Wiring Findings

### 🔴 Critical — "Recovered" / "Net Loss" on this page are computed without trip-refund allocation, dispute refunds, or unlinked credits

**Where:** `TollTagDetail.tsx:139` and `TollTopupHistory.tsx:136`

```ts
const financials = calculateTollFinancials(tx, trip, claim);
```

`calculateTollFinancials` takes an optional 4th argument, `ctx`, that supplies:
- `allocatedTripRefund` — the trip's `tollCharges` **shared out pool-style** across every toll linked to that trip
- `disputeRefundAmount` — matched dispute-refund credits
- `unlinkedSourceTrip` — credit from an "Unlinked Refund" apply

Every other place in the codebase that calls this function builds and passes `ctx` — `ReconciliationWizard.tsx:989`, `ReconciledTollsList.tsx:133`, `MatchedTollDetailOverlay.tsx:55`, `UnderpaidClaimsStep.tsx` (×2), `pendingUnderpaidListable.ts` (×2). **Tag Inventory's two call sites are the only ones in the app that omit it.**

The consequence is documented in the source itself — `allocateTripRefundAcrossTolls`'s docblock (`tollReconciliation.ts:475-493`) explicitly warns:

> "calling it once per toll without accounting for siblings **double- (or triple-) counts the same refund**."

Without `ctx`, `calculateTollFinancials` falls back to `finiteAmount(trip?.tollCharges)` — the trip's **full, un-pooled** refund amount — credited in full to *every* toll linked to that trip. If a trip crossed two toll plazas (which is exactly what the screenshot shows: `Portmore East (K10)` and `Portmore West (R07)`, both same-day, both tagged to Uber), each one can independently claim the full trip refund, inflating "Recovered."

It also silently zeroes out two legitimate recovery sources — dispute refunds and unlinked-apply credits will never show up here, only on the canonical Reconciliation pages — so a driver-recovered/write-off dollar that the rest of the app tracks correctly can look unrecovered here, or vice versa depending on the trip-sharing case above.

**Why this matters:** the screenshot shows **$8,845.00 Recovered against $8,845.00 Tag Usage — a suspiciously perfect 100% all-time recovery rate with $0.00 Net Loss.** Given the missing pooling logic, this number cannot be trusted as-is; it should be cross-checked against the Reconciliation Wizard's totals for the same vehicle/date range. If they don't match, this is the reason.

**Fix direction (not applied, per your instructions):** build the same `ctx` (via `buildTollFinancialsContext` + `buildTripRefundAllocation`, exactly as `ReconciledTollsList.tsx` does) in both `TollTagDetail.tsx` and `TollTopupHistory.tsx` before calling `calculateTollFinancials`.

---

### 🔴 Confirmed bug — "View in Reconciliation" doesn't deep-link to the vehicle you were looking at

**Where:** `TagInventory.tsx:192-194`

```ts
onNavigateToReconciliation={onNavigate ? (_vehicleId: string) => {
    onNavigate('toll-tags');
} : undefined}
```

The callback receives `vehicleId` (note the `_` prefix — TypeScript is telling you it's unused) and **discards it**, always routing to the generic `toll-tags` page. Checking `App.tsx:474-478` confirms `toll-tags` renders `<TollReconciliation />` with **no props at all** — there's no mechanism today for a vehicle/tag to be carried across this navigation, even if the callback did forward it.

**User impact:** clicking "View in Reconciliation" from `T-Tag / 212100286450` drops you on the unfiltered Reconciliation screen with no indication of which vehicle to look for. The button visually promises continuity it doesn't deliver.

---

### 🟠 High — Tag assignment is two non-atomic writes with no rollback

**Where:** `AssignTagModal.tsx:53-77`

```ts
await api.saveVehicle(updatedVehicle);   // 1
await api.saveTollTag(updatedTag);       // 2
```

If step 2 fails after step 1 succeeds (network blip, validation error, concurrent edit), the vehicle now points at a tag (`tollTagUuid`) that doesn't know it's assigned — `assignedVehicleId` never got set, `assignmentHistory` never got its entry. The tag list will show it as "Unassigned" while the vehicle record disagrees. There's no compensating action or retry — the `catch` block only logs and clears `isSaving`.

The same pattern exists (worse, three writes) in the "Sync Tag History" backfill and in unassign (`TagInventory.tsx:142-169`, vehicle save then tag save with no undo). This class of bug is the classic source of "the balance doesn't match what I see in Reconciliation" support tickets.

---

### 🟠 High — Viewing the page performs writes, on every render and every filter change

**Where:** `TollTagDetail.tsx:85-189` (`fetchStats`), triggered by two `useEffect`s: mount/vehicle change, **and** `datePreset`/`customStartDate`/`customEndDate` change.

`fetchStats` computes `calculatedBalance` from the **all-time** ledger (unaffected by the date filter) and then, every single time it runs:

```ts
if (Math.abs(currentBalance - calculatedBalance) > 0.01 && vehicle) {
    await api.saveVehicle({ ...vehicle, tollBalance: calculatedBalance });
}
...
if (tag.lastCalculatedBalance === undefined || Math.abs(...) > 0.01) {
    await api.saveTollTag({ ...tag, lastCalculatedBalance: calculatedBalance, ... });
}
```

Two problems:
1. **A read (viewing the page, or clicking "7 Days" / "30 Days") triggers a write** to `vehicle` and `tollTag` records. That's surprising behavior for anything touching financial state, and makes "who changed this and why" harder to answer later — there's no audit-trail entry for these auto-corrections.
2. Because the balance is all-time and doesn't depend on the date filter, **every date-preset click re-issues the same write** for no new information — wasted round-trips, and a live race if two admins have the same tag open (last save wins, silently).

This isn't necessarily wrong to have *somewhere* (self-healing caches are reasonable), but doing it as a side effect of a `GET`-shaped user action, on every filter click, with no audit trail, is a design smell worth revisiting.

---

### 🟡 Medium — "Tag Account Balance" can quietly include another tag's history

**Where:** backend `GET /toll-logs`, `scope=tag` branch (`toll_controller.tsx:2473-2485`)

By design (and the code comments are honest about this — "UNION the current vehicle's tag-ledger tolls...strictly a superset of the legacy view, no regression"), the balance shown on a tag's detail page is:

> rows linked to *this* tag (any vehicle, via backfilled `tollTagId`) **UNION** rows on *this vehicle* that haven't been tag-linked yet (regardless of which tag they actually belong to)

This is a sensible transitional design while `tollTagId` backfill is incomplete — the client even renders a "Different Tag" badge (`TollTopupHistory.tsx:153-164`) for exactly these rows, which the screenshot shows repeatedly. But the **Balance card total itself doesn't disclose that it may include unlinked/different-tag activity** — only the transaction rows do, several rows down. A user skimming the top card has no idea the $655.00 could include tolls from a tag swap that hasn't been backfilled. Running "Sync Tag History" (already built, on the Tag Inventory list page) closes this gap — worth surfacing that connection more directly on the detail page itself (see UX section).

---

### 🟡 Medium — Full-lifetime fetch, no pagination, all claims loaded client-side

**Where:** `TollTagDetail.tsx:98-106`, `TollTopupHistory.tsx:57-61`

`api.getTollLogs(...)` is called with no `limit`/`offset` even though the endpoint supports both — every transaction the tag (or its union set) has ever had is fetched and rendered in one table. `api.getClaims()` similarly fetches **all** claims fleet-wide, client-side, just to build an `id → claim` lookup for this one tag. Fine at current data volume; will degrade as ledger history grows across a multi-year fleet. Worth a `limit` + "load more" or server-side claim filtering before this becomes a real slow-load complaint.

---

### 🟡 Medium — Hard delete on a financial ledger row, one click + a generic confirm

**Where:** `TollTopupHistory.tsx:270-278`, `confirmDelete` (`:93-107`)

The trash icon calls `api.deleteTransaction(transactionToDelete)` directly — a real delete, not a void/reverse with a reason. The confirm dialog is the generic "This action cannot be undone" text, identical to deleting a comment or a draft. For a row that's part of a reconciled financial ledger (with `workflowStage`, `auditTrail`, `matchStatus` fields the backend already tracks), silently hard-deleting it with no reason code and no audit-trail entry is a bigger risk than the UI communicates — especially since it's one click away from "View Transaction History," which any admin with tag-inventory access can reach.

---

## 2. UI/UX Review

The bones are good — clear balance, clear top-up/usage split, a real low-balance alert, provider-balance reconciliation, assignment history. The issues are mostly about **hierarchy, jargon, and "at a glance"** — which is exactly what you asked about.

### What's working
- Balance card's color logic (green positive / red negative / gray zero) is intuitive.
- The provider-balance "Balanced" / "Discrepancy: +$X" badges are a genuinely good pattern — keep that.
- Low-balance banner + list-level badge is a solid two-tier alert (though see below).
- Assignment History timeline is clear and well-built.

### Where it falls short of "info at a glance"

**1. No trend, only totals.** Every number on this page is a static lifetime or period sum. A fleet manager's real question is "is this tag burning faster than it's being topped up, and when will it run dry?" Nothing here answers that. A simple balance-over-time sparkline in the Balance card, or a "burn rate" (avg. $/week over the selected period) next to Tag Usage, would turn this from a ledger into a decision-support tool.

**2. Recovery Status buried at the bottom of a card that also contains raw expense totals.** "Recovered $8,845 / Net Loss $0" is presented with equal visual weight to "Tag Usage / Total Top-up" just above it, inside the same card, separated only by a thin `border-t`. Given the Critical finding above, this number needs to be *more* scrutinizable, not less — right now it reads as an authoritative, final figure with no way to drill into which tolls it came from without opening the transaction table and hovering each row's tooltip individually.

**3. Provider Balance verification is an afterthought.** It's the one field that lets you catch drift against the actual TransJamaica/JUTC/whichever provider portal, and it's presented as a small gray label with a barely-visible pencil icon, defaulting to a plain text link ("Enter provider balance to verify") when empty. Given this is the *ground truth check* for the whole page, it deserves a more prominent treatment — e.g., a persistent "Verify Balance" call-to-action with a staleness indicator ("last checked 45 days ago") when it hasn't been updated recently, not just a passive field waiting to be noticed.

**4. Jargon without a legend.** "Unmatched / Personal," "Driver Pd," "Different Tag," "Toll Usage" vs "Usage (Toll)" — these are internal reconciliation vocabulary now exposed raw on a page that non-reconciliation-fluent staff (e.g., someone just checking "is this tag topped up") will land on. A one-line glossary tooltip on the column header, or consistent plain-language labels, would help a lot.

**5. Long single-column scroll, no anchoring.** Balance → Activity Summary → Filter bar → 28-row transaction table → Assignment History timeline, all stacked vertically with no sticky header. On a tag with a long history (this one has 28 transactions and it's already a full scroll+), the balance and alert banner scroll out of view exactly while you're scanning the table that explains them. A sticky mini-header (tag number + current balance + low-balance state) while scrolling the transaction table would fix this, or splitting into tabs (**Overview / Transactions / Assignment History**) so each view is self-contained.

**6. No export.** This is fundamentally a reconciliation artifact — the kind of thing someone downloads to cross-check against a provider statement or hand to accounting. There's no CSV/export action anywhere on the page.

**7. Date filter re-fetches the whole page on every click, with a generic full-card skeleton.** Clicking between "7 Days" / "30 Days" / etc. re-triggers `fetchStats()` (network round trip + the write side-effects noted above) and both the Balance and Activity Summary cards blank out to a pulse skeleton each time, even though the Balance figure never actually changes with the filter (it's always all-time). That's a flicker for no informational gain — the skeleton should be scoped to what's actually changing (Activity Summary's *period* figures), and the Balance card shouldn't re-render/reload at all when only the date filter changes.

**8. "Different Tag" rows have no way to be isolated or explained inline.** Given how central the union-scope behavior is (see wiring finding above), and how many rows carry this badge in the screenshot, a first-time viewer has no way to answer "why am I seeing tolls not from this tag on this tag's page?" without hovering each badge individually. A short inline explainer (or a toggle: "Show only this tag's own history") would turn a confusing surprise into an intentional, explained feature.

**9. Recovered/Net Loss numbers per-row rely on a hover tooltip for the breakdown** (Platform Refund / Driver Charge / Fleet Absorbed) — reasonable for density, but given finding #1 (allocation bug), that breakdown is exactly the thing a skeptical user would want to double-check, and it's hidden behind a hover-only `Info` icon rather than being one click from a detail view (there is a `TollTransactionDetailOverlay` already wired via row-click — good — but it's not obviously discoverable that the *row itself* is clickable; nothing signals it beyond `cursor-pointer`).

### Concrete layout suggestion

```
┌─────────────────────────────────────────────────────────┐
│ ← T-Tag / 212100286450          [Active] 5179KZ  Added…  │  ← sticky on scroll
│ Balance: $655.00  ▲ trend  ⚠ (if low)   [Verify][Export] │
├─────────────────────────────────────────────────────────┤
│ Overview │ Transactions (28) │ Assignment History        │  ← tabs
└─────────────────────────────────────────────────────────┘
```
- **Overview tab:** Balance + sparkline, Provider Balance verification (promoted), Low Balance config, Activity Summary/Recovery Status with a "how this is calculated" link.
- **Transactions tab:** the table, full width, with a "this tag only" / "include vehicle history" toggle, search-by-plaza, and CSV export.
- **Assignment History tab:** the timeline, no longer competing for scroll real estate with 28 table rows.

---

## 3. Priority Summary

| # | Finding | Severity | Type |
|---|---|---|---|
| 1 | Recovered/Net Loss computed without trip-refund pooling, dispute refunds, or unlinked credits | 🔴 Critical | Data correctness |
| 2 | "View in Reconciliation" drops vehicle context, always lands on generic page | 🔴 Critical | Broken wiring |
| 3 | Tag assignment/unassignment is two non-atomic writes, no rollback | 🟠 High | Data integrity |
| 4 | Viewing the page / changing date filter silently writes to vehicle & tag records | 🟠 High | Architecture |
| 5 | Balance may silently include another tag's un-backfilled history | 🟡 Medium | Disclosure |
| 6 | No pagination on lifetime ledger fetch; all claims loaded client-side | 🟡 Medium | Scale |
| 7 | One-click hard delete on ledger rows, generic confirm, no audit trail | 🟡 Medium | Data safety |
| 8 | No trend/burn-rate — page is all static totals | UX | At-a-glance |
| 9 | Provider Balance verification under-emphasized relative to its importance | UX | Hierarchy |
| 10 | Jargon-heavy labels with no legend | UX | Clarity |
| 11 | Long single-scroll layout, no sticky summary, no tabs | UX | Navigation |
| 12 | No CSV/export for reconciliation use case | UX | Missing feature |
| 13 | Full-card skeleton reload on every date-filter click | UX | Perceived performance |
| 14 | "Different Tag" rows unexplained inline | UX | Clarity |

**If you only fix three things:** #1 (the numbers need to be trustworthy), #2 (dead-end button), and #4 (stop writing on read — at minimum, don't refire the balance-sync write on date-filter changes since the value can't have changed).
