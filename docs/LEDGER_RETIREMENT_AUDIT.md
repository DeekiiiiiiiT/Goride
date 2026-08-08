# Unified Ledger Retirement Audit

**Audited:** 2026-08-07 · **Branch:** `chore/sentry-fleet-setup` · **Auditor:** Claude (read-only review, no code changed)

**Verdict up front: not ready to retire the old ledger(s) yet.** The new `ledger.*` schema is currently a **write-only mirror** — nothing in production reads money from it to make a real decision (payout, statement, balance). One of its five reconciliation "islands" (Dash) is a hardcoded stub that can never actually confirm parity. The one code path that *does* read from it is silently broken. Details and a fix list below.

This document is a snapshot audit, not a plan — it complements the existing `docs/LEDGER_UNIFICATION_PLAN.md` (phase tracker) and `docs/LEDGER_LEGACY_INVENTORY.md` (fleet KV inventory) rather than replacing them. Where this audit disagrees with the phase tracker's "Complete" status, that's called out explicitly.

---

## 1. What you actually have (not two ledgers — five sources feeding one sink, plus a sixth semi-independent system)

Your plan doc calls these "islands," which is the right mental model. Each is a **legacy source of truth that money-moving code still reads from today**. All five (allegedly) mirror into one new destination:

| # | Legacy island (still the real SSOT) | New destination | Dual-write code |
|---|---|---|---|
| 1 | `rides.payment_journal_entries` (cash settlement journal) | `ledger.entries` | `dualWriteRidesJournalLine()` in [`dualWriteRides.ts`](../supabase/functions/_shared/unifiedLedger/dualWriteRides.ts) |
| 2 | `kv_store_37f42386` keys `ledger_event:*` (fleet/driver canonical KV — **this is the documented Money SSOT for driver statements**, see `LEDGER_LEGACY_INVENTORY.md`) | `ledger.entries` | `fleetDualWriteCanonicalEvent()` in [`unified_ledger_dual_write.ts`](../supabase/functions/_fleet-server/unified_ledger_dual_write.ts) |
| 3 | `kv_store_37f42386` keys `toll_ledger:*` | `ledger.entries` | `dualWriteTollLedgerKv()` in [`dualWriteToll.ts`](../supabase/functions/_shared/unifiedLedger/dualWriteToll.ts) |
| 4 | `payments.transactions` / `payments.merchant_payouts` (Dash) | `ledger.entries` | `dualWriteDashPayment()` in [`dualWriteDash.ts`](../supabase/functions/_shared/unifiedLedger/dualWriteDash.ts) |
| 5 | `rides.ledger_lines` | *(intentionally not mirrored — reporting-only, explicitly excluded from health checks)* | dead code only, see §4.7 |

**Sixth, separate system you should know about:** `ledger.financial_events` (created by `20260717140000_driver_financial_ledger_rebuild.sql`, posted via `postFinancialEvent()` / RPC `ledger_post_financial_event`). This is used by newer Toll Brain / Fuel Brain code for toll/fuel/cash/earnings/payout domains. It's architecturally the *best-built* piece here — it posts to its own table **and** `ledger.entries` **atomically in one Postgres transaction** (there's a `ledger_entry_id` FK column linking the two), so it can't drift the way the JS-level dual writes can. It is **not** what `apps/fleet` driver-overview reads today, though — that still reads `ledger_event:*` KV directly (confirmed in `ledgerMoneyAggregate.ts` and `LEDGER_LEGACY_INVENTORY.md`). Keep these two "canonical-sounding" systems (`ledger_event:*` KV vs. `ledger.financial_events` SQL) mentally separate — they are not the same thing and not everything in one is in the other.

**The new schema itself:** `ledger.accounts`, `ledger.entries`, `ledger.source_receipts`, posted through the single RPC `ledger.post_entry` (schema: [`20260706140000_ledger_schema_core.sql`](../supabase/migrations/20260706140000_ledger_schema_core.sql), idempotency/receipt logic patched by your new [`20260807152000_ledger_post_entry_receipt_on_skip.sql`](../supabase/migrations/20260807152000_ledger_post_entry_receipt_on_skip.sql)).

