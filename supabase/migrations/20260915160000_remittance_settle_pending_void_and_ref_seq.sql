-- R-3 pending|void settlement status · R-8 sequence references

ALTER TABLE delivery.courier_remittance_settlements
  DROP CONSTRAINT IF EXISTS courier_remittance_settlements_status_check;

ALTER TABLE delivery.courier_remittance_settlements
  ADD CONSTRAINT courier_remittance_settlements_status_check
  CHECK (status IN ('pending', 'posted', 'reversed', 'void'));

CREATE SEQUENCE IF NOT EXISTS delivery.remittance_settlement_ref_seq;

CREATE OR REPLACE FUNCTION delivery.next_remittance_settlement_ref(p_year int DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
DECLARE
  y int := coalesce(p_year, extract(year from now())::int);
  n bigint;
BEGIN
  n := nextval('delivery.remittance_settlement_ref_seq');
  RETURN 'RMT-' || y::text || '-' || lpad(n::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION delivery.next_remittance_settlement_ref FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delivery.next_remittance_settlement_ref TO service_role;
