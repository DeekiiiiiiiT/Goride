-- D4 (F-15): sealed-week guard on fuel.week_lines only (fuel_system, toll pattern).

CREATE SCHEMA IF NOT EXISTS fuel_system;

CREATE OR REPLACE FUNCTION fuel_system.seal_writer_on(p_command_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('fuel.seal_writer', 'on', true);
  PERFORM set_config('fuel.seal_writer_cmd', coalesce(p_command_id, ''), true);
  PERFORM set_config(
    'fuel.seal_writer_proof',
    md5(coalesce(p_command_id, '') || ':' || txid_current()::text),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION fuel_system.seal_writer_off()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('fuel.seal_writer', 'off', true);
  PERFORM set_config('fuel.seal_writer_cmd', '', true);
  PERFORM set_config('fuel.seal_writer_proof', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION fuel_system.seal_week_guard_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(current_setting('fuel.seal_writer', true), 'off') = 'on'
     AND coalesce(current_setting('fuel.seal_writer_proof', true), '') =
         md5(coalesce(current_setting('fuel.seal_writer_cmd', true), '') || ':' || txid_current()::text);
$$;

-- A fuel week is one period per company × week × service line, so the guard checks the
-- line's own period, never "any period that week" (Rideshare locked must not block Delivery).
CREATE OR REPLACE FUNCTION fuel_system.period_is_locked(p_org text, p_period_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fuel_reconciliation_period p
    WHERE p.id = p_period_id
      AND p.org_id::text = p_org
      AND (p.status = 'locked' OR p.locked_at IS NOT NULL)
  );
$$;

CREATE OR REPLACE FUNCTION fuel.sealed_week_raise(p_table text, p_week_key date, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING MESSAGE = 'SEALED_WEEK_LOCKED',
    DETAIL = json_build_object('table', p_table, 'week_key', p_week_key, 'id', p_id)::text,
    ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION fuel.tg_week_lines_sealed_week_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF fuel_system.seal_week_guard_bypass() THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- The row being removed or changed (its old period) …
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND fuel_system.period_is_locked(OLD.org_id, OLD.period_id) THEN
    PERFORM fuel.sealed_week_raise('fuel.week_lines', OLD.week_start, OLD.id);
  END IF;
  -- … and the row being written (its new period), so a line can't be moved in or out.
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND fuel_system.period_is_locked(NEW.org_id, NEW.period_id) THEN
    PERFORM fuel.sealed_week_raise('fuel.week_lines', NEW.week_start, NEW.id);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS week_lines_sealed_week_guard ON fuel.week_lines;

CREATE TRIGGER week_lines_sealed_week_guard
  BEFORE INSERT OR UPDATE OR DELETE ON fuel.week_lines
  FOR EACH ROW
  EXECUTE FUNCTION fuel.tg_week_lines_sealed_week_guard();

REVOKE ALL ON FUNCTION fuel_system.seal_writer_on(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fuel_system.seal_writer_off() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fuel_system.seal_week_guard_bypass() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fuel_system.period_is_locked(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fuel_system.seal_writer_on(text) TO service_role;
GRANT EXECUTE ON FUNCTION fuel_system.seal_writer_off() TO service_role;
GRANT EXECUTE ON FUNCTION fuel_system.seal_week_guard_bypass() TO service_role;
GRANT EXECUTE ON FUNCTION fuel_system.period_is_locked(text, text) TO service_role;