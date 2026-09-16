# Fuel recon calculation remediation — ops freeze (2026-09-15)

Code for Phases 0–4 is in-repo. Until it is **deployed** and soak-verified:

1. **Do not** use “Unexplained fuel” or driver fuel share from week recon for payroll / settlement decisions.
2. Auto-close remains gated by per-snapshot residual checks (F-4) and degraded inputs (F-5).
3. Keep `FUEL_SERVER_ENGINE=shadow` — do not flip enforce until shadow soak exits after this program.
4. Apply migration `20260916010000_fuel_period_degraded_inputs.sql` before relying on `degraded_inputs`.

## Exit for this freeze

- Perfect synthetic week reports true unexplained ≈ $0 (timing carved out).
- Drivers are not charged residual via Percentage / Fixed_Amount.
- Reference week Sep 7–13 / 5179KZ decomposed and accepted by finance.

## Soak checklist addendum

- [ ] Perfect-week fixture: true unexplained ≈ $0 (timing carved)
- [ ] Canceling residuals (A +50% / B −50%): auto-close / HTTP finalize **blocks**
- [ ] Open week Gas/Cash equals locked week Gas/Cash
- [ ] Percentage / Fixed_Amount: driver not charged unexplained plug
- [ ] Money strip: 2 payer tiles + subordinate timing/unexplained
- [ ] `degraded_inputs` on period when wizard soft-timeouts fire
- [ ] Reference week 5179KZ Sep 7–13 decomposed (timing vs true) — finance sign-off
- [ ] Shadow soak ≥2 close cycles before any enforce discussion
