-- Allow DELETE on public.rides_fare_rules when the `rides` schema is not exposed to PostgREST.

CREATE OR REPLACE FUNCTION public.rides_fare_rules_instead_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
BEGIN
  DELETE FROM rides.fare_rules WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS rides_fare_rules_instead_delete ON public.rides_fare_rules;
CREATE TRIGGER rides_fare_rules_instead_delete
  INSTEAD OF DELETE ON public.rides_fare_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.rides_fare_rules_instead_delete();

NOTIFY pgrst, 'reload schema';
