-- One border publish at a time. Claimed before the coverage grid is built.
-- A lock older than 10 minutes is abandoned so a crashed publish cannot block the next one.

CREATE TABLE IF NOT EXISTS geo.publish_guard (
  id smallint PRIMARY KEY CHECK (id = 1),
  started_at timestamptz,
  holder text
);

INSERT INTO geo.publish_guard (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE geo.publish_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE geo.publish_guard FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION geo.try_begin_publish(p_holder text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
DECLARE
  got integer;
BEGIN
  IF p_holder IS NULL OR btrim(p_holder) = '' THEN
    RETURN false;
  END IF;

  UPDATE geo.publish_guard
  SET started_at = now(), holder = p_holder
  WHERE id = 1
    AND (
      started_at IS NULL
      OR started_at < now() - interval '10 minutes'
      OR holder = p_holder
    );

  GET DIAGNOSTICS got = ROW_COUNT;
  RETURN got = 1;
END;
$$;

CREATE OR REPLACE FUNCTION geo.finish_publish(p_holder text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = geo, public
AS $$
BEGIN
  UPDATE geo.publish_guard
  SET started_at = NULL, holder = NULL
  WHERE id = 1
    AND holder = p_holder;
END;
$$;

REVOKE ALL ON FUNCTION geo.try_begin_publish(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION geo.finish_publish(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION geo.try_begin_publish(text) TO service_role;
GRANT EXECUTE ON FUNCTION geo.finish_publish(text) TO service_role;
