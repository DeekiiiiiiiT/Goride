# Dash Launch — Ops Secrets & Webhook Verification Checklist
# Run before staging→prod cutover. Check each box in the launch go/no-go review.

## SMS (customer status updates via dashOrderSms)

- [ ] `DIGICEL_SMS_API_URL` + `DIGICEL_SMS_API_KEY` **or** `FLOW_SMS_API_URL` + `FLOW_SMS_API_KEY` set on delivery edge function
- [ ] `SMS_HOOK_STUB_LOG_OK` / `DASH_SMS_STUB_LOG_OK` are **unset** in production
- [ ] Smoke: place order → status change → customer phone receives SMS (or confirmed defer log only if no phone)

## Web Push (merchant + courier)

- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` set on `merchant-push` and `notifications` functions
- [ ] `REQUIRE_VAPID=1` set in production (health returns 503 if missing)
- [ ] `VITE_VAPID_PUBLIC_KEY` set on dash-merchant (and courier if used)
- [ ] `MERCHANT_PUSH_SECRET` set; Dashboard webhook Authorization/header matches
- [ ] Supabase Dashboard Database Webhook: `delivery.orders` INSERT → `merchant-push` with secret header
- [ ] Smoke: merchant subscribe → place order → device receives push
- [ ] Smoke: courier subscribe → offer dispatch → device receives push

## Stripe Terminal (POS)

- [ ] `STRIPE_SECRET_KEY` set on delivery function
- [ ] Production merchant build has `VITE_STRIPE_TERMINAL_SIMULATED` unset/false
- [ ] Real reader paired; card-present PaymentIntent succeeds

## Stripe Connect (payouts)

- [ ] Connect Express onboarded for test merchant + test courier
- [ ] Sandbox transfer succeeds end-to-end
- [ ] Legal/KYC money-transmission review signed (see docs/dash-launch-compliance-checklist.md)

## Dispatch re-dispatch cron

- [ ] Scheduled job calls `POST /courier/offers/redispatch` every 1–2 minutes with `FLEET_CRON_SECRET` or service role
- [ ] Verify stranded `ready` orders without courier get a new offer wave

## Migrations

- [ ] Applied `20260803120000_courier_payouts_period_unique.sql`
- [ ] Applied `20260803121000_merchant_special_hours.sql`
- [ ] Applied Connect account id migration(s) if present

## Uber Fleet (Vehicles API — RoamFleet Settings → Integrations)

- [ ] Uber Developer org **RoamFleet** (renamed from GoRide Fleet if needed) has an Application with Vehicles scopes
- [ ] Privacy Policy `https://roamenterprise.co/privacy` + Redirect `https://roamfleet.co/uber-callback` registered
- [ ] Webhook URL `…/make-server-37f42386/uber/webhook` registered (subscription may need Uber POC)
- [ ] Supabase Edge Function secrets: `UBER_CLIENT_ID` + `UBER_CLIENT_SECRET` on fleet server (`make-server-37f42386`)
- [ ] Optional: `UBER_FLEET_SCOPES` override (default `vehicle_suppliers.vehicles.read vehicle_suppliers.vehicles.assignment`)
- [ ] Smoke: Settings → Connect → Sync Now returns vehicle match summary (not 401/403)
