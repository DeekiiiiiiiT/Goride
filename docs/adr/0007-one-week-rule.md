# ADR 0007: One week membership rule

**Status:** Accepted — 2026-08-18

## Decision

`periodKeyFor(event, America/Jamaica)` assigns every dollar to a Monday–Sunday week. The ±14-day grace band, 5–10 day statement heuristic, and raw UTC string compares are retired. Statements that span weeks split at import.

## Consequences

All engines import `@roam/finance-core` `periodKeyFor`. `canonicalEventInSelectedWindow` becomes a strict calendar-day filter.
