-- Phase 2: server-owned Consumption Reconciliation periods + append-only audit
-- Re-versioned past 20260902120000 collision with dispute_resolution_unification.
-- Backfill from finalized_report KV is a separate edge job.

create table if not exists public.fuel_reconciliation_period (
  id text primary key,
  org_id uuid not null,
  week_start date not null,
  week_end date not null,
  status text not null default 'open'
    check (status in ('open', 'in_review', 'ready', 'locked', 'reopened')),
  current_step text,
  version bigint not null default 1,
  vehicle_count int not null default 0,
  driver_count int not null default 0,
  total_spend numeric(14, 2) not null default 0,
  gas_card_spend numeric(14, 2) not null default 0,
  cash_from_earnings numeric(14, 2) not null default 0,
  company_share numeric(14, 2) not null default 0,
  driver_share numeric(14, 2) not null default 0,
  unexplained numeric(14, 2) not null default 0,
  counts jsonb not null default '{}'::jsonb,
  leakage_reviewed_at timestamptz,
  leakage_reviewed_by uuid,
  leakage_review_note text,
  locked_at timestamptz,
  locked_by uuid,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  computed_at timestamptz,
  computed_from_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, week_start)
);

create index if not exists fuel_recon_period_org_week_idx
  on public.fuel_reconciliation_period (org_id, week_start desc);

create index if not exists fuel_recon_period_org_status_idx
  on public.fuel_reconciliation_period (org_id, status);

create table if not exists public.fuel_period_audit (
  id bigserial primary key,
  period_id text not null references public.fuel_reconciliation_period (id) on delete cascade,
  org_id uuid not null,
  at timestamptz not null default now(),
  actor_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists fuel_period_audit_period_idx
  on public.fuel_period_audit (period_id, at desc);

create table if not exists public.fuel_period_job (
  id uuid primary key default gen_random_uuid(),
  period_id text not null references public.fuel_reconciliation_period (id) on delete cascade,
  org_id uuid not null,
  kind text not null check (kind in ('finalize', 'reopen', 'recompute')),
  state text not null default 'queued'
    check (state in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text not null,
  period_version bigint not null,
  progress_done int not null default 0,
  progress_total int not null default 0,
  cursor jsonb not null default '{}'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create index if not exists fuel_period_job_period_idx
  on public.fuel_period_job (period_id, created_at desc);

alter table public.fuel_reconciliation_period enable row level security;
alter table public.fuel_period_audit enable row level security;
alter table public.fuel_period_job enable row level security;
