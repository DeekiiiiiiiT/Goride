# RoamFleet × Rush — production launch runbook

Consumer launch (no pilot workflow). Direct courier payouts; fleet settlement is tier-2.

## Feature flags (defaults)

| Flag | Production default | Rollback |
|------|-------------------|----------|
| `LEGACY_DRIVER_JOIN` | **off** | Keep off — invite-only join |
| `RUSH_SETTLEMENT` | **on** for orgs with `rush_delivery` | Disable per org in Dominion Rush rollout panel |
| `RUSH_COURIER_LINK` | **on** for delivery orgs | Disable to block courier workforce invites |

New orgs with `rush_delivery` in `service_lines` are provisioned with Rush modules + flags via `fleet_owner_provision.ts`.

## Rollback per org

1. Dominion → Fleet Rush modules (read-only panel) — turn off `rush_couriers`, `rush_settlement`, etc.
2. Org Settings → Service lines — remove `rush_delivery` (confirm modal warns about in-flight couriers).
3. Edge: set org overrides in `organization_feature_flags` if needed.

## Reconciliation cron

Migration `20260901150000_rush_trip_recon_cron_fix.sql` schedules `rush_trip_recon` on fresh DBs. Verify in Supabase Dashboard → Database → Cron / `pg_cron` that job exists after deploy.

## Projector capacity

Rush orders POST to `POST /internal/trips/project` (service-role only). Public `POST /trips` requires authenticated org — cannot cross-org inject.

Pre-launch: run projector load test against staging with peak order fixture; document p95 ingest latency in ops notes.

## Verification checklist

- [ ] Rideshare + courier join via invite codes only
- [ ] `GET /drivers` lists invite joiners
- [ ] Combined weekly statement shows `serviceLineBreakdown` in settlement overlay
- [ ] `node scripts/check-no-join-fleet-client.mjs` passes
- [ ] `deno test` green for `workforce_link`, `service_line_attribution`, `rush_fleet_finish`
- [ ] Playwright `fleet` project smoke (three customer shapes)

## Notion

Update [Audit Tracker](https://app.notion.com/p/bf2b52b6b24f46378908de6fe97375b5) — RoamFleet × Rush integration → **Done** with link to this runbook.
