# Fuel Brain

Platform brain for **fuel purpose classification** (Ride Share, Deadhead, Company Ops, Personal, Unknown).

Fleet owns the **money layer** (receipts, efficiency, policy % splits). The brain supplies **category km + confidence**.

Architecture: [fuel-brain-architecture.drawio.xml](./fuel-brain-architecture.drawio.xml)  
Cutover: [FUEL_BRAIN_CUTOVER.md](./FUEL_BRAIN_CUTOVER.md)

## Components

| Surface | Role |
|---------|------|
| Dominion `FuelBrainPage` | Policies, evidence health, Unknown queue, org allow-list |
| Edge `supabase/functions/fuel-brain` | Health, policies, classify-week, unknown reviews |
| Driver `PersonalDrivingToggle` | Personal / Off-duty sessions (`VITE_FUEL_PERSONAL_SESSIONS_ENABLED`) |
| Fleet recon | Dual path: legacy residual vs brain km (`VITE_FLEET_USE_FUEL_BRAIN`) |

## Feature flags (default OFF)

| Flag | Where | Meaning |
|------|-------|---------|
| `FUEL_PERSONAL_SESSIONS_ENABLED` / `VITE_FUEL_PERSONAL_SESSIONS_ENABLED` | Edge + clients | Driver toggle + session API |
| `FUEL_BRAIN_ENABLED` | Edge | Accept classify traffic |
| `VITE_FUEL_BRAIN_SHADOW_COMPARE` | Fleet | Log brain vs legacy without changing money |
| `FLEET_USE_FUEL_BRAIN` / `VITE_FLEET_USE_FUEL_BRAIN` | Edge + Fleet | Recon consumes brain km (**last**) |

## Classifier priority (locked)

1. Declared personal / off-duty sessions → Personal (high)
2. Platform trip km (full rideshare stack) → Ride Share (high)
3. Company Misc / Maintenance adjustments → Company Ops (high)
4. Deadhead hint on remaining residual → Deadhead (med)
5. Else → **Unknown** (low) — **never auto-Personal**

## Trip km rule

Shared helper: On Trip + Enroute + Open + Unavailable (`tripRideshareKm.ts` + `fuel_logic.getTotalTripRideshareKm`).

## Secrets

- `FUEL_BRAIN_INTERNAL_SECRET` — Fleet/server → Edge classify (`X-Fuel-Brain-Internal-Secret`)

## Migration

`supabase/migrations/20260713120000_fuel_brain_schema.sql` — `fuel.driving_sessions`, `fuel.brain_policies`, `fuel.unknown_reviews`, `fuel.product_profiles` + public views.
