# RoamFleet × Rush — Pilot Runbook (Wave 1)

**Prerequisites:** X1 closed (product-line `rush_*` defaults on); pilot org selected (delivery-only or both-lines).

## Flag sequence

Use Dominion **Fleet Rush Rollout** panel or `rush_rollout_admin` API. Enable **one org only** until Wave 2 (scope filtering) ships.

| Step | Flag | Validate before next step |
|------|------|---------------------------|
| 1 | `service_lines_enabled` | Org `service_lines` resolves; rideshare-only orgs unchanged |
| 2 | `rush_courier_link` | Owner creates invite → courier accepts → roster shows member |
| 3 | `rush_trip_projection` | Delivered order appears in `fleet.trips` within minutes |
| 4 | `rush_ui` | Couriers, Deliveries, Supply Health nav visible and entitled |
| 5 | `rush_settlement` | **After Wave 3** — manual week reconciliation to the cent |

## 7-day zero-drift gate

1. Enable step 3 (`rush_trip_projection`) on pilot org.
2. Daily: run recon (`rush_trip_recon`) or check Dominion drift panel.
3. **Pass:** `drift === 0` for 7 consecutive days before scaling pilot or enabling step 5.

## Rollback drills

After each step, run [rush-fleet-load-rollback-drills.md](./rush-fleet-load-rollback-drills.md).

## Escalation

- Projection drift → disable `rush_trip_projection`; investigate `courier_fleet_id` and accept paths.
- Wrong nav → check `service_lines`, org `enabled_modules`, and `rush_ui` flag.
