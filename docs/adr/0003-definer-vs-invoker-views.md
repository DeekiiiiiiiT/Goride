# ADR 0003: Definer vs. Invoker Views for Ledger-Scoped Reads

**Status:** Accepted (2026-07-06)

## Context

All 51 existing `public.<schema>_<table>` passthrough views in this codebase use plain
`CREATE VIEW` (definer-mode). A prior attempt at `security_invoker = true` on 3 views
(`supabase/scripts/setup-rides-admin-api.sql`) was explicitly reverted in a later migration
(`20260517220000_rides_admin_views_definer.sql`, comment: "fixes permission errors for
service_role") back to definer-mode.

Every existing ledger-reading caller in this codebase authenticates as `service_role`,
which bypasses RLS entirely regardless of view mode (RLS bypass is a role-level
`BYPASSRLS` attribute, not a view-mode setting). This suggests the earlier invoker-mode
failure was very likely a missing **table-level `GRANT`** to `service_role` on the
underlying table (invoker-mode views require the querying role to have a direct grant on
the underlying table, not just the view) — not an RLS-bypass problem.

This matters now because Phase 13 introduces the **first genuinely-scoped (non-passthrough)
views** in the codebase — `ledger_scoped_passenger`, `ledger_scoped_driver`,
`ledger_scoped_fleet`, `ledger_scoped_dominion` — which actually filter by org/portal
rather than just re-exposing a table. Definer-mode would silently bypass the querying
user's RLS entirely, which is exactly wrong for a view whose entire purpose is enforcing
scope.

## Verification step (do before deciding)

Attempt `security_invoker = true` on a throwaway test view in staging, with an explicit
`GRANT SELECT` on the underlying table added for `service_role`, and confirm this resolves
the failure mode the 2026-05-17 revert was working around.

## Recommendation

If verified, use `security_invoker = true` for the **new** ledger-scoped views only — not
retroactively for the 51 existing passthrough views, which stay as-is (no reason to touch
working code).

## Decision

**Invoker mode** for the four new ledger-scoped views (`ledger_scoped_*`), shipped in
`supabase/migrations/20260706150000_ledger_scoped_views.sql`. Underlying `ledger.entries`
and `ledger.accounts` have `GRANT SELECT` to `authenticated` and `service_role` via
public passthrough views; RLS on base tables enforces org scope when callers use
`authenticated` JWTs.

Existing 51 passthrough views remain definer-mode (unchanged).

## Consequences

- Portal reads that query `ledger_scoped_*` as an authenticated user respect RLS on
  `ledger.entries` / `ledger.accounts`.
- `service_role` callers (Edge functions, dual-write) continue to bypass RLS on base tables;
  they use `ledger.entries` / `ledger_post_entry` directly, not scoped views.
- No retroactive migration of legacy passthrough views.
