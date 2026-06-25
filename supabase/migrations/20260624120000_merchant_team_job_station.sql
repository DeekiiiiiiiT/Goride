-- job_station: counter | kitchen | manager | NULL (legacy full OrdersPage)
ALTER TABLE delivery.merchant_team_members
  ADD COLUMN IF NOT EXISTS job_station text
  CHECK (job_station IS NULL OR job_station IN ('counter', 'kitchen', 'manager'));

ALTER TABLE delivery.merchant_team_invites
  ADD COLUMN IF NOT EXISTS job_station text
  CHECK (job_station IS NULL OR job_station IN ('counter', 'kitchen', 'manager'));
