CREATE TABLE IF NOT EXISTS public.catalog_vehicle_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.catalog_research_job (id) ON DELETE CASCADE,
  make text,
  model text,
  production_start_year integer,
  production_end_year integer,
  chassis_code text,
  engine_code text,
  drivetrain text,
  transmission text,
  market text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalog_vehicle_proposal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_vehicle_proposal_no_direct ON public.catalog_vehicle_proposal;
CREATE POLICY catalog_vehicle_proposal_no_direct ON public.catalog_vehicle_proposal FOR ALL USING (false) WITH CHECK (false);
