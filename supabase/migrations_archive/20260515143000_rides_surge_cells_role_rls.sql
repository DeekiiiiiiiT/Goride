-- Tighten rides.surge_cells: only rides surface roles may read via PostgREST (defense in depth).
DROP POLICY IF EXISTS rides_surge_select ON rides.surge_cells;
CREATE POLICY rides_surge_select ON rides.surge_cells
  FOR SELECT TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('passenger', 'driver')
  );
