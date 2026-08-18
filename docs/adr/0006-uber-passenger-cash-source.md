# ADR 0006: Uber passenger cash source

**Status:** Accepted — 2026-08-18

**Depends on:** [FINANCIAL_INTEGRITY_AUDIT](../FINANCIAL_INTEGRITY_AUDIT.md) D1

## Context

Driver Settlements and Driver Overview disagree on Uber passenger cash for the same week (Kenny Aug 3–9: $84,172.52 vs $55,147.05). Three sources exist: ledger `payout_cash`, CSV rollup, trip cash.

## Decision

Ledger `payout_cash` is the only Uber passenger-cash figure, after de-duplicating same-date/same-amount rows (prefer the tagged driverId). CSV and trip sums are checks. A difference > $0.01 renders as a warning and never overwrites.

## Consequences

Rebuild must call `foldPayoutCashByWeek`. Overview must stop overwriting Uber cash with CSV.
