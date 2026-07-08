-- Parity with rides.dispatch_settings toll flags on matching.policies default row.
ALTER TABLE matching.policies
  ADD COLUMN IF NOT EXISTS toll_detect_enroute BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS route_toll_estimation_enabled BOOLEAN NOT NULL DEFAULT FALSE;
