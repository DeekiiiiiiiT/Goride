# Wallet architecture — QA matrix

Companion to [`MONEY_LEDGER_RULES.md`](MONEY_LEDGER_RULES.md).

| Case | Expect |
|------|--------|
| Independent cash/card Roam trip | Personal Cash/Digital/Debt only; no fleet KV sync |
| Fleet Roam trip, `fleet_org_payout_enabled=false` | Driver wallets + fleet KV sync (today’s behavior) |
| Fleet Roam trip, `fleet_org_payout_enabled=true` | Fare → org accounts; tips → driver Digital; fleet sync; Fleet Settlement desk |
| Fleet Start Trip only | Fleet Settlement / analytics only; Roam wallets $0 |
| `manual_start_trip_enabled=false` | Start Trip hidden |
| Fleet expenses / fuel | Still works; visible under Fleet Settlement |
| Kenny historical week | Fleet periods match Trip Analytics; Roam wallet not backfilled |
| Fee 0% (prod default) | Balances unchanged vs pre-deploy |
| Fee > 0 staging (`ROAM_PLATFORM_FEE_BPS` or dispatch setting) | `platform_fee_minor` set; `driver_net` reduced; tips excluded from fee base |

## Flags

| Flag | Where | Default |
|------|-------|---------|
| `manual_start_trip_enabled` | `driver_profiles` | true |
| `fleet_org_payout_enabled` | `organizations` | false |
| `roam_platform_fee_bps` | `rides.dispatch_settings` + env `ROAM_PLATFORM_FEE_BPS` | 0 |
| `FLEET_ORG_PAYOUT_ENABLED` env | edge | unset (use org column) |

## Ops follow-ups

1. Apply migration `20260726120000_wallet_architecture_layers.sql`.
2. Redeploy `rides` + `_fleet-server` edge functions.
3. Rebuild Kenny periods per [`FLEET_PERIOD_REBUILD.md`](FLEET_PERIOD_REBUILD.md).
4. Pilot `fleet_org_payout_enabled` on one org before global.
5. Set real Roam fee bps when product ready.
6. After App Store: set `manual_start_trip_enabled=false` per fleet drivers / org policy.
