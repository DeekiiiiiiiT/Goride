# ADR 0002: Atomic Posting RPC Pattern

**Status:** Accepted — owner sign-off 2026-07-06 (Phase 2)

## Context

`postPaymentJournal()` in `supabase/functions/_shared/paymentAccounts.ts` is the one
subsystem in the codebase that's actually built close to correctly — real double-entry
accounts, a DB-enforced idempotency constraint. But its balance updates are two separate
sequential `UPDATE` calls, computed from an in-memory cached "before" value, with no row
lock (`SELECT ... FOR UPDATE`) and no wrapping transaction/RPC. Concurrent postings against
the same account can race and silently corrupt `balance_minor`.

The codebase already contains the correct pattern to copy: `rides_run_cash_settlement_timeout()`
and `rides._ensure_payment_account()` in
`supabase/migrations/20260619120000_cash_settlement_timeout.sql` — a single `plpgsql`
function doing `FOR UPDATE`, `INSERT ... ON CONFLICT DO NOTHING` + `GET DIAGNOSTICS`, and
delta-based balance updates, all inside one implicit transaction.

This decision matters beyond the existing rides journal: Phase 6 generalizes whichever
pattern is chosen here into the platform-wide `ledger.post_entry(...)` RPC that every
future product (tolls, Dash, driver/fleet payouts) posts through.

## Options

- **B1 — Full port to a single atomic Postgres RPC** `rides.post_payment_journal_line(...)`,
  modeled exactly on the existing timeout-function pattern (fixed-order row locking via
  `ORDER BY id ... FOR UPDATE` to avoid deadlocks, `ON CONFLICT DO NOTHING` +
  `GET DIAGNOSTICS`, delta-based updates). `postPaymentJournal()` becomes a thin wrapper
  calling this RPC once per line.
- **B2 — Minimal patch.** Replace the two absolute-value `UPDATE`s with delta-based
  `UPDATE ... SET balance_minor = balance_minor + $delta`, still without a transaction
  wrapper around the full insert+updates sequence. Faster to ship; does not fully close
  the race (an Edge Function crash mid-sequence can still leave a partially-applied line).

**Recommendation:** B1 — because Phase 6 builds the new platform-wide posting RPC as a
generalization of this exact pattern; doing B1 now means Phase 6 generalizes something
already proven in production, not something novel. If B2 is taken as a same-day interim
step, B1 still must land before Phase 6 begins.

## Decision

**B1 — Full atomic Postgres RPC.** Owner approved 2026-07-06.

Regression proof of the bug (Phase 1): `paymentAccounts.test.ts` →
`concurrent postings preserve credited account balance` fails with balance 100 vs expected
200 under parallel calls.

## Consequences

- **Executed 2026-07-06 (Phase 4):**
  - Migration `20260706130000_post_payment_journal_line_rpc.sql` adds
    `rides.post_payment_journal_line` + `public.rides_post_payment_journal_line`.
  - `postPaymentJournal()` now calls the RPC per line (row locks + delta balance updates).
  - Phase 1 concurrency regression test passes (5/5).
- Phase 6 `ledger.post_entry(...)` generalizes this RPC pattern.
