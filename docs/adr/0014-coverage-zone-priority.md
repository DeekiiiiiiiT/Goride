# ADR 0014 — Coverage zone priority semantics

**Status:** Accepted  
**Date:** 2026-08-28

## Context

`service_zone_polygons.priority` existed but `evaluateCoverage` ignored it. Ops need “safe islands” (hospital inside a no-go district).

## Decision

At a point, collect all matching zones after operational filters (`is_active`, effective window, schedule). Sort by:

1. `priority DESC`
2. `kind ASC` (include before exclude at tie)
3. `id ASC` (stable)

**Winner decides outcome:**

- Winner **exclude** + policy `block` → not deliverable (`excluded_zone`)
- Winner **exclude** + other policy → deliverable with policy attached
- Winner **include** → deliverable
- No match → `out_of_coverage`

Default exclude priority 10 vs include 0 preserves “exclude wins” unless include is explicitly raised.

## Consequences

- Safe islands require include priority > exclude at same location.
- Single evaluator in `@roam/dash-coverage` used by client and server.
