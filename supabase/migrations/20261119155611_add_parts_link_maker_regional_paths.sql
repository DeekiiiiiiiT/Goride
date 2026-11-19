-- Add parts: the car maker read from a catalogue link also accepts regional catalogue paths.
-- Amayama's genuine-catalogue links say /toyota-japan/ (also /toyota-europe/, /lexus-japan/…), not /toyota/, so the maker
-- was never found and a trusted Toyota page still saved as "Needs checking". Same function, wider path match only:
-- '/toyota/' and '/toyota-<region>/' both mean Toyota (likewise Daihatsu, Subaru, Suzuki; Lexus added, it has its own
-- trusted rows). Everything else is unchanged.

CREATE OR REPLACE FUNCTION public.self_serve_link_hints(p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  u text := btrim(coalesce(p_url, ''));
  d text;
  frames text[];
  path_lower text;
  catalog_maker text;
  trust text;
  trusted_site boolean := false;
BEGIN
  IF u = '' OR u !~* '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_url');
  END IF;
  d := public.source_domain(u);
  frames := public.self_serve_link_frame_codes(u);
  path_lower := lower(u);
  IF path_lower ~ '/toyota(-[a-z]+)?/' THEN catalog_maker := 'Toyota';
  ELSIF path_lower ~ '/lexus(-[a-z]+)?/' THEN catalog_maker := 'Lexus';
  ELSIF path_lower ~ '/daihatsu(-[a-z]+)?/' THEN catalog_maker := 'Daihatsu';
  ELSIF path_lower ~ '/subaru(-[a-z]+)?/' THEN catalog_maker := 'Subaru';
  ELSIF path_lower ~ '/suzuki(-[a-z]+)?/' THEN catalog_maker := 'Suzuki';
  END IF;
  trust := public.source_trust(u, lower(coalesce(catalog_maker, '')), ARRAY[]::text[]);
  trusted_site := trust = 'confirmed';
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'host', d,
    'trustedSite', trusted_site,
    'catalogMaker', catalog_maker,
    'frameCodes', to_jsonb(frames),
    'sourceTrust', trust
  ));
END;
$function$;

REVOKE ALL ON FUNCTION public.self_serve_link_hints(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_link_hints(text) TO service_role;
