-- Phase 3A: backfill rush_config.setting_values from SQL-readable stores.
-- Env / KV cannot be read here — see scripts/backfill-rush-settings.mjs.

DO $$
DECLARE
  v_actor uuid;
  v_platform_scope uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_enabled boolean;
  v_key text;
  v_setting_key text;
  v_inserted int;
  flag_row record;
BEGIN
  -- Prefer a real platform_owner; else nil UUID (documented system migration actor).
  -- Alias roles as role_row — PL/pgSQL record vars must not shadow SQL aliases.
  SELECT ur.user_id INTO v_actor
  FROM platform.user_roles ur
  JOIN platform.roles role_row ON role_row.id = ur.role_id
  WHERE role_row.name IN ('platform_owner', 'superadmin')
  ORDER BY CASE role_row.name WHEN 'platform_owner' THEN 0 ELSE 1 END, ur.user_id
  LIMIT 1;

  IF v_actor IS NULL THEN
    v_actor := v_platform_scope;
  END IF;

  -- ── platform_feature_flags.IN_HOUSE_ENABLED → customer.in_house.enabled ──
  IF to_regclass('public.platform_feature_flags') IS NOT NULL THEN
    SELECT enabled INTO v_enabled
    FROM public.platform_feature_flags
    WHERE name = 'IN_HOUSE_ENABLED'
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO rush_config.setting_values (key, scope, scope_id, value, version, updated_by, updated_at)
      VALUES (
        'customer.in_house.enabled',
        'platform',
        v_platform_scope,
        to_jsonb(v_enabled),
        1,
        v_actor,
        now()
      )
      ON CONFLICT (key, scope, scope_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted > 0 THEN
        INSERT INTO rush_config.setting_changes (
          key, scope, scope_id, old_value, new_value, reason, changed_by, effective_at
        ) VALUES (
          'customer.in_house.enabled',
          'platform',
          NULL,
          NULL,
          to_jsonb(v_enabled),
          'Migrated from platform_feature_flags.IN_HOUSE_ENABLED',
          v_actor,
          now()
        );
      END IF;
    END IF;
  END IF;

  -- ── rush_money.runtime_flags → money.* / customer.payment.wallet ──
  IF to_regclass('rush_money.runtime_flags') IS NOT NULL THEN
    FOR flag_row IN
      SELECT key, enabled FROM rush_money.runtime_flags
      WHERE key IN ('wallet_live', 'device_linking', 'payout_export', 'risk_controls')
    LOOP
      v_key := flag_row.key;
      v_enabled := flag_row.enabled;
      v_setting_key := CASE v_key
        WHEN 'wallet_live' THEN 'customer.payment.wallet'
        WHEN 'device_linking' THEN 'money.device_linking'
        WHEN 'payout_export' THEN 'money.payout_export'
        WHEN 'risk_controls' THEN 'money.risk_controls'
      END;

      INSERT INTO rush_config.setting_values (key, scope, scope_id, value, version, updated_by, updated_at)
      VALUES (
        v_setting_key,
        'platform',
        v_platform_scope,
        to_jsonb(v_enabled),
        1,
        v_actor,
        now()
      )
      ON CONFLICT (key, scope, scope_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted > 0 THEN
        INSERT INTO rush_config.setting_changes (
          key, scope, scope_id, old_value, new_value, reason, changed_by, effective_at
        ) VALUES (
          v_setting_key,
          'platform',
          NULL,
          NULL,
          to_jsonb(v_enabled),
          format('Migrated from rush_money.runtime_flags.%s', v_key),
          v_actor,
          now()
        );
      END IF;
    END LOOP;
  END IF;
END $$;

COMMENT ON SCHEMA rush_config IS
  'Rush typed settings. SQL backfill: platform_feature_flags + rush_money.runtime_flags. Env/KV: scripts/backfill-rush-settings.mjs';
