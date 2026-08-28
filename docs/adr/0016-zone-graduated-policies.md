# ADR 0016 — Zone graduated policies

**Status:** Accepted  
**Date:** 2026-08-28

## Context

Binary exclude-only model cannot express surcharge, courier opt-in, or manager approval.

## Decision

`zone_policy jsonb` on market and scoped zones:

```json
{ "action": "block" | "surcharge" | "courier_opt_in" | "manager_approval" | "cash_disabled", "params": {} }
```

Default `{ "action": "block" }`. Evaluation returns `policy` on result; integrations:

- **surcharge** → pricing quote modifier (future param: `amount_jmd`)
- **courier_opt_in** → dispatch flag
- **manager_approval** → ops queue
- **cash_disabled** → checkout payment filter

## Consequences

- Block behavior unchanged for existing rows.
- Non-block policies require downstream wiring per action.
