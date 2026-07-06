# ADR 0005: Unified Ledger Schema

**Status:** Accepted — 2026-07-06 (Phase 5)

**Depends on:** [ADR 0002](./0002-atomic-posting-rpc-pattern.md) (atomic posting RPC pattern),
[ADR 0004](./0004-org-scoping-for-ledger-reads.md) (RLS org scoping — Option 1).

## Context

Roam has five disconnected money-movement stores (see
[LEDGER_UNIFICATION_PLAN](../LEDGER_UNIFICATION_PLAN.md)):

| Island | Store today | Grain | Org scope today |
|---|---|---|---|
| **R1** Rides cash journal | `rides.payment_accounts` + `rides.payment_journal_entries` | Double-entry lines | Per user account keys |
| **R2** Driver/fleet KV | `ledger_event:*` in `kv_store_37f42386` | Canonical events | `organizationId` on JSON blob |
| **R3** Toll KV | `toll_ledger:*` in `kv_store_37f42386` | Toll records | Fleet org via vehicle/driver |
| **R4** Dash payments | `payments.*` | Intents, txns, refunds, payouts | Merchant/courier ids + RLS |
| **R5** Rides reporting | `rides.ledger_lines` | Fare-breakdown report rows | Per ride/driver/rider |

None of these share a chart of accounts, idempotency namespace, or reconciliation surface.
Phase 6 introduces a **new, unused** `ledger` schema that becomes the long-term SSOT; Phases
7–10 dual-write into it while legacy stores remain authoritative for reads.

## Decision

Adopt a **Postgres `ledger` schema** with:

1. **Double-entry journal** (`accounts` + `entries`) in **minor currency units** (`BIGINT`).
2. **One atomic write path:** `ledger.post_entry(...)` RPC, generalized from
   `rides.post_payment_journal_line` (ADR B1).
3. **Source linkage** via `ledger.source_receipts` so every unified line traces to exactly
   one legacy row/event (dual-write + reconciliation).
4. **Org tenancy** via `ledger.accounts.organization_id` + RLS (ADR 0004 Option 1).
5. **Additive only in Phase 6** — no reads cut over, no legacy writes removed.

## Schema

### `ledger.accounts`

Chart-of-accounts rows. Balances are **derived caches** updated only inside `post_entry`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `organization_id` | `UUID` NULL FK → `public.organizations(id)` | NULL = platform/system accounts |
| `account_key` | `TEXT` NOT NULL | Stable logical key (see Account keys) |
| `account_class` | `TEXT` NOT NULL | `asset` \| `liability` \| `equity` \| `revenue` \| `expense` |
| `owner_user_id` | `UUID` NULL | Rider/driver when applicable |
| `owner_role` | `TEXT` NULL | `rider` \| `driver` \| `merchant` \| `courier` \| `system` |
| `currency` | `TEXT` NOT NULL DEFAULT `'JMD'` | |
| `balance_minor` | `BIGINT` NOT NULL DEFAULT 0 | Updated only in `post_entry` |
| `metadata` | `JSONB` NOT NULL DEFAULT `'{}'` | |
| `created_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | |

**Unique:** `(account_key, currency)`.

**Account keys** (extend existing rides conventions; do not break current keys):

| Pattern | Example | Use |
|---|---|---|
| `platform:receivable` | `platform:receivable` | Rider arrears / platform receivable |
| `platform:clearing` | `platform:clearing` | Card/cash clearing |
| `user:{uuid}:rider` | | Rider wallet |
| `user:{uuid}:driver` | | Legacy driver wallet |
| `user:{uuid}:driver:digital\|cash\|debt` | | V2 driver sub-wallets |
| `org:{uuid}:fleet` | | Fleet-level clearing (tolls, imports) |
| `merchant:{uuid}:receivable` | | Dash merchant settlement |
| `courier:{uuid}:payable` | | Dash courier earnings |

Phase 6 seeds platform system accounts only. Per-user accounts are created lazily inside
`post_entry` (same as `rides._ensure_payment_account`).

### `ledger.entries`

Immutable double-entry lines (one debit account, one credit account per row).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `organization_id` | `UUID` NULL | Denormalized from debit account for RLS |
| `idempotency_key` | `TEXT` NOT NULL | Global unique (see Idempotency) |
| `entry_type` | `TEXT` NOT NULL | Unified taxonomy (see Entry types) |
| `product` | `TEXT` NOT NULL | `rides` \| `fleet` \| `dash` \| `platform` |
| `debit_account_id` | `UUID` NOT NULL FK → `ledger.accounts` | |
| `credit_account_id` | `UUID` NOT NULL FK → `ledger.accounts` | |
| `amount_minor` | `BIGINT` NOT NULL CHECK `> 0` | |
| `currency` | `TEXT` NOT NULL | |
| `request_hash` | `TEXT` NULL | Conflict detection (rides journal parity) |
| `effective_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | Business date |
| `reference_type` | `TEXT` NULL | `ride` \| `trip` \| `order` \| `toll` \| `statement` \| `import_batch` |
| `reference_id` | `TEXT` NULL | UUID or external id |
| `metadata` | `JSONB` NOT NULL DEFAULT `'{}'` | |
| `created_by_user_id` | `UUID` NULL | |
| `created_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | |

**Unique:** `(idempotency_key)`.

**Indexes:** `(organization_id, effective_at DESC)`, `(reference_type, reference_id)`,
`(entry_type, effective_at DESC)`, `(debit_account_id)`, `(credit_account_id)`.

### `ledger.source_receipts`

Maps unified entries back to legacy islands (dual-write + reconciliation).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `ledger_entry_id` | `UUID` NOT NULL FK → `ledger.entries` | |
| `source_system` | `TEXT` NOT NULL | See Source systems |
| `source_id` | `TEXT` NOT NULL | Legacy primary key or KV key suffix |
| `source_idempotency_key` | `TEXT` NULL | Legacy idempotency if different |
| `created_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | |

