-- O7: RLS must not fall back to user_metadata (user-editable).
DROP POLICY IF EXISTS station_merchant_aliases_select_org ON public.station_merchant_aliases;
CREATE POLICY station_merchant_aliases_select_org
  ON public.station_merchant_aliases
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')
  );
