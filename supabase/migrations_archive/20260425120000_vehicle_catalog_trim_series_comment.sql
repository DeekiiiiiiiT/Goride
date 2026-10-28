-- Document meaning of trim_series for series / facelift splits (same column, v1).

COMMENT ON COLUMN public.vehicle_catalog.trim_series IS
  'Trim grade, market series, and/or facelift phase (e.g. Pre-Facelift, Facelift). For a major mid-cycle update, use separate rows with distinct production_start_year/production_end_year.';
