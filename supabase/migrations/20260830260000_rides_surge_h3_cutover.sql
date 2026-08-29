-- Phase 7: Rides surge H3 cutover — stop relying on grid: keys for new demand.
-- Cannot recompute H3 from cell_key in SQL (no h3 extension). Zero legacy counters
-- so stale grid: demand does not keep pricing after cutover; new writes use H3 ids.

UPDATE rides.surge_cells
SET open_requests = 0,
    surge_multiplier = 1.0,
    updated_at = NOW()
WHERE cell_key LIKE 'grid:%';

COMMENT ON COLUMN rides.surge_cells.cell_key IS
  'Primary surge key. Post-2026-08-29 cutover: H3 cell id (not grid:lat:lng).';

COMMENT ON COLUMN rides.surge_cells.h3_cell_key IS
  'H3 cell key; equals cell_key for post-cutover rows. Dual-read may still see legacy grid: rows.';
