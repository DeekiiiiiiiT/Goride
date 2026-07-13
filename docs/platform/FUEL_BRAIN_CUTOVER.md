# Fuel Brain — Production Cutover Runbook

Ordered flag enablement and rollback. Mirror style: [MATCHING_BRAIN_CUTOVER.md](./MATCHING_BRAIN_CUTOVER.md).

## Prerequisites

1. Migration applied: `20260713120000_fuel_brain_schema.sql`
2. Edge function deployed: `fuel-brain`
3. Secrets:
   - `FUEL_BRAIN_INTERNAL_SECRET` (Edge + any server caller)
4. Clients built with Vite flags for the stage you are enabling

## Enable sequence (do not skip)

### Step 1 — Sessions (evidence only)

```bash
# Client env (driver + fleet)
VITE_FUEL_PERSONAL_SESSIONS_ENABLED=1
# Optional Edge mirror
FUEL_PERSONAL_SESSIONS_ENABLED=1
```

**Verify:** Driver can start/end Personal or Off-duty; Fleet recon shows week session panel; **recon money unchanged**.

**Rollback:** Set flag to `0`.

---

### Step 2 — Brain Edge (shadow)

```bash
# Edge
FUEL_BRAIN_ENABLED=1
```

```bash
# Fleet client (optional shadow logs)
VITE_FUEL_BRAIN_SHADOW_COMPARE=1
# Keep consumer OFF
VITE_FLEET_USE_FUEL_BRAIN=0
```

**Verify:**

```bash
curl https://YOUR_PROJECT.supabase.co/functions/v1/fuel-brain/health
# brain_enabled: true
```

Compare shadow logs: brain personal/unknown vs legacy residual. Money UI still legacy.

**Rollback:** `FUEL_BRAIN_ENABLED=0` and/or `VITE_FUEL_BRAIN_SHADOW_COMPARE=0`.

---

### Step 3 — Fleet consumer (one org / staging first)

1. Dominion → Fuel Brain → allow organization on product profile stub
2. Enable:

```bash
VITE_FLEET_USE_FUEL_BRAIN=1
FLEET_USE_FUEL_BRAIN=1
```

**Verify:**

- Declared personal session km appear in Personal
- No sessions → residual goes **Unknown**, not Personal
- Finalize warns/blocks when Unknown above Dominion threshold (ack to proceed)

**Rollback (immediate):** `VITE_FLEET_USE_FUEL_BRAIN=0` / `FLEET_USE_FUEL_BRAIN=0` restores legacy residual row math.

---

### Step 4 — Tighten Unknown gates

After shadow weeks look good, lower `unknown_finalize_threshold_km` / `%` in Dominion policy.

## Invariants

1. Flag off → recon totals match pre-change fixtures
2. Declared personal appears in Personal when consumer on
3. No sessions + consumer on → Unknown, not Personal
4. Client and deadhead server use same trip km helper
5. Finalize gated on Unknown when consumer on
6. Rollback consumer flag restores legacy immediately

## Out of scope (this delivery)

GPS trails, home/office geofences, ECU fuel, rewriting Ride Share $ formula beyond km source, changing policy coverage %.
