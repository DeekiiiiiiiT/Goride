/**
 * Trip Intent v2 — staged deploy + QA checklist (Phase 9).
 * Deploy order: migrations → `rides` edge → passenger build (TRIP_INTENT_V2 on).
 */
export const TRIP_INTENT_QA_CHECKLIST = [
  'Open Roam: publish on @tag → booker tag lookup → overlay → track + minimize chip',
  'Shadow Roam: publish → booker pays → /shadow-trip status → drop-off SMS → wallet receipt',
  'Book for someone without intent: route → contact → home book flow',
  'Book for someone with intent: contact overlay → one-tap fulfill',
  'Targeted audience: only designated booker can fulfill',
  'Regression: self-booked ride, passenger redirect, driver app unchanged',
] as const;

export const TRIP_INTENT_DEPLOY_STEPS = [
  'supabase db push (trip_intents migration)',
  'npx supabase functions deploy rides --no-verify-jwt',
  'passenger app release build',
  'smoke: tag lookup + shadow GET /requests/:id redaction',
] as const;
