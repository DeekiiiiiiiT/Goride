# @roam/fuel-core

Pure TypeScript fuel domain helpers shared by fleet, admin, driver, and Deno edge.

**No React, no DOM, no sonner.** Apps thin-reexport from this package so call sites keep working.

## Package is canonical

`@roam/fuel-core` owns cycle math (`calculateFuelCycles`) and the money engine (`FuelCalculationService`). Fleet/admin/driver are consumers via thin re-exports — do not fork bodies back into apps.

| Topic | Decision |
| --- | --- |
| Price per litre | Observed gas-card cost / liters, else org `defaultPricePerLiterJmd`, else `priceUnavailable` (never invent 1.50). |
| Efficiency fallback | `FALLBACK_EFFICIENCY_KM_L = 10` is plausible for Jamaica and remains. |
| Cycle engine | Capacity close / soft anchors; JAA statement rows excluded. |

## Parity

Run `node scripts/check-fuel-core-parity.mjs` (also in CI) to ensure app shims stay re-exports of `@roam/fuel-core` rather than forked bodies.

## Deno

Edge may import source files via relative path, e.g.:

`../../../packages/fuel-core/src/resolvePricePerLiter.ts`
