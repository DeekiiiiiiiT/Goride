-- Read-only Phase 3a checks (trust + trusted_source). Run on DB with parts data.

SELECT * FROM (
  SELECT
    'trusted_source_seed_car_makers'::text AS check_name,
    (
      (SELECT count(*)::int FROM public.trusted_source ts WHERE ts.kind = 'car_maker' AND ts.maker_norm = 'toyota') = 3
      AND (SELECT count(*)::int FROM public.trusted_source ts WHERE ts.kind = 'car_maker' AND ts.maker_norm = 'daihatsu') = 3
      AND (SELECT count(*)::int FROM public.trusted_source ts WHERE ts.kind = 'car_maker' AND ts.maker_norm = 'lexus') = 2
    ) AS pass,
    format(
      'toyota=%s daihatsu=%s lexus=%s',
      (SELECT count(*)::text FROM public.trusted_source ts WHERE ts.kind = 'car_maker' AND ts.maker_norm = 'toyota'),
      (SELECT count(*)::text FROM public.trusted_source ts WHERE ts.kind = 'car_maker' AND ts.maker_norm = 'daihatsu'),
      (SELECT count(*)::text FROM public.trusted_source ts WHERE ts.kind = 'car_maker' AND ts.maker_norm = 'lexus')
    ) AS detail

  UNION ALL

  SELECT
    'trusted_source_seed_part_makers'::text,
    (
      EXISTS (SELECT 1 FROM public.trusted_source ts WHERE ts.kind = 'part_maker' AND ts.maker_norm = 'sb nagamochi' AND ts.domain = 'sbparts.jp')
      AND EXISTS (SELECT 1 FROM public.trusted_source ts WHERE ts.kind = 'part_maker' AND ts.maker_norm = 'nibk' AND ts.domain = 'jnbk-brakes.com')
      AND EXISTS (SELECT 1 FROM public.trusted_source ts WHERE ts.kind = 'part_maker' AND ts.maker_norm = 'brembo' AND ts.domain = 'bremboparts.com')
    ),
    'expect SB Nagamochi, NiBK, Brembo domains'::text

  UNION ALL

  SELECT
    'part_listing_trust_present'::text,
    COALESCE(
      NOT EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.trust IS NULL
      ),
      true
    ),
    format('listings_with_null_trust=%s', coalesce((SELECT count(*)::text FROM public.part_listing pl WHERE pl.trust IS NULL), 'n/a'))

  UNION ALL

  SELECT
    'listing_domains_maker_sites_confirmed'::text,
    COALESCE(
      -- Only listings whose group still holds parts: a same-part merge moves the parts and
      -- leaves the old group's listings parked (so undo can move the parts back). Parked
      -- listings have no part maker to match, so they are reported, not judged.
      (SELECT bool_and(pl.trust = 'confirmed')
       FROM public.part_listing pl
       WHERE (pl.evidence_url ILIKE '%://%sbparts.jp%'
          OR pl.evidence_url ILIKE '%://%jnbk-brakes.com%'
          OR pl.evidence_url ILIKE '%://%bremboparts.com%')
         AND EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = pl.interchange_group_id)),
      true
    ),
    format(
      'rows=%s parked_on_empty_groups=%s',
      (SELECT count(*)::text FROM public.part_listing pl
       WHERE (pl.evidence_url ILIKE '%://%sbparts.jp%'
          OR pl.evidence_url ILIKE '%://%jnbk-brakes.com%'
          OR pl.evidence_url ILIKE '%://%bremboparts.com%')
         AND EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = pl.interchange_group_id)),
      (SELECT count(*)::text FROM public.part_listing pl
       WHERE NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.interchange_group_id = pl.interchange_group_id))
    )

  UNION ALL

  SELECT
    'listing_domains_shops_needs_checking'::text,
    COALESCE(
      (SELECT bool_and(pl.trust = 'needs_checking')
       FROM public.part_listing pl
       WHERE pl.evidence_url ILIKE '%fitinpart%'
          OR pl.evidence_url ILIKE '%spareto%'
          OR pl.evidence_url ILIKE '%yoshiparts%'
          OR pl.evidence_url ILIKE '%toyota-club%'),
      true
    ),
    format(
      'rows=%s',
      (SELECT count(*)::text FROM public.part_listing pl
       WHERE pl.evidence_url ILIKE '%fitinpart%'
          OR pl.evidence_url ILIKE '%spareto%'
          OR pl.evidence_url ILIKE '%yoshiparts%'
          OR pl.evidence_url ILIKE '%toyota-club%')
    )

  UNION ALL

  SELECT
    'oe_04465b1190_confirmed_sb_nibk'::text,
    COALESCE(
      NOT EXISTS (
        SELECT 1
        FROM public.vehicle_oe_number von
        WHERE von.oe_number_norm = '04465B1190'
          AND (von.trust IS DISTINCT FROM 'confirmed'
            OR coalesce(von.trust_reason, '') NOT ILIKE '%NiBK%'
            OR coalesce(von.trust_reason, '') NOT ILIKE '%agree%')
      ),
      true
    ),
    format('rows=%s', (SELECT count(*)::text FROM public.vehicle_oe_number von WHERE von.oe_number_norm = '04465B1190'))

  UNION ALL

  SELECT
    'source_domain_normalization'::text,
    (public.source_domain('https://www.SBparts.jp/catalogue/1?x=1') = 'sbparts.jp'),
    coalesce(public.source_domain('https://www.SBparts.jp/catalogue/1?x=1'), 'null')

) checks
ORDER BY check_name;