**Unique:** `(source_system, source_id)` and `(source_system, source_idempotency_key)` WHERE
`source_idempotency_key IS NOT NULL`.

**Source systems:**

| `source_system` | Legacy location | Phase |
|---|---|---|
| `rides_payment_journal` | `rides.payment_journal_entries.id` | 7 |
| `kv_ledger_event` | `ledger_event:{id}` | 8 |
| `kv_toll_ledger` | `toll_ledger:{id}` | 9 |
| `dash_payments` | `payments.transactions.id` / refunds / payouts | 10 |
| `rides_ledger_lines` | `rides.ledger_lines.id` | 7 (with journal) or derived |

### Entry types

Unified `entry_type` is namespaced by convention `{domain}_{action}`:

- **Rides wallet:** reuse existing strings (`cash_trip_arrears`, `wallet_topup`, …) for 1:1
  dual-write mapping in Phase 7.
- **Fleet canonical:** map `CanonicalLedgerEvent.eventType` (`fare_earning`, `platform_fee`, …).
- **Toll:** map `TollLedgerRecord` types (`usage`, `top_up`, `refund`, …).
- **Dash:** `order_capture`, `order_refund`, `merchant_payout`, `courier_payout`.

New types are additive; CHECK constraint is **not** used on `ledger.entries` (validation in
`post_entry` + application). Avoids repeated migration churn from rides' `entry_type` CHECK
history.

### Idempotency

- **Global key:** `ledger.entries.idempotency_key` is unique across all products.
- **Dual-write keys** (Phases 7–10):

  ```
  {source_system}:{legacy_id}
  ```

  Examples: `rides_payment_journal:{uuid}`, `kv_ledger_event:{eventId}`.

- **Multi-line settlements** (rides parity): `{settlement_base}:{entry_type}` when one
  settlement produces several lines.

- **Conflict rule:** same `idempotency_key` + different `request_hash` → reject (return
  `conflict: true`), matching `postPaymentJournal` behaviour.

### RPC: `ledger.post_entry`

Single write path for Phase 6+; generalizes `rides.post_payment_journal_line`.

```sql
ledger.post_entry(
  p_idempotency_key       TEXT,
  p_entry_type            TEXT,
  p_debit_account_key     TEXT,
  p_credit_account_key    TEXT,
  p_amount_minor          BIGINT,
  p_currency              TEXT,
  p_request_hash          TEXT DEFAULT NULL,
  p_organization_id       UUID DEFAULT NULL,
  p_product               TEXT DEFAULT 'platform',
  p_effective_at          TIMESTAMPTZ DEFAULT now(),
  p_reference_type        TEXT DEFAULT NULL,
  p_reference_id          TEXT DEFAULT NULL,
  p_metadata              JSONB DEFAULT '{}',
  p_created_by_user_id    UUID DEFAULT NULL
) RETURNS JSONB
-- { "inserted": bool, "skipped": bool, "conflict": bool, "entry_id": uuid|null }
```

**Behaviour** (same as ADR B1):

1. Resolve/create debit & credit accounts by `account_key` + `currency`.
2. Lock accounts `ORDER BY id FOR UPDATE`.
3. `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` + `GET DIAGNOSTICS`.
4. On conflict, compare `request_hash`; return `conflict` or `skipped`.
5. Delta-update `balance_minor` on both accounts.
6. Set `organization_id` on entry from debit account (or `p_organization_id`).

Public wrapper: `public.ledger_post_entry(...)` for PostgREST / Edge Functions.

### RLS (org scoping — Option 1)

Enable RLS on `ledger.accounts` and `ledger.entries`.

