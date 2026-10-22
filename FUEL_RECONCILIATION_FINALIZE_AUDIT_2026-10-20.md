# Fuel Reconciliation — Finalize Path & Calculation Engine Audit

**Rev 13 · 2026-10-22** · Read-only check of Rev 12 against code, gates and production. No code, config or data changed.
**Gates:** fuel-core 34/34 ✔ · `deno check` (prepare, compute, routes, closable gate) ✔ · hash tests 5/5 ✔ · leakage step test ✔ · fleet `tsc` 484 ✔ · `fleet-fuel` v95 deployed 16:00 UTC ✔

## Status: code complete — no open code findings

Rev 12's claims are verified in code:

- **Prior-week credit:** counts locked weeks only, and every prior week's status, snapshot version and variance is in the input hash.
- **Lock order:** a week can't lock while any of the 3 earlier started weeks is not locked. The refusal is repeated inside the finalize job.
- **Gate:** the larger of J$5,000 and 20% of the week's spend.
- **Home pin:** part of the hash.
- **Failed-route snapshots:** retried, not duplicated.
- **Shadow report:** a read-only `engine-shadow` route exists.

**Routing works.** One Google Directions route is cached (15:54 UTC). The `ZERO_RESULTS` lines at 15:54–15:57 are individual legs Google can't route; those legs fall back to the road-factor estimate, as designed. The health check (Kingston → Spanish Town) uses valid points.

## What's left (all operational)

1. **Commit.** The Rev 12 work is still uncommitted, including the new `priorWeekCredit.ts`, even though v95 is live. Commit so the repo matches production.
2. **Prepare the open weeks on v95.** No `/compute` has run since the deploy: the latest snapshots for 21 Sep, 28 Sep and 5 Oct are from 14:07, before routing and the new hash. Open each week in the wizard, then run the check below. For 5 Oct, expect commute > 0, reposition "Measured route", and unattributed well under 381 km.
3. **14 Sep is a real week, not an empty one.** Its period row shows J$0 and no vehicles, but **12 fills** are on record; it was never prepared. Because of the lock-order rule it **blocks** 21 Sep, 28 Sep and 5 Oct. Check that it appears in the week list (it should be filled in from fill data), then prepare and lock it.
4. **Lock in order:** 7 Sep (still `reopened`) → 14 Sep → 21 Sep → 28 Sep → 5 Oct. Prepare each week again **after** the one before it locks, so the credit uses locked numbers.
5. **Shadow before the first lock:** run `GET /fuel/engine-shadow?weeks=8&status=locked` and review the driver-share differences. Don't reopen locked weeks from it.

Kenny (5179KZ) is the only active driver. Driver `5ec79f6c` (1505LM) is not a real driver, so no home address is needed.

## Check

```sql
select period_id, version, created_at,
       r->'metadata'->>'referenceKmPerLiter' ref, r->>'miscellaneousCost' variance,
       r->>'commuteCost' commute, r->>'unattributedKmCost' unattributed, r->>'driverShare' driver
from public.fuel_week_snapshot, jsonb_array_elements(money->'reports') r
where provenance->>'engineVersion' is not null and created_at > '2026-10-22 16:00'
order by created_at desc;
```

## Do not change

- The continuous fill chain, Jamaica-time weeks, the evidence ladder without a floor, and the 8-week all-fills reference.
- Negative variance never billed; the leftover default is company; locked-only rolling credit; lock order.
- `processJobRow`'s `alreadyLocked` short-circuit, C-8 compensation, the atomic job claim, and the after-prepare snapshot hash.
- The Review Queue.
