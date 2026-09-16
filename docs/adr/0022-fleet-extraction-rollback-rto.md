# ADR 0022 — Fleet extraction rollback RTO

## Status

Accepted — 2026-09-16

## Context

With hundreds of client call sites on `API_ENDPOINTS.fuel` / `.fleet`, rollback is not a feature flag. Claiming “repoint + remount” as a checkbox hides real recovery time.

## Decision

1. **v1 rollback = redeploy + app release.** Remount domain on `make-server`/`fleet-core`, repoint client endpoint keys, redeploy edge + ship client builds.
2. Target **RTO: ≤ 4 hours** for a single domain (fuel or toll) during business hours once the remount path is practiced.
3. Rehearse once after F1 (toll): time remount + client revert on staging/prod-like; record actual minutes in `docs/fleet-domain-extraction-completion.md` §8.
4. Runtime-switchable endpoint resolver is **out of scope** for this program (future ADR if RTO exceeds target).

## Consequences

- Each cutover PR must keep remount/`RETIRED` comments reversible.
- Product accepts a multi-hour freeze window for domain rollback until a resolver exists.

## Related

- ADR 0019–0021, extraction completion playbook §B5
