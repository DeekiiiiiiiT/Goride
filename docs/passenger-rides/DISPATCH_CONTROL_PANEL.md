# Dispatch Control Panel

Global matching and dispatch settings for Roam Rides, editable from **Rides Admin → Control Panel** without redeploying the edge function.

## Deploy

1. Apply migration `supabase/migrations/20260521100000_rides_dispatch_settings.sql` (`supabase db push` or SQL Editor).
2. Redeploy the **rides** Supabase Edge Function.
3. Hard-refresh the rides-passenger admin app.

## Settings reference

| Setting | Default | Effect |
|---------|---------|--------|
| Max matching waves | 3 | How many times the system widens search before cancelling for no drivers |
| Wave radius (km) | 5, 15, 35 | Haversine radius per wave (must increase each wave) |
| Offers per wave | 8 | Max drivers pinged per wave |
| Default offer timeout (s) | 15 | Seconds drivers have to accept (unless overridden per booking) |
| Location max age (min) | 10 | GPS freshness for matching and quote ETA |
| Quote driver radius (km) | 15 | Driver pool for pickup ETA on quotes |
| Body-type filtering | on | When off, ignores service ↔ body type links (distance-only) |
| Tier expansion | expand | **expand**: add lower-priority body types each wave; **strict**: only highest-priority tier |
| Require body type for offers | on | When off, drivers without `body_type_slug` can still receive offers |

## What stays elsewhere

- **Body types & services** — Fare Rules → Transport Solutions
- **Service ↔ body type priority** — Services edit dialog
- **Fares** — Fare Rules
- **Surge** — Surge Pricing

## Runtime behavior

- Settings are cached in the edge function for ~30 seconds after load.
- **In-flight rides** keep their current `matching_wave`; new waves and new bookings use updated values immediately after cache expiry.
- Changes are audited as `admin_dispatch_settings_updated`.

## Roles

- **Read**: `rides_ops`, `rides_admin`, platform roles
- **Write**: `rides_admin`, `platform_owner`, `superadmin` only

## Phase 2 (not implemented)

- Per-service dispatch overrides (custom radii, strict-only products)
- Quote token TTL and surge caps in Control Panel
