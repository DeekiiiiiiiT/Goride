# Fuel Brain backfill & PO acceptance

After deploying capacity-cycle unification:

## 1. Recalculate (ops) — real path only

1. Deploy edge functions (`fleet-server` / `_fleet-server`).
2. Open **Fuel Audit → Recalculate All**, or Logs → **Recalculate** (now calls the same endpoint).
3. Optional body / vehicle filter: `{ "vehicleId": "5179KZ" }` (plate or UUID) to rescore one car.
4. Confirm each fill gets:
   - `isCapacityClose` / `isSoftAnchor` / `volumeContributed` / `excessVolume` under the **98%** rule
   - a **stable UUID** `metadata.cycleId` shared by fills in the same tank cycle
5. Labels show **Capacity full** (spillover) — driver Full Tank checkbox is removed.

**Do not use** retired `POST …/admin/backfill-fuel-integrity` (returns 410).

## 2. Personal Allowance (ops)

1. Open **Earnings Policy** (or Tier → Personal Allowance) for the live/default policy.
2. Confirm **Personal Allowance is ON**.
3. Set **weekly quota JMD** to the fleet target.
4. Confirm active Fuel scenario **personalCoverage** so overage personal $ is paid by the driver.

## 3. Feature flags

| Flag | Default | Meaning |
|---|---|---|
| `VITE_FLEET_CYCLE_HEALTH` | ON (unset) | Week Emerald/Amber/Red from tank cycles |
| `VITE_FLEET_CYCLE_HEALTH=0` | — | Legacy Amber-from-bucket (rollback) |
| `VITE_FLEET_USE_FUEL_BRAIN` | ON | Km attribution brain (unchanged) |

## 4. PO acceptance checklist (5179KZ)

- [ ] Capacity closes when cumulative ≥ ~35.3 L on 36 L tank
- [ ] Recent fills have `cycleId`; spillover on next cycle when a fill overshoots
- [ ] Reimbursement rows are not hard anchors; Full Tank checkbox gone from driver UI
- [ ] Finalize freezes slim cycles
- [ ] Net Pay still = Paid by Driver − Deduction
