# FUEL_SERVER_ENGINE rollout (Close-out)

## Current prod

**`FUEL_SERVER_ENGINE=shadow`** (restored 2026-09-15).

Enforce stays paused until soak exit. Shadow logs the same diffs without blocking closes.

## Wait before enforce (data-gated)

1. N-17 PA absorb in `computeFuelWeek` + snap stamp + CI fixtures green  
2. Finalize break-glass UI live (admin + reason ≥8)  
3. **N-19 live** — every `fuel_engine_diff` audit carries `authoritySourceByDriver` (and per-mismatch `authoritySource`)  
4. **`shadowMinWeeks: 2`** with zero unexpected `fuel_engine_diff` (or signed `finance_recon_drift` exceptions)  
5. Phase 4 ladder live; soak rows show `authoritySource` (expect **`trip_agg`** until fill tagging ships; no unexplained fallthrough to `snap_category_costs` on PA/normal weeks)  
6. **N-3 live** — shadow/enforce derives `windowTimingCost` + `unattributedFillCost` from week entries (not client stamp alone) and `diffWeekCalc` reports timing/unattributed deltas  
7. Then set `FUEL_SERVER_ENGINE=enforce` on Supabase secrets (not Vercel)

### Honest Phase 4 / N-18 posture

Fill writers now stamp `usageCategory` (saveFuelEntry infer, JAA `ride`, driver portal `ride`).  
Existing untagged historical fills still fall through to `trip_agg`.  
`playbookStatus.phase4ServerCats = ladder_live_trip_agg`  
`playbookStatus.n18FillTagging = writers_live_pending_soak`  

Promote to `live` after soak shows `authoritySource: "server_entries"` on tagged weeks.  
Do **not** block enforce on requiring server_entries for every historical week.

## Soak checklist (≥2 full close cycles on shadow)

For each closed week:

- [ ] Close via wizard (and one bulk path if used in ops)
- [ ] Close completes (no 422 from PA alone)
- [ ] Pull `fuel_period_audit` where `action = 'fuel_engine_diff'`
- [ ] Classify every mismatch: expected (signed exception) vs bug
- [ ] Confirm `authoritySourceByDriver` present for each driver (N-19) — expect `trip_agg` until Wave 4
- [ ] Inspect share/category deltas — no unexplained `driverShare` / `companyShare` / category deltas
- [ ] Inspect timing/unattributed deltas — N-3 fields present on `fuel_engine_diff` when non-zero
- [ ] Any residual rows signed in `finance_recon_drift` (`kind=fuel`, `source=close` or `nightly`)
- [ ] Confirm nightly statement↔ledger drift stays $0
- [ ] PA weeks show zero PA-shaped share drift after N-17
- [ ] Exercise break-glass once in staging (reason ≥8 → audit `fuel_force_client_money`)

**Soak exit:** `shadowMinWeeks` met, zero unexpected diffs (or all signed), wait conditions above green.

**Hard stop:** do not flip enforce if N-17 red, N-19 missing from audits, or waitConditions unmet.

## Playwright soak smoke

```bash
# Gate hard-stop only (no creds)
pnpm test:e2e:fleet:fuel-soak -g "gate hard-stop"

# Two-week audit + break-glass (fleet running on FLEET_BASE_URL)
# Use node @playwright/test CLI (pnpm bin can resolve the wrong playwright package on this repo)
set E2E_FLEET_EMAIL=...
set E2E_FLEET_PASSWORD=...
set E2E_FUEL_WEEK=2026-08-18
set E2E_FUEL_WEEK_2=2026-08-25
pnpm test:e2e:fleet:fuel-soak

# Destructive closes (shadow) — only when you intend to lock weeks
set E2E_FUEL_SOAK_MODE=close
set E2E_FUEL_ALLOW_FINALIZE=1

# After checklist green: record enforce in stage0-gate.json (still set Supabase secret manually)
set E2E_FUEL_FLIP_ENFORCE=1
```

Report: `docs/fuel-recon/soak-smoke-last-run.json`

## Enforce flip playbook (Wave 2)

Only after soak exit:

1. Re-run gates: `fuel-core` typecheck/tests, Deno fuel suite, fleet fuel finalize tests  
2. Set Supabase secret `FUEL_SERVER_ENGINE=enforce` (prod)  
3. Update `stage0-gate.json`: `currentProd: "enforce"`, `next: null`, `soakExit: "done"`, `enforcedAt: <ISO>`  
4. First production close: expect lock on match; on mismatch expect 422 + break-glass UI (not curl)  
5. 48h watch: finalize outcomes, any `partial_money`, open `finance_recon_drift` for `kind=fuel`

**Rollback:** flip secret back to `shadow` (proven Rev 6). Keep break-glass UI for at least two weeks post-enforce.

## Break-glass

`X-Fuel-Force-Client-Money: 1` + body `forceReason` ≥ 8 — Finalize UI (admin-only) after SNAPSHOT_MISMATCH.

## Authority notes

- **Phase 4 ladder:** `server_entries → trip_agg → tagged_snap_entries → snap_category_costs`
- **Today:** production authority is almost always `trip_agg` (client `tripCategoryAgg` stamp). Server-tagged fills unlock `server_entries` after Wave 4 writers land.
- Untargeted rows (no driver/vehicle on entry) never become authority.
- Untagged settledEntries are not authority (N-15).
- Money: PA earned absorb runs in `computeFuelWeek` (N-17).
- Observability: `authoritySource` / `authoritySourceByDriver` on `fuel_engine_diff` (N-19).

## Stage 0

Week **2026-08-24** / **73e5b1dc…** statement↔ledger **$0** — see `stage0-gate.json`.
