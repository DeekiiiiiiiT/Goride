-- Triggers audit Wave 0: org auto-provision trusts app_metadata only (never never)

CREATE OR REPLACE FUNCTION public.auto_create_organization_for_fleet_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_role TEXT;
  user_product_line TEXT;
  org_name TEXT;
BEGIN
  -- SECURITY: app_metadata only. raw_user_meta_data is writable by any
  -- unauthenticated caller via supabase.auth.signUp()/updateUser().
  user_role := COALESCE(NEW.raw_app_meta_data->>'role', 'viewer');

  IF user_role NOT IN ('admin', 'fleet_owner') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE owner_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  user_product_line := COALESCE(NEW.raw_app_meta_data->>'productLine', 'fleet');
  org_name := COALESCE(
    NEW.raw_app_meta_data->>'fleetName',
    NEW.raw_app_meta_data->>'companyName',
    CONCAT(SPLIT_PART(NEW.email, '@', 1), '''s Fleet')
  );

  INSERT INTO public.organizations (
    id, owner_id, name, product_line, business_type, contact_email, status
  ) VALUES (
    NEW.id,
    NEW.id,
    org_name,
    user_product_line,
    COALESCE(NEW.raw_app_meta_data->>'businessType', 'rideshare'),
    NEW.email,
    'active'
  );

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('organizationId', NEW.id::text)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_create_organization_for_fleet_owner() IS
  'Auto-provisions org for admin/fleet_owner from app_metadata only. Never trusts user_metadata.';
