-- NR-04 (docs/needs-review-browser-check-audit.md): Needs review jobs that hold only an unproven guess move to
-- Browser check when Roam knows the car's catalogue (a version the owner confirmed earlier). The job page builds the
-- link from that version (research_car_link.ts). Over the open-check limit they wait their turn, as today (RE-28).
-- Proven answers, open "two makers disagree" jobs and vehicle jobs stay in Needs review.

with cap as (
  select coalesce(max_open_browser_checks, 25)
         - (select count(*) from public.catalog_research_job where state = 'browser_check') as free
  from public.catalog_research_settings where id = 1
),
guesses as (
  select j.id, row_number() over (order by j.updated_at) as n
  from public.catalog_research_job j
  where j.state = 'needs_review'
    and j.job_type in ('part', 'spec')
    and coalesce(j.browser_check_allowed, true)
    and exists (select 1 from public.research_car_site_version v where v.vehicle_catalog_id = j.vehicle_catalog_id)
    and not exists (
      select 1 from public.catalog_part_proposal p
      where p.job_id = j.id and coalesce(p.status, '') <> 'rejected'
        and (p.checks->>'trust' = 'confirmed' or p.trust_route is not null
             or coalesce(array_length(p.evidence_read_ids, 1), 0) > 0)
    )
    and not exists (
      select 1 from public.catalog_spec_proposal s
      where s.job_id = j.id and coalesce(s.status, '') <> 'rejected'
        and (s.trust_route is not null or coalesce(array_length(s.evidence_read_ids, 1), 0) > 0)
    )
    and not exists (select 1 from public.research_number_conflict c where c.job_id = j.id and c.closed_at is null)
),
moved as (
  update public.catalog_research_job j
  set state = case when g.n <= greatest((select free from cap), 0) then 'browser_check' else 'browser_check_queued' end,
      updated_at = now()
  from guesses g
  where j.id = g.id
  returning j.id, j.state
)
insert into public.catalog_research_event (job_id, step, outcome, detail)
select id, 'route', state, jsonb_build_object('from', 'needs_review', 'reason', 'unproven_guess', 'fix', 'NR-04')
from moved;
