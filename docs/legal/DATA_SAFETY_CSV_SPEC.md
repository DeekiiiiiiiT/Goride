# Google Play Data Safety CSV — Roam Admin Spec

This document defines how Roam admin portals import/export Google Play Console **Data safety** CSV files for round-trip sync.

## File format

- **Filename:** `data_safety_export.csv`
- **Encoding:** UTF-8 (BOM tolerated on import)
- **Line endings:** LF or CRLF (export uses LF)
- **Row count:** ~782 data rows plus header (Rider golden fixture)

### Columns (exact header required)

| Column | Description |
|--------|-------------|
| `Question ID (machine readable)` | Stable Google question key, e.g. `PSL_DATA_TYPES_PERSONAL` |
| `Response ID (machine readable)` | Option key; may be empty for free-text / ephemeral rows |
| `Response value` | `true` when selected, `false` for ephemeral “no”, URL/text otherwise, empty when unselected |
| `Answer requirement` | `REQUIRED`, `MULTIPLE_CHOICE`, `SINGLE_CHOICE`, `MAYBE_REQUIRED`, `OPTIONAL` |
| `Human-friendly question label` | Display label; paths use ` / ` separator |

## Question ID families

| Prefix / pattern | Purpose |
|------------------|---------|
| `PSL_DATA_COLLECTION_*` | Global collection / encryption |
| `PSL_SUPPORTED_ACCOUNT_CREATION_METHODS` | Account creation methods |
| `PSL_ACCOUNT_DELETION_URL`, `PSL_DATA_DELETION_URL` | Deletion URLs |
| `PSL_SUPPORT_DATA_DELETION_BY_USER` | Deletion request options |
| `PSL_DATA_TYPES_*` | Declared data types (checkbox per type) |
| `PSL_DATA_USAGE_RESPONSES:{typeId}:*` | Per-type usage (collected/shared, ephemeral, purposes) |

## Value rules

- **MULTIPLE_CHOICE / checkbox:** selected = `true`; unselected = empty cell
- **SINGLE_CHOICE / radio:** exactly one option `true`; others empty
- **Ephemeral** (`PSL_DATA_USAGE_EPHEMERAL`): empty Response ID; value `true` (yes) or `false` (no)
- **Text / URL:** value in Response value column; Response ID empty

## Storage (Supabase)

- `data_safety_rows` JSONB — full row snapshots preserving order
- `data_safety_imported_at` — last CSV import timestamp
- `data_safety_source_hash` — SHA-256 of last imported CSV (hex)
- `data_safety_template_version` — fixture version string

## Acceptance criteria

1. **Round-trip:** `serialize(parse(file))` equals original after LF normalization and BOM strip.
2. **Console import:** Admin export imports into Play Console without row errors.
3. **Console export:** Console export imported into admin; store listing preview matches Console sections.
4. **Concurrency:** Second save with stale `expectedUpdatedAt` returns HTTP 409.
5. **Isolation:** Rider and Driver rows never share the same DB column.

## Manual QA checklist

- [ ] Import Rider golden CSV → preview shows Personal info, Location, etc.
- [ ] Export → re-import in Play Console
- [ ] Toggle one checkbox → export → diff only that row
- [ ] Read-only admin cannot save or import
- [ ] Driver portal uses separate fixture and DB row

## Fixtures

- Rider: `packages/play-store-launch/fixtures/rides-data-safety.golden.csv`
- Driver: `packages/play-store-launch/fixtures/driver-data-safety.golden.csv` (Phase 6)
