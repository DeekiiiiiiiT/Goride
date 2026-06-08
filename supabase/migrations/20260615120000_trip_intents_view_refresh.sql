-- Refresh booking_requests view after trip_intents columns (PostgREST uses public views).
CREATE OR REPLACE VIEW public.rides_booking_requests AS SELECT * FROM rides.booking_requests;

NOTIFY pgrst, 'reload schema';
