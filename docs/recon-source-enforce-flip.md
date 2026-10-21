# Recon source close blockers — enforce flip

## Live production (flipped 2026-10-20)
- Edge secret **`SOURCE_ENFORCE=enforce`** is set — `SOURCE_*`, `STEP_STALE`, and `LINE_UNATTRIBUTED` **block** Close Week.
- `SOURCE_WAIVED` and `SOURCE_ATTESTED_NONE` stay **`warn`** even in enforce mode.

## Recheck 2026-10-21
- The secret name is still on GoRide. Last write: 2026-10-20 01:33 UTC, the same flip above.
- The secrets list only returns a digest, so the word itself cannot be read back. The next-day audit called it unset; that was not confirmed.
- Not changed in this pass. Do not flip again until two weeks have closed through the wizard.

## Rollback
- Unset `SOURCE_ENFORCE` or set `SOURCE_ENFORCE=shadow` / any non-`enforce` value → warn.

## Related
- Wizard: edge `RECON_WIZARD=1` + KV `feature_flag:recon_wizard` enabled + client wizard default ON.
- See also: `docs/toll-recon-enforce-flip.md`, `docs/recon-wizard-deploy-checklist.md`.
