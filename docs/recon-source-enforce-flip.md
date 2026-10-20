# Recon source close blockers — enforce flip

## Live defaults (P4 ship)
- `SOURCE_*`, `STEP_STALE`, and `LINE_UNATTRIBUTED` on Close Week preview/close are **`warn`** — they show on the Sources lane but do not block the Close button.
- `SOURCE_WAIVED` and `SOURCE_ATTESTED_NONE` stay **`warn`** even after enforce.

## Flip to block
- Set edge env **`SOURCE_ENFORCE=enforce`** (unset or any other value → warn).
- Rollback: unset `SOURCE_ENFORCE` or set `SOURCE_ENFORCE=shadow`.

## Canary (two closed weeks)
- Zero `SOURCE_MISSING` / `SOURCE_PARTIAL` on weeks ops marked ready in the recon wizard.
- After flip, Close Week must refuse when required sources are still missing (same codes, severity `block`).

See also: `docs/toll-recon-enforce-flip.md`, `WEEK_RECONCILIATION_WIZARD_AUDIT.md` §4.8.
