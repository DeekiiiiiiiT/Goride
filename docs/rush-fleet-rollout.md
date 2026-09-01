# RoamFleet × Roam Rush — Gradual Rollout Guide

Mirrors [fleet-data-isolation-rollout.md](./fleet-data-isolation-rollout.md) for Rush integration flags.

## Flags

Defined in `supabase/functions/_fleet-server/feature_flags.ts`:

| Flag | Guards | Default |
|------|--------|---------|
| `service_lines_enabled` | Reading `organizations.service_lines` instead of `business_type` | off |
| `rush_courier_link` | Workforce invites + courier↔fleet membership | off |
| `rush_trip_projection` | Order→trip projection bridge | off |
| `rush_settlement` | Delivery revenue in settlement + COD read APIs | off |
| `rush_ui` | Rush navigation and pages in fleet app | off |

**Prerequisite:** Module kill switch (V6) must be fixed before relying on flag rollback.

## Pre-enable checklist

- [ ] Wave 1 gate: invite accept requires auth; RLS uses `organizationId` claim
- [ ] Wave 2 gate: offer-accept path stamps `courier_fleet_id`; recon reports zero drift 7 days
- [ ] All Critical defects (V1–V3) closed
- [ ] High gating defects (V4–V8) closed
- [ ] Pilot orgs selected (see [rush-fleet-decision-log.md](./rush-fleet-decision-log.md))

## Enable sequence (per pilot org)

1. `service_lines_enabled` — org reads multi-line config
2. `rush_courier_link` — invite couriers, verify roster
3. `rush_trip_projection` — live delivery→trip sync; monitor recon daily
4. `rush_ui` — Rush nav surfaces (after entitlement gating verified)
5. PO sign-off on payout routing
6. `rush_settlement` — COD + combined settlement

## Admin API

```bash
# Check flags
curl -X GET "$API/admin/feature-flags" -H "Authorization: Bearer $ADMIN_JWT"

# Enable for one org
curl -X POST "$API/admin/feature-flags/rush_trip_projection/enable-for-org" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"ORG_UUID"}'

# Global enable (after pilot)
curl -X POST "$API/admin/feature-flags/rush_trip_projection/enable" \
  -H "Authorization: Bearer $ADMIN_JWT"

# Emergency disable
curl -X POST "$API/admin/feature-flags/rush_trip_projection/emergency-disable" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

## Rollback

| Phase | Action |
|-------|--------|
| Projection | Flag off; remove trips where `platform = 'Roam Rush'` by synthetic batch |
| Settlement | Flag off; no new Rush rows in settlement runs |
| UI | Flag off; nav hidden |
| Identity | Flag off; new columns inert |

## Control org

Keep one rideshare-only org enabled through all waves. CI + manual check: portal unchanged.

## Monitoring

- Daily: `GET /rush/trip-recon` (cron) — drift must be 0
- Alerts: recon drift ≠ 0, COD API 5xx, invite accept 401 rate anomalies
