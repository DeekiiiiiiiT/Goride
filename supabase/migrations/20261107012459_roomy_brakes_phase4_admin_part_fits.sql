-- Phase 4 (RB-10): admin_catalog_master_part — engine on fits + PLATFORM TWIN sisters (restored).

CREATE OR REPLACE FUNCTION public.admin_catalog_master_part(p_part_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_group uuid;
  v_part jsonb;
  v_fits jsonb;
  v_twins jsonb;
  v_factory jsonb;
  v_wva text;
  v_pos text;
  v_side text;
  v_fit_count integer;
  v_members jsonb;
  v_hash text;
BEGIN
  SELECT jsonb_build_object(
    'partId', pm.id,
    'groupId', pm.interchange_group_id,
    'name', coalesce(pm.name, ''),
    'number', coalesce(pm.oem_part_number, ''),
    'brand', coalesce(pm.manufacturer, ''),
    'partType', coalesce(mc.plain_name, mc.name, ''),
    'tier', CASE
      WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
      WHEN coalesce(g.fit_scope, '') = 'powertrain'
        AND NOT EXISTS (
          SELECT 1 FROM public.part_listing listed
          WHERE listed.interchange_group_id = pm.interchange_group_id
        ) THEN 3
      ELSE 1
    END,
    'status', CASE WHEN pm.catalog_decision = 'confirmed' THEN 'verified' ELSE 'needs_checking' END,
    'evidenceUrl', coalesce(pm.evidence_url, (
      SELECT pl.evidence_url FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id
      ORDER BY pl.verified_at DESC NULLS LAST
      LIMIT 1
    )),
    'note', coalesce(pm.description, (
      SELECT pl.note FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id AND coalesce(pl.note, '') <> ''
      LIMIT 1
    ), '')
  ), pm.interchange_group_id
  INTO v_part, v_group
  FROM public.part_master pm
  LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  LEFT JOIN public.maintenance_service_categories mc ON mc.id = pm.maintenance_component_id
  WHERE pm.id = p_part_id
    AND pm.catalog_decision IS DISTINCT FROM 'rejected';

  IF v_part IS NULL THEN
    RETURN jsonb_build_object('error', 'Part not on file');
  END IF;

  SELECT pin.value INTO v_wva
  FROM public.part_index_number pin
  WHERE pin.part_id = p_part_id AND pin.index_type = 'wva'
  ORDER BY pin.created_at DESC
  LIMIT 1;

  SELECT pl.position, pl.side INTO v_pos, v_side
  FROM public.part_listing pl
  WHERE pl.interchange_group_id = v_group
  ORDER BY pl.verified_at DESC NULLS LAST, pl.created_at DESC
  LIMIT 1;

  SELECT count(DISTINCT pl.vehicle_catalog_id)::integer INTO v_fit_count
  FROM public.part_listing pl
  WHERE pl.interchange_group_id = v_group;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'partId', pm2.id,
      'number', pm2.oem_part_number,
      'brand', pm2.manufacturer,
      'name', pm2.name
    ) ORDER BY pm2.oem_part_number
  ), '[]'::jsonb)
  INTO v_members
  FROM public.part_master pm2
  WHERE pm2.interchange_group_id = v_group;

  SELECT left(md5(
    coalesce((SELECT oem_part_number_norm FROM public.part_master WHERE id = p_part_id), '')
    || '|' || coalesce(v_group::text, '')
    || '|' || coalesce((SELECT revision::text FROM public.part_interchange_group WHERE id = v_group), '0')
  ), 8)
  INTO v_hash;

  SELECT coalesce(jsonb_agg(fit ORDER BY fit->>'linkType', fit->>'make', fit->>'model'), '[]'::jsonb)
  INTO v_fits
  FROM (
    SELECT jsonb_build_object(
      'listingId', pl.id,
      'variantId', vc.id,
      'make', vc.make,
      'model', vc.model,
      'chassis', coalesce(vc.chassis_code, ''),
      'engine', coalesce(vc.engine_code, ''),
      'years', CASE
        WHEN pl.year_from IS NULL AND pl.year_to IS NULL THEN trim(both FROM
          coalesce(vc.production_start_year::text, '') ||
          CASE WHEN vc.production_end_year IS NULL THEN '–present' ELSE '–' || vc.production_end_year::text END
        )
        ELSE coalesce(pl.year_from::text, '') || '–' || coalesce(pl.year_to::text, 'present')
      END,
      'yearFrom', pl.year_from,
      'yearTo', pl.year_to,
      'position', coalesce(pl.position, ''),
      'side', coalesce(pl.side, ''),
      'linkType', 'DIRECT',
      'evidenceUrl', pl.evidence_url,
      'trust', pl.trust,
      'trustReason', pl.trust_reason,
      'trustSetBy', pl.trust_set_by
    ) AS fit
    FROM public.part_listing pl
    JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
    WHERE pl.interchange_group_id = v_group
    LIMIT 80
  ) direct;

  v_twins := '[]'::jsonb;
  IF v_group IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(fit ORDER BY fit->>'make', fit->>'model'), '[]'::jsonb)
    INTO v_twins
    FROM (
      SELECT jsonb_build_object(
        'variantId', vc.id,
        'make', vc.make,
        'model', vc.model,
        'chassis', coalesce(vc.chassis_code, ''),
        'engine', coalesce(vc.engine_code, ''),
        'years', trim(both FROM coalesce(vc.production_start_year::text, '') ||
          CASE WHEN vc.production_end_year IS NULL THEN '–present' ELSE '–' || vc.production_end_year::text END),
        'position', '',
        'linkType', 'PLATFORM TWIN',
        -- Same body as a listed car, but nobody has a source for this car: never Confirmed.
        'trust', 'needs_checking',
        'trustReason', 'Same body as a listed car; no source for this car yet'
      ) AS fit
      FROM public.vehicle_catalog vc
      WHERE vc.platform_id IN (
        SELECT family.id
        FROM public.vehicle_platform family
        WHERE family.parent_id IN (
          SELECT coalesce(vp.parent_id, vp.id)
          FROM public.part_listing pl
          JOIN public.vehicle_catalog listed ON listed.id = pl.vehicle_catalog_id
          JOIN public.vehicle_platform vp ON vp.id = listed.platform_id
          WHERE pl.interchange_group_id = v_group
        )
        OR family.id IN (
          SELECT coalesce(vp.parent_id, vp.id)
          FROM public.part_listing pl
          JOIN public.vehicle_catalog listed ON listed.id = pl.vehicle_catalog_id
          JOIN public.vehicle_platform vp ON vp.id = listed.platform_id
          WHERE pl.interchange_group_id = v_group
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = vc.id
      )
    ) twins;
  END IF;

  v_fits := coalesce(v_fits, '[]'::jsonb) || coalesce(v_twins, '[]'::jsonb);

  SELECT coalesce(jsonb_agg(obj ORDER BY obj->>'make', obj->>'model', obj->>'oeNumber'), '[]'::jsonb)
  INTO v_factory
  FROM (
    SELECT DISTINCT ON (von.id)
      jsonb_build_object(
        'oeId', von.id,
        'variantId', von.vehicle_catalog_id,
        'make', vc.make,
        'model', vc.model,
        'oeNumber', von.oe_number,
        'oeBrand', von.oe_brand,
        'evidenceUrl', von.evidence_url,
        'evidenceUrl2', von.evidence_url_2,
        'trust', von.trust,
        'trustReason', von.trust_reason,
        'trustSetBy', von.trust_set_by
      ) AS obj
    FROM public.part_fit_derived d
    JOIN public.vehicle_oe_number von ON von.id = d.vehicle_oe_number_id
    JOIN public.vehicle_catalog vc ON vc.id = von.vehicle_catalog_id
    WHERE d.interchange_group_id = v_group
      AND d.vehicle_oe_number_id IS NOT NULL
    ORDER BY von.id
    LIMIT 200
  ) oe;

  RETURN v_part
    || jsonb_build_object(
      'wva', v_wva,
      'position', coalesce(v_pos, ''),
      'side', coalesce(v_side, ''),
      'fitCount', coalesce(v_fit_count, 0),
      'groupRevision', (SELECT ig.revision FROM public.part_interchange_group ig WHERE ig.id = v_group),
      'groupCode', (SELECT ig.code FROM public.part_interchange_group ig WHERE ig.id = v_group),
      'groupMembers', coalesce(v_members, '[]'::jsonb),
      'provenanceHash', v_hash,
      'hash', v_hash,
      'fits', coalesce(v_fits, '[]'::jsonb),
      'factoryOeOnCars', coalesce(v_factory, '[]'::jsonb)
    );
END;
$fn$;
