# ADR 0024 — Toll settings have one owner

## Status

Accepted — 2026-11-18

## Context

Toll v2 dispute mode needs platform-specific dispute rules, plaza duplicate windows, plaza refund rates, and a fleet dispute policy before the matcher or dispute commands can run safely. Roam also has legacy `toll.brain_policies` used by toll-brain for geofence detection and quotes. Mixing those concerns lets settings drift and breaks the “refuse to match without settings” rule (B12).

## Decision

1. **v2 matcher and dispute commands** read only `toll.platform_settings`, `toll.plaza_rules`, `toll.plaza_rates`, and `toll.dispute_policy` for company-scoped toll behaviour.
2. **`toll.brain_policies`** stays owned by toll-brain for Roam ride geofence detection and quotes; it is not the source for v2 matcher settings.
3. **Scoring constants** (`MATCHER_CONFIG_V1`, `ENGINE_VERSION`) stay versioned in application code until a future engine version bump moves them.
4. **Changes** to toll settings go through `change_toll_settings` and initial seed through `approve_settings_seed`, both always four-eyes (S1b). With `toll_disputes` on, `match_claim` refuses `SETTINGS_MISSING` until those tables cover every platform, plaza and the dispute policy that the company's live records use (company-wide, so a new plaza stops matching until its rule is added).

## Consequences

- Operators must run settings seed (L2.6 step 0) before turning `toll_disputes` on for a company.
- ADR and product docs must keep brain vs v2 settings boundaries visible to support staff.
- Matcher TypeScript does not need new settings reads for this decision; refusal is enforced in SQL.

## Related

- `docs/toll-build/cursor-S1b-four-eyes-settings-income.md`
- `docs/toll-architecture-gap-audit.md` B12, B14, B17, S16