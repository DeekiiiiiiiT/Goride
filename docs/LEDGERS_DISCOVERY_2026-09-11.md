# Ledgers §13 discovery (2026-09-11)

Run against GoRide (`csfllzzastacofsvcdsc`).

| Check | Result |
|---|---|
| Trips by platform / missing `netToDriver` | Uber 2734 / 470 missing; **InDrive 421 / 421 missing**; Roam 177 / 177 missing |
| Org buckets | Single org `8cfa606a-…` — **3332** trips; no null / roam-default-org rows |
| `amount` vs payload drift | **0** drifted rows |

Implications:
- F-02 InDrive net fix is mandatory (100% of InDrive rows lacked `netToDriver`).
- F-25 tenancy leak not currently active in this dataset; still enable `STRICT_ORG_FILTER` after backfill discipline.
- F-26 amount mirror is healthy today; still promote `net_to_driver` via migration `20260911140000_…`.
