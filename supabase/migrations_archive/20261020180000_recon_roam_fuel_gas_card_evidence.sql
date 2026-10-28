-- Roam fuel (fuel_card_roam) live evidence = Gas Card / fuel-card inventory fills.
-- Product: "Gas Card" Paid By + Card_Transaction / entrySource fuel-card are the
-- Roam Fuels pathway (issuer may be JAA Advance rental cards in inventory).
-- Do not require provider name to contain "roam".

CREATE OR REPLACE FUNCTION recon._day_has_statement_live(
  p_org text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE p_source_id
    WHEN 'uber_bundle' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND lower(coalesce(t.platform, '')) LIKE '%uber%'
          AND coalesce(t.service_line, 'rideshare') <> 'rush_delivery'
      );
    WHEN 'indrive_trips' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND lower(coalesce(t.platform, '')) LIKE '%indrive%'
          AND coalesce(t.service_line, 'rideshare') <> 'rush_delivery'
      );
    WHEN 'toll_usage' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.toll_ledger l
        WHERE l.organization_id = p_org
          AND l.date::date = p_day
          AND lower(coalesce(l.type, '')) IN ('usage', 'toll_usage')
          AND lower(coalesce(l.payment_method, '')) NOT LIKE '%cash%'
      );
    WHEN 'toll_topup' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.toll_ledger l
        WHERE l.organization_id = p_org
          AND l.date::date = p_day
          AND lower(coalesce(l.type, '')) IN ('top_up', 'topup')
      );
    WHEN 'fuel_card_roam' THEN
      -- Gas Card / Roam Fuels inventory fills (statement or matched card charge).
      RETURN EXISTS (
        SELECT 1
        FROM fleet.fuel_entries f
        WHERE f.organization_id = p_org
          AND f.date::date = p_day
          AND (
            coalesce(f.type, '') = 'Card_Transaction'
            OR lower(coalesce(f.payload_json->>'entrySource', '')) = 'fuel-card'
            OR lower(coalesce(f.payload_json->>'paymentMethod', '')) IN ('gas card', 'company_card', 'gas_card')
            OR lower(coalesce(f.payload_json->>'paidBy', '')) IN ('gas card', 'company_card')
            OR (
              nullif(trim(coalesce(f.payload_json->>'cardId', '')), '') IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM fleet.fuel_cards c
                WHERE c.organization_id = f.organization_id
                  AND (
                    c.id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
                    OR c.legacy_kv_id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
                  )
              )
            )
          )
      );
    WHEN 'fuel_card_self' THEN
      -- Own / JAA self-serve statement fills (explicit self-serve program rows).
      RETURN EXISTS (
        SELECT 1
        FROM fleet.fuel_entries f
        LEFT JOIN fleet.fuel_cards c
          ON c.organization_id = f.organization_id
         AND (
           c.id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
           OR c.legacy_kv_id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
         )
        WHERE f.organization_id = p_org
          AND f.date::date = p_day
          AND (
            lower(coalesce(f.payload_json->>'importSource', '')) LIKE '%jaa%'
            OR lower(coalesce(f.payload_json->>'importSource', '')) LIKE '%self_serve%'
            OR (
              lower(coalesce(c.payload_json->>'jaaCardType', '')) = 'driver_tied'
              AND lower(coalesce(f.payload_json->>'entrySource', '')) <> 'fuel-card'
            )
          )
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION recon._day_has_statement_live(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recon._day_has_statement_live(text, text, date) TO service_role;

NOTIFY pgrst, 'reload schema';
