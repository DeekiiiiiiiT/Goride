# Stitch — Consumption Reconciliation (fuel period workflow)

Screens from **Roam Fleet APP** (Precision Operations).

## Production visual references
| Screen | Stitch id | Local folder |
|--------|-----------|--------------|
| Fuel Week Wizard - Data Quality (Redesign) | `de37d1ddddbb450f8698e1e23ef27697` | `fuel-week-wizard-data-quality-redesign/` |
| Fuel Week Wizard - Unexplained Fuel | `9035519da7d24b3782b5427ca1891124` | (Stitch cloud; wired in `FuelPeriodWizard` leakage step) |
| Finalize | `bee123c6d77748adaa6a99c9fde8457c` | `finalize-v2/` |

## Other design exports
- consumption-reconciliation-landing
- fuel-week-wizard-data-quality (legacy dense table)
- reset-period-modal

The wizard is the **production recon entry** (`FuelReconciliationDashboard` -> landing cards -> 6-step wizard). Dense spreadsheet is opt-in via "Show full cost breakdown" on Data Quality (`FuelDataQualityStep`).
