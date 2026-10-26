-- Sep 7 toll cards were $2,400 off because seven matched tolls had their
-- platform recovery cancelled all the way to zero. This puts exactly one
-- recovery back on each matched toll. It does not delete rows and it does
-- not change what a driver was charged.
--
-- Safe to run again. A toll that already has one live recovery is skipped.
-- Weeks Sep 14 through Oct 11 are included; they had no extras.

do $$
declare
  r record;
  v_in integer;
  v_out integer;
  v_net integer;
  v_ver integer;
  v_need integer;
  v_key text;
  v_bare text;
  v_vehicle text;
  extra record;
begin
  update ledger.entries e
     set organization_id = t.organization_id::uuid
    from fleet.toll_ledger t
   where e.organization_id is null
     and e.entry_type = 'toll_charge_offset'
     and e.reference_id = t.id::text
     and t.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
     and t.date >= date '2026-09-07'
     and t.date < date '2026-10-12';

  -- A first run also posted a recovery on matched tolls that had never had one.
  -- Cancel those. A toll that already had a real recovery is left alone.
  for r in
    select e.reference_id,
           e.amount_minor,
           e.organization_id,
           e.effective_at,
           e.metadata->>'driverId' as driver_id,
           e.metadata->>'vehicleId' as vehicle_id,
           e.metadata->>'version' as ver
      from ledger.entries e
     where e.entry_type = 'toll_charge_offset'
       and e.metadata->>'repair' = 'one_active_platform_offset'
       and e.metadata->>'direction' = 'inflow'
       and e.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
       and not exists (
         select 1
           from ledger.entries prior
          where prior.reference_id = e.reference_id
            and prior.entry_type = 'toll_charge_offset'
            and prior.metadata->>'direction' = 'inflow'
            and prior.metadata->>'reason' = 'platform_reimbursed'
            and coalesce(prior.metadata->>'repair', '') <> 'one_active_platform_offset'
       )
  loop
    v_bare := 'toll_ledger:' || r.reference_id || '|toll_charge_reinstate:v' || r.ver;
    v_key := 'kv_ledger_event:' || v_bare;
    if not exists (select 1 from ledger.entries where idempotency_key = v_key) then
      perform public.ledger_post_entry(
        p_idempotency_key => v_key,
        p_entry_type => 'toll_charge_offset',
        p_debit_account_key => 'user:' || r.driver_id || ':driver:digital',
        p_credit_account_key => 'platform:clearing',
        p_amount_minor => r.amount_minor,
        p_currency => 'JMD',
        p_organization_id => r.organization_id,
        p_product => 'roam_driver',
        p_effective_at => r.effective_at,
        p_reference_type => 'transaction',
        p_reference_id => r.reference_id,
        p_metadata => jsonb_build_object(
          'version', r.ver::int,
          'category', 'toll_charge_offset',
          'driverId', r.driver_id,
          'platform', 'Roam',
          'direction', 'outflow',
          'vehicleId', r.vehicle_id,
          'description', 'Toll charge reinstated (resolution reverted)',
          'grossAmount', r.amount_minor / 100.0,
          'isReconciled', false,
          'reinstatesOffsetKey', 'toll_ledger:' || r.reference_id || '|toll_charge_offset:v' || r.ver,
          'repair', 'one_active_platform_offset'
        ),
        p_source_system => 'kv_ledger_event',
        p_source_id => gen_random_uuid()::text,
        p_source_idempotency_key => v_bare
      );
    end if;
  end loop;

  for r in
    select t.id::text as toll_id,
           t.driver_id::text as driver_id,
           t.date::date as toll_date,
           round(abs(t.amount) * 100)::bigint as amount_minor,
           t.organization_id::uuid as organization_id
      from fleet.toll_ledger t
     where t.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
       and t.date >= date '2026-09-07'
       and t.date < date '2026-10-12'
       and t.type = 'usage'
       and t.status = 'reconciled'
       and t.trip_id is not null
       and coalesce(t.resolution, '') not in ('personal', 'write_off', 'business')
  loop
    select
      count(*) filter (
        where metadata->>'direction' = 'inflow'
          and metadata->>'reason' = 'platform_reimbursed'
      ),
      count(*) filter (where metadata->>'direction' = 'outflow')
      into v_in, v_out
      from ledger.entries
     where entry_type = 'toll_charge_offset'
       and reference_id = r.toll_id;

    v_net := coalesce(v_in, 0) - coalesce(v_out, 0);

    -- A matched toll that never had a platform recovery stays that way.
    -- Only a recovery that was cancelled all the way down gets one put back.
    if v_net = 1 or coalesce(v_in, 0) = 0 then
      continue;
    end if;
    if not exists (
      select 1
        from ledger.entries prior
       where prior.reference_id = r.toll_id
         and prior.entry_type = 'toll_charge_offset'
         and prior.metadata->>'direction' = 'inflow'
         and prior.metadata->>'reason' = 'platform_reimbursed'
         and coalesce(prior.metadata->>'repair', '') <> 'one_active_platform_offset'
    ) then
      continue;
    end if;

    select coalesce(max((regexp_match(idempotency_key, 'toll_charge_(?:offset|reinstate):v([0-9]+)$'))[1]::int), 0)
      into v_ver
      from ledger.entries
     where reference_id = r.toll_id
       and entry_type = 'toll_charge_offset';

    select metadata->>'vehicleId'
      into v_vehicle
      from ledger.entries
     where reference_id = r.toll_id
       and entry_type = 'toll_charge_offset'
       and metadata->>'direction' = 'inflow'
     order by effective_at
     limit 1;

    if v_net < 1 then
      v_need := 1 - v_net;
      if v_need > 3 then
        raise exception 'toll % net % is too far to repair automatically', r.toll_id, v_net;
      end if;
      while v_need > 0 loop
        v_ver := v_ver + 1;
        v_bare := 'toll_ledger:' || r.toll_id || '|toll_charge_offset:v' || v_ver;
        v_key := 'kv_ledger_event:' || v_bare;
        if not exists (select 1 from ledger.entries where idempotency_key = v_key) then
          perform public.ledger_post_entry(
            p_idempotency_key => v_key,
            p_entry_type => 'toll_charge_offset',
            p_debit_account_key => 'platform:clearing',
            p_credit_account_key => 'user:' || r.driver_id || ':driver:digital',
            p_amount_minor => r.amount_minor,
            p_currency => 'JMD',
            p_organization_id => r.organization_id,
            p_product => 'roam_driver',
            p_effective_at => (r.toll_date::text || 'T12:00:00Z')::timestamptz,
            p_reference_type => 'transaction',
            p_reference_id => r.toll_id,
            p_metadata => jsonb_build_object(
              'reason', 'platform_reimbursed',
              'version', v_ver,
              'category', 'toll_charge_offset',
              'driverId', r.driver_id,
              'platform', 'Roam',
              'direction', 'inflow',
              'vehicleId', v_vehicle,
              'description', 'Toll not a fleet loss (platform_reimbursed)',
              'grossAmount', r.amount_minor / 100.0,
              'isReconciled', false,
              'offsetsIdempotencyKey', 'toll_ledger:' || r.toll_id || '|toll_charge',
              'repair', 'one_active_platform_offset'
            ),
            p_source_system => 'kv_ledger_event',
            p_source_id => gen_random_uuid()::text,
            p_source_idempotency_key => v_bare
          );
        end if;
        v_need := v_need - 1;
      end loop;
    elsif v_net > 1 then
      -- Cancel every live recovery except the oldest, so one remains.
      for extra in
        select ver
          from (
            select (regexp_match(e.idempotency_key, 'toll_charge_offset:v([0-9]+)$'))[1]::int as ver
              from ledger.entries e
             where e.reference_id = r.toll_id
               and e.entry_type = 'toll_charge_offset'
               and e.metadata->>'direction' = 'inflow'
               and e.metadata->>'reason' = 'platform_reimbursed'
               and not exists (
                 select 1
                   from ledger.entries x
                  where x.idempotency_key = 'kv_ledger_event:toll_ledger:' || r.toll_id
                        || '|toll_charge_reinstate:v'
                        || (regexp_match(e.idempotency_key, 'toll_charge_offset:v([0-9]+)$'))[1]
               )
          ) live
         where ver > (
           select min(ver) from (
             select (regexp_match(e2.idempotency_key, 'toll_charge_offset:v([0-9]+)$'))[1]::int as ver
               from ledger.entries e2
              where e2.reference_id = r.toll_id
                and e2.entry_type = 'toll_charge_offset'
                and e2.metadata->>'direction' = 'inflow'
                and e2.metadata->>'reason' = 'platform_reimbursed'
                and not exists (
                  select 1
                    from ledger.entries x2
                   where x2.idempotency_key = 'kv_ledger_event:toll_ledger:' || r.toll_id
                         || '|toll_charge_reinstate:v'
                         || (regexp_match(e2.idempotency_key, 'toll_charge_offset:v([0-9]+)$'))[1]
                )
           ) oldest
         )
         order by ver
      loop
        v_ver := extra.ver;
        v_bare := 'toll_ledger:' || r.toll_id || '|toll_charge_reinstate:v' || v_ver;
        v_key := 'kv_ledger_event:' || v_bare;
        if not exists (select 1 from ledger.entries where idempotency_key = v_key) then
          perform public.ledger_post_entry(
            p_idempotency_key => v_key,
            p_entry_type => 'toll_charge_offset',
            p_debit_account_key => 'user:' || r.driver_id || ':driver:digital',
            p_credit_account_key => 'platform:clearing',
            p_amount_minor => r.amount_minor,
            p_currency => 'JMD',
            p_organization_id => r.organization_id,
            p_product => 'roam_driver',
            p_effective_at => (r.toll_date::text || 'T12:00:00Z')::timestamptz,
            p_reference_type => 'transaction',
            p_reference_id => r.toll_id,
            p_metadata => jsonb_build_object(
              'version', v_ver,
              'category', 'toll_charge_offset',
              'driverId', r.driver_id,
              'platform', 'Roam',
              'direction', 'outflow',
              'vehicleId', v_vehicle,
              'description', 'Toll charge reinstated (resolution reverted)',
              'grossAmount', r.amount_minor / 100.0,
              'isReconciled', false,
              'reinstatesOffsetKey', 'toll_ledger:' || r.toll_id || '|toll_charge_offset:v' || v_ver,
              'repair', 'one_active_platform_offset'
            ),
            p_source_system => 'kv_ledger_event',
            p_source_id => gen_random_uuid()::text,
            p_source_idempotency_key => v_bare
          );
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- File the leftover Sep 11 personal toll under rideshare. The $275 charge stays.
update fleet.toll_ledger
   set service_line = 'rideshare',
       service_line_source = 'org',
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'service_line', 'rideshare',
         'serviceLine', 'rideshare',
         'service_line_source', 'org',
         'serviceLineSource', 'org'
       )
 where id = '090bd599-309f-4949-aab5-f83dc214aedf'
   and resolution = 'personal'
   and amount = -275
   and service_line is null;
