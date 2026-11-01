# Fleet inventory cutover runbook

**Rev 5 implementation (Nov 2026):** Prod data migration applied via `20261101180000` / `20261101180100` (+ MCP follow-ups). Phase 2/3 flags re-enabled after wiring. Drop legacy tables: apply [`20261101172934_drop_legacy_fleet_inventory_tables.sql`](../supabase/migrations/20261101172934_drop_legacy_fleet_inventory_tables.sql) only after Fleet vehicle equipment UI no longer reads `fleet.equipment` / KV routes.

Feature flags (`public.platform_feature_flags`):

| Flag | Phase |
|------|--------|
| `fleet_inventory_phase0_security` | Auth + org backfill + bulk draw lock |
| `fleet_inventory_phase1_engine` | `fleet.inv_*` tables + RPCs |
| `fleet_inventory_phase2_stock` | New Fleet UI at `/vehicle-operations/inventory` |
| `fleet_inventory_phase3_kits` | Kits, driver car kit, alerts, `inv_road_clearance_gate` |
| `fleet_inventory_phase4_assets` | Serialized assets IN8/IN9 |
| `fleet_inventory_phase5_maintenance` | WO consume/reserve |
| `fleet_inventory_phase6_purchasing` | IN11 + finance posting flag |
| `fleet_inventory_phase7_counts` | IN12 + scanners |
| `fleet_inventory_phase8_telematics` | Provider adapter |
| `inv_road_clearance_gate` | Rush dispatch kit gate (with phase 3) |
| `fleet_inventory_finance_posting` | PO/receipt/write-off → Business Finance (phase 6) |

## Migrations (R3-04 / R5-06)

**Production history** (already applied on GoRide — do not re-add monolithic `20261101143100–143600` to `supabase/migrations/`):

| Version | Name |
|---------|------|
| 20261101163228 | fleet_inventory_phase0 |
| 20261101163300–163408 | fleet_inventory_engine_schema_1 … _8 |
| 20261101163522–163819 | fleet_inventory_engine_rpcs_1 … _4, _ext |
| 20261101163618 | fleet_inventory_maintenance_consume |
| 20261101163823 | fleet_inventory_ledger_digest_search_path |
| 20261101163825 | fleet_inventory_data_migration |

Monolithic SQL for **local bootstrap** lives in [`supabase/migrations_archive/`](../supabase/migrations_archive/) (`20261101143100` … `20261101143600`). CI now relies on full replay of split migrations `20261101163300`–`163408`; [`scripts/bootstrap-inventory-local-db.mjs`](../scripts/bootstrap-inventory-local-db.mjs) only seeds `fleet.inv_settings` for the test org after reset.

New inventory fixes use versions **after** `20261101163825` (R10/R12 use production timestamps `20261101180924` … `20261101182842` — filenames must match `supabase migration list` on project `csfllzzastacofsvcdsc`).

**R10 prod migration names (repo sync, Nov 2026):** `20261101180924` bridge_r10_01 · `20261101180928` void_legacy_dup_wos · `20261101181057` phone_balance_seed · `20261101181107` balance_refresh_fix · `20261101181109` phone_adjust · `20261101181112` mount_ledger · `20261101181115` spare_offset.

**R12:** `20261101182842_fleet_inventory_r12_double_entry_and_phone_repair.sql` — four RPC double-entry + OPN-0004 repair. If a dev clone applied misnumbered `80500` files, run `supabase migration repair` to match remote before `db push`.

Apply remote changes with **`supabase db push`** from committed migration files only (do not one-off MCP `apply_migration` for new inventory work).

Drop legacy tables: recreate migration only after R5-02 + R5-11 (see step 7 below).

If Phase 0 was applied manually on prod, repair history without re-running:

```bash
supabase migration repair 20261101143100 --status applied
supabase db push
```

Post-apply SQL: run [`scripts/sql/fleet_inventory_integrity_checks.sql`](scripts/sql/fleet_inventory_integrity_checks.sql) — each query must return **0 rows**.

## Feature flags (R3-16)

- UI and legacy 410 both read `public.platform_feature_flags` via `GET /make-server-37f42386/platform-feature-flags`.
- Do **not** enable `fleet_inventory_phase2_stock` until Phase 2 API + wiring are verified on staging.
- Local Fleet desk preview: `VITE_FLEET_INVENTORY_PHASE2=1` in `apps/fleet/.env.local`.
- Local Driver car kit: `VITE_FLEET_INVENTORY_PHASE3_KITS=1` in `apps/driver/.env.local`.

## Deploy fleet-core (R3-01)

Rebuild and deploy `fleet-core` after inventory controller changes. Verify unauthenticated `POST /make-server-37f42386/templates` → **401**.

## Decommission legacy monolith inventory (R3-17)

1. Enable phase 2 in prod after migration + integrity checks clean.
2. Legacy KV routes under `/make-server-37f42386/inventory` return **410** when `fleet_inventory_phase2_stock` is on.
3. Fleet nav shows a single **Inventory & Asset Management** item (`inventory` page) — no legacy `(legacy)` route.
4. After verified data migration (R5-02) and legacy code removal (R5-11), apply a **new** drop-legacy migration in the **same release** as Fleet/Driver deploy and `fleet_inventory_phase2_stock` ON (no 30-day wait).

## Verification

- `deno test` inventory suite in CI
- Optional integration: `INVENTORY_INTEGRATION_TESTS=1 INVENTORY_TEST_ORG_ID=… deno test supabase/functions/_fleet-server/inventory_integration.test.ts`
- `node scripts/stitch-fidelity.mjs --report` — Ported IN/DK rows at 100%
- SQL integrity checklist → 0 rows

## Stitch gap screens (audit §3)

Fifteen flows (settings, item editor, import, locations, opening balances, register asset, PO/vendor, counts, requisitions, approval drawer, scanner pair, snooze, kit compare, driver status update) are tracked under `apps/fleet/src/components/inventory/gap/` until Stitch exports land in `docs/stitch/`.
