# Unified Ledger Platform — Plan Index

This document tracks the multi-phase effort to unify Roam's five currently-disconnected
money-movement systems (rides cash-settlement journal, driver/fleet KV canonical ledger
events, toll ledger, Dash `payments.*` schema, `rides.ledger_lines` reporting) into one
platform-wide double-entry `ledger` schema, with each product admin portal (and Roam
Dominion) getting a scoped view into it rather than its own copy of the truth.

**Scope note:** this document does **not** modify or re-litigate the migration tracked in
[`docs/LEDGER_LEGACY_INVENTORY.md`](./LEDGER_LEGACY_INVENTORY.md) (the `ledger:%` → `ledger_event:*`
migration within the fleet/driver KV system). That migration is treated here as already
complete; `ledger_event:*` is simply one of the five sources being unified below.

## Prime directive

No breakage of existing production functionality. Every phase is additive and reversible
before anything is removed. Nothing existing is deleted, dropped, or turned off until its
replacement has run in production, been verified, and soaked for a defined period — with
explicit sign-off required before any decommission step executes.

## Phases

| Phase | Focus | Status |
|---|---|---|
| 0 | Governance/CI safety net | Complete |
| 1 | Regression tests for systems about to change | Complete |
| 2 | Owner decision checkpoint (bug-fix strategy) | Complete |
| 3 | Fix migration-ordering bug | Complete |
| 4 | Fix atomic-write bug | Complete |
| 5 | Unified ledger schema ADR | Complete |
| 6 | Build ledger core (unused) | Complete |
| 7 | Dual-write: rides cash settlement | Complete |
| 8 | Dual-write: KV canonical events | Complete |
| 9 | Dual-write: toll ledger | Complete |
| 10 | Dual-write: Dash payments | Complete |
| 11 | De-dup `TripLedgerPage` | Complete |
| 12 | Per-island read cutover | Scaffold ready — `LEDGER_READ_UNIFIED_RIDES\|FLEET\|TOLL\|DASH` OFF until soak + shadow sign-off |
| 13 | Portal views + org-scoping decision | Complete |
| 14 | Dominion unified feed | Complete |
| 15 | Reconciliation/anomaly detection | Complete (Dash legacy count + soak clock + Phase D retired islands) |
| 16 | Decommission (per island) | Ready (gated) — backup/hard-delete scripts; confirm env required; not executed |
| 17 | Scaling/archival (future, non-blocking) | Deferred |

Decision records for the two owner-decision gates (Phase 2 ✅, Phase 13 ✅) live in
[`docs/adr/`](./adr/).

**Phase 2 decisions (2026-07-06):** A1 migration resequence + B1 atomic posting RPC.
See [`0001`](./adr/0001-migration-reorder-decision.md) and [`0002`](./adr/0002-atomic-posting-rpc-pattern.md).

**Phase 5 schema (2026-07-06):** `ledger` schema design — [`0005`](./adr/0005-unified-ledger-schema.md).
Org scoping Option 1 (RLS) locked in [`0004`](./adr/0004-org-scoping-for-ledger-reads.md).

**Phase 13 views (2026-07-06):** Invoker-mode scoped views — [`0003`](./adr/0003-definer-vs-invoker-views.md).

## Production cutover flags

**Status (2026-08-07):** Dual-write + Dominion feed ON. Product primary-read flags **OFF**.
48h soak clock started (see Dominion Unified Ledger → Phase 0 panel / `ledger_soak_status()`).

| Flag | Effect |
|---|---|
| `LEDGER_DUAL_WRITE_ENABLED=1` | Mirror new money movement into `ledger.*` (Phases 7–10) |
| `LEDGER_DUAL_WRITE_<ISLAND>=0` | Phase D per-island dual-write kill (default ON when global on) |
| `LEDGER_LEGACY_WRITE_<ISLAND>=0` | Phase D stop appending to KV/island money stores |
| `LEDGER_READ_UNIFIED=1` | Dominion unified feed (not product cutover) |
| `LEDGER_READ_UNIFIED_RIDES\|FLEET\|TOLL\|DASH=1` | Phase C primary product reads from `ledger.entries` |
| `LEDGER_SHADOW_READ=1` | Phase B shadow compare (no UX change) |
| `LEDGER_PHASE_D_RECON=1` + `LEDGER_RETIRED_ISLANDS=` | Mark retiring islands in Dominion recon |

Dual-write is safe while product read flags stay off. Phase 16 hard delete stays gated
(`LEDGER_HARD_RETIRE_CONFIRM` + `--execute`) until soak → shadow → read flip → write-stop
sign-off. Disaster rollback after E: restore backup + re-enable legacy flags.

**Deploy:** Edge `rides`, `make-server-37f42386`, `toll-brain`, `payments`, `delivery`;
Dominion admin UI for Unified Ledger / soak panel.

## Key artifacts (Phases 6–15)

| Phase | Migration / module |
|---|---|
| 6 | `supabase/migrations/20260706140000_ledger_schema_core.sql` |
| 7–10 | `supabase/functions/_shared/unifiedLedger/*`, fleet `unified_ledger_dual_write.ts` |
| 12 | `LEDGER_READ_UNIFIED` in `platformLedger.ts` |
| 13 | `supabase/migrations/20260706150000_ledger_scoped_views.sql` |
| 14 | `GET /rides/admin/ledger/unified/feed`, Dominion `UnifiedLedgerFeed.tsx` |
| 15 | `GET /rides/admin/ledger/unified/reconciliation` |

## Two known bugs fixed before the unified ledger is built (Phases 2–4)

1. **Migration replay bug** — three migration files sort before (by filename) the migration
   that creates the tables they `ALTER`, so a from-scratch replay fails. See
   `docs/adr/0001-migration-reorder-decision.md`.
2. **Non-atomic journal writer** — `postPaymentJournal()` in
   `supabase/functions/_shared/paymentAccounts.ts` updates two account balances via two
   separate sequential `UPDATE`s with no row lock or transaction, allowing a race under
   concurrent postings. See `docs/adr/0002-atomic-posting-rpc-pattern.md`.
   **Proof:** `supabase/functions/_shared/paymentAccounts.test.ts` →
   `concurrent postings preserve credited account balance` (passes after Phase 4).
