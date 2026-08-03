-- Phase D: denormalized last-known driver GPS on logistics jobs (ops live map).

ALTER TABLE logistics.jobs
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_heading DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_located_at TIMESTAMPTZ;
