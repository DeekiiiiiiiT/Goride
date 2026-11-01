CREATE OR REPLACE FUNCTION fleet.inv_ledger_hash_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO fleet, public, extensions
AS $function$
DECLARE
  v_prev_hash text;
  v_prev_block bigint;
  v_canonical text;
BEGIN
  IF NEW.block_no IS NOT NULL AND NEW.block_no > 0 AND NEW.row_hash IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.row_hash, l.block_no
  INTO v_prev_hash, v_prev_block
  FROM fleet.inv_ledger l
  WHERE l.organization_id = NEW.organization_id
  ORDER BY l.block_no DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_prev_hash := repeat('0', 64);
    NEW.block_no := 1;
  ELSE
    NEW.block_no := v_prev_block + 1;
    NEW.prev_hash := v_prev_hash;
  END IF;

  IF NEW.prev_hash IS NULL OR NEW.prev_hash = '' THEN
    NEW.prev_hash := v_prev_hash;
  END IF;

  v_canonical := fleet.inv_ledger_canonical(NEW);
  NEW.row_hash := encode(digest(NEW.prev_hash || '|' || v_canonical, 'sha256'), 'hex');
  RETURN NEW;
END;
$function$;
;
