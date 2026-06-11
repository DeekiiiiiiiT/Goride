/**
 * Pickup location request — staged deploy + QA checklist.
 * Deploy order: migrations → rides edge (PICKUP_LOCATION_REQUEST=1) → passenger build (VITE flag).
 */
export const PICKUP_LOCATION_REQUEST_QA_CHECKLIST = [
  'Flag off: Book for Someone unchanged — no Get rider location button, no API calls',
  'Flag off: no incoming shell banner, no GET /incoming calls',
  'Roam tag rider with app: in_app delivery, no SMS, shell banner visible on Home/Services/Account',
  'Roam contact (linked user): in_app delivery, rider sees banner',
  'Phone contact without Roam: SMS only with share link, no in-app banner until login',
  'Phone contact with Roam account (lookup): in_app delivery, banner visible',
  'Roam tag rider: request → share → pickup auto-fills on booker',
  'Roam contact with saved place: manual/saved pickup still works without live request',
  'Phone contact without Roam: SMS deep link → login → share location',
  'Rider declines: booker sees toast, can enter pickup manually',
  'Request expires (15 min): resend works, prior request cancelled',
  'Booker cancels waiting: pending row closed server-side',
  'Complete flow: location → recipient → home → book ride succeeds',
  'Shadow / Open Roam and Book for Me flows unaffected',
] as const;

export const PICKUP_LOCATION_REQUEST_DEPLOY_STEPS = [
  'supabase db push (20260616120000_pickup_location_requests.sql)',
  'supabase db push (20260617120000_pickup_location_requests_rider_incoming.sql)',
  'Set PICKUP_LOCATION_REQUEST=1 on rides edge function secrets',
  'npx supabase functions deploy rides --no-verify-jwt',
  'Passenger release build with VITE_PICKUP_LOCATION_REQUEST=1',
  'Smoke: POST /v1/pickup-location-requests (in_app + sms paths)',
  'Smoke: GET /v1/pickup-location-requests/incoming for signed-in rider',
  'Smoke: GET token preview + share flow',
] as const;
