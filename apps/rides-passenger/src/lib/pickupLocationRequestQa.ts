/**
 * Pickup location request — staged deploy + QA checklist.
 * Deploy order: migration → rides edge (PICKUP_LOCATION_REQUEST=1) → passenger build (VITE flag).
 */
export const PICKUP_LOCATION_REQUEST_QA_CHECKLIST = [
  'Flag off: Book for Someone unchanged — no Get rider location button, no API calls',
  'Roam tag rider with app: request → share → pickup auto-fills on booker',
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
  'Set PICKUP_LOCATION_REQUEST=1 on rides edge function secrets',
  'npx supabase functions deploy rides --no-verify-jwt',
  'Passenger release build with VITE_PICKUP_LOCATION_REQUEST=1',
  'Smoke: POST /v1/pickup-location-requests + GET token preview + share flow',
] as const;
