-- Prod sync R6-06: extensions in search_path for ledger canonical (pgcrypto digest chain).

CREATE OR REPLACE FUNCTION fleet.inv_ledger_canonical(p_row fleet.inv_ledger)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = fleet, extensions, pg_temp
AS $$
  SELECT concat_ws(
    '|',
    p_row.organization_id,
    p_row.movement_id::text,
    p_row.item_id::text,
    p_row.location_id::text,
    COALESCE(p_row.bin_id::text, ''),
    COALESCE(p_row.asset_id::text, ''),
    p_row.qty_delta::text,
    COALESCE(p_row.unit_cost::text, ''),
    p_row.currency,
    p_row.block_no::text
  );
$$;
