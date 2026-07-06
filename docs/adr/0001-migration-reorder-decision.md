# ADR 0001: Migration Reorder Decision

**Status:** Accepted — owner sign-off 2026-07-06 (Phase 2)

## Context

Three migration files were git-committed last but their filename timestamps sort *before*
the migration that creates the tables they `ALTER`:

- `supabase/migrations/20260615232859_switch_to_card_settlement.sql`
- `supabase/migrations/20260615233500_cash_settlement_disputes.sql`
- `supabase/migrations/20260615234000_admin_settlement_overrides.sql`

...all sort before `supabase/migrations/20260618120000_cash_settlement_wallet.sql`, which
creates `rides.payment_accounts` and `rides.payment_journal_entries`. A from-scratch
migration replay (fresh environment, CI, disaster recovery) in filename order fails, or
(if patched around) ends up with an `entry_type` CHECK constraint missing 6 types that
shipping code actively emits.

Production most likely has the correct final state, applied out-of-order historically.
This ADR is about fixing the files on disk so replay is possible going forward — not about
whether production itself is broken today.

## Options

- **A1 — Resequence via `git mv`.** Rename the three files to timestamps immediately after
  `20260618120000` (content unchanged). Requires a pre-flight check of production's
  `supabase_migrations.schema_migrations` table (confirm the old version strings are
  already applied) plus a compensating one-off SQL script so the CLI doesn't try to
  reapply them under new names.
- **A2 — Corrective forward migration.** Add a new migration that only re-asserts the
  final `entry_type` CHECK idempotently, without fixing replay order for the other DDL
  (the disputes table, admin-overrides table, `shortfall_payment_method` column) those
  three files also introduce. Narrower fix; from-scratch replay of those specific
  statements may still need separate verification.

**Recommendation:** A1, provided the pre-flight confirms it's safe on every deployed
environment.

## Decision

**A1 — Resequence via `git mv`.** Owner approved 2026-07-06.

### Pre-flight findings (GoRide production, `csfllzzastacofsvcdsc`)

| Check | Result |
|---|---|
| `rides.payment_accounts` exists | Yes |
| `rides.payment_journal_entries` exists | Yes |
| `20260615232859` in `schema_migrations` | No |
| `20260615233500` in `schema_migrations` | No |
| `20260615234000` in `schema_migrations` | No |
| `20260618120000` in `schema_migrations` | No |

DDL is live in production but these version strings were never recorded — likely applied
via manual SQL or an earlier deploy path. **A1 is safe to proceed:** Phase 3 will rename
the files on disk and ship a compensating migration that inserts the new version strings
only (no DDL replay), so `supabase db push` on production does not re-apply statements.

## Consequences

- **Executed 2026-07-06 (Phase 3):** four files resequenced via `git mv` (three per ADR plus
  `cash_settlement_admin_grants`, which referenced tables created by the disputes/overrides
  migrations and would have broken replay if left at `20260616121500`):

  | Old version | New version | File |
  |---|---|---|
  | `20260615232859` | `20260618120001` | `switch_to_card_settlement.sql` |
  | `20260615233500` | `20260618120002` | `cash_settlement_disputes.sql` |
  | `20260615234000` | `20260618120003` | `admin_settlement_overrides.sql` |
  | `20260616121500` | `20260618120004` | `cash_settlement_admin_grants.sql` |

- Bookkeeping migration: `20260706120000_ledger_phase3_migration_resequence_bookkeeping.sql`
  (removes stale version strings; inserts new ones for envs where DDL predates history).
- Replay order is now: `20260618120000_cash_settlement_wallet` → `…001` → `…002` → `…003` → `…004`.
- Follow-up: audit duplicate `20260618120000` / `20260619120000` timestamps (separate issue).
- Promote `verify-migrations-replay.yml` to required check once CI replay is green.
