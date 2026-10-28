-- Phase 5: server-owned Toll Reconciliation periods + append-only audit.
-- Mirrors fuel_reconciliation_period; Finish = Reviewed (state=ready), not seal.

create table if not exists public.toll_reconciliation_period (
  id text primary key,
  organization_id uuid not null,
  week_key date not null,
  state text not null default 'open'
    check (state in ('open', 'in_review', 'ready', 'sealed', 'reopened')),
  readiness_hash text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  finish_note text,
  blockers jsonb not null default '[]'::jsonb,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, week_key)
);

create index if not exists toll_recon_period_org_week_idx
  on public.toll_reconciliation_period (organization_id, week_key desc);

create index if not exists toll_recon_period_org_state_idx
  on public.toll_reconciliation_period (organization_id, state);

create table if not exists public.toll_period_audit (
  id bigserial primary key,
  period_id text not null references public.toll_reconciliation_period (id) on delete cascade,
  organization_id uuid not null,
  at timestamptz not null default now(),
  actor_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists toll_period_audit_period_idx
  on public.toll_period_audit (period_id, at desc);

alter table public.toll_reconciliation_period enable row level security;
alter table public.toll_period_audit enable row level security;

-- Org-scoped PostgREST policies (edge/service-role bypasses RLS).
CREATE POLICY toll_recon_period_org_select ON public.toll_reconciliation_period
  FOR SELECT TO authenticated
  USING (
    organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY toll_recon_period_org_insert ON public.toll_reconciliation_period
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY toll_recon_period_org_update ON public.toll_reconciliation_period
  FOR UPDATE TO authenticated
  USING (
    organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  )
  WITH CHECK (
    organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY toll_period_audit_org_select ON public.toll_period_audit
  FOR SELECT TO authenticated
  USING (
    organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

CREATE POLICY toll_period_audit_org_insert ON public.toll_period_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

COMMENT ON TABLE public.toll_reconciliation_period IS
  'Toll recon period SoT: Finish writes ready (reviewed); seal at Close Week sets sealed; reopen restores writability.';

COMMENT ON TABLE public.toll_period_audit IS
  'Append-only audit for toll_reconciliation_period finish / reopen / seal transitions.';
