-- H3 Surge Cells — Dual-write with legacy grid keys
-- Enables H3-based surge lookup while maintaining backward compatibility.

--------------------------------------------------------------------------------
-- 1. Add h3_cell_key column to surge_cells
--------------------------------------------------------------------------------

ALTER TABLE rides.surge_cells 
ADD COLUMN IF NOT EXISTS h3_cell_key TEXT;

COMMENT ON COLUMN rides.surge_cells.h3_cell_key IS 
  'H3 cell key for surge lookup. Dual-written with legacy cell_key during transition.';

-- Index for H3 surge lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_surge_cells_h3_key
ON rides.surge_cells (h3_cell_key)
WHERE h3_cell_key IS NOT NULL;

--------------------------------------------------------------------------------
-- 2. Surge upsert RPC with H3 support
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rides_upsert_surge_cell(
  p_cell_key TEXT,
  p_h3_cell_key TEXT DEFAULT NULL,
  p_delta INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_row rides.surge_cells%ROWTYPE;
  v_next_requests INTEGER;
  v_next_mult NUMERIC;
BEGIN
  -- Try to find existing row by legacy key or H3 key
  SELECT * INTO v_row
  FROM rides.surge_cells
  WHERE cell_key = p_cell_key
     OR (p_h3_cell_key IS NOT NULL AND h3_cell_key = p_h3_cell_key)
  LIMIT 1
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Insert new row
    IF p_delta <= 0 THEN
      RETURN jsonb_build_object('ok', true, 'action', 'skip', 'reason', 'negative_delta_no_row');
    END IF;
    
    INSERT INTO rides.surge_cells (
      cell_key,
      h3_cell_key,
      open_requests,
      surge_multiplier,
      updated_at
    ) VALUES (
      p_cell_key,
      p_h3_cell_key,
      GREATEST(0, p_delta),
      1.0,
      NOW()
    );
    
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'insert',
      'cell_key', p_cell_key,
      'h3_cell_key', p_h3_cell_key,
      'open_requests', GREATEST(0, p_delta),
      'surge_multiplier', 1.0
    );
  END IF;
  
  -- Update existing row
  v_next_requests := GREATEST(0, COALESCE(v_row.open_requests, 0) + p_delta);
  v_next_mult := COALESCE(v_row.surge_multiplier, 1.0);
  
  -- Adjust surge multiplier based on demand
  IF v_next_requests >= 8 THEN
    v_next_mult := LEAST(2.5, v_next_mult + 0.05);
  ELSIF v_next_requests <= 2 THEN
    v_next_mult := GREATEST(1.0, v_next_mult - 0.02);
  END IF;
  
  UPDATE rides.surge_cells
  SET 
    open_requests = v_next_requests,
    surge_multiplier = v_next_mult,
    h3_cell_key = COALESCE(p_h3_cell_key, h3_cell_key),
    updated_at = NOW()
  WHERE cell_key = v_row.cell_key;
  
  RETURN jsonb_build_object(
    'ok', true,
    'action', 'update',
    'cell_key', p_cell_key,
    'h3_cell_key', COALESCE(p_h3_cell_key, v_row.h3_cell_key),
    'open_requests', v_next_requests,
    'surge_multiplier', v_next_mult
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_upsert_surge_cell TO service_role;

--------------------------------------------------------------------------------
-- 3. Surge read RPC with H3 fallback
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rides_read_surge_multiplier(
  p_cell_key TEXT,
  p_h3_cell_key TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_mult NUMERIC;
BEGIN
  -- Try H3 key first if provided
  IF p_h3_cell_key IS NOT NULL THEN
    SELECT surge_multiplier INTO v_mult
    FROM rides.surge_cells
    WHERE h3_cell_key = p_h3_cell_key
    LIMIT 1;
    
    IF FOUND THEN
      RETURN v_mult;
    END IF;
  END IF;
  
  -- Fallback to legacy key
  SELECT surge_multiplier INTO v_mult
  FROM rides.surge_cells
  WHERE cell_key = p_cell_key
  LIMIT 1;
  
  RETURN COALESCE(v_mult, 1.0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rides_read_surge_multiplier TO service_role;

--------------------------------------------------------------------------------
-- 4. Update public view
--------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.rides_surge_cells;
CREATE OR REPLACE VIEW public.rides_surge_cells AS
  SELECT 
    cell_key,
    h3_cell_key,
    open_requests,
    surge_multiplier,
    updated_at
  FROM rides.surge_cells;

GRANT SELECT ON public.rides_surge_cells TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
