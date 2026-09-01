# RoamFleet × Roam Rush — Programme Decisions (§10)

**Locked:** 2026-09-01  
**Authority:** Product Owner sign-off for integration programme  
**Source:** [ROAMFLEET_RUSH_INTEGRATION_AUDIT.md](../ROAMFLEET_RUSH_INTEGRATION_AUDIT.md) §10

## Decisions

| # | Topic | Decision | Rationale |
|---|--------|----------|-----------|
| 1 | Payout routing | **Roam pays couriers directly**; fleet owner invoices/collects fleet cut separately (Uber model) | Lowest regulatory risk for v1; fleet cut stays tier-2 settlement on `fleet.trips` |
| 2 | Commercial packaging | **Paid add-on modules** via `enabled_modules` (`rush_*` keys), with org `service_lines` gating what they operate | Separates entitlement from configuration; supports trial/grace on modules later |
| 3 | Courier history on fleet join | **Join date onward** only | Avoids retroactive settlement changes |
| 4 | Merchant-as-fleet-owner | **Blocked commercially for v1** | Data model allows it; commercial model does not support dual role yet |
| 5 | Fleet-preference dispatch | **Out of scope v1** | Marketplace fairness / antitrust; read-only Supply Health only |
| 6 | Branding | **Keep `roamfleet.co`**; soften in-product copy from "fleet management" to **"operations"** | Domain equity; broader delivery + rideshare positioning |
| 7 | Fleet owner courier approval | **Roam approves; owners nominate** via sponsored onboarding | Platform liability for background checks and documents |
| 8 | COD cash in fleet | **Read-only projection** with "owed to Roam" label; no fleet write path | Prevents fleet owner clearing platform receivable |

## Implications for engineering

- Do not add fleet party to `computeDashCaptureSplit`.
- Rush nav requires `service_lines` + `enabled_modules` + rollout flags (`rush_ui`, etc.).
- Product-line `rush_*` defaults are `true` (kill switch at platform level); org without `rush_delivery` in `service_lines` still fails closed via `rushModuleOverridesForServiceLines`.

## Review

Revisit payout routing (decision 1) and merchant-as-fleet (decision 4) with legal before v2.
