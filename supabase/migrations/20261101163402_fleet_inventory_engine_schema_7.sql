
CREATE OR REPLACE FUNCTION fleet.inv_deny_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'inv_ledger is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_canonical(p_row fleet.inv_ledger)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = fleet, pg_temp
AS $$
  SELECT concat_ws(
    '|',
    p_row.organization_id,
    p_row.movement_id::text,
    p_row.item_id::text,
    p_row.location_id::text,
    COALESCE(p_row.bin_id::text, ''),
    COALESCE(p_row.asset_id::text, ''),
    p_row.qty_delta::text,
    COALESCE(p_row.unit_cost::text, ''),
    p_row.currency,
    p_row.block_no::text
  );
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_hash_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_refresh_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_line_value numeric(14, 2);
BEGIN
  v_line_value := COALESCE(NEW.unit_cost, 0) * NEW.qty_delta;

  INSERT INTO fleet.inv_balance (
    organization_id, item_id, location_id, bin_id, on_hand, value, updated_at
  )
  VALUES (
    NEW.organization_id, NEW.item_id, NEW.location_id, NEW.bin_id,
    NEW.qty_delta, v_line_value, now()
  )
  ON CONFLICT (organization_id, item_id, location_id, bin_key) DO UPDATE
  SET
    on_hand = fleet.inv_balance.on_hand + EXCLUDED.on_hand,
    value = fleet.inv_balance.value + EXCLUDED.value,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_ledger_immutable ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_immutable
  BEFORE UPDATE OR DELETE ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_deny_ledger_mutation();

DROP TRIGGER IF EXISTS trg_inv_ledger_hash ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_hash
  BEFORE INSERT ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_ledger_hash_on_insert();

DROP TRIGGER IF EXISTS trg_inv_ledger_balance ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_balance
  AFTER INSERT ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_ledger_refresh_balance();
