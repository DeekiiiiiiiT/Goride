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

**Prerequisite:** Module kill switch (W1) fixed — platform `false` defeats org override.

## Entitlement model

RoamFleet is the shared ops portal for rideshare and delivery. When an org's `service_lines` includes `rush_delivery`, all `rush_*` module keys are auto-provisioned in `enabled_modules`. KV flags (`rush_ui`, etc.) are **rollout controls only**, not paid SKUs.

Fleet owners configure service lines in **RoamFleet → Settings**. Platform staff can override service lines and rollout flags in **Dominion → Roam Fleet → Customer Accounts → org detail**.

## Pre-enable checklist

- [ ] Wave 1 gate: invite accept requires auth; RLS uses `organizationId` claim
- [ ] Wave 2 gate: offer-accept path stamps `courier_fleet_id`; recon reports zero drift 7 days
- [ ] All Critical defects (V1–V3) closed
- [ ] High gating defects (V4–V8) closed
- [ ] Pilot orgs selected (see [rush-fleet-decision-log.md](./rush-fleet-decision-log.md))

## Enable sequence (per pilot org)

### Dominion UI (preferred)

1. Log in to **Dominion** as `platform_owner`
2. **Roam Fleet → Customer Accounts** → open the pilot org
3. **Service lines** — confirm **Deliveries** is on (toggle and save if needed)
4. **Delivery rollout** — enable flags in order (UI enforces dependencies):
   - Service lines config
   - Courier linking
   - Trip projection
   - Delivery UI
   - Settlement (confirm modal — money impact)
5. **Effective delivery modules** — read-only; should show all `rush_*` on when Deliveries is entitled

**Permissions:** `platform_support` can view rollout status; only `platform_owner` can edit service lines or toggle flags.

**Not in scope:** `roamfleet.co/admin` (fleet product admin) and Dominion **Roam Rush → Merchants** (marketplace merchants).

### Manual pilot checklist (post-deploy)

- [ ] Pilot org: service lines match expectation in Dominion org detail
- [ ] Walk enable sequence 1→5; verify fleet app invites / projection / nav per flag
- [ ] Control org (rideshare-only): delivery off, rollout flags inert
- [ ] New signup with delivery: no module picker step; Settings shows “Delivery included”

## Admin API (fallback / automation)

```bash
# Consolidated status for one org
curl -X GET "$API/admin/organizations/ORG_UUID/rush-rollout" \
  -H "Authorization: Bearer $ADMIN_JWT"

# Platform owner: set service lines
curl -X PATCH "$API/admin/organizations/ORG_UUID/service-lines" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"serviceLines":["rideshare","rush_delivery"]}'

# Enable flag for one org (platform owner only for rush_* flags)
curl -X POST "$API/admin/feature-flags/rush_trip_projection/enable-for-org" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"ORG_UUID"}'

# Disable for org
curl -X POST "$API/admin/feature-flags/rush_trip_projection/disable-for-org" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"ORG_UUID"}'
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
