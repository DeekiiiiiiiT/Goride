-- F-11 + F-18 (fuel enterprise audit): fuel rules move out of the shared key-value table
-- (public.kv_store_37f42386, key prefix `fuel_scenario:`, no company column, no row security)
-- into fuel.policy_scenarios: one row per rule, with its company in its own column and RLS on.
--
-- The row keeps the rule exactly as it was (body = the old KV value, including versions[]),
-- so fuelPolicyVersion.ts works unchanged and no week's numbers move. The KV rows are copied
-- once and left untouched as history. From here on the server reads and writes only this table,
-- through the service-role functions below (the fuel schema is not exposed to PostgREST).

CREATE SCHEMA IF NOT EXISTS fuel;

CREATE TABLE IF NOT EXISTS fuel.policy_scenarios (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT fuel_policy_body_id CHECK (body ->> 'id' = id),
  CONSTRAINT fuel_policy_body_org CHECK (body ->> 'organizationId' = org_id),
  CONSTRAINT fuel_policy_org_present CHECK (length(btrim(org_id)) > 0)
);

CREATE INDEX IF NOT EXISTS fuel_policy_scenarios_org_idx ON fuel.policy_scenarios (org_id);

ALTER TABLE fuel.policy_scenarios ENABLE ROW LEVEL SECURITY;

-- A signed-in user may read only their own company's rules (if the schema is ever exposed).
-- Org from app_metadata only (user_metadata is user-editable), as in fuel.week_lines.
DROP POLICY IF EXISTS fuel_policy_scenarios_read_own_org ON fuel.policy_scenarios;
CREATE POLICY fuel_policy_scenarios_read_own_org ON fuel.policy_scenarios
  FOR SELECT TO authenticated
  USING (
    org_id = coalesce(
      NULLIF(auth.jwt() -> 'app_metadata' ->> 'organizationId', ''),
      NULLIF(auth.jwt() -> 'app_metadata' ->> 'organization_id', ''),
      ''
    )
  );

REVOKE ALL ON fuel.policy_scenarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON fuel.policy_scenarios TO authenticated;
GRANT ALL ON fuel.policy_scenarios TO service_role;

-- One-time copy from the key-value store. Only rows that name a company (all 5 on production,
-- 22 Nov 2026) and whose key matches their id. Existing table rows are never overwritten.
INSERT INTO fuel.policy_scenarios (id, org_id, body, updated_by)
SELECT k.value ->> 'id', k.value ->> 'organizationId', k.value, 'migration:kv_copy'
FROM public.kv_store_37f42386 k
WHERE k.key LIKE 'fuel_scenario:%'
  AND coalesce(k.value ->> 'organizationId', '') <> ''
  AND k.key = 'fuel_scenario:' || (k.value ->> 'id')
ON CONFLICT (id) DO NOTHING;

-- A company's rules, oldest first.
CREATE OR REPLACE FUNCTION public.fuel_policy_list(p_org text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(p.body ORDER BY p.created_at, p.id), '[]'::jsonb)
  FROM fuel.policy_scenarios p
  WHERE p.org_id = p_org AND length(btrim(coalesce(p_org, ''))) > 0;
$$;

-- Save (create or replace) one rule for a company. A rule id that belongs to another company
-- is refused (F-18): the caller sees "not found", never the other company's rule.
CREATE OR REPLACE FUNCTION public.fuel_policy_save(p_org text, p_body jsonb, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text := p_body ->> 'id';
  v_owner text;
BEGIN
  IF length(btrim(coalesce(p_org, ''))) = 0 OR length(btrim(coalesce(v_id, ''))) = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'FUEL_POLICY_BAD_INPUT', ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_body ->> 'organizationId', '') <> p_org THEN
    RAISE EXCEPTION USING MESSAGE = 'FUEL_POLICY_WRONG_ORG', ERRCODE = 'P0001';
  END IF;
  SELECT org_id INTO v_owner FROM fuel.policy_scenarios WHERE id = v_id FOR UPDATE;
  IF v_owner IS NOT NULL AND v_owner <> p_org THEN
    RAISE EXCEPTION USING MESSAGE = 'FUEL_POLICY_NOT_FOUND', ERRCODE = 'P0001';
  END IF;
  INSERT INTO fuel.policy_scenarios (id, org_id, body, updated_by)
  VALUES (v_id, p_org, p_body, p_actor)
  ON CONFLICT (id) DO UPDATE
    SET body = excluded.body, updated_at = now(), updated_by = excluded.updated_by;
  RETURN p_body;
END;
$$;

REVOKE ALL ON FUNCTION public.fuel_policy_list(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_policy_save(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_policy_list(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fuel_policy_save(text, jsonb, text) TO service_role;
