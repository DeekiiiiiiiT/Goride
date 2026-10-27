# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 20 · 2026-10-27 · Owner gates Done · Week closes need signed-in UI**

Rev 1–19 are in git history. This revision lists open items only.

## Owner gates — Done
- **Kenny $699.85:** cash handed over → leave `bb0ee186…` **posted**. No reverse.
- **Oct 12 cash gap:** Uber = **22,470.65** → **no** `oct12-cash-mismatch-correction`.

## Code — Done (shipped)
§1a Mark reviewed & continue + §1b decline fill filter on roam-fleet (`9f449ba3` / www.roamfleet.co).

## Open — Week close sequence (signed-in fleet UI)

Local URL already pointed at Sep 14 fuel step: `/week-reconciliation?week=2026-09-14&step=fuel`.

1. **Sep 14:** Fuel gaps → real Accept reason if residual needs accept → **Mark reviewed & continue** → do not save leftover split → Finalize → Trips & earnings → Settlement preview → Close (cash really received only).
2. **Sep 21 → Sep 28 → Oct 5** in order.
3. After each close, Oct 19 must still read **+37,397.13**. Stop if it drifts.

**Note:** Latest `ledger.driver_period_revisions` for Oct 19 currently shows raw `settlement_amount` **-7313** (and earlier rows at **37397.13**). Confirm the **wallet UI** number after each close, not a lone revision row without correction lines.