| Role | Policy |
|---|---|
| `authenticated` fleet user | `organization_id = rbac_org_id()` OR row is platform system account they may read via view |
| `service_role` | Bypass (Edge Functions post via service role until Dominion JWT fix) |
| Dominion platform admin | `rbac_is_platform_user()` → all orgs (Phase 13 views) |

`ledger.source_receipts`: readable by same org as linked entry (join via `ledger_entry_id`).

Phase 6 ships policies in migration; Phase 13 adds scoped **views**
(`ledger_scoped_fleet`, etc. per ADR 0003).

### Public API exposure

Follow rides pattern:

- Native tables in `ledger` schema.
- Optional `public.ledger_*` passthrough views + `GRANT` to `service_role` for hosted
  projects that do not expose `ledger` in PostgREST schema cache.

Phase 6: views for `accounts`, `entries`, `source_receipts` (read-only for service_role;
writes via RPC only).

## Island mapping (dual-write reference)

Phases 7–10 implement translators; schema supports them as follows:

### R1 — Rides payment journal (Phase 7)

| Legacy | Unified |
|---|---|
| `debit_account_id` / `credit_account_id` | Resolve to same `account_key` in `ledger.accounts` |
| `ride_request_id` | `reference_type='ride'`, `reference_id` |
| `entry_type` | Same string |
| `idempotency_key` | `rides_payment_journal:{legacy_id}` or per-line key |
| `amount_minor`, `currency`, `request_hash`, `metadata` | Direct |

### R2 — KV canonical events (Phase 8)

| Legacy | Unified |
|---|---|
| `direction=inflow` | Credit driver/org account, debit revenue or clearing |
| `direction=outflow` | Debit driver/org expense account, credit clearing |
| `eventType` | `entry_type` |
| `sourceType` + `sourceId` | `reference_type` + `reference_id` |
| `netAmount` | `amount_minor` (convert to minor if needed) |
| `idempotencyKey` | `kv_ledger_event:{idempotencyKey}` |

Account selection rules live in Phase 8 translator (driver digital wallet vs fleet expense).

### R3 — Toll ledger (Phase 9)

| Legacy | Unified |
|---|---|
| `type=usage` | Debit fleet/driver expense, credit tag balance or payable |
| `amount` | `amount_minor` |
| `driverId`, `vehicleId` | `metadata` + org from fleet context |
| `id` | `kv_toll_ledger:{id}` |

### R4 — Dash payments (Phase 10)

| Legacy | Unified |
|---|---|
| `payments.transactions` | Capture: debit customer clearing, credit merchant receivable |
| `payments.refunds` | Reverse capture |
| `merchant_payouts` / `courier_payouts` | Debit payable, credit bank clearing |
| Amounts | Convert `numeric` → minor (`* 100` for JMD cents policy) |

### R5 — `rides.ledger_lines` (Phase 7)

Reporting rows are **derived**, not double-entry. Phase 7 either:

- Generates `ledger_lines` from unified entries (future cutover), or
- Dual-writes journal first and keeps `ledger_lines` as a reporting projection.

`source_receipts` links `rides_ledger_lines:{id}` when a line is materialized from a journal
event.

## Phase 6 deliverables (next phase)

Migration `20260706140000_ledger_schema_core.sql` (filename tentative) creates:

1. `CREATE SCHEMA ledger`
2. Tables: `accounts`, `entries`, `source_receipts`
3. `ledger._resolve_account_id`, `ledger.post_entry`, `public.ledger_post_entry`
4. RLS policies (skeleton; Dominion JWT fix tracked separately)
5. Public read views + grants
6. Seed `platform:receivable` and `platform:clearing` in `ledger.accounts`

**No application code calls `ledger.post_entry` until dual-write phases.** Existing
`postPaymentJournal` continues using `rides.post_payment_journal_line`.

## Consequences

- Phase 6 implements this ADR verbatim; no schema redesign without a new ADR.
- `ledger.post_entry` becomes the template for all future money movement (tolls, Dash, fleet).
- Reconciliation (Phase 15) diffs `source_receipts` counts vs legacy per island.
- Duplicate timestamp migrations (`20260618120000` × 3) remain a separate cleanup item.
- Amount policy: **BIGINT minor units** everywhere in `ledger`; Dash `numeric` converted at
  dual-write boundary.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Extend `rides.payment_journal_entries` as platform ledger | Rides-specific schema; cannot represent toll KV / Dash cleanly |
| Event-sourcing only (no accounts) | R2/R3 already event-shaped but R1 is true double-entry; accounts required for balances |
| Keep KV as SSOT for fleet | Conflicts with plan; Postgres ledger enables RLS and reconciliation |
| `NUMERIC` amounts | Inconsistent with rides journal; integer minor avoids float drift |
