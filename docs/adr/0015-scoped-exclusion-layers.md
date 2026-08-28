# ADR 0015 — Scoped exclusion layers

**Status:** Accepted  
**Date:** 2026-08-28

## Context

Market-local cutouts must be duplicated for cross-town hazards. Pricing already uses global → parish → town layers.

## Decision

- Market cutouts stay in `delivery.service_zone_polygons` (published with town coverage).
- Cross-cutting cutouts use `delivery.scoped_exclusion_zones` with `scope IN ('global','parish','market')`.
- Resolver merges scoped exclusions at evaluation time via `coverageLayers.ts` + `buildCoverageZonesForEvaluation`.

## Consequences

- Parish/global edits do not require per-town publish.
- Publish snapshots remain town-scoped; scoped exclusions are live on save.
