# RoamFleet × Rush — Pilot Checklist

Run after Wave 1–2 remediation and before enabling flags on pilot orgs.

## Pre-flight

- [ ] V1 invite accept returns 401 without auth
- [ ] Active courier joining fleet stays `active`
- [ ] Offer-accept path stamps `courier_fleet_id`
- [ ] Live projection creates synthetic batch row
- [ ] Recon cron configured with `CRON_SECRET`
- [ ] Control org (rideshare-only) regression check passed

## Flag sequence (per org)

1. [ ] `service_lines_enabled`
2. [ ] `rush_courier_link` — invite courier, verify roster
3. [ ] `rush_trip_projection` — complete delivery, trip appears < 5 min
4. [ ] 7 consecutive days recon drift = 0
5. [ ] `rush_ui` — nav matches customer shape
6. [ ] PO payout routing sign-off
7. [ ] `rush_settlement` — COD API 200, manual week reconcile to cent

## Customer shapes

| Org | Verify |
|-----|--------|
| Rideshare-only (control) | Nav unchanged, no Rush surfaces |
| Delivery-only | Couriers + Fuel/Toll/Vehicles, no Imports |
| Both-lines | Scope switcher filters trips |

## Emergency rollback

See [rush-fleet-rollout.md](./rush-fleet-rollout.md). Verify V6 kill switch before relying on flag disable.
