/** QA checklist for Roam Connections rollout. */
export const ROAM_CONNECTIONS_QA = [
  'Flag OFF: all add-contact surfaces behave as before',
  'Flag OFF: Book for Someone E2E unchanged',
  'Flag ON: Add by @tag sends connection request (not silent add)',
  'Flag ON: Add contact overlay sends request when Save checked',
  'Flag ON: Device import sends batch requests with summary',
  'Flag ON: Pending hub shows Sent connection requests + ride auths',
  'Flag ON: Incoming banner appears for pending received requests',
  'Flag ON: Accept creates booker contact row',
  'Flag ON: Reject / block / report on received tab',
  'Flag ON: Ride authorization works in parallel while connection pending',
  'Flag ON: Signup sync-phone matches pending invites',
  'Flag ON: Grandfathered linked contacts still bookable',
  'Deploy: migration 20260618120000_roam_connections.sql applied',
  'Local dev: add VITE_ROAM_CONNECTIONS=1 to apps/rides-passenger/.env.local and restart Vite',
  'Deploy: ROAM_CONNECTIONS=1 server secret before client VITE_ROAM_CONNECTIONS=1 at build time',
] as const;
