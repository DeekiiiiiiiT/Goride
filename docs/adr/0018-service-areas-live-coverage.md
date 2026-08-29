# ADR 0018 — Service areas as live coverage

## Status

Accepted — 2026-08-28

## Context

Official town borders (COD-AB `source=import`) are useful map context but often too large for a soft launch. Ops need to publish smaller **service areas** (neighborhood pockets) without redrawing red “non-delivery” everywhere outside those pockets.

## Decision

**Live coverage rule (per market):**

1. If the market has **zero** service includes (`source` in `manual` | `radius` | `auto_outline`), keep today’s behavior: official `source=import` includes are live for customers, quotes, orders, net coverage, and hex compile.
2. If the market has **one or more** service includes, **only those** count for live coverage. Official import includes remain on the map as **non-editable context** (same idea as parish foundation vs town borders).
3. Red **exclude** cutouts still block delivery *inside* a live service area (temporary hazards). They are not used to invent the launch footprint.

Shared helpers: `filterLiveCoverageZones` / `evaluateLiveCoverage` / `coverageRoleForZone` in `@roam/dash-coverage`.

Public `GET /geo/delivery-zones` returns `source` and `coverage_role` (`live` | `context`). Customer eval uses `evaluateLiveCoverage`.

## Consequences

- Spanish Town (and peers): draw service pockets → publish → pins outside pockets fail even if inside the green COD-AB border.
- Old Harbour (import-only): unchanged until a service area is added.
- First published service area demotes the official border automatically (no separate toggle).
- GeoJSON import must not wipe service includes when updating the official context ring.

## Related

- ADR 0014 (zone priority), ADR 0017 (enforcement contract)
- `docs/SERVICE_AREAS_RUNBOOK.md`
