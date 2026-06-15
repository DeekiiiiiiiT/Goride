-- Phase 6: Seed product profile stubs for all supported products
-- These are inactive by default; activate when each product integrates with matching brain

-- Get the default policy ID
DO $$
DECLARE
  v_default_policy_id UUID;
BEGIN
  SELECT id INTO v_default_policy_id
  FROM matching.policies
  WHERE is_default = TRUE
  LIMIT 1;

  IF v_default_policy_id IS NULL THEN
    RAISE NOTICE 'No default matching policy found. Skipping product profile stubs.';
    RETURN;
  END IF;

  -- Rides product profile (active - already integrated)
  INSERT INTO matching.product_profiles (product_key, surface_key, policy_id, is_active)
  VALUES ('rides', 'default', v_default_policy_id, TRUE)
  ON CONFLICT DO NOTHING;

  -- Fleet product profile (inactive - future integration)
  INSERT INTO matching.product_profiles (product_key, surface_key, policy_id, is_active)
  VALUES ('fleet', 'default', v_default_policy_id, FALSE)
  ON CONFLICT DO NOTHING;

  -- Dash product profile (inactive - future integration)
  INSERT INTO matching.product_profiles (product_key, surface_key, policy_id, is_active)
  VALUES ('dash', 'default', v_default_policy_id, FALSE)
  ON CONFLICT DO NOTHING;

  -- Enterprise product profile (inactive - future integration)
  INSERT INTO matching.product_profiles (product_key, surface_key, policy_id, is_active)
  VALUES ('enterprise', 'default', v_default_policy_id, FALSE)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Product profile stubs seeded for rides (active), fleet, dash, enterprise (inactive)';
END;
$$;
