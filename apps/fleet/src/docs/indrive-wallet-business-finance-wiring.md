# Wiring InDrive Wallet into Business Finance

**Status: wired (2026-07-20).** Canonical `wallet_credit` is the source of truth for
loads. Loads are **transfers** (bank/cash → platform wallet), not P&L expenses.
Platform fees use shared recognition (`platformFeeRecognition.ts`) so P&L and
Wallet Center cannot drift.

**Org-tag fix (2026-07-20):** Older `wallet_credit` / InDrive `fare_earning` rows
lacking `organizationId` were backfilled. Fleet reads include null-org legacy
rows; new credits copy org from the transaction when present.

## Accounting model

| Event | Classification | Where shown | Operating profit? |
|-------|----------------|-------------|-------------------|
| Wallet top-up (`wallet_credit`) | Transfer | Cash & Bank, Overview Transfers, Wallet Center | No |
| Platform commission | Expense | P&L Platform fees + platform split | Yes |
| Trip earnings | Revenue (pre-commission gross when known) | P&L Gross | Via net trip |

## How it works

**1. Canonical ledger write on every top-up.** Quick load → `transaction` +
`wallet_credit` via `appendCanonicalWalletCreditIfEligible`.

**2. Loads from canonical.** `computeIndriveWalletLoadsFromLedgerEntries` sums
`wallet_credit`. Raw `transaction:*` is write-path only.

**3. Fees — shared recognition.** [`platformFeeRecognition.ts`](../utils/platformFeeRecognition.ts):
- Explicit: `|netAmount|` on `platform_fee`
- Fallback: `gross − net` on `fare_earning` when no explicit fees for that platform
- Fare gross for P&L: `grossAmount` when it exceeds net (avoids double-counting)

InDrive Wallet metrics wrap the same helper filtered to InDrive.
Business Finance P&L uses it for all platforms.

**4. Fleet endpoint.** `GET /ledger/indrive-wallet/fleet` — one scan for Wallet
Center (replaces N+1).

**5. Business Finance surfaces**
- Cash & Bank: **Bank → InDrive wallet** (period transfers + short drivers)
- Overview: **Transfers** card (not under Money out)
- P&L: **no** wallet loads line; Maintenance remains the only “Not tracked yet”
- Risks: `walletShortDriverCount`

## Deploy

```bash
npx supabase functions deploy make-server-37f42386 --use-api
```
