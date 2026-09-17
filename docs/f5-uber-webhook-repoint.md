# F5 — Re-point Uber webhook (PO, 2 minutes)

**Why:** Uber posts to whatever URL is saved in *their* dashboard. That URL never updates when we ship code. If it still says `make-server-37f42386`, traffic stays forever and retiring the shim **silently drops** vehicle/driver sync events.

## Do this

1. Open [Uber Developer Dashboard](https://developer.uber.com/) → org **RoamFleet** → your Vehicles/Fleet application → **Webhooks** (or Setup).
2. Set the webhook URL to exactly:

```
https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-core/uber/webhook
```

3. Save.

## Tell eng / Cursor when done

We will verify:

- New rows in `kv_store_37f42386` with keys `uber_webhook_log:*`
- Shim soak no longer lists `/make-server-37f42386/uber/webhook`
- Mark `uber-webhook` as `cleared` in `docs/f5-external-callers.json`
- `pnpm f5:external-callers` exits 0

Same URL is advertised in Fleet → Integrations → Uber status (`portal.webhookUrl`) and in `apps/fleet/src/constants/uberFleetPortal.ts`.
