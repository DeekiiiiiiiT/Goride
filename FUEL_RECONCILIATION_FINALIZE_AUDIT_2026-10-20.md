# Fuel Reconciliation — Finalize Path Audit

**Rev 5 · 2026-10-21** · Read-only check of the Rev 4 fixes against code, gates and production (`csfllzzastacofsvcdsc`). No code, config or data changed.
**Gates:** fuel-core 27/27 ✔ · `deno check` (compute, prepare, routes) ✔ · Deno hash/org tests 5/5 ✔ · fleet `tsc` **495** ✔ (new baseline)

## Status: code complete

Every code item from Revs 1–4 is fixed, committed and verified.

**R4-1 is fixed and proven in production.** The snapshot now stores the hash taken *after* distances are saved. The new test covers a week with no saved distances. 2026-10-05 computed to a **single** v1 with no follow-up duplicate.

**2026-10-05 is verified ready to lock.** The server snapshot ties to the raw fills to the cent:

| Line | Server snapshot | From `fleet.fuel_entries` |
|---|---|---|
| Gas card | 15,000.00 | three linked card + manual pairs, counted once: 5,000 + 6,000 + 4,000. Three declined rows excluded |
| Cash from earnings | 13,350.00 | 5,000 + 3,000 + 2,350 + 3,000. All four reimbursements are **Approved** in Transactions |
| **Total** | **28,350.00** | 28,350.00 |
| Rideshare + deadhead + personal + window timing | 22,807.99 + 175.29 + 325.53 + 5,041.20 = 28,350.00 | identity exact, misc 0 |
| Driver / company | 2,342.15 / 26,007.85 | the same driver share the browser engine produced on 10-20 |

The 5,041.20 window-timing line is the first fill of the week, held by the company. That's correct by design (see "Do not change").

## What's left

1. **Finalize 2026-10-05.** This is the first money the new path will post. Then run the check below. It should show `sv` set, `progress_done` = 1, and the period's driver share = 2,342.15.
2. **Close the remaining open weeks.** 2026-09-21 and 2026-09-28 have fills but $0 on the period row until they are opened. 2026-09-07 is still `reopened`.
3. **Optional cleanup.**
   - `null_org_fill` can't fire now that `fuel_entries.organization_id` is NOT NULL. Keep it as a guard, but it isn't a live control.
   - `fleet.odometer_readings` still has 3 NULL-company check-in rows.

```sql
select j.period_id, j.state, j.cursor->>'snapshotVersion' sv, j.progress_done, j.failures,
       p.status, p.total_spend, p.driver_share, p.company_share
from public.fuel_period_job j join public.fuel_reconciliation_period p on p.id = j.period_id
where j.kind = 'finalize' order by j.created_at desc limit 3;

select event_type, amount_minor from public.financial_events
where domain ilike '%fuel%' and period_anchor between '2026-10-05' and '2026-10-11' and reversed_at is null;
-- expect fuel_deduction −234215, fuel_fleet_share −2600785, fuel_driver_spend −1335000, fuel_gas_card_spend −1500000
```

## Do not change

- Fill-to-fill efficiency, the window-timing carve, misc → company, the Personal Allowance identity.
- `processJobRow`'s `alreadyLocked` short-circuit, C-8 compensation, the atomic job claim, and the after-prepare snapshot hash.
- The Review Queue.
