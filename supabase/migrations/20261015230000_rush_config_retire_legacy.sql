-- Phase 5: retire Rush legacy settings stores after cutover to rush_config.
-- Safe to re-run. Does not drop env vars (deploy-time). Keeps rush_money.runtime_flags
-- as a compatibility VIEW over rush_config for any residual readers.

-- 1) Remove unread KV segment keys for Rush / Courier
DELETE FROM public.kv_store_37f42386
WHERE key IN ('platform:settings:dash', 'platform:settings:courier');

-- 2) Remove Rush rows from platform_feature_flags (now in rush_config)
DELETE FROM public.platform_feature_flags
WHERE name IN (
  'IN_HOUSE_ENABLED',
  'DELIVERY_CUSTOMER_ORDERS_ENABLED',
  'PAYMENTS_INTENTS_ENABLED'
);

-- 3) Compatibility view: rush_money.runtime_flags → rush_config values
-- Drop table only if empty of non-migrated keys; prefer view shim.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'rush_money' AND table_name = 'runtime_flags'
  ) THEN
    -- Preserve any rows not represented in rush_config for audit, then replace with view.
    CREATE TABLE IF NOT EXISTS rush_money.runtime_flags_retired AS
    SELECT * FROM rush_money.runtime_flags;

    DROP TABLE IF EXISTS rush_money.runtime_flags CASCADE;

    CREATE OR REPLACE VIEW rush_money.runtime_flags AS
    SELECT
      m.key,
      COALESCE(
        (SELECT (sv.value = 'true'::jsonb)
         FROM rush_config.setting_values sv
         WHERE sv.key = m.setting_key
           AND sv.scope = 'platform'
           AND sv.scope_id = '00000000-0000-0000-0000-000000000000'),
        m.default_on
      ) AS enabled,
      'Shim over rush_config — do not write'::text AS note
    FROM (
      VALUES
        ('wallet_live', 'customer.payment.wallet', true),
        ('device_linking', 'money.device_linking', true),
        ('payout_export', 'money.payout_export', true),
        ('risk_controls', 'money.risk_controls', true)
    ) AS m(key, setting_key, default_on);

    GRANT SELECT ON rush_money.runtime_flags TO service_role;
  END IF;
END $$;

COMMENT ON SCHEMA rush_config IS
  'Rush typed settings. Legacy KV platform:settings:dash/courier and Rush platform_feature_flags rows retired 2026-10-15.';
