-- Identity sync: keep platform.identities current after persona signup/updates

CREATE OR REPLACE FUNCTION platform.upsert_identity_for_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
DECLARE
  v_auth_email TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_name TEXT;
  v_has_persona BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT u.email INTO v_auth_email FROM auth.users u WHERE u.id = p_user_id;

  SELECT
    COALESCE(c.email, cp.email),
    COALESCE(c.phone, cp.phone),
    COALESCE(c.name, cp.display_name, u.raw_user_meta_data->>'full_name')
  INTO v_email, v_phone, v_name
  FROM auth.users u
  LEFT JOIN delivery.customers c ON c.user_id = u.id
  LEFT JOIN delivery.courier_profiles cp ON cp.user_id = u.id
  WHERE u.id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM delivery.customers c WHERE c.user_id = p_user_id
    UNION ALL
    SELECT 1 FROM delivery.courier_profiles cp WHERE cp.user_id = p_user_id
    UNION ALL
    SELECT 1 FROM delivery.merchants m WHERE m.owner_id = p_user_id
    UNION ALL
    SELECT 1 FROM delivery.merchant_team_members mtm WHERE mtm.user_id = p_user_id
  ) INTO v_has_persona;

  IF NOT v_has_persona AND v_auth_email IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO platform.identities (user_id, primary_email, primary_phone, display_name, updated_at)
  VALUES (
    p_user_id,
    COALESCE(v_email, v_auth_email),
    v_phone,
    v_name,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    primary_email = COALESCE(EXCLUDED.primary_email, platform.identities.primary_email),
    primary_phone = COALESCE(EXCLUDED.primary_phone, platform.identities.primary_phone),
    display_name = COALESCE(EXCLUDED.display_name, platform.identities.display_name),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION platform.trg_sync_identity_from_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
BEGIN
  PERFORM platform.upsert_identity_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.trg_sync_identity_from_courier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
BEGIN
  PERFORM platform.upsert_identity_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.trg_sync_identity_from_merchant_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    PERFORM platform.upsert_identity_for_user(NEW.owner_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.owner_id IS DISTINCT FROM NEW.owner_id AND OLD.owner_id IS NOT NULL THEN
    PERFORM platform.upsert_identity_for_user(OLD.owner_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.trg_sync_identity_from_merchant_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM platform.upsert_identity_for_user(NEW.user_id);
  END IF;
  IF TG_OP = 'DELETE' AND OLD.user_id IS NOT NULL THEN
    PERFORM platform.upsert_identity_for_user(OLD.user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION platform.trg_sync_identity_from_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.email IS DISTINCT FROM NEW.email THEN
    PERFORM platform.upsert_identity_for_user(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_identity_customer ON delivery.customers;
CREATE TRIGGER sync_identity_customer
  AFTER INSERT OR UPDATE OF user_id, email, phone, name ON delivery.customers
  FOR EACH ROW EXECUTE FUNCTION platform.trg_sync_identity_from_customer();

DROP TRIGGER IF EXISTS sync_identity_courier ON delivery.courier_profiles;
CREATE TRIGGER sync_identity_courier
  AFTER INSERT OR UPDATE OF user_id, email, phone, display_name ON delivery.courier_profiles
  FOR EACH ROW EXECUTE FUNCTION platform.trg_sync_identity_from_courier();

DROP TRIGGER IF EXISTS sync_identity_merchant_owner ON delivery.merchants;
CREATE TRIGGER sync_identity_merchant_owner
  AFTER INSERT OR UPDATE OF owner_id ON delivery.merchants
  FOR EACH ROW EXECUTE FUNCTION platform.trg_sync_identity_from_merchant_owner();

DROP TRIGGER IF EXISTS sync_identity_merchant_staff ON delivery.merchant_team_members;
CREATE TRIGGER sync_identity_merchant_staff
  AFTER INSERT OR UPDATE OF user_id OR DELETE ON delivery.merchant_team_members
  FOR EACH ROW EXECUTE FUNCTION platform.trg_sync_identity_from_merchant_staff();

DROP TRIGGER IF EXISTS sync_identity_auth_user ON auth.users;
CREATE TRIGGER sync_identity_auth_user
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION platform.trg_sync_identity_from_auth_user();

-- Reconciliation backstop (callable manually or via cron)
CREATE OR REPLACE FUNCTION platform.reconcile_identities()
RETURNS TABLE(synced_count INT, drift_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, delivery, auth, public
AS $$
DECLARE
  v_synced INT := 0;
  v_drift INT := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM delivery.customers
      UNION SELECT user_id FROM delivery.courier_profiles
      UNION SELECT owner_id AS user_id FROM delivery.merchants WHERE owner_id IS NOT NULL
      UNION SELECT user_id FROM delivery.merchant_team_members WHERE user_id IS NOT NULL
    ) personas
  LOOP
    PERFORM platform.upsert_identity_for_user(r.user_id);
    v_synced := v_synced + 1;
  END LOOP;

  SELECT COUNT(*)::INT INTO v_drift
  FROM (
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM delivery.customers
      UNION SELECT user_id FROM delivery.courier_profiles
      UNION SELECT owner_id AS user_id FROM delivery.merchants WHERE owner_id IS NOT NULL
      UNION SELECT user_id FROM delivery.merchant_team_members WHERE user_id IS NOT NULL
    ) p
  ) expected
  WHERE NOT EXISTS (SELECT 1 FROM platform.identities i WHERE i.user_id = expected.user_id);

  RETURN QUERY SELECT v_synced, v_drift;
END;
$$;

ALTER TABLE platform.identities
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

GRANT EXECUTE ON FUNCTION platform.upsert_identity_for_user(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION platform.reconcile_identities() TO service_role;
