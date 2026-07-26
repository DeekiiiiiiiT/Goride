-- Root cause: reverse posts a compensating row, but the original still held
-- idx_fin_events_active_source (WHERE reverses_event_id IS NULL). Re-finalize
-- after delete/reset then collided on (source_system, source_id, event_type).
-- Fix: mark originals reversed_at when a reverse is posted; unique index ignores them.

ALTER TABLE ledger.financial_events
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL;

-- Backfill: any event already pointed at by a reverse is superseded.
UPDATE ledger.financial_events e
SET reversed_at = COALESCE(e.reversed_at, r.created_at, now())
FROM ledger.financial_events r
WHERE r.reverses_event_id = e.id
  AND e.reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_events_reversed_at
  ON ledger.financial_events(reversed_at)
  WHERE reversed_at IS NOT NULL;

DROP INDEX IF EXISTS ledger.idx_fin_events_active_source;
CREATE UNIQUE INDEX idx_fin_events_active_source
  ON ledger.financial_events(source_system, source_id, event_type)
  WHERE reverses_event_id IS NULL AND reversed_at IS NULL;

-- Mark prior event when a reverse row is inserted (frees active-source slot).
CREATE OR REPLACE FUNCTION ledger.mark_reversed_on_reverse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'ledger', 'public'
AS $$
BEGIN
  IF NEW.reverses_event_id IS NOT NULL THEN
    UPDATE ledger.financial_events
    SET reversed_at = COALESCE(reversed_at, now())
    WHERE id = NEW.reverses_event_id
      AND reversed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_events_mark_reversed ON ledger.financial_events;
CREATE TRIGGER trg_fin_events_mark_reversed
AFTER INSERT ON ledger.financial_events
FOR EACH ROW
WHEN (NEW.reverses_event_id IS NOT NULL)
EXECUTE FUNCTION ledger.mark_reversed_on_reverse();

CREATE OR REPLACE VIEW public.financial_events AS SELECT * FROM ledger.financial_events;
