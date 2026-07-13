# Fuel Brain cutover

Residual Personal stack is the product path. Sessions / Unknown review are **obsolete**.

## Deploy checklist

1. Apply migration `20260713140000_fuel_brain_residual_upgrade.sql` (policy columns + drop sessions/unknown tables).
2. Redeploy Edge `fuel-brain`.
3. Redeploy fleet `make-server` (hosts `fuel_logic` odo-first deadhead + policy load).
4. Confirm Dominion Fuel Brain → Deadhead rules save.
5. Fleet recon: Ride + Company + Deadhead + Personal closes odo; Misc is spend residual only.

## Rollback

Set `VITE_FLEET_USE_FUEL_BRAIN=0` on Fleet — money path uses legacy residual-in-personal with deadhead hint (same shape as automated leftover, minus brain metadata).

## Obsolete Phase A notes

Driver Personal toggles, session evidence, and Unknown finalize gates are removed. See `FUEL_BRAIN.md` for current rules. Keep `FUEL_BRAIN_PHASE_A.md` only as historical context.
