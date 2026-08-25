# Stitch — Consumption Reconciliation (fuel period workflow)

Screens from Roam Fleet APP (Precision Operations). Design tokens: `apps/fleet/DESIGN.md`.

- consumption-reconciliation-landing
- fuel-week-wizard-data-quality
- fuel-week-wizard-money-clarity — **current** week-wizard visual (payment source vs who owes)
- finalize-v2
- reset-period-modal

Production entry: `FuelReconciliationDashboard` ? landing cards ? 6-step `FuelPeriodWizard`. Dense table is drill-down on Data quality only.

**Money clarity (2026-08):** KPI strip splits into (1) Where money came from — gas card vs cash from earnings vs total, (2) Who ends up paying — company keeps / driver charge / unexplained. Stitch HTML uses fake `$XX` placeholders; app binds `sumGasCardSpendForReport`, `sumPaidByDriverForReport`, `totalGasCardCost`, `companyShare`, `driverShare`, `miscellaneousCost`.
