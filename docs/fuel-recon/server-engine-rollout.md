# FUEL_SERVER_ENGINE rollout (Rev 6)

## Current prod

**`FUEL_SERVER_ENGINE=shadow`** (restored 2026-09-15).

Enforce stays paused until soak exit. Shadow logs the same diffs without blocking closes.

## Wait before enforce (data-gated)

1. N-17 PA absorb in `computeFuelWeek` + snap stamp + CI fixtures green  
2. Finalize break-glass UI live (admin + reason ≥8)  
3. **`shadowMinWeeks: 2`** with zero unexpected `fuel_engine_diff` (or signed `finance_recon_drift` exceptions)  
4. Phase 4 server entry-derived categories live under shadow  
5. Then set `FUEL_SERVER_ENGINE=enforce` on Supabase secrets (not Vercel)

## Soak checklist (Phase 3)

For each of ≥2 full fuel close cycles on shadow:

- [ ] Close completes (no 422 from PA alone)
- [ ] Inspect `fuel_engine_diff` audits for that week — no unexplained `driverShare` / `companyShare` / category deltas
- [ ] Any residual rows signed in `finance_recon_drift` (`kind=fuel`, `source=close` or `nightly`)
- [ ] PA weeks show zero PA-shaped share drift after N-17

**Hard stop:** do not flip enforce if N-17d red or waitConditions unmet.

## Break-glass

`X-Fuel-Force-Client-Money: 1` + body `forceReason` ≥ 8 — Finalize UI (admin-only) after SNAPSHOT_MISMATCH.

## Authority notes

- **Phase 4:** server-loaded week entries with `usageCategory` are category authority (independent of client `tripCategoryAgg` stamp). Client agg remains a claim for compare.
- Fallback: `metadata.tripCategoryAgg`; untagged settledEntries are not authority (N-15).
- Money: PA earned absorb runs in `computeFuelWeek` (N-17).

## Stage 0

Week **2026-08-24** / **73e5b1dc…** statement↔ledger **$0** — see `stage0-gate.json`.
