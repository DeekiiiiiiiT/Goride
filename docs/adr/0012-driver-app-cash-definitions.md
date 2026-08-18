# ADR 0012: Driver-app cash definitions

**Status:** Accepted — 2026-08-18

## Decision

The driver app uses the fleet desk definitions: `amountOwed` is passenger cash only (never float). Fuel credits live on settlement, not inside Cash Returned. Week buckets use fleet timezone.

## Consequences

Driver `cashSettlementCalc` matches fleet. Settlement math imports `@roam/finance-core`.
