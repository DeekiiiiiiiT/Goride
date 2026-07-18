# Finance Workbench — Phase 0

## Redirect map (Financial Analytics → one finance home)

| Old FA tab | Destination |
|------------|-------------|
| Cash Flow Analysis | Business Finance → Overview / Cash & Bank |
| Expense Management → Approvals | Business Finance → Workbench → Approvals |
| Expense Management → Fuel/Maint/Recurring | Fuel Management / Maintenance Hub (do not rebuild) |
| Payroll System | Drivers → Settlement / Payout (SSOT) via Workbench → Settlement |
| Reconciliation Report | Business Finance → Driver Balances |
| Report Center mashup P&L | Business Finance → P&L + Workbench → Close & Export |

## Keep

- Transaction List (`transaction-list` / TabbedTransactionList)
- Bank Deposits, Cash Retag, InDrive Wallet — **under Business Finance sidebar** (not Fleet Ops / Fleet Financials)
- Driver Settlement math (untouched)

## Sidebar (unified)

```
Business Finance
  Home (P&L / Cash / Workbench tabs)
  Bank Deposits
  Cash Retag
  InDrive Wallet
  Transaction List
```

Specialist desks show **Business Finance › Desk** breadcrumb + Back; period handoff seeds Bank / Wallet date filters.

Fleet Ops keeps Fuel + Toll only.

## Kill (never rebuild)

- Mocked CashFlowDashboard KPIs
- Toy 70% Payroll calculator
- FleetFinancialReport non-SSOT cash recon
- ReportCenter trip-mashup P&L
- FA Fuel/Maintenance/Recurring local-only trackers

## Product note

Expense Approvals still uses `api.saveTransaction` on Pending Expense rows — relocate into Workbench with same writers.
