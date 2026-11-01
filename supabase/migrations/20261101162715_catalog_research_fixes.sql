-- Fleet Find parts audit R1–R12: promote/claim fixes, priority queue, backfill, vehicle proposals.

DO $$
BEGIN
  PERFORM pgmq.create('catalog_research_priority');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    IF SQLERRM NOT LIKE '%already exists%' THEN RAISE; END IF;
END $$;

ALTER TABLE public.part_master
  DROP CONSTRAINT IF EXISTS part_master_catalog_decision_check;

ALTER TABLE public.part_master
  ADD CONSTRAINT part_master_catalog_decision_check
  CHECK (catalog_decision IN ('pending', 'confirmed', 'rejected', 'auto_confirmed'));

ALTER TABLE public.catalog_research_job
  ADD COLUMN IF NOT EXISTS next_research_at timestamptz,
  ADD COLUMN IF NOT EXISTS pgmq_queue text;

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

CREATE INDEX IF NOT EXISTS idx_catalog_vehicle_proposal_job
  ON public.catalog_vehicle_proposal (job_id);

ALTER TABLE public.catalog_vehicle_proposal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_vehicle_proposal_no_direct ON public.catalog_vehicle_proposal;
CREATE POLICY catalog_vehicle_proposal_no_direct ON public.catalog_vehicle_proposal
  FOR ALL USING (false) WITH CHECK (false);