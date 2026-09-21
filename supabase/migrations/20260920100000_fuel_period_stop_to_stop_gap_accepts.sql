-- Audited accept of OVER-LOG / attribution stop-to-stop windows (not chain/Indet).
ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS stop_to_stop_gap_accepts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.fuel_reconciliation_period.stop_to_stop_gap_accepts IS
  'Accepted stop-to-stop OVER-LOG windows for this period: [{bucketId,vehicleId,startOdometer,endOdometer,startDate,endDate,note,disposition,at,by}]. Cleared on reopen. Never accepts chain anomalies.';
