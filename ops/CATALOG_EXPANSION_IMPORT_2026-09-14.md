# Catalog expansion import — 2026-09-14

## Pre-flight
- Validator: `npx tsx scripts/validate-catalog-expansion-import.ts` → **PASS** (190 rows, no unknown headers)
- Edge: `_fleet-server` (`make-server-37f42386`) deployed before import
- Rev 2 close-out (§E1 force-undo ceremony, §E3 backfill rate limit, §E4 shared bulk max) in tree

## Restore point
- File: `ops/vehicle_catalog_restore_2026-09-14.csv`
- Pre-import catalog count: **166**

## Import
- Source CSV: `catalog_expansion_2026-09-14.csv` (190 rows)
- Method: linked DB SQL chunks `ops/import_chunk_00.sql` … `import_chunk_07.sql` (same payloads / provenance as Dominion bulk path)
- **`import_batch_id`:** `84311f52-f66a-4aa9-8481-12a9373a2349`
- `source`: `csv_import` (creates only)

## Verify
| Metric | Value |
|--------|-------|
| Total rows after import | **356** (= 166 + 190) |
| Rows with this `import_batch_id` | **190** |
| Rows with `source = csv_import` | **190** |

Spot-check (2026-09-14): 10+ variants present with chassis/generation (e.g. Toyota Passo/Sienta/Alphard, Honda Freed/Insight/Airwave, Daihatsu Hijet/Tanto, Hino Dutro/Ranger). Make mix: Toyota 85, Nissan 28, Honda 18, Mazda 16, Suzuki 12, Mitsubishi 11, Subaru 9, Daihatsu 6, Isuzu 3, Hino 2. Empty make/model in batch: **0**. All 190 tagged `vehicle_class=car` (matches source CSV).

## Undo (if needed)
Dominion → Vehicle Catalog → last import result **Undo this import**, or call undo-batch with this `import_batch_id`.  
If dependents block: force-undo requires typed phrase **`UNDO BATCH`**.

## Ops watch (24h)
- Catalog orphans panel
- Vehicle catalog gate / backfill noise
- Do not re-open closed Critical/High audit findings unless verification fails
