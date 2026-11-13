# Service discount — what's left

**Rev 11 · 12 Nov 2026.** Goal: a shop discount is typed once on Log service → Review, and the saved service, the car's cost figures and Business Finance all show the amount actually paid.

**Done:** database changes live (migrations `20261111163445`, `20261111185734`, switch off for every org); server + Fleet screens built; code review CR-01–CR-09 fixed; 69/69 Deno, 39/39 vitest. Full history of this audit is in git (Rev 8 and earlier).

## Still to do, in order

| # | What | State |
|---|---|---|
| 1 | Re-run done-tests 1, 3, 8 on the test copy (Log service screen + test seed changed in Rev 8). | **PASSED 12 Nov** — 3 passed (21.8 s); new teardown ran clean; test copy stopped, test images deleted. |
| 2 | Commit the discount changes. | **DONE 12 Nov** — in `2b7d4b31` (pushed). |
| 3 | Deploy fleet-ops + Fleet site. | **DONE 12 Nov** — fleet-ops **v358** live (bundle rebuilt from `2b7d4b31`, has the discount, none of the S1–S3 bugs); smoke test passed. Fleet site rebuild fired by Vercel path deploy at 21:39 UTC (commit `a8ebe17a`, includes the discount screens). |
| 4 | Switch `maintenance_discount_enabled` on for the owner's org; log one real service with a discount; screenshots of Review, Service history and Business Finance. | **Switch ON 12 Nov** (org `8cfa606a…`, the only org; the server's view reads `true`). **Real service logged 13 Nov** (5179KZ, 20 May 2026): lines 3,000 − discount 1,900 = total_cost 1,100, saved correctly. Open: owner confirms Service history + Business Finance show 1,100 on screen. |

## Known, not a bug

- One old service (5179KZ, 30 Oct 2025) has total 24,100 vs lines 19,100. No invoice says what the 5,000 was; the tie check lists it by id.

## Seen, belongs to its own audit

- `loadOrgDueSoonSettings` and the work-order approval limit read settings the server can't see, so they always use defaults (1000 km / 30 days; 50,000).
