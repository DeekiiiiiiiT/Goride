-- Unified ledger Disk IO audit Phase 1 / L-3.
-- Stamp driver_id (canonical), platform, batch_id as real columns so reads filter in SQL.

alter table ledger.entries
  add column if not exists driver_id uuid,
  add column if not exists platform text,
  add column if not exists batch_id text;

comment on column ledger.entries.driver_id is
  'Canonical Roam fleet driver UUID (aliases resolved). Stamped by ledger.post_entry.';
comment on column ledger.entries.platform is
  'Trip/platform label (uber, indrive, roam, …). Stamped from metadata at post time.';
comment on column ledger.entries.batch_id is
  'Import/batch id for audit. Stamped from metadata at post time.';

-- Resolve a candidate driver token (account-key UUID or metadata driverId) to fleet.drivers.id.
create or replace function ledger.resolve_canonical_driver_id(p_candidate text)
returns uuid
language plpgsql
stable
security definer
set search_path = ledger, fleet, public, pg_catalog
as $fn$
declare
  v_raw text := nullif(btrim(coalesce(p_candidate, '')), '');
  v_id text;
begin
  if v_raw is null then
    return null;
  end if;

  -- Prefer exact fleet.drivers.id / uber / indrive match.
  select d.id into v_id
  from fleet.drivers d
  where d.id = v_raw
     or d.uber_driver_id = v_raw
     or d.indrive_driver_id = v_raw
  limit 1;

  if v_id is not null and v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_id::uuid;
  end if;

  -- Fallback: candidate itself is a UUID (orphan / not yet in fleet.drivers).
  if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_raw::uuid;
  end if;

  return null;
exception when others then
  return null;
end;
$fn$;

revoke all on function ledger.resolve_canonical_driver_id(text) from public;
grant execute on function ledger.resolve_canonical_driver_id(text) to service_role;

create or replace function ledger.extract_driver_token_from_account_key(p_account_key text)
returns text
language sql
immutable
as $fn$
  select (regexp_match(coalesce(p_account_key, ''), '^user:([^:]+):driver(?::|$)', 'i'))[1];
$fn$;

revoke all on function ledger.extract_driver_token_from_account_key(text) from public;
grant execute on function ledger.extract_driver_token_from_account_key(text) to service_role;

-- Derive direction the same way mapUnifiedEntryToCanonicalEvent does.
create or replace function ledger.entry_direction(
  p_metadata jsonb,
  p_debit_account_key text,
  p_credit_account_key text
)
returns text
language plpgsql
immutable
as $fn$
declare
  v_raw text := lower(nullif(btrim(coalesce(p_metadata->>'direction', '')), ''));
  v_credit_driver text;
  v_debit_driver text;
begin
  if v_raw in ('inflow', 'outflow', 'neutral') then
    return v_raw;
  end if;
  v_credit_driver := ledger.extract_driver_token_from_account_key(p_credit_account_key);
  v_debit_driver := ledger.extract_driver_token_from_account_key(p_debit_account_key);
  if v_credit_driver is not null and v_debit_driver is null then
    return 'inflow';
  end if;
  if v_debit_driver is not null and v_credit_driver is null then
    return 'outflow';
  end if;
  return 'inflow';
end;
$fn$;

revoke all on function ledger.entry_direction(jsonb, text, text) from public;
grant execute on function ledger.entry_direction(jsonb, text, text) to service_role;

-- Jamaica Monday week start for rollups.
create or replace function ledger.jamaica_week_start(p_at timestamptz)
returns date
language sql
immutable
as $fn$
  select date_trunc('week', (p_at at time zone 'America/Jamaica'))::date;
$fn$;

revoke all on function ledger.jamaica_week_start(timestamptz) from public;
grant execute on function ledger.jamaica_week_start(timestamptz) to service_role;

-- Backfill from metadata + account keys (aliases via fleet.drivers).
with account_keys as (
  select
    e.id,
    e.metadata,
    da.account_key as debit_key,
    ca.account_key as credit_key
  from ledger.entries e
  join ledger.accounts da on da.id = e.debit_account_id
  join ledger.accounts ca on ca.id = e.credit_account_id
  where e.driver_id is null
     or e.platform is null
     or e.batch_id is null
)
update ledger.entries e
set
  driver_id = coalesce(
    e.driver_id,
    ledger.resolve_canonical_driver_id(nullif(ak.metadata->>'driverId', '')),
    ledger.resolve_canonical_driver_id(ledger.extract_driver_token_from_account_key(ak.credit_key)),
    ledger.resolve_canonical_driver_id(ledger.extract_driver_token_from_account_key(ak.debit_key))
  ),
  platform = coalesce(e.platform, nullif(ak.metadata->>'platform', '')),
  batch_id = coalesce(e.batch_id, nullif(ak.metadata->>'batchId', ''))
from account_keys ak
where ak.id = e.id;

create index if not exists idx_ledger_entries_org_driver_effective
  on ledger.entries (organization_id, driver_id, effective_at desc, id desc)
  where driver_id is not null;

create index if not exists idx_ledger_entries_org_effective_id
  on ledger.entries (organization_id, effective_at desc, id desc);

create index if not exists idx_ledger_entries_org_batch
  on ledger.entries (organization_id, batch_id)
  where batch_id is not null;
