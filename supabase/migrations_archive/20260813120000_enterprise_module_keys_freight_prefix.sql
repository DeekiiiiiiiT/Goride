-- Rewrite legacy camelCase Enterprise module keys → freight_* (and leave grocery reserved for new defaults).
-- Dual-read aliases remain in @roam/platform-settings and Deno enterprise_modules.ts.

CREATE OR REPLACE FUNCTION public._migrate_enterprise_module_keys(raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  canon text;
  legacy_map jsonb := '{
    "shipments": "freight_shipments",
    "carriers": "freight_carriers",
    "clients": "freight_clients",
    "rateCards": "freight_rate_cards",
    "suites": "freight_suites",
    "mailboxPackages": "freight_mailbox_packages",
    "miamiScan": "freight_miami_scan",
    "manifests": "freight_manifests",
    "customsBoard": "freight_customs_board",
    "hubStation": "freight_hub_station",
    "fulfillmentDesk": "freight_fulfillment",
    "clientFleet": "freight_client_fleet",
    "dispatchBoard": "freight_dispatch",
    "serviceZones": "freight_service_zones",
    "opsInbox": "freight_ops_inbox"
  }'::jsonb;
BEGIN
  IF raw IS NULL OR jsonb_typeof(raw) <> 'object' THEN
    RETURN raw;
  END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each(raw)
  LOOP
    canon := COALESCE(legacy_map ->> k, k);
    -- Prefer explicit canonical over legacy when both present
    IF legacy_map ? k AND raw ? canon THEN
      CONTINUE;
    END IF;
    result := result || jsonb_build_object(canon, v);
  END LOOP;

  RETURN result;
END;
$$;

UPDATE public.organizations
SET enabled_modules = public._migrate_enterprise_module_keys(enabled_modules)
WHERE enabled_modules IS NOT NULL
  AND enabled_modules ?| ARRAY[
    'shipments', 'carriers', 'clients', 'rateCards', 'suites',
    'mailboxPackages', 'miamiScan', 'manifests', 'customsBoard',
    'hubStation', 'fulfillmentDesk', 'clientFleet', 'dispatchBoard',
    'serviceZones', 'opsInbox'
  ];

-- Platform settings KV (fleet-server) — rewrite enterprise enabledModules blob when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kv_store_37f42386'
  ) THEN
    UPDATE public.kv_store_37f42386
    SET value = jsonb_set(
      value,
      '{enabledModules}',
      public._migrate_enterprise_module_keys(value -> 'enabledModules'),
      true
    )
    WHERE key = 'platform:settings:enterprise'
      AND value ? 'enabledModules'
      AND jsonb_typeof(value -> 'enabledModules') = 'object';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public._migrate_enterprise_module_keys(jsonb);
