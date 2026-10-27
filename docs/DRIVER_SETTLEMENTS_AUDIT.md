# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 19 · 2026-10-27 · §1a/§1b code Done · Owner ops checklist live**

Rev 1–18 are in git history. This revision lists open items only.

**Verified this round (prod DB, 2026-10-27):**
- Fuel money math for declined Sep 16 Super Lube rows remains correct (Rev 18 §1 withdrawn).
- Sep 7 fuel period **locked**. Sep 14 fuel period **open** at `leakage-gap`, `leakage_reviewed_at` still null.
- Sep 21 / Sep 28 / Oct 5 fuel periods still **open**. Oct 12 **locked**.
- Kenny Sep 7 pay movement `bb0ee186-ac67-4016-8791-b154bab5be96` still **posted** ($699.85). No reverse row.
- Oct 12 cash-mismatch correction **not** posted yet (no `3201.27` / oct12 idempotency movement).

## Code — Done

### 1a. Fuel gaps “Mark reviewed & continue” — Done
- Disposition form in `FuelLeakageStep` now has primary **Mark reviewed & continue** (enabled when disposition + 8-char reason).
- Wizard `handleMarkLeakageReviewedAndContinue` persists review then advances to Settlement (avoids stale Continue gate).
- Footer / helper copy updated; leftover-split muted vs accept card.
- Tests: `FuelLeakageStep.test.tsx`.

### 1b. Gap note declined fills — Done
- `FuelGapAttribution` filters week fills with `@roam/fuel-core` `countsInFuelLogSpend`.
- Tests: `FuelGapAttribution.test.tsx` (declined → 0 missing odo; approved → counts).

## Owner ops — still open (human gates)

Do these **after** fleet ships with §1a/§1b. Do **not** invent Uber cash or cash-handover facts.

### B1. Kenny $699.85 (Sep 7)
- Movement `bb0ee186-ac67-4016-8791-b154bab5be96` is **posted**.
- If cash was handed over → leave it.
- If not → Driver Settlements → Done → Undo/reverse with a real reason. **Never edit** the row.

### B2. Oct 12 cash gap 3,201.27
- If Uber cash report = **22,470.65** → do nothing.
- If Uber cash report = **19,269.38** → gated `POST …/settlements/oct12-cash-mismatch-correction` with Kenny `driverId` + `confirm: true`.
- **Don't:** reopen Oct 12, post a second −13,191.88, or edit cash rows.

### C. Week close order
1. **Sep 14** Fuel gaps: disposition + real Accept reason → **Mark reviewed & continue** → leave leftover split unsaved unless charging Kenny → Finalize → Trips & earnings → Settlement preview → Close. Log only cash really received.
2. Then **Sep 21 → Sep 28 → Oct 5**, in order.
3. After each close, confirm Oct 19 still reads **+37,397.13**. Stop if it drifts.

## Ship / commit
- Fleet app needs deploy of §1a/§1b before Sep 14 close uses the new CTA (workaround: hero Mark reviewed still works after deploy of combined handler; pre-deploy use Mark reviewed at top then Continue).
- Commit code + this audit when asked.
