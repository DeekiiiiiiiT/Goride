-- R19. Runtime config the schema-only baseline does not replay.
-- Copied from prod csfllzzastacofsvcdsc on 2026-10-28.
-- Rule 1: work_mem is unitless kB. Time limits are copied as prod stores them
-- (3s / 8s / 120000 / 30000). Do not write 8MB — PostgREST lowercases it to 8mb.
-- Seeds use ON CONFLICT DO NOTHING so a live database keeps its balances and
-- the paused week calculator (emergency_off stays true on prod).
-- Account rows whose owner or organization is missing are skipped. A fresh
-- database has no auth.users or organizations, so it cannot take all 28.
-- Prod already has them, and the conflict clause leaves them untouched.

-- ---------------------------------------------------------------------------
-- Role settings
-- ---------------------------------------------------------------------------

alter role anon set statement_timeout = '3s';
-- R20. Anon must not inherit authenticator work_mem. Unitless kB only.
alter role anon set work_mem = 8192;

alter role authenticated set statement_timeout = '8s';
alter role authenticated set work_mem = 8192;

-- safeupdate (session_preload_libraries) is already on authenticator in prod.
-- The migration role is not allowed to set that parameter, so it is not repeated here.
alter role authenticator set statement_timeout = 120000;
alter role authenticator set lock_timeout = '8s';
alter role authenticator set pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon, geo, places, explorer';

alter role service_role set statement_timeout = 30000;
alter role service_role set work_mem = 8192;

-- Schema list is unchanged, so do not rebuild the PostgREST cache here.
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

insert into recon.worker_control (id, emergency_off)
values (1, false)
on conflict (id) do nothing;

insert into ledger.accounts (
  id, organization_id, account_key, account_class, owner_user_id, owner_role, currency, balance_minor
)
select
  v.id,
  v.organization_id,
  v.account_key,
  v.account_class,
  v.owner_user_id,
  v.owner_role,
  v.currency,
  v.balance_minor
