# Body-type dispatch — ops checklist

## Database

Apply migration `supabase/migrations/20260520100000_rides_body_type_dispatch.sql` (SQL Editor or `supabase db push`).

## Deploy

Redeploy the **rides** Edge function after code changes.

## Configure (Roam Rides admin)

1. **Fare Rules → Transport Solutions → Body types** — add Commando body types (Sedan, SUV, …).
2. **Services** — create rider products (Roam S, Comfort, Courier, …) with marketing copy.
3. On each **service**, check allowed body types and set order (↑↓ = dispatch priority).
4. **Fare Rules → Rules** — one active rule per location × **service** slug (not body-type slug).

## Drivers

- Primary `driver_vehicles.body_type` must match a Commando label (maps to a configured body-type slug).
- Driver app sends `body_type_slug` when going online; drivers without a body type do not receive offers when a service has linked types.

## Dispatch behaviour

- **Wave 1:** only drivers whose `body_type_slug` matches the service’s **highest-priority** linked type(s).
- **Wave 2+:** adds the next priority tier(s) until all linked types are eligible.
- Within each wave, ranking is still by drive time / distance (unchanged).

## Clean slate (legacy UberX tiers)

Delete old `uberx` / `comfort` vehicle rows if unused, remove fare rules that reference them, then recreate services and body-type links as above.

## Global dispatch knobs

Wave count, radii, offer timeouts, and body-type policy toggles are in **Admin → Control Panel**. See [DISPATCH_CONTROL_PANEL.md](./DISPATCH_CONTROL_PANEL.md).
