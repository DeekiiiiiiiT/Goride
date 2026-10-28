-- Parts sourcing enterprise upgrade.
-- Additive. Old part_fitment rows stay exact-variant matches.
-- Edge uses service role. Signed-in clients have no direct access.

-- ---------------------------------------------------------------------------
-- Phase 0: bridge, request outcome, offer freshness
-- ---------------------------------------------------------------------------

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS maintenance_component_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS part_kind text NOT NULL DEFAULT 'oem',
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.part_master
  DROP CONSTRAINT IF EXISTS part_master_part_kind_check;
ALTER TABLE public.part_master
  ADD CONSTRAINT part_master_part_kind_check
  CHECK (part_kind IN ('oem', 'oe_supplier', 'aftermarket', 'used', 'reman'));

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS oem_part_number_norm text
  GENERATED ALWAYS AS (
    upper(regexp_replace(coalesce(oem_part_number, ''), '[^A-Za-z0-9]', '', 'g'))
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS part_master_mfr_number_unique
  ON public.part_master (upper(coalesce(manufacturer, '')), oem_part_number_norm)
  WHERE oem_part_number_norm <> '';

CREATE INDEX IF NOT EXISTS idx_part_master_component ON public.part_master (maintenance_component_id);
CREATE INDEX IF NOT EXISTS idx_part_master_name_trgm ON public.part_master USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_part_master_number_trgm ON public.part_master USING gin (oem_part_number_norm gin_trgm_ops);

ALTER TABLE public.supplier_part_offer
  ADD COLUMN IF NOT EXISTS price_observed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS core_charge numeric(12, 2),
  ADD COLUMN IF NOT EXISTS warranty_months integer,
  ADD COLUMN IF NOT EXISTS warranty_km integer,
  ADD COLUMN IF NOT EXISTS organization_id text,
  ADD COLUMN IF NOT EXISTS freight_estimate numeric(12, 2),
  ADD COLUMN IF NOT EXISTS duty_rate numeric(8, 4),
  ADD COLUMN IF NOT EXISTS fx_rate_to_jmd numeric(12, 4);

ALTER TABLE public.supplier_part_offer
  DROP CONSTRAINT IF EXISTS supplier_part_offer_source_check;
ALTER TABLE public.supplier_part_offer
  ADD CONSTRAINT supplier_part_offer_source_check
  CHECK (source IN ('manual', 'quote', 'api'));

ALTER TABLE public.supplier_part_offer
  DROP CONSTRAINT IF EXISTS supplier_part_offer_supplier_part_sku_unique;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_part_offer_sku_org_unique
  ON public.supplier_part_offer (supplier_id, part_id, supplier_sku, coalesce(organization_id, ''));

ALTER TABLE public.supplier
  ADD COLUMN IF NOT EXISTS freight_estimate numeric(12, 2),
  ADD COLUMN IF NOT EXISTS duty_rate numeric(8, 4),
  ADD COLUMN IF NOT EXISTS fx_rate_to_jmd numeric(12, 4);

ALTER TABLE public.parts_sourcing_requests
  ADD COLUMN IF NOT EXISTS resolved_part_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS maintenance_component_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS urgency text,
  ADD COLUMN IF NOT EXISTS qty numeric(12, 3),
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.parts_sourcing_requests
  DROP CONSTRAINT IF EXISTS parts_sourcing_requests_urgency_check;
ALTER TABLE public.parts_sourcing_requests
  ADD CONSTRAINT parts_sourcing_requests_urgency_check
  CHECK (urgency IS NULL OR urgency IN ('low', 'normal', 'urgent'));

-- ---------------------------------------------------------------------------
-- Phase 1: platform, engine, interchange
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vehicle_platform (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.engine_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  displacement_cc integer,
  fuel_type text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.vehicle_platform (code, label)
SELECT upper(trim(chassis_code)), upper(trim(chassis_code))
FROM public.vehicle_catalog
WHERE nullif(trim(chassis_code), '') IS NOT NULL
GROUP BY upper(trim(chassis_code))
ON CONFLICT (code) DO NOTHING;

UPDATE public.vehicle_platform p
SET label = p.code || ' — ' || sub.makes
FROM (
  SELECT upper(trim(chassis_code)) AS code,
         string_agg(DISTINCT make || ' ' || model, ', ' ORDER BY make || ' ' || model) AS makes
  FROM public.vehicle_catalog
  WHERE nullif(trim(chassis_code), '') IS NOT NULL
  GROUP BY 1
) sub
WHERE p.code = sub.code;

INSERT INTO public.engine_family (code)
SELECT upper(trim(engine_code))
FROM public.vehicle_catalog
WHERE nullif(trim(engine_code), '') IS NOT NULL
GROUP BY upper(trim(engine_code))
ON CONFLICT (code) DO NOTHING;

UPDATE public.engine_family e
SET displacement_cc = sub.cc::integer,
    fuel_type = sub.fuel
FROM (
  SELECT upper(trim(engine_code)) AS code,
         max(engine_displacement_cc) AS cc,
         max(fuel_type) AS fuel
  FROM public.vehicle_catalog
  WHERE nullif(trim(engine_code), '') IS NOT NULL
  GROUP BY 1
) sub
WHERE e.code = sub.code;

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.vehicle_platform (id),
  ADD COLUMN IF NOT EXISTS engine_family_id uuid REFERENCES public.engine_family (id);

UPDATE public.vehicle_catalog vc
SET platform_id = p.id
FROM public.vehicle_platform p
WHERE upper(trim(vc.chassis_code)) = p.code
  AND vc.platform_id IS NULL;

UPDATE public.vehicle_catalog vc
SET engine_family_id = e.id
FROM public.engine_family e
WHERE upper(trim(vc.engine_code)) = e.code
  AND vc.engine_family_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_platform ON public.vehicle_catalog (platform_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_engine_family ON public.vehicle_catalog (engine_family_id);

ALTER TABLE public.parts_sourcing_requests
  ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.vehicle_platform (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS engine_family_id uuid REFERENCES public.engine_family (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.part_interchange_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  fit_scope text NOT NULL,
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_interchange_group_scope_check
    CHECK (fit_scope IN ('powertrain', 'chassis', 'body', 'electrical', 'universal'))
);

ALTER TABLE public.part_master
  ADD COLUMN IF NOT EXISTS interchange_group_id uuid REFERENCES public.part_interchange_group (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_part_master_group ON public.part_master (interchange_group_id);

CREATE TABLE IF NOT EXISTS public.interchange_fitment_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interchange_group_id uuid NOT NULL REFERENCES public.part_interchange_group (id) ON DELETE CASCADE,
  target_kind text NOT NULL,
  engine_family_id uuid REFERENCES public.engine_family (id),
  platform_id uuid REFERENCES public.vehicle_platform (id),
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id),
  year_from integer,
  year_to integer,
  "position" text,
  source text NOT NULL DEFAULT 'manual',
  verified_by uuid,
  verified_at timestamptz,
  notes text,
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interchange_fitment_rule_target_check CHECK (
    (target_kind = 'engine_family' AND engine_family_id IS NOT NULL)
    OR (target_kind = 'platform' AND platform_id IS NOT NULL)
    OR (target_kind = 'catalog_variant' AND vehicle_catalog_id IS NOT NULL)
  ),
  CONSTRAINT interchange_fitment_rule_source_check CHECK (
    source IN ('manual', 'oem_catalog', 'supplier', 'install_confirmed', 'import')
  )
);

CREATE INDEX IF NOT EXISTS idx_interchange_rule_group ON public.interchange_fitment_rule (interchange_group_id);
CREATE INDEX IF NOT EXISTS idx_interchange_rule_engine ON public.interchange_fitment_rule (engine_family_id);
CREATE INDEX IF NOT EXISTS idx_interchange_rule_platform ON public.interchange_fitment_rule (platform_id);

CREATE OR REPLACE FUNCTION public.enforce_interchange_fitment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  scope text;
BEGIN
  SELECT fit_scope INTO scope
  FROM public.part_interchange_group
  WHERE id = NEW.interchange_group_id;
  IF NEW.target_kind = 'engine_family' AND scope NOT IN ('powertrain', 'universal') THEN
    RAISE EXCEPTION 'engine-family fitment is only allowed for powertrain or universal groups';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interchange_fitment_scope_guard ON public.interchange_fitment_rule;
CREATE TRIGGER interchange_fitment_scope_guard
  BEFORE INSERT OR UPDATE ON public.interchange_fitment_rule
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_interchange_fitment_scope();

CREATE TABLE IF NOT EXISTS public.part_supersession (
  old_part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  new_part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  effective_at date,
  fully_interchangeable boolean NOT NULL DEFAULT true,
  PRIMARY KEY (old_part_id, new_part_id),
  CONSTRAINT part_supersession_not_self CHECK (old_part_id <> new_part_id)
);

CREATE TABLE IF NOT EXISTS public.part_term_synonym (
  term text PRIMARY KEY,
  maintenance_component_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  canonical text NOT NULL
);

INSERT INTO public.part_term_synonym (term, canonical)
VALUES
  ('lambda sensor', 'Oxygen sensor'),
  ('o2 sensor', 'Oxygen sensor'),
  ('oxygen sensor', 'Oxygen sensor'),
  ('a/f sensor', 'Oxygen sensor')
ON CONFLICT (term) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Phase 5–7 tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.part_number_link_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  work_order_line_id uuid NOT NULL REFERENCES public.maintenance_work_order_lines (id) ON DELETE CASCADE,
  part_number text NOT NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  linked_part_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_number_link_review_status_check CHECK (status IN ('open', 'linked', 'dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS part_number_link_review_line
  ON public.part_number_link_review (work_order_line_id);

CREATE TABLE IF NOT EXISTS public.part_fit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog (id) ON DELETE SET NULL,
  work_order_line_id uuid REFERENCES public.maintenance_work_order_lines (id) ON DELETE SET NULL,
  organization_id text NOT NULL,
  outcome text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_fit_feedback_outcome_check CHECK (outcome IN ('fit', 'no_fit', 'modified'))
);

CREATE INDEX IF NOT EXISTS idx_part_fit_feedback_part ON public.part_fit_feedback (part_id);

CREATE TABLE IF NOT EXISTS public.part_core_return (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  work_order_line_id uuid REFERENCES public.maintenance_work_order_lines (id) ON DELETE SET NULL,
  part_id uuid NOT NULL REFERENCES public.part_master (id),
  supplier_id uuid REFERENCES public.supplier (id),
  vehicle_id text NOT NULL,
  core_charge numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  due_by date,
  shipped_at timestamptz,
  credited_at timestamptz,
  credit_amount numeric(12, 2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_core_return_status_check
    CHECK (status IN ('pending', 'shipped', 'credited', 'rejected', 'written_off'))
);

CREATE INDEX IF NOT EXISTS idx_part_core_return_due ON public.part_core_return (status, due_by);

CREATE TABLE IF NOT EXISTS public.part_warranty_claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  work_order_line_id uuid REFERENCES public.maintenance_work_order_lines (id) ON DELETE SET NULL,
  part_id uuid NOT NULL REFERENCES public.part_master (id),
  supplier_id uuid REFERENCES public.supplier (id),
  vehicle_id text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_warranty_claim_status_check
    CHECK (status IN ('open', 'submitted', 'credited', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.part_repeat_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  vehicle_id text,
  component_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  part_number text,
  brand text,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_repeat_alert_kind_check CHECK (kind IN ('component', 'supplier_batch')),
  CONSTRAINT part_repeat_alert_status_check CHECK (status IN ('open', 'dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS part_repeat_alert_open_component
  ON public.part_repeat_alert (vehicle_id, component_id)
  WHERE status = 'open' AND kind = 'component' AND component_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS part_repeat_alert_open_batch
  ON public.part_repeat_alert (part_number)
  WHERE status = 'open' AND kind = 'supplier_batch' AND part_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.part_quote_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text,
  part_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  part_number text,
  qty numeric(12, 3),
  needed_by date,
  supplier_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  status text NOT NULL DEFAULT 'open',
  reply_offer_id uuid REFERENCES public.supplier_part_offer (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_quote_request_status_check CHECK (status IN ('open', 'quoted', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.part_supplier_price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_key text NOT NULL,
  part_number_norm text NOT NULL,
  unit_price numeric(12, 2),
  currency text,
  stock_qty numeric(12, 3),
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT part_supplier_price_cache_key UNIQUE (supplier_key, part_number_norm)
);

CREATE TABLE IF NOT EXISTS public.org_part_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  part_id uuid NOT NULL REFERENCES public.part_master (id) ON DELETE CASCADE,
  qty numeric(12, 3) NOT NULL DEFAULT 0,
  location text,
  reorder_point numeric(12, 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_part_stock_place
  ON public.org_part_stock (organization_id, part_id, coalesce(location, ''));

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_parts_usage_line
  ON public.maintenance_parts_usage (line_id)
  WHERE line_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text
)
LANGUAGE sql
STABLE
AS $$
  WITH cat AS (
    SELECT vc.id, vc.make, vc.platform_id, vc.engine_family_id, vc.production_start_year AS year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  sister AS (
    SELECT string_agg(DISTINCT vc.make, ' / ' ORDER BY vc.make) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id = cat.platform_id
    WHERE vc.platform_id IS NOT NULL
      AND lower(vc.make) <> lower(cat.make)
  ),
  engine_source AS (
    SELECT min(vc.make) AS make
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.engine_family_id = cat.engine_family_id
    WHERE vc.engine_family_id IS NOT NULL
      AND lower(vc.make) <> lower(cat.make)
  ),
  rules AS (
    SELECT r.target_kind, r.source, r."position", r.year_from, r.year_to,
           g.fit_scope, g.id AS group_id
    FROM public.interchange_fitment_rule r
    JOIN public.part_interchange_group g ON g.id = r.interchange_group_id
    CROSS JOIN cat
    WHERE (
      (r.target_kind = 'catalog_variant' AND r.vehicle_catalog_id = cat.id)
      OR (r.target_kind = 'platform' AND r.platform_id = cat.platform_id)
      OR (
        r.target_kind = 'engine_family'
        AND r.engine_family_id = cat.engine_family_id
        AND g.fit_scope IN ('powertrain', 'universal')
      )
    )
    AND (r.year_from IS NULL OR cat.year IS NULL OR cat.year >= r.year_from)
    AND (r.year_to IS NULL OR cat.year IS NULL OR cat.year <= r.year_to)
  ),
  hits AS (
    SELECT pm.id AS part_id, rules.target_kind, rules.source, rules."position", rules.fit_scope, rules.group_id
    FROM rules
    JOIN public.part_master pm ON pm.interchange_group_id = rules.group_id
    UNION ALL
    SELECT pm.id, 'catalog_variant', 'legacy_fitment', NULL::text,
           COALESCE(g.fit_scope, 'chassis'), pm.interchange_group_id
    FROM public.part_fitment pf
    JOIN public.part_master pm ON pm.id = pf.part_id
    LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    CROSS JOIN cat
    WHERE pf.vehicle_catalog_id = cat.id
  ),
  classified AS (
    SELECT
      h.part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      h.fit_scope,
      h.source AS rule_source,
      h."position",
      COALESCE(h.group_id, pm.interchange_group_id) AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        WHEN pm.part_kind = 'oem' AND (
          h.target_kind = 'catalog_variant'
          OR (h.target_kind = 'platform' AND lower(coalesce(pm.manufacturer, '')) = lower(cat.make))
        ) THEN 1
        WHEN h.target_kind = 'platform' THEN 2
        WHEN h.target_kind = 'engine_family' THEN 3
        ELSE 2
      END AS tier
    FROM hits h
    JOIN public.part_master pm ON pm.id = h.part_id
    CROSS JOIN cat
    WHERE p_component_id IS NULL OR pm.maintenance_component_id = p_component_id
  ),
  best AS (
    SELECT DISTINCT ON (part_id) *
    FROM classified
    ORDER BY part_id, tier ASC
  ),
  oem_ref AS (
    SELECT DISTINCT ON (b.interchange_group_id)
      b.interchange_group_id,
      b.oem_part_number AS reference_oem,
      b.manufacturer AS reference_manufacturer
    FROM best b
    WHERE b.part_kind = 'oem' AND b.interchange_group_id IS NOT NULL
    ORDER BY b.interchange_group_id, b.tier ASC
  )
  SELECT
    b.tier,
    b.part_id,
    b.part_name,
    b.oem_part_number,
    b.manufacturer,
    b.part_kind,
    b.fit_scope,
    b.rule_source,
    b."position",
    b.interchange_group_id,
    b.maintenance_component_id,
    b.category_id,
    sister.names AS sister_names,
    engine_source.make AS source_make,
    COALESCE(oem_ref.reference_oem, b.oem_part_number) AS reference_oem,
    COALESCE(oem_ref.reference_manufacturer, b.manufacturer) AS reference_manufacturer,
    COALESCE((
      SELECT array_agg(old.oem_part_number)
      FROM public.part_supersession s
      JOIN public.part_master old ON old.id = s.old_part_id
      WHERE s.new_part_id = b.part_id AND old.oem_part_number IS NOT NULL
    ), ARRAY[]::text[]) AS also_known_as,
    COALESCE((
      SELECT count(*)::integer
      FROM public.part_fit_feedback f
      WHERE f.part_id = b.part_id AND f.outcome = 'fit'
    ), 0) AS confirmed_installs,
    b.description
  FROM best b
  LEFT JOIN sister ON true
  LEFT JOIN engine_source ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = b.interchange_group_id;
$$;

CREATE OR REPLACE FUNCTION public.parts_catalog_coverage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  codes text[] := ARRAY[
    'ENG-OIL', 'ENG-SPARK', 'FILT-AIR', 'HVAC-CABIN', 'BRK-PADS',
    'BELT-SERP', 'LGT-WIPER', 'SUS-INSP', 'FLD-COOL', 'TRN-FLUID'
  ];
  active_ids uuid[];
  total int;
  covered int := 0;
  cid uuid;
  comp uuid;
  ok boolean;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT pm.maintenance_component_id), ARRAY[]::uuid[])
  INTO active_ids
  FROM public.part_master pm
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE c.op_code = ANY (codes);

  SELECT count(*) INTO total
  FROM public.vehicle_catalog
  WHERE nullif(trim(chassis_code), '') IS NOT NULL;

  IF total = 0 OR active_ids IS NULL OR cardinality(active_ids) = 0 THEN
    RETURN jsonb_build_object(
      'coveragePct', 0,
      'vehicleCount', COALESCE(total, 0),
      'coveredCount', 0,
      'componentsWithParts', COALESCE(cardinality(active_ids), 0)
    );
  END IF;

  FOR cid IN
    SELECT id FROM public.vehicle_catalog WHERE nullif(trim(chassis_code), '') IS NOT NULL
  LOOP
    ok := true;
    FOREACH comp IN ARRAY active_ids LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.parts_for_vehicle(cid, comp) p WHERE p.tier BETWEEN 1 AND 3
      ) THEN
        ok := false;
        EXIT;
      END IF;
    END LOOP;
    IF ok THEN
      covered := covered + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'coveragePct', round((covered::numeric / total) * 100, 1),
    'vehicleCount', total,
    'coveredCount', covered,
    'componentsWithParts', cardinality(active_ids)
  );
END;
$$;

-- Usage, part-number link, cores, stock, and warranty prompts in one transaction.
CREATE OR REPLACE FUNCTION public.apply_parts_usage_for_work_order(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  wo public.maintenance_work_orders%ROWTYPE;
  line public.maintenance_work_order_lines%ROWTYPE;
  match_count int;
  match_id uuid;
  norm text;
  offer public.supplier_part_offer%ROWTYPE;
  prev_odo integer;
  prev_at timestamptz;
  prev_part uuid;
  prev_supplier uuid;
  prompts jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO wo FROM public.maintenance_work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'work order not found';
  END IF;

  FOR line IN
    SELECT * FROM public.maintenance_work_order_lines
    WHERE work_order_id = p_work_order_id AND declined IS NOT TRUE
  LOOP
    IF line.part_id IS NULL AND coalesce(trim(line.part_number), '') <> '' THEN
      norm := upper(regexp_replace(line.part_number, '[^A-Za-z0-9]', '', 'g'));
      SELECT count(*)::int, (array_agg(id))[1]
      INTO match_count, match_id
      FROM public.part_master
      WHERE oem_part_number_norm = norm AND oem_part_number_norm <> '';
      IF match_count = 1 THEN
        UPDATE public.maintenance_work_order_lines
        SET part_id = match_id, updated_at = now()
        WHERE id = line.id;
        line.part_id := match_id;
      ELSIF match_count > 1 THEN
        INSERT INTO public.part_number_link_review (organization_id, work_order_line_id, part_number, candidate_count, status)
        VALUES (wo.organization_id, line.id, line.part_number, match_count, 'open')
        ON CONFLICT (work_order_line_id) DO NOTHING;
      END IF;
    END IF;

    IF line.part_id IS NOT NULL THEN
      INSERT INTO public.maintenance_parts_usage (
        organization_id, work_order_id, line_id, part_id, qty, unit_cost, currency, vehicle_id, used_at
      )
      VALUES (
        wo.organization_id,
        wo.id,
        line.id,
        line.part_id,
        COALESCE(line.qty, 1),
        line.unit_price,
        COALESCE(wo.currency, 'JMD'),
        wo.vehicle_id,
        now()
      )
      ON CONFLICT (line_id) WHERE line_id IS NOT NULL DO NOTHING;

      SELECT * INTO offer
      FROM public.supplier_part_offer
      WHERE part_id = line.part_id
        AND is_active = true
        AND core_charge IS NOT NULL
        AND core_charge > 0
        AND (organization_id IS NULL OR organization_id = wo.organization_id)
      ORDER BY (organization_id IS NOT NULL) DESC, unit_price ASC
      LIMIT 1;
      IF FOUND AND NOT EXISTS (
        SELECT 1 FROM public.part_core_return c WHERE c.work_order_line_id = line.id
      ) THEN
        INSERT INTO public.part_core_return (
          organization_id, work_order_line_id, part_id, supplier_id, vehicle_id,
          core_charge, currency, status, due_by
        ) VALUES (
          wo.organization_id, line.id, line.part_id, offer.supplier_id, wo.vehicle_id,
          offer.core_charge, COALESCE(offer.currency, wo.currency, 'JMD'), 'pending',
          (now() + interval '30 days')::date
        );
      END IF;

      UPDATE public.org_part_stock
      SET qty = GREATEST(qty - COALESCE(line.qty, 1), 0), updated_at = now()
      WHERE organization_id = wo.organization_id AND part_id = line.part_id;

      IF line.action = 'replace' AND line.component_id IS NOT NULL THEN
        SELECT pwo.odometer, pwo.closed_at, prev.part_id, o.supplier_id
        INTO prev_odo, prev_at, prev_part, prev_supplier
        FROM public.maintenance_work_order_lines prev
        JOIN public.maintenance_work_orders pwo ON pwo.id = prev.work_order_id
        LEFT JOIN public.supplier_part_offer o ON o.part_id = prev.part_id AND o.is_active = true
          AND (o.warranty_months IS NOT NULL OR o.warranty_km IS NOT NULL)
        WHERE prev.component_id = line.component_id
          AND pwo.vehicle_id = wo.vehicle_id
          AND pwo.id <> wo.id
          AND pwo.status = 'completed'
          AND prev.action = 'replace'
          AND prev.declined IS NOT TRUE
        ORDER BY pwo.closed_at DESC NULLS LAST
        LIMIT 1;
        IF prev_part IS NOT NULL AND (
          (prev_at IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.supplier_part_offer o
            WHERE o.part_id = prev_part AND o.warranty_months IS NOT NULL
              AND prev_at + (o.warranty_months || ' months')::interval > now()
          ))
          OR (prev_odo IS NOT NULL AND wo.odometer IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.supplier_part_offer o
            WHERE o.part_id = prev_part AND o.warranty_km IS NOT NULL
              AND wo.odometer - prev_odo <= o.warranty_km
          ))
        ) THEN
          prompts := prompts || jsonb_build_array(jsonb_build_object(
            'partId', prev_part,
            'supplierId', prev_supplier,
            'componentId', line.component_id,
            'vehicleId', wo.vehicle_id,
            'workOrderLineId', line.id
          ));
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'warrantyPrompts', prompts);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_repeat_part_alerts(p_km integer DEFAULT 10000, p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted int := 0;
  n int;
BEGIN
  INSERT INTO public.part_repeat_alert (organization_id, vehicle_id, component_id, kind, status, detail)
  SELECT wo.organization_id, wo.vehicle_id, l.component_id, 'component', 'open',
         'Same component replaced at least twice inside the km or day window'
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  WHERE l.action = 'replace'
    AND l.declined IS NOT TRUE
    AND l.component_id IS NOT NULL
    AND wo.status = 'completed'
  GROUP BY wo.organization_id, wo.vehicle_id, l.component_id
  HAVING count(*) >= 2
    AND (
      max(wo.odometer) - min(wo.odometer) <= p_km
      OR max(wo.closed_at) - min(wo.closed_at) <= (p_days || ' days')::interval
    )
  ON CONFLICT (vehicle_id, component_id) WHERE status = 'open' AND kind = 'component' AND component_id IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  inserted := inserted + n;

  INSERT INTO public.part_repeat_alert (part_number, brand, kind, status, detail)
  SELECT upper(trim(l.part_number)), max(l.brand), 'supplier_batch', 'open',
         'Same part number replaced on several vehicles'
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  WHERE l.action = 'replace'
    AND coalesce(trim(l.part_number), '') <> ''
    AND wo.status = 'completed'
  GROUP BY upper(trim(l.part_number))
  HAVING count(DISTINCT wo.vehicle_id) >= 3
  ON CONFLICT (part_number) WHERE status = 'open' AND kind = 'supplier_batch' AND part_number IS NOT NULL
  DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  inserted := inserted + n;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_parts_catalog_rows(p_rows jsonb, p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  row jsonb;
  applied int := 0;
  errors jsonb := '[]'::jsonb;
  group_id uuid;
  part_id uuid;
  component_id uuid;
  engine_id uuid;
  platform_id uuid;
  catalog_id uuid;
  scope text;
  kind text;
  target text;
BEGIN
  FOR row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    BEGIN
      scope := row->>'fitScope';
      kind := COALESCE(NULLIF(row->>'partKind', ''), 'oem');
      target := row->>'targetKind';
      IF target = 'engine_family' AND scope NOT IN ('powertrain', 'universal') THEN
        errors := errors || jsonb_build_array('Engine rule rejected for ' || COALESCE(row->>'partNumber', ''));
        CONTINUE;
      END IF;
      INSERT INTO public.part_interchange_group (code, label, fit_scope, import_batch_id)
      VALUES (row->>'interchangeCode', COALESCE(NULLIF(row->>'label', ''), row->>'interchangeCode'), scope, p_batch_id)
      ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, fit_scope = EXCLUDED.fit_scope
      RETURNING id INTO group_id;

      SELECT id INTO component_id
      FROM public.maintenance_service_categories
      WHERE op_code = NULLIF(row->>'componentOpCode', '')
      LIMIT 1;

      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, import_batch_id, updated_at
      )
      SELECT
        (SELECT id FROM public.part_category ORDER BY sort_order LIMIT 1),
        COALESCE(NULLIF(row->>'partName', ''), row->>'partNumber'),
        row->>'partNumber',
        NULLIF(row->>'manufacturer', ''),
        kind,
        group_id,
        component_id,
        p_batch_id,
        now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.part_master pm
        WHERE upper(coalesce(pm.manufacturer, '')) = upper(coalesce(row->>'manufacturer', ''))
          AND pm.oem_part_number_norm = upper(regexp_replace(coalesce(row->>'partNumber', ''), '[^A-Za-z0-9]', '', 'g'))
          AND pm.oem_part_number_norm <> ''
      );
      SELECT id INTO part_id
      FROM public.part_master
      WHERE upper(coalesce(manufacturer, '')) = upper(coalesce(row->>'manufacturer', ''))
        AND oem_part_number_norm = upper(regexp_replace(coalesce(row->>'partNumber', ''), '[^A-Za-z0-9]', '', 'g'))
      LIMIT 1;
      IF part_id IS NULL THEN
        errors := errors || jsonb_build_array('Could not save part ' || COALESCE(row->>'partNumber', ''));
        CONTINUE;
      END IF;
      UPDATE public.part_master
      SET interchange_group_id = group_id,
          maintenance_component_id = COALESCE(component_id, maintenance_component_id),
          part_kind = kind
      WHERE id = part_id;

      engine_id := NULL;
      platform_id := NULL;
      catalog_id := NULL;
      IF target = 'engine_family' THEN
        SELECT id INTO engine_id FROM public.engine_family WHERE code = upper(trim(row->>'targetCode'));
      ELSIF target = 'platform' THEN
        SELECT id INTO platform_id FROM public.vehicle_platform WHERE code = upper(trim(row->>'targetCode'));
      ELSIF target = 'catalog_variant' THEN
        catalog_id := NULLIF(row->>'targetCode', '')::uuid;
      END IF;
      IF (target = 'engine_family' AND engine_id IS NULL)
        OR (target = 'platform' AND platform_id IS NULL)
        OR (target = 'catalog_variant' AND catalog_id IS NULL) THEN
        errors := errors || jsonb_build_array('Unknown target ' || COALESCE(row->>'targetCode', ''));
        CONTINUE;
      END IF;

      INSERT INTO public.interchange_fitment_rule (
        interchange_group_id, target_kind, engine_family_id, platform_id, vehicle_catalog_id,
        year_from, year_to, "position", source, import_batch_id
      ) VALUES (
        group_id, target, engine_id, platform_id, catalog_id,
        NULLIF(row->>'yearFrom', '')::integer,
        NULLIF(row->>'yearTo', '')::integer,
        NULLIF(row->>'position', ''),
        'import',
        p_batch_id
      );
      applied := applied + 1;
    EXCEPTION WHEN OTHERS THEN
      errors := errors || jsonb_build_array(SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('applied', applied, 'errors', errors, 'batchId', p_batch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_parts_catalog_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  rules int;
  parts int;
BEGIN
  DELETE FROM public.interchange_fitment_rule WHERE import_batch_id = p_batch_id;
  GET DIAGNOSTICS rules = ROW_COUNT;
  DELETE FROM public.part_master pm
  WHERE pm.import_batch_id = p_batch_id
    AND NOT EXISTS (SELECT 1 FROM public.maintenance_parts_usage u WHERE u.part_id = pm.id);
  GET DIAGNOSTICS parts = ROW_COUNT;
  DELETE FROM public.part_interchange_group g
  WHERE g.import_batch_id = p_batch_id
    AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = g.id);
  RETURN jsonb_build_object('rulesRemoved', rules, 'partsRemoved', parts);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.vehicle_platform ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_interchange_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interchange_fitment_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_supersession ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_term_synonym ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_number_link_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_fit_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_core_return ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_warranty_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_repeat_alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_quote_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_supplier_price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_part_stock ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicle_platform', 'engine_family', 'part_interchange_group', 'interchange_fitment_rule',
    'part_supersession', 'part_term_synonym', 'part_number_link_review', 'part_fit_feedback',
    'part_core_return', 'part_warranty_claim', 'part_repeat_alert', 'part_quote_request',
    'part_supplier_price_cache', 'org_part_stock'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_direct', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      t || '_no_direct', t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parts_catalog_coverage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_parts_usage_for_work_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_repeat_part_alerts(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_parts_catalog_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.parts_catalog_coverage() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_parts_usage_for_work_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_repeat_part_alerts(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_parts_catalog_rows(jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_parts_catalog_batch(uuid) TO service_role;
