# Fuel Brain backfill & PO acceptance

After deploying Fuel Brain Architecture Sync + stable cycleId + Personal Allowance:

## 1. Recalculate (ops)

1. Open **Fuel Management → Transaction Logs / Full Tanks**.
2. Set the date filter to the week(s) you care about (start with **Jun 15 – Jun 21, 2026**).
3. Click **Recalculate** so every fill gets:
   - `isSoftAnchor` / `volumeContributed` / `excessVolume` under the **98%** rule
   - a **stable UUID** `metadata.cycleId` shared by all fills in the same tank cycle
4. Confirm Full Tanks shows **Verified (Manual)** vs **Verified (Soft)** and cycle ids match entry metadata.

## 2. Personal Allowance (ops)

1. Open **Earnings Policy** (or Tier → Personal Allowance) for the live/default policy.
2. Confirm **Personal Allowance is ON** (defaults now enable for new policies; flip existing policies if still off).
3. Set **weekly quota JMD** to the fleet target (or leave unset to use weekly quota amount / 100,000 fallback).
4. Keep default bands unless product changes them: 0–60%→0 km, 60–80%→40, 80–100%→75, 100%+→100; next-week bonus 20 km.
5. Confirm active Fuel scenario **personalCoverage** (or Full mode) so **overage** personal $ is paid by the driver.

## 3. Feature flags

| Flag | Default | Meaning |
|---|---|---|
| `VITE_FLEET_CYCLE_HEALTH` | ON (unset) | Week Emerald/Amber/Red from tank cycles |
| `VITE_FLEET_CYCLE_HEALTH=0` | — | Legacy Amber-from-bucket (rollback) |
| `VITE_FLEET_USE_FUEL_BRAIN` | ON | Km attribution brain (unchanged) |

## 4. PO acceptance checklist (5179KZ / Kenny, Jun 15–21)

- [ ] Full Tanks: ~4 verified cycles, Soft vs Manual labeled honestly; stable cycleIds after Recalculate
- [ ] Finalize freezes **slim** cycles (ids + stats, no full transaction blobs)
- [ ] Consumption Reconciliation: Data Health not Amber solely from ±20% stop variance
- [ ] With PA on: Personal shows “after allowance”; earned km absorbed by company; overage only in driver share
- [ ] Net Pay still = Paid by Driver − Deduction
- [ ] One narrative across Full Tanks + Recon + Stop-to-Stop
