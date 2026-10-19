# Audit: Fuel stop location resolution

**Rev 3 · 2026-10-19** · Status: **remediation implemented (code + prod data ops); commit + driver store ship pending** · Project `csfllzzastacofsvcdsc`

**Problem (Rev 1):** a driver logged a fill 397 m and 4 minutes after leaving FESCO Spanish Town Road, a verified station. The fill became a new "Unknown Vendor" location. The card statement named the station, but the system couldn't translate that name into the verified station.

## Where it stands

**Rev 3 closed in code / prod:**
- O1–O8 + smaller driver/queue/tsc fixes
- G1 provisional Resolution Queue filter + confirm API
- G2 reason / nearMiss / statementMerchant on learnt
- G3 reason-aware actions + bulk LATE LOG link + same-brand warning
- G4 Fleet log provisional evidence tooltip + swipe/`fillAt` time preference
- G5 SUPER LUBE + UNITED PETROLEUM GOD stations + seed aliases (pins need calibration)
- G7 CSV twins deleted (C3 = 0)
- G6 Move pin UI, geofence watch wired (opt-in flag), mock best-effort, weekly health workflow
- O7 RLS `app_metadata` only applied to prod
- C9 stuck-provisional check added to health SQL

**Still on you:** git commit/push (not auto-committed), redeploy `fleet-fuel` if CLI deploy was not run from this machine, ship driver store build ≥ claim-sheet version, watch first real Gas Card fill for `stationResolution` + `driverClaim`.

---

## Open items → status

### Must fix (O1–O8) — Done in code

| # | Issue | Status |
|---|---|---|
| O1 | Gas Card drops `driverClaim` | Fixed — online + offline metadata |
| O2 | Claim accepted from any distance | Fixed — candidates only; conflict → `review_required` |
| O3 | Remember statement name never works | Fixed — Link checkboxes + org resolve |
| O4 | Auto-heal overwrites admin/seed | Fixed — protect + conflict log |
| O5 | Re-heal full scans | Fixed — SQL org query + only on insert/change |
| O6 | Re-heal misses `location` | Fixed — `collectMerchantCandidateTexts` + pair attach |
| O7 | RLS `user_metadata` | Fixed — migration applied prod |
| O8 | Migration version drift | Fixed — renamed to `20261019181251_…` |

### Gaps

| # | Gap | Status |
|---|---|---|
| G1 | Provisional invisible | Done — `/admin/provisional-fills` + filter |
| G2 | Reason/statement on location-only | Done — learnt stamps + heal write |
| G3 | Queue actions by reason | Done — Link primary / bulk LATE LOG |
| G4 | Fleet logs evidence + swipe time | Done |
| G5 | SUPER LUBE / UNITED | Done — GOD + aliases (calibrate pins) |
| G6 | Phase 3 stubs | Done — Move pin tab, geofence watch, weekly workflow |
| G7 | CSV twin cleanup | Done — C3 = 0 |

---

## Ship steps (remaining)

1. Commit + push when ready.
2. Confirm `fleet-fuel` redeployed with this revision.
3. Ship driver store build (repo Android `1.0.29+`).
4. Watch first real fills: `metadata.stationResolution`, `fillAt` ≠ submit, Gas Card includes `driverClaim`.
5. Calibrate Super Lube / United Petroleum pins via Dominion **Move pin**.

## Gates

- Deno tests for O2/O4/O6 + provisional + heal: passing locally.
- Prod: C3 = 0 after G7; C9 added; O7 RLS live.
- Fleet `tsc` baseline: re-measure on clean `main` (unrelated +3 at Rev 2).
