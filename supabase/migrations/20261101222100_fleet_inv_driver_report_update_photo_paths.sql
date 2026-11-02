-- R20-02: store evidence paths on driver report updates (replacement photos).

ALTER TABLE fleet.inv_driver_report_update
  ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}'::text[];

DO $$
DECLARE
  t text := 'inv_driver_report_update';
  v_suffix text;
  v_public text;
BEGIN
  v_suffix := CASE WHEN t ~ '^inv_' THEN substring(t FROM 5) ELSE t END;
  v_public := 'fleet_inv_' || v_suffix;
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS SELECT * FROM fleet.%I',
    v_public,
    t
  );
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_public);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
    v_public
  );
END $$;
