-- Book for me: payer commit window + rider book deadline

ALTER TABLE rides.booking_requests
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS book_by_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_booking_requests_claimed_book_by
  ON rides.booking_requests (book_by_at)
  WHERE status = 'claimed';

CREATE OR REPLACE VIEW public.rides_booking_requests AS SELECT * FROM rides.booking_requests;

NOTIFY pgrst, 'reload schema';
