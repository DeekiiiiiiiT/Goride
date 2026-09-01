# V21 — Recorded decision (alerts / keep-alive removals)

**Date:** 2026-09-01  
**Context:** Rush integration commits removed the 45s `/health` keep-alive and the alerts/notifications subsystem (`alertEngine`, `NotificationCenter`, etc.).

## Decision

**Accept removal** for the Rush programme scope. Restoring alerts is a separate product initiative, not a Rush integration blocker.

## Rationale

- Removals are clean (no dangling imports).
- Rush rollout does not depend on fleet alerts or cold-start keep-alive.
- Re-introduction should be scoped as its own ticket with UX and ops requirements.

## Follow-up (optional backlog)

- Fleet alerts v2 with Rush-aware supply health integration
- Edge keep-alive strategy via platform cron or Vercel/Deploy config
