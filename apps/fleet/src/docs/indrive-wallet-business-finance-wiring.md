# Wiring InDrive Wallet into Business Finance

**Status: wired (2026-07-20).** Canonical `wallet_credit` is the source of truth for
loads. Business Finance sums period loads from in-memory ledger events; Wallet
Center and Overview short-driver risk use one fleet endpoint (no N+1).

**Org-tag fix (2026-07-20):** Older `wallet_credit` rows lacked `organizationId`,
so the fleet Period total (strict org filter) showed $0 while Recent top-ups
(driver-scoped list) still showed them. Missing org tags were backfilled from
the driver’s org; fleet reads now include null-org legacy rows (same pattern as
statement summary); new credits copy org from the transaction when present.

## How it works

**1. Canonical ledger write on every top-up.** `IndriveWalletCenterPage.tsx`'s
"Quick load" form calls `api.saveTransaction` with a transaction built by
[indriveWalletLoad.ts](../utils/indriveWalletLoad.ts)
(`category: 'InDrive Wallet Credit'`). On save, the server appends a
`wallet_credit` canonical ledger event via
`appendCanonicalWalletCreditIfEligible`
([canonical_from_ops.ts](../supabase/functions/server/canonical_from_ops.ts)).
Deletes remove the matching canonical event via
`deleteCanonicalLedgerBySource("transaction", [id])`.

**2. Loads + fees both from canonical.** Shared helpers in
[indriveWalletMetrics.ts](../utils/indriveWalletMetrics.ts):
- Loads: `wallet_credit` only (`computeIndriveWalletLoadsFromLedgerEntries`)
- Fees: InDrive `platform_fee`, else fare gross−net gap
  (`computeIndriveWalletFeesFromLedgerEntries`)
- Fleet rollup: `buildIndriveWalletFleetFromLedger` (alias-aware driver ids)

Raw `transaction:*` with category `InDrive Wallet Credit` remains the
**write-path** record; reads must not scan it for loads.

**3. Per-driver endpoint.** `GET /ledger/driver-indrive-wallet` — loads and
fees from canonical. Used by single-driver hooks (`useIndriveWallet`).

**4. Fleet endpoint (replaces Wallet Center N+1).**
`GET /ledger/indrive-wallet/fleet?startDate=&endDate=` returns
`{ totals: { periodLoads, periodFees, shortDriverCount }, drivers: [...] }`.
`IndriveWalletCenterPage` calls this once via `api.getIndriveWalletFleet`.

## Business Finance

**1. Period loads.** `fetchBusinessFinanceBundle.ts` sums `wallet_credit` from
already-fetched `ledgerEvents` (no extra network call for the $ total).

**2. Short-driver risk.** Same bundle calls `getIndriveWalletFleet` (try/catch,
non-fatal) → `risks.walletShortDriverCount` + `incompleteSources` line + Cash
Bank `walletLoads.shortDriverCount`. Overview shows an amber risk row with deep
link to InDrive Wallet.

**3. P&L — intentional non-tracking.** `wallet_loads` stays
`amount: null, tracked: false`. Wallet loads are a funding transfer; InDrive’s
cut is already in Platform fees / `platformSplit`. Do not add `wallet_credit` to
Expenses `RECOGNIZED`.

## Deploy note

Edge function source is
`apps/fleet/src/supabase/functions/server/index.tsx` (imported by
`supabase/functions/make-server-37f42386`). Redeploy after server route changes:

```bash
npx supabase functions deploy make-server-37f42386 --use-api
```
