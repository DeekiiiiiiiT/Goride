# ADR 0019 — Week seal lane failure policy

## Status

Accepted — 2026-09-16

## Context

`week_close` orchestrates three seals (fuel, toll, earnings). Fuel already blocks close on hard failure (`FUEL_SEAL_FAILED`). Toll and earnings were wrapped in `catch → console.warn("non-fatal")`, which lets a week report success with missing seals. Extracting toll/pay onto HTTP makes silent failure worse (cold starts, 502s).

## Decision

1. **All three lanes block** on hard seal failure. A week that cannot seal a required lane is `CLOSE_BLOCKED` with a named lane — never a green close with a log warning.
2. Soft-fail is forbidden unless a future ADR reopens it **and** a persisted drift row + surfaced blocker exist.
3. Per-lane durable state lives in `fleet.week_seal_log` (distinct from `week_close_runs`).
4. Every cross-function seal call carries an `Idempotency-Key`; receivers replay prior results.

## Consequences

- Settlement desk must show the named lane blocker in UI.
- F1+ must not carry `non-fatal` warn wrappers across HTTP.
- Replay drills are part of D14.

## Related

- `docs/fleet-domain-extraction-completion.md` §A4 / §B2
- ADR 0020 (edge kernel), ADR 0022 (rollback)
