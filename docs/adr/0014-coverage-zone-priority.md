# ADR 0014 — Coverage zone priority semantics

**Status:** Accepted (amended 2026-08-29)  
**Date:** 2026-08-28

## Context

`service_zone_polygons.priority` existed but `evaluateCoverage` ignored it. Ops need “safe islands” (hospital inside a no-go district). Equal-priority ties must fail safe so a safety exclusion never loses a coin-flip to an include.

## Decision

At a point, collect all matching zones after operational filters (`is_active`, effective window, schedule). Sort by:

1. `priority DESC`
2. `kind` — **exclude before include** at equal priority (fail-safe)
3. `id ASC` (stable)

**Winner decides outcome:**

- Winner **exclude** + policy `block` → not deliverable (`excluded_zone`)
- Winner **exclude** + other policy → deliverable with policy attached
- Winner **include** → deliverable
- No match → `out_of_coverage`

**Recommended defaults (soft bands — not a DB CHECK):**

| Kind | Typical priority |
|------|------------------|
| Include (import / foundation) | 0 |
| Include (service area) | 10 |
| Include (synthetic parish_boundary context) | 5 |
| Exclude (market or scoped) | **100+** |

Safe islands: raise the include priority **above** the overlapping exclude (e.g. exclude 100, hospital include **200**). Overlapping numeric bands stay legal so islands remain expressible.

## Consequences

- A no-go zone never loses an equal-priority tie.
- New exclusions default to 100 so they no longer collide with service areas at 10.
- Safe islands still require an explicitly higher include priority than the surrounding exclude.
- Single evaluator in `@roam/dash-coverage` used by client and server; PostGIS `resolve_containing_zones` candidate order matches.
