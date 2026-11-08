-- V-15: Key-part readiness counts verified when a tier 1–3 part has a part_listing
-- for that car with trust = 'confirmed' (per-car trust), not only catalog_decision.

DROP MATERIALIZED VIEW public.variant_parts_readiness;

CREATE MATERIALIZED VIEW public.variant_parts_readiness AS
 WITH core AS (
         SELECT v.op_code
           FROM ( VALUES ('ENG-OIL'::text), ('ENG-SPARK'::text), ('ENG-THERM'::text), ('FILT-AIR'::text), ('HVAC-CABIN'::text), ('BRK-PADS'::text), ('BELT-SERP'::text), ('LGT-WIPER'::text), ('BRK-ROTOR'::text), ('SUS-SHOCK'::text)) v(op_code)
        ), comp AS (
         SELECT c.id,
            c.op_code
           FROM public.maintenance_service_categories c
             JOIN core ON core.op_code = c.op_code
        ), na AS (
         SELECT DISTINCT ON (vc.id, comp.op_code) vc.id AS variant_id,
            comp.op_code,
            a.applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             JOIN public.catalog_component_applicability a ON a.component_id = comp.id
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE a.scope = 'variant'::text AND a.vehicle_catalog_id = vc.id OR a.scope = 'platform'::text AND (a.platform_id = vc.platform_id OR a.platform_id = mine.parent_id) OR a.scope = 'engine_family'::text AND a.engine_family_id = vc.engine_family_id
          ORDER BY vc.id, comp.op_code, (
                CASE a.scope
                    WHEN 'variant'::text THEN 1
                    WHEN 'platform'::text THEN 2
                    ELSE 3
                END)
        ), spec_hit AS (
         SELECT DISTINCT vc.id AS variant_id,
            c.op_code
           FROM public.vehicle_catalog vc
             JOIN public.catalog_spec_value sv ON true
             JOIN public.spec_key sk ON sk.key = sv.spec_key
             JOIN public.maintenance_service_categories c ON c.id = sk.component_id
             JOIN core ON core.op_code = c.op_code
             LEFT JOIN public.vehicle_platform mine ON mine.id = vc.platform_id
          WHERE COALESCE(btrim(sv.evidence_url), ''::text) <> ''::text AND COALESCE(btrim(sv.value), ''::text) <> ''::text AND (sv.scope = 'variant'::text AND sv.vehicle_catalog_id = vc.id OR sv.scope = 'platform'::text AND (sv.platform_id = vc.platform_id OR sv.platform_id = mine.parent_id) OR sv.scope = 'engine_family'::text AND sv.engine_family_id = vc.engine_family_id)
        ), hits AS (
         SELECT vc.id AS variant_id,
            comp.op_code,
            bool_or(
              p.tier >= 1 AND p.tier <= 3 AND (
                pm.catalog_decision = 'confirmed'::text
                OR EXISTS (
                  SELECT 1
                  FROM public.part_listing pl
                  WHERE pl.vehicle_catalog_id = vc.id
                    AND pl.interchange_group_id = pm.interchange_group_id
                    AND pl.trust = 'confirmed'
                )
              )
            ) OR bool_or(sh.op_code IS NOT NULL) AS verified,
            bool_or(p.part_id IS NOT NULL AND pm.catalog_decision IS DISTINCT FROM 'rejected'::text AND p.tier >= 1 AND p.tier <= 3) AS any_part,
            bool_or(na.applicable = false) AS not_applicable
           FROM public.vehicle_catalog vc
             CROSS JOIN comp
             LEFT JOIN LATERAL public.parts_for_vehicle(vc.id, comp.id, NULL::integer) p ON true
             LEFT JOIN public.part_master pm ON pm.id = p.part_id
             LEFT JOIN na ON na.variant_id = vc.id AND na.op_code = comp.op_code
             LEFT JOIN spec_hit sh ON sh.variant_id = vc.id AND sh.op_code = comp.op_code
          GROUP BY vc.id, comp.op_code
        ), rolled AS (
         SELECT hits.variant_id,
            count(*) FILTER (WHERE hits.verified OR hits.not_applicable)::integer AS components_ready,
            jsonb_object_agg(hits.op_code,
                CASE
                    WHEN hits.verified THEN 'verified'::text
                    WHEN hits.not_applicable THEN 'not_applicable'::text
                    WHEN hits.any_part THEN 'unverified'::text
                    ELSE 'missing'::text
                END) AS cells
           FROM hits
          GROUP BY hits.variant_id
        )
 SELECT variant_id,
    components_ready,
    components_ready = (( SELECT count(*) AS count
           FROM core)) AS ready,
    cells
   FROM rolled;

CREATE UNIQUE INDEX variant_parts_readiness_variant_id ON public.variant_parts_readiness USING btree (variant_id);
REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;

REFRESH MATERIALIZED VIEW public.variant_parts_readiness;
