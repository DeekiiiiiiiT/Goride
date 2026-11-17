-- C3c fix: persist staff user on become_ready (replace / restore)

DROP FUNCTION IF EXISTS public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text
);

CREATE OR REPLACE FUNCTION public.vehicle_picture_become_ready(
  p_picture_id uuid,
  p_version int,
  p_r2_key text,
  p_cost_usd numeric,
  p_provider text,
  p_ai_model text,
  p_prompt_version int,
  p_prompt text,
  p_source text DEFAULT 'ai',
  p_made_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_source NOT IN ('ai', 'staff_upload', 'restore') THEN
    RAISE EXCEPTION 'invalid source %', p_source;
  END IF;

  INSERT INTO public.vehicle_picture_version (
    picture_id, version, r2_key, source, cost_usd, provider, ai_model, prompt_version
  ) VALUES (
    p_picture_id, p_version, p_r2_key, p_source, p_cost_usd, p_provider, p_ai_model, p_prompt_version
  );

  UPDATE public.vehicle_picture_version
  SET retired_at = now()
  WHERE picture_id = p_picture_id
    AND version < p_version
    AND retired_at IS NULL;

  UPDATE public.vehicle_picture
  SET
    status = 'ready',
    r2_key = p_r2_key,
    source = p_source,
    cost_usd = p_cost_usd,
    provider = p_provider,
    ai_model = p_ai_model,
    prompt = p_prompt,
    prompt_version = p_prompt_version,
    made_at = now(),
    made_by = p_made_by,
    lease_until = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_picture_id;
END;
$$;

ALTER FUNCTION public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_picture_become_ready(
  uuid, int, text, numeric, text, text, int, text, text, uuid
) TO service_role;