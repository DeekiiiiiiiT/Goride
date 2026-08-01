/**
 * Path B smoke checklist runner (manual API steps documented).
 * Full Playwright e2e lands when Enterprise test credentials exist in CI.
 *
 * Local verify:
 * 1. pnpm --filter @roam/enterprise build  (done in implementation)
 * 2. deno test --no-check supabase/functions/freight/transitions.test.ts
 * 3. Sign in at /login → /app → create carrier/client/rate card/shipment → bill
 */
console.log(`
Path B smoke (manual):
  [ ] Marketing Sign In → /login
  [ ] /app dashboard loads
  [ ] Create carrier (own + 3PL), client, rate card
  [ ] Create shipment → transition → bill (double-click safe)
  [ ] Wrong productLine blocked
  [ ] No rideshare Enterprise orgs (audit view = 0)
`);