---

## 2. The central problem: nothing reads from the new ledger yet

Two feature flags control everything (`supabase/functions/_shared/unifiedLedger/flags.ts`):

- `LEDGER_DUAL_WRITE_ENABLED` — mirror writes into `ledger.entries`.
- `LEDGER_READ_UNIFIED` — read from `ledger.entries` instead of the legacy source.

Your plan doc (`LEDGER_UNIFICATION_PLAN.md`, dated 2026-07-06) states **both are ON** in Supabase secrets and that Phase 12 ("per-island read cutover") is **Complete**. I can't read your Supabase project secrets from the repo, so **please confirm current values of both flags directly in the Supabase dashboard** — the code tells a different story than "cutover complete":

Grepping every call site of `isLedgerReadUnifiedEnabled()`, it is used in exactly **three** places, and none of them are real product money paths:

1. `rides/admin/unifiedLedger.ts` — Dominion's admin "Unified Ledger" feed/reconciliation screen only.
2. `rides/admin/platformLedger.ts` — an admin trip-ledger endpoint, gated further behind `grain === "line"` (see §3.1, it's also broken).
3. Nothing else. Not payouts, not driver statements, not Dash order totals, not toll charges, not fare calculation.

So even in the best case (both flags genuinely ON), the *only* consumer of `ledger.entries` is an internal admin dashboard. Every actual money decision in the product — driver payouts, merchant payouts, courier earnings, statements, wallet balances — still reads from the five legacy sources in the table above. **This is expected and fine for a dual-write soak period. It is not a state you can retire the old ledger from**, because retiring the old ledger today would delete the only thing any app actually reads.

---

## 3. Concrete bugs found (not just "missing coverage" — code that will misbehave)

### 3.1 `platformLedger.ts` reads the wrong `product` value — the one live read path is broken

`supabase/functions/rides/admin/platformLedger.ts:41-48`:

```ts
if (isLedgerReadUnifiedEnabled() && grain === "line") {
  const { entries, total } = await listUnifiedLedgerEntries({
    product: "rides",   // ← queries ledger.entries WHERE product = 'rides'
    ...
```

But every rides dual-write posts with `product: "roam_rides"` or `"roam_driver"` (see `resolveRidesProduct()` in `dualWriteRides.ts`) — the string `"rides"` is only listed as a **deprecated legacy alias** in `postEntry.ts`'s type comment and is never actually written. `listUnifiedLedgerEntries()` does a plain `.eq("product", opts.product)`, so this query returns **zero rows, always**, and the endpoint returns `{ lines: [], total: 0, source: "ledger.entries" }` — no error, just silently empty.

Net effect: if `LEDGER_READ_UNIFIED=1` and something calls this endpoint with `grain=line`, the admin sees "no data" instead of real ledger lines. I didn't find a current frontend caller passing `grain=line` to this specific endpoint, so it's likely dormant rather than actively misleading anyone today — but it means **Phase 12 ("per-island read cutover") is not actually functioning**, contrary to the plan doc's "Complete" status. Fix before relying on this path or before checking that phase off for real.

### 3.2 Dash reconciliation is a hardcoded stub — you cannot verify Dash parity today

This is the most important finding for your "am I safe to retire the old ledger" question.

`ledger_reconcile_islands()` (originally in `20260807140000_ledger_security_invoker_grants_and_reconcile.sql`, refined twice more in your new untracked migrations) computes a `legacy_count` per source system so Dominion's health screen can show green/red. For four of the five islands it does a real count against the legacy table/KV. For Dash:

```sql
UNION ALL
SELECT 'dash_payments', 0::bigint
```

`legacy_count` for `dash_payments` is **hardcoded to the literal `0`**, in all three revisions of this function, including the one from today. Meanwhile `unified_count` for `dash_payments` is a real count of `ledger.source_receipts` rows (which grows every time `dualWriteDashPayment()` fires from `payments/index.ts`, `courierConsumerRoutes.ts`, and `financeRoutes.ts`).

Consequence: `delta = unified_count - 0 = unified_count`. Unless literally zero Dash dual-writes have ever succeeded, this row **can never show `delta = 0`**. Yet the admin route's `green_definition` text explicitly lists `dash_payments` as one of the islands that must be at delta 0 for "Phase A green" (`rides/admin/unifiedLedger.ts:66`). Either:
- the Dominion reconciliation screen is currently showing Dash as perpetually "unhealthy" (in which case you'd have noticed — worth checking), or
- nobody has looked at that specific row closely, because the other four islands look fine.

The real fix is a `legacy_count` subquery against `payments.transactions` (+ `payments.merchant_payouts`, + `payments.refunds` if that's a separate table) filtered the same way the other islands are (exclude zero-amount / neutral rows) — mirroring what `dualWriteDashPayment()` actually skips. **Until this exists, you have zero automated signal on whether Dash's dual-write is complete or lossy.** Manual, one-off spot-checking is your only current option for that island.

### 3.3 `checkProductBalances()` cannot ever detect an imbalance — it's not a real check

`supabase/functions/_shared/unifiedLedger/queries.ts`, function `checkProductBalances()` (backs the Dominion "balances" reconciliation tile via `GET /ledger/unified/reconciliation/balances`):

```ts
const totalDebits = entries.reduce((sum, e) => sum + (e.amount_minor ?? 0), 0);
const totalCredits = totalDebits;   // ← not computed independently
...
balanced: true,                     // ← always
```

It sums `amount_minor` once and assigns the same number to both `total_debits_minor` and `total_credits_minor`, then always returns `balanced: true`. A real double-entry balance check needs to sum amounts **grouped by which side of the entry the account sits on** (or compare `ledger.accounts.balance_minor` deltas), not assume the two sides are equal by construction. As written, this function is decorative — it will report "balanced" even if `ledger.post_entry`'s account-resolution logic had a bug that posted every entry to the same account twice, or any other real corruption. Don't use this as evidence the new ledger is internally consistent; it currently can't be evidence of anything.

### 3.4 Self-referencing (no-op) entries: fixed for toll, not fixed for the fleet canonical KV path

You already found and manually cleaned up one instance of this class of bug: `20260807150000_phase_a_toll_orphan_cleanup_and_backfill.sql` deletes two specific `ledger.entries` rows by hardcoded UUID, described as "bogus toll dual-writes (debit=credit platform:clearing, no KV SSOT)". `dualWriteTollLedgerKv()` was subsequently guarded against this (`if (!entry.organizationId) { skip missing_organization_id }`).

The same failure mode still exists, unguarded, in `fleetDualWriteCanonicalEvent()` (`unified_ledger_dual_write.ts:81-107`, the `kv_ledger_event` path):

```ts
const driverKey = hasValidDriverId
  ? `user:${event.driverId}:driver:digital`
  : (event.organizationId ? `org:${event.organizationId}:fleet` : "platform:clearing");
...
p_debit_account_key: inflow ? "platform:clearing" : driverKey,
p_credit_account_key: inflow ? driverKey : "platform:clearing",
```

If a `ledger_event:*` row has neither a valid UUID `driverId` nor an `organizationId`, `driverKey` resolves to `"platform:clearing"` — the *same* value used for the other leg — producing a debit=credit=`platform:clearing` no-op entry, identical in shape to the two you already deleted for toll. There's no DB-level constraint preventing `debit_account_id = credit_account_id` either (checked `ledger.entries` schema — no such CHECK constraint), so nothing stops this at the database layer. Given the historic-orphan-driver-ID problem you're already patching around in `ledger._ensure_account()` (§3.5), it's likely this has produced, or will produce, more of these. Worth a targeted query for `ledger.entries WHERE debit_account_id = credit_account_id` before you trust the numbers.

### 3.5 Orphaned historic driver IDs lose attribution silently

`20260807151000_ledger_ensure_account_orphan_drivers.sql` (`ledger._ensure_account`) handles historic fleet KV events whose `driverId` no longer exists in `auth.users` by setting `owner_user_id = NULL` on the created `ledger.accounts` row rather than failing. This is a reasonable defensive choice (better than a hard FK failure blocking dual-write), but it means: any account created this way is now anonymous in the new ledger — you can't trace it back to "which driver" from `ledger.accounts` alone, only from the `account_key` string pattern if it happens to embed the ID. Worth a query to see how many accounts currently have `owner_user_id IS NULL` and whether that's an acceptable number or a sign of a bigger ID-drift problem between `auth.users` and historic KV records.

---

## 4. Coverage gaps and things to double-check before signing off

### 4.1 Backfill completion is not verified anywhere automated

Your new migration adds `ledger_backfill_kv_ledger_event_batch(limit)` and `ledger_backfill_rides_payment_journal_batch(limit)` — manual, paged (200 rows default, 500 max) RPCs meant to catch up historic rows that predate dual-write going live. I found no cron job, scheduled edge function, or CI step that calls these on a schedule — they look like operator-run, one-off tools. Before trusting "green" reconciliation numbers, confirm:
- Both backfills have actually been run to completion (repeatedly, until `processed = 0`), not just written.
- There isn't a third legacy source needing an equivalent backfill (Dash historic transactions — there's no backfill RPC for `payments.transactions` at all, consistent with §3.2's finding that Dash reconciliation isn't wired up).

### 4.2 Async dual-write failures are logged, not alerted

Every dual-write function (`dualWriteDash.ts`, `dualWriteRides.ts`, `dualWriteToll.ts`, `unified_ledger_dual_write.ts`) logs a structured `unified_dual_write` JSON line on failure (`metrics.ts`) and, in most call sites, the *caller* swallows the exception with `console.error` so the original money-moving request still succeeds (correct choice — you don't want a ledger mirror bug to block a real payment). But that means a failed dual-write is only visible if someone is actively grepping logs for `event":"unified_dual_write","status":"fail"`. The plan doc's own Phase-A note says "Soak: watch `unified_dual_write` fails for 48h before Phase B" — confirm that watching actually happened (a log-based alert, a saved query, a dashboard) rather than being an intention that got skipped once the flags were flipped on 2026-07-06.

### 4.3 Rides: one dual-write path is dead code — safe, but worth deleting for clarity

`dualWriteRideLedgerLine()` in `dualWriteRides.ts:133` is marked `@deprecated`, has zero call sites anywhere in `supabase/functions`, and its own docstring says it was "removed to fix double-counting." It's inert, not a risk — just noise if you're trying to reason about what actually writes to the ledger. Fine to leave as-is per your "don't change code" instruction for this audit; flagging so it doesn't get re-wired by accident later.

### 4.4 Merchant payout reversals — confirm coverage

`POST /payouts` (creating a merchant payout) dual-writes correctly (`financeRoutes.ts:77-87`, `kind: "merchant_payout"`). I did not fully trace whether payout **hold/cancel/reverse** transitions (`POST /payouts/:id/hold` and any cancel/fail endpoint) post a compensating ledger entry, or whether a held-then-cancelled payout leaves a phantom debit in the new ledger with nothing reversing it. Worth a direct check against `financeRoutes.ts` past line 90 (I read through the `hold` handler start but not the full reversal flow) before relying on merchant-side balances in `ledger.entries`.

### 4.5 Out of scope, correctly not dual-written (confirmed, not a gap)

Three fleet-server/delivery "ledger"-named files have no dual-write hooks at all. I checked each — this is correct, not an oversight:
- `payment_ledger_line_controller.tsx` — a *display/reporting* projection of `rides.ledger_lines` and Uber CSV data, not a source of truth itself.
- `maintenance_service_ledger_core.ts` — explicitly commented "ops truth, not finance."
- `delivery/inventory/ledgerService.ts` — inventory *quantity* tracking (`inventory_ledger`), not money.

No action needed here; listing them so you know they were checked and ruled out rather than missed.

### 4.6 Migration history: duplicate-named files are harmless

`20260706140000_ledger_schema_core.sql` (443 lines, real DDL) has several same-named siblings later the same day (`20260706180135_ledger_schema_core.sql` etc., all 3-line files). Each is a no-op stub: `SELECT 1;` with a comment "History alignment stub: already applied on remote... Do not re-run DDL here." This is normal Supabase local/remote migration-history reconciliation, not a bug or a sign of drift — confirmed by reading the actual file contents, not just the names.

### 4.7 Unrelated changes bundled in this branch

`apps/fleet/src/components/database/{BusinessTypeCustomers,DatabaseManagement,LedgerColumnSettings}.tsx` have small diffs in this branch, but they're an icon-extraction refactor (`BIZ_ICON` moved to `@roam/admin-core/customers/businessTypeUi`) unrelated to the money-ledger unification work. Not a ledger risk, just noting it's mixed into the same branch in case you want a separate commit/PR for it.

---

## 5. What to copy over — checklist

Since the dual-write pipes are all in place and (mostly) running, "copying over" is really "verifying nothing has been silently dropped." Concretely, before you'd feel safe:

- [ ] **Dash**: build the missing `legacy_count` query for `payments.transactions` / `payments.merchant_payouts` (§3.2) — this is the only island with literally no verification today.
- [ ] **Dash**: confirm there's a historic backfill (or that dual-write went live before any transactions existed) — no backfill RPC currently exists for this island (§4.1).
- [ ] **Fix** the `product: "rides"` → should be checking both `roam_rides` and `roam_driver`, or the real product taxonomy — in `platformLedger.ts` (§3.1) before trusting or re-enabling that read path.
- [ ] **Fix or replace** `checkProductBalances()` with a real double-entry check (§3.3) — right now it can't catch a real imbalance.
- [ ] **Add the same `missing_organization_id`-style guard** (or equivalent) to `fleetDualWriteCanonicalEvent()` that `dualWriteTollLedgerKv()` already has, to stop new self-referencing entries (§3.4).
- [ ] **Query** `ledger.entries WHERE debit_account_id = credit_account_id` and `ledger.accounts WHERE owner_user_id IS NULL` to size the existing damage from §3.4/§3.5 before deciding whether more cleanup migrations like `20260807150000` are needed.
- [ ] **Confirm** `LEDGER_DUAL_WRITE_ENABLED` and `LEDGER_READ_UNIFIED` current values in Supabase secrets — the plan doc says both are ON as of 2026-07-06, verify that's still true and matches what you intend.
- [ ] **Confirm** merchant payout hold/cancel reversal coverage (§4.4).
- [ ] **Decide** whether `ledger.financial_events` (toll/fuel/cash/earnings/payout via `postFinancialEvent`) needs to become the actual read source for Fleet driver statements, or whether that migration is a separate, later effort — right now driver-overview still reads `ledger_event:*` KV directly, so `ledger.entries` isn't in that critical path at all yet.

## 6. Recommended sequencing (not a decision for me to make, just the standard order)

1. Fix the four concrete bugs in §3 (they're all small, isolated).
2. Close the Dash reconciliation gap (§3.2) so all five islands have a real, trustworthy delta=0 signal — this is your actual "is the copy complete" answer, and right now you don't have it for the biggest revenue-bearing island.
3. Run backfills to completion, re-check reconciliation is green across *all five* islands (not four) for a sustained period (your own plan doc suggests 48h+ soak on write failures; I'd extend that to "green reconciliation" too).
4. Only then consider flipping real product reads (payouts, statements, balances) over to `ledger.entries` per-island, starting with the one with the strongest guarantees (`ledger.financial_events`-backed toll/fuel/cash, since that's already atomic) and ending with Dash (weakest guarantees today).
5. Decommission (Phase 16 in your plan doc) stays "Deferred" until each island has been read from the new ledger in production, uneventfully, for a defined soak period per your own prime directive ("Nothing existing is deleted, dropped, or turned off until its replacement has run in production, been verified, and soaked for a defined period — with explicit sign-off required").

Nothing in this audit suggests the architecture is wrong — the schema, idempotency design, and atomic `financial_events`→`ledger.entries` pattern are solid. The gap is specifically in **verification tooling** (Dash reconciliation, the balance check) and **a couple of small, fixable bugs** in code that hasn't been exercised in production yet. That's a normal state for this phase of a migration — it's just not a state to retire anything from.
