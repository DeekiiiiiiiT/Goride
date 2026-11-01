-- Fleet Find parts audit R1–R12 (truncated grants only if re-run)
DO $$
BEGIN
  PERFORM pgmq.create('catalog_research_priority');
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.part_master DROP CONSTRAINT IF EXISTS part_master_catalog_decision_check;
ALTER TABLE public.part_master ADD CONSTRAINT part_master_catalog_decision_check CHECK (catalog_decision IN ('pending', 'confirmed', 'rejected', 'auto_confirmed'));

ALTER TABLE public.catalog_research_job ADD COLUMN IF NOT EXISTS next_research_at timestamptz, ADD COLUMN IF NOT EXISTS pgmq_queue text;
