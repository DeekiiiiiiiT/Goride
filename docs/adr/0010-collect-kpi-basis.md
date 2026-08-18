# ADR 0010: Collect KPI basis

**Status:** Accepted — 2026-08-18

## Decision

The Collect desk shows two figures, never mixed: **Driver owes (settled)** from `driver_owes` rows, and **Cash held (not yet finalized)** from `cash-held` rows.

## Consequences

`DriverSettlementsPage` KPIs split. Row chips already distinguish the two queues.
