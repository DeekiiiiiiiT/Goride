# ADR 0017 — Coverage enforcement contract

**Status:** Accepted  
**Date:** 2026-08-28

## Context

Exclusions were authored in admin but never enforced consistently at quote/checkout; client lacked hole/multiPolygon parity.

## Decision

Enforcement required at:

| Layer | Requirement |
|-------|-------------|
| Public API | `GET /geo/delivery-zones` includes `multiPolygon`, operational fields |
| Address save | Client `evaluateCoverage` with full geometry |
| Checkout | Require lat/lng pin; re-check zone before order |
| Quote | Require `dropoff_lat` + `dropoff_lng` |
| Order create | `assertSameMarketCoverage` (existing) |

Publish blocks on blocking conflict codes (`cutout_outside_town`, `overlapping_cutouts`). Excludes require category before publish.

## Consequences

- Keyword-only address heuristics cannot bypass server gate.
- Ops must categorize cutouts before go-live.