from (
  values
    ('97c19dc8-40a1-4fe8-9d83-e4dc22fb4213'::uuid, null::uuid, 'merchant:39b283c8-951c-4c94-bef7-291049b08350:receivable', 'asset', null::uuid, 'merchant', 'JMD', -883017::bigint),
    ('bad06c3c-25c3-42ff-baf1-960c0c94db2e'::uuid, null::uuid, 'merchant:e31e6d88-ae1d-4ad2-a1ae-d14001f5d372:receivable', 'asset', null::uuid, 'merchant', 'JMD', 579759::bigint),
    ('11d0e6b2-e799-4b5d-9c03-d2aaf1ec883b'::uuid, '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'::uuid, 'org:8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823:fleet', 'asset', null::uuid, null::text, 'JMD', -64629224::bigint),
    ('f4fd05ed-bf0a-4d88-aedc-56da5bb751f9'::uuid, null::uuid, 'platform:bank_clearing', 'asset', null::uuid, 'system', 'JMD', -4400000::bigint),
    ('dd9ba937-71ec-4c7e-956b-79af6ce76a47'::uuid, null::uuid, 'platform:clearing', 'asset', null::uuid, 'system', 'JMD', -521219358::bigint),
    ('cecbc6d9-4266-44c5-8d87-ac32e33568de'::uuid, null::uuid, 'platform:driver_cash_outlay', 'liability', null::uuid, 'system', 'JMD', 17140000::bigint),
    ('659fae75-1de2-47e7-8616-56b70ecf8a3e'::uuid, null::uuid, 'platform:driver_payable', 'liability', null::uuid, 'system', 'JMD', 25908043::bigint),
    ('4b409539-5a42-4d56-b762-cc5195309c7b'::uuid, null::uuid, 'platform:driver_receivable', 'asset', null::uuid, 'system', 'JMD', -94180980::bigint),
    ('7bfec8e6-dee7-47af-9c4c-d28a242a34e1'::uuid, null::uuid, 'platform:driver_reimbursement_payable', 'liability', null::uuid, 'system', 'JMD', 0::bigint),
    ('f660579b-8550-4b07-bda3-538db5735501'::uuid, null::uuid, 'platform:fleet_fuel_expense', 'expense', null::uuid, 'system', 'JMD', -326024221::bigint),
    ('fc8ea4ee-c180-457a-9183-d68328734bd3'::uuid, null::uuid, 'platform:fleet_toll_expense', 'expense', null::uuid, 'system', 'JMD', -20017000::bigint),
    ('b9b34b3e-5071-46db-bfb4-a38ee53aa1e1'::uuid, null::uuid, 'platform:fuel_card_clearing', 'liability', null::uuid, 'system', 'JMD', 28521430::bigint),
    ('8c32b676-e963-4c6d-8145-cea46e7f43db'::uuid, null::uuid, 'platform:receivable', 'asset', null::uuid, 'system', 'JMD', 693144::bigint),
    ('a30f0795-8053-4eec-aa40-3bd23bc990c4'::uuid, null::uuid, 'platform:reimbursement_receivable', 'asset', null::uuid, 'system', 'JMD', 0::bigint),
    ('8cdc1c65-bfb7-4d5d-b4e8-371366887212'::uuid, null::uuid, 'platform:toll_tag_clearing', 'liability', null::uuid, 'system', 'JMD', 24417000::bigint),
    ('47872313-e60a-42df-9a0f-7fe9fdb73a8a'::uuid, null::uuid, 'platform:write_off', 'expense', null::uuid, 'system', 'JMD', 0::bigint),
    ('18fb19ca-21aa-4612-b9be-2f8e0cad8c27'::uuid, null::uuid, 'user:00000000-0000-0000-0000-000000000000:driver:digital', 'asset', null::uuid, 'driver', 'JMD', -58329644::bigint),
    ('ab24b27c-7218-43b3-8bbf-b621f2fb3c79'::uuid, null::uuid, 'user:163d0d38-1cc0-413a-9bf2-eee4fe34f7d0:rider', 'asset', '163d0d38-1cc0-413a-9bf2-eee4fe34f7d0'::uuid, 'rider', 'JMD', 20193::bigint),
    ('fbe98293-f3e6-43a7-ae7f-29c7d5a18902'::uuid, null::uuid, 'user:52ff47da-ef48-41b8-93d5-80a09b85ce5b:driver:digital', 'asset', null::uuid, 'driver', 'JMD', 301460665::bigint),
    ('4d7a1043-c836-4403-8b52-77fa656107fb'::uuid, null::uuid, 'user:5f6a08ec-2039-4225-91f6-a9a2c345f81c:driver', 'asset', '5f6a08ec-2039-4225-91f6-a9a2c345f81c'::uuid, 'driver', 'JMD', -12116::bigint),
    ('23873269-dad9-48f0-b7e9-c936d6a6befc'::uuid, null::uuid, 'user:5f6a08ec-2039-4225-91f6-a9a2c345f81c:driver:digital', 'asset', '5f6a08ec-2039-4225-91f6-a9a2c345f81c'::uuid, 'driver', 'JMD', 2071266::bigint),
    ('647b0e9e-7a66-4218-8725-79092c589d8c'::uuid, null::uuid, 'user:73dfc14d-3798-4a00-8d86-b2a3eb632f54:driver:digital', 'asset', null::uuid, 'driver', 'JMD', 83712545::bigint),
    ('3fab652a-08cf-49b9-bfd2-a5c7665c85a8'::uuid, null::uuid, 'user:73e5b1dc-01b4-45ee-a34a-25a3256b9841:driver:digital', 'asset', '73e5b1dc-01b4-45ee-a34a-25a3256b9841'::uuid, 'driver', 'JMD', 603693295::bigint),
    ('207ebe33-0678-4856-8875-093ea40f46c3'::uuid, null::uuid, 'user:c98081c8-3a19-4631-8547-85b94cf30812:driver:cash', 'asset', 'c98081c8-3a19-4631-8547-85b94cf30812'::uuid, 'driver', 'JMD', 103233::bigint),
    ('3c038bfe-ab55-41b6-a495-ee5770df8343'::uuid, null::uuid, 'user:c98081c8-3a19-4631-8547-85b94cf30812:driver:debt', 'asset', 'c98081c8-3a19-4631-8547-85b94cf30812'::uuid, 'driver', 'JMD', 0::bigint),
    ('232a5f4b-d50c-4eee-ae2d-1f8bc4cd777a'::uuid, null::uuid, 'user:c98081c8-3a19-4631-8547-85b94cf30812:driver:digital', 'asset', 'c98081c8-3a19-4631-8547-85b94cf30812'::uuid, 'driver', 'JMD', 1374987::bigint),
    ('a0858ff4-1b20-4927-899a-a2be9a27579d'::uuid, null::uuid, 'user:c98081c8-3a19-4631-8547-85b94cf30812:rider', 'asset', 'c98081c8-3a19-4631-8547-85b94cf30812'::uuid, 'rider', 'JMD', 0::bigint),
    ('7b3d9361-7dab-416e-a7a8-f5447180160b'::uuid, null::uuid, 'user:f625098d-ed19-475e-a0d9-acc543a7468e:rider', 'asset', 'f625098d-ed19-475e-a0d9-acc543a7468e'::uuid, 'rider', 'JMD', 0::bigint)
) as v(id, organization_id, account_key, account_class, owner_user_id, owner_role, currency, balance_minor)
where (v.organization_id is null or exists (
  select 1 from public.organizations o where o.id = v.organization_id
))
and (v.owner_user_id is null or exists (
  select 1 from auth.users u where u.id = v.owner_user_id
))
on conflict (account_key, currency) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('courier-documents', 'courier-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']::text[]),
  ('customer-avatars', 'customer-avatars', true, 2097152, array['image/jpeg','image/png','image/webp']::text[]),
  ('customer-issue-photos', 'customer-issue-photos', false, 2097152, array['image/jpeg','image/png','image/webp']::text[]),
  ('driver-documents', 'driver-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']::text[]),
  ('driver-photos', 'driver-photos', false, 5242880, array['image/jpeg','image/png','image/webp']::text[]),
  ('enterprise-freight-docs', 'enterprise-freight-docs', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp','image/heic']::text[]),
  ('ephemeral-evidence', 'ephemeral-evidence', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']::text[]),
  ('explorer-photos', 'explorer-photos', false, null, null),
  ('in-house-receipts', 'in-house-receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf']::text[]),
  ('make-37f42386-docs', 'make-37f42386-docs', false, 10485760, null),
  ('make-37f42386-vehicles', 'make-37f42386-vehicles', false, 10485760, null),
  ('merchant-assets', 'merchant-assets', true, 5242880, array['image/jpeg','image/png','image/webp']::text[]),
  ('merchant-documents', 'merchant-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Cron. One guarded reschedule per prod job. Commands match cron.job.
-- ---------------------------------------------------------------------------

create or replace function private.r19_schedule_cron(p_name text, p_schedule text, p_command text)
returns void
language plpgsql
as $fn$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron missing; skipped %', p_name;
    return;
  end if;
  begin
    perform cron.unschedule(p_name);
  exception when others then
    null;
  end;
  perform cron.schedule(p_name, p_schedule, p_command);
end;
$fn$;

select private.r19_schedule_cron(
  'catalog-demand-readiness', '30 3 * * *',
  $cmd$SELECT public.refresh_catalog_demand_and_readiness();$cmd$
);
select private.r19_schedule_cron(
  'dominion-score-master-data', '15 2 * * *',
  $cmd$select fleet.score_master_data();$cmd$
);
select private.r19_schedule_cron(
  'finance-statement-drift-nightly', '15 4 * * *',
  $cmd$
      SELECT fleet.recognise_coverage_through_today(CURRENT_DATE);
      SELECT fleet.finance_statement_drift(CURRENT_DATE);
      $cmd$
);
select private.r19_schedule_cron(
  'fleet-activity-drift-check', '45 5 * * *',
  $cmd$SELECT private.invoke_fleet_activity_drift_check()$cmd$
);
select private.r19_schedule_cron(
  'fleet-evidence-cleanup-daily', '0 3 * * *',
  $cmd$SELECT private.invoke_evidence_cleanup();$cmd$
);
select private.r19_schedule_cron(
  'fleet-finance-doctor-nightly', '10 4 * * *',
  $cmd$SELECT private.invoke_finance_doctor();$cmd$
);
select private.r19_schedule_cron(
  'fleet-finance-recon-nightly', '0 4 * * *',
  $cmd$SELECT private.invoke_finance_recon();$cmd$
);
select private.r19_schedule_cron(
  'fleet-ops-periods-nightly', '20 4 * * *',
  $cmd$SELECT private.fleet_rebuild_all_org_operational_periods();$cmd$
);
select private.r19_schedule_cron(
  'fleet-toll-low-balance', '15 11 * * *',
  $cmd$SELECT fleet.scan_toll_low_balances();$cmd$
);
select private.r19_schedule_cron(
  'fuel-period-job-sweep', '17 * * * *',
  $cmd$select private.invoke_fuel_period_job_sweep();$cmd$
);
select private.r19_schedule_cron(
  'geo-adopted-reconcile', '15 6 * * *',
  $cmd$SELECT private.invoke_rush_delivery('/internal/geo/reconcile');$cmd$
);
select private.r19_schedule_cron(
  'ledger-io-snapshots-hourly', '7 * * * *',
  $cmd$select private.capture_io_snapshot();$cmd$
);
select private.r19_schedule_cron(
  'parts-repeat-alerts', '15 6 * * *',
  $cmd$SELECT public.refresh_repeat_part_alerts(10000, 90, NULL);$cmd$
);
select private.r19_schedule_cron(
  'platform-role-consistency-nightly', '20 4 * * *',
  $cmd$SELECT platform.record_role_consistency_nightly();$cmd$
);
select private.r19_schedule_cron(
  'purge_fleet_activity_400d', '30 5 * * *',
  $cmd$SELECT fleet.purge_old_activity_data(400)$cmd$
);
select private.r19_schedule_cron(
  'purge_ride_location_updates_30d', '15 5 * * *',
  $cmd$SELECT rides.purge_old_location_updates(30)$cmd$
);
select private.r19_schedule_cron(
  'purge-cron-run-details-7d', '40 5 * * *',
  $cmd$delete from cron.job_run_details where end_time < now() - interval '7 days'$cmd$
);
select private.r19_schedule_cron(
  'purge-disk-io-logs-90d', '50 5 * * *',
  $cmd$
      delete from private.api_usage_events where occurred_at < now() - interval '90 days';
      delete from public.kv_store_37f42386
        where key >= 'error-log:' and key < 'error-loga'
          and left(coalesce(value->>'timestamp', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and (value->>'timestamp')::timestamptz < now() - interval '90 days';
      delete from public.kv_store_37f42386
        where key >= 'stats:v3:' and key < 'stats:v3a'
          and (value ? 'timestamp') and (value ? 'ttl')
          and (value->>'timestamp') ~ '^[0-9]+$'
          and (value->>'ttl') ~ '^[0-9]+$'
          and to_timestamp(((value->>'timestamp')::numeric) / 1000.0)
              + make_interval(secs => (value->>'ttl')::int) < now();
      delete from public.kv_store_37f42386
        where key >= 'api_usage:' and key < 'api_usagea'
          and substring(key from 11 for 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and substring(key from 11 for 10) < to_char(now() - interval '90 days', 'YYYY-MM-DD');
    $cmd$
);
select private.r19_schedule_cron(
  'refresh_driver_directory_stats_hourly', '20 * * * *',
  $cmd$SELECT rides.refresh_driver_directory_stats()$cmd$
);
select private.r19_schedule_cron(
  'rides_apply_pending_driver_debt_daily', '15 4 * * *',
  $cmd$SELECT public.rides_apply_pending_driver_debt();$cmd$
);
select private.r19_schedule_cron(
  'rush-money-recon', '30 6 * * *',
  $cmd$SELECT private.invoke_rush_delivery('/internal/rush-money/recon');$cmd$
);
select private.r19_schedule_cron(
  'rush-money-scores', '45 6 * * *',
  $cmd$SELECT private.invoke_rush_delivery('/internal/rush-money/scores');$cmd$
);
select private.r19_schedule_cron(
  'rush-trip-recon-daily', '30 3 * * *',
  $cmd$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/fleet-core/rush/trip-recon/cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $cmd$
);
select private.r19_schedule_cron(
  'rush-void-abandoned-orders', '15 * * * *',
  $cmd$SELECT delivery.void_abandoned_unpaid_orders();$cmd$
);

drop function private.r19_schedule_cron(text, text, text);
