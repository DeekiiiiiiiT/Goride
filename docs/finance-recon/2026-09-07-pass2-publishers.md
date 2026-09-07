# Close Program Pass 2 — Earnings + Toll statement publishers

**Goal:** unblock Close Week. Close Week's cross-system invariants require a
signed `fuel`, `toll` **and** `earnings` week_statement per driver-week. Fuel
already publishes at finalize; Pass 2 adds the earnings and toll lanes.

## What changed

1. **Earnings publisher** — `driver_financial_periods.ts` publishes a closed
   `earnings` statement after every successful period persist. Idempotent: an
   unchanged standing statement is not re-versioned.
2. **Toll week seal** — `toll_week_seal.ts` (`sealTollWeek`) publishes a closed
   `toll` statement per active driver from the period columns. `netLoss` is
   derived so the four-card identity (Spend − Reimbursed − Charged − NetLoss = 0)
   always balances.
   - Route: `POST /make-server-37f42386/toll/periods/:weekKey/seal`
     (permission `toll.manage`, org-scoped). Body (all optional):
     `{ chargedAmountsMajor, nettingByDriver, force }`.
3. **Auto-seal precondition** — `week_close.ts` `previewWeekClose` and
   `closeWeek` call `ensureCloseLaneStatements` first: any driver missing the
   earnings or toll lane is backfilled (earnings from period columns, toll via
   `sealTollWeek`) before invariants run. This unblocks Close Week without any
   wizard change.

## Amounts (canonical minor-unit keys)

- **earnings**: `passengerCash` (= cash_collected), `driverShare`,
  `companyShare` (= fleet_share), `tipsPaidToDriver`, `gross` (= earnings_gross),
  `settlementAmount`.
- **toll**: `totalSpend` (= toll_spend), `chargedToDriver`, `reimbursed`,
  `netLoss` (derived), `cashWashSpend` (= toll_cash_spend), `tagSpend`.

`passengerCash`, `driverShare`, `companyShare`, `totalSpend`, `chargedToDriver`,
`reimbursed` are the keys `closeInvariants` reads.

## Backfill

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/backfill-week-statements.mjs [--since=YYYY-MM-DD] [--org=<uuid>] [--dry]
```

Reads `ledger.driver_financial_periods` and publishes earnings + toll statements
matching the `publishWeekStatement` shape (canonical keys + `source_hash`).
Idempotent — unchanged closed lanes are skipped; changed lanes get version n+1
and supersede the prior closed row. Use `--dry` to preview counts.
