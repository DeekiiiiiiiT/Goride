# Uber report late (toll dispute alert)

## What it means

The weekly Uber driver report for a past week is not uploaded yet. The alert fires on **day 3** after that week ended (Sunday).

## Why it matters

- Refunds from Uber are matched only after that week's report is **in**.
- If a dispute stays open **23 days** after you marked it sent without the report, the system closes it as **`no_report`** and the **fleet pays**.

## What to do

1. Open **Week Reconciliation** for that week.
2. Upload the **Uber weekly report** (`uber_bundle`) for the week shown in the alert.
3. Wait for the next toll sweep (after import or nightly). The alert should clear.

## How to confirm it cleared

In toll alerts, the `report_late:<platform>:<week_start>` row should have **resolved_at** set after coverage is complete for Monday–Sunday of that week.