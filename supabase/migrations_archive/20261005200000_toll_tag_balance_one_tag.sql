-- One ledger write refreshes one tag. The existing one-argument function
-- stays in place so the daily scan keeps working.

CREATE OR REPLACE FUNCTION fleet.toll_tag_balance_rows(p_org text, p_tag_id text)
RETURNS TABLE (
  tag_id text,
  ledger_count integer,
  balance numeric,
  usage_amount numeric,
  usage_count integer,
  span_days numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  WITH tags AS (
    SELECT id
    FROM fleet.toll_tags
    WHERE organization_id = p_org
      AND id = p_tag_id
      AND coalesce(payload_json->>'status', '') <> 'Retired'
  ),
  rows AS (
    SELECT
      l.toll_tag_id AS tag_id,
      l.amount,
      l.date,
      coalesce(nullif(l.payment_method, ''), l.payload_json->>'paymentMethod', '') AS pm,
      lower(coalesce(l.status, '')) AS st,
      coalesce(l.metadata->>'voided', l.payload_json->'metadata'->>'voided', '') AS voided
    FROM fleet.toll_ledger l
    WHERE l.organization_id = p_org
      AND l.toll_tag_id = p_tag_id
  ),
  kept AS (
    SELECT *
    FROM rows
    WHERE st NOT IN ('voided', 'void')
      AND lower(voided) NOT IN ('true', 't')
      AND pm NOT ILIKE '%cash%'
      AND pm NOT ILIKE '%card%'
      AND pm NOT ILIKE '%fleet%'
      AND pm NOT ILIKE '%account%'
  )
  SELECT
    t.id,
    count(k.tag_id)::integer,
    CASE WHEN count(k.tag_id) = 0 THEN NULL ELSE coalesce(sum(k.amount), 0) END,
    coalesce(sum(abs(k.amount)) FILTER (WHERE k.amount < 0), 0),
    count(*) FILTER (WHERE k.amount < 0)::integer,
    CASE
      WHEN count(*) FILTER (WHERE k.amount < 0) < 2 THEN NULL
      ELSE GREATEST(1, (max(k.date) FILTER (WHERE k.amount < 0) - min(k.date) FILTER (WHERE k.amount < 0))::numeric)
    END
  FROM tags t
  LEFT JOIN kept k ON k.tag_id = t.id
  GROUP BY t.id;
$$;

CREATE OR REPLACE FUNCTION public.fleet_toll_tag_balance_rows(p_org text, p_tag_id text)
RETURNS TABLE (
  tag_id text,
  ledger_count integer,
  balance numeric,
  usage_amount numeric,
  usage_count integer,
  span_days numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT * FROM fleet.toll_tag_balance_rows(p_org, p_tag_id);
$$;

REVOKE ALL ON FUNCTION public.fleet_toll_tag_balance_rows(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_toll_tag_balance_rows(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
