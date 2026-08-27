# ADR 0013: Rush Coverage Precedence & H3 Spatial Index

**Status:** Accepted — 2026-08-27  
**Related:** [H3_SPATIAL_INDEX_REVIEW.md](../H3_SPATIAL_INDEX_REVIEW.md), H3 Spatial Master Plan

## Context

Roam Rush had five overlapping answers to “do we deliver here?”:

1. Market include/exclude polygons (`service_zone_polygons` / published coverage versions)
2. Parish coverage mode (`coverage_mode`: `town_zones` | `parish_boundary`)
3. `merchants.delivery_radius_km` (stored; not a runtime gate historically)
4. `business_types.max_delivery_radius_km` (onboarding default)
5. `merchant_tiers.default_delivery_radius_km` (tier default; unused at runtime)

Rides H3 was hybrid/scaffolding. Rush must be **H3-first** with no square `grid:` keys and no dual presence tables.

## Decision

### Coverage evaluation order (frozen)

| Step | Check | Customer-facing reason code | Copy |
|------|--------|----------------------------|------|
| 1 | Market active? | `market_inactive` | “Roam Rush is not available in this area yet.” |
| 2 | In exclude polygon/hex? | `excluded_zone` | “We’re not currently serving your address.” |
| 3 | In include polygon/hex (or parish mode equivalent)? | `out_of_coverage` | “You’re outside our delivery zone.” |
| 4 | Within merchant reach hex set? | `too_far_from_store` | “This store doesn’t deliver that far.” |
| 5 | Pass | — | Deliverable |

Rule 4 activates only after merchant hex reach ships. Until then, eligibility remains market coverage + `merchants.market_id` (current behavior).

### Boundary & resolution policy

- **Include** edge hexes for market include (generous; merchant reach narrows later).
- **Exclude** edge hexes for no-go zones (conservative).
- Compile cells at **resolution 7 and 8** on publish; live matching/dispatch uses **7** until density data justifies switching.
- Tier / business-type radii are **defaults at merchant creation only**, never runtime gates.

### Spatial architecture locks

- H3 is the only logistics index for Rush (candidate filter); Haversine/drive-time ranks the shortlist.
- Evolve `delivery.courier_availability` with `h3_cell` + `h3_res` (no second presence table).
- Shared math lives in `@roam/spatial` (`h3-js@4.1.0`).
- One dispatch kill switch: `RUSH_H3_DISPATCH_ENABLED`.
- Polygons remain admin source of truth; hex cells are a derived cache with recompile-all.

## Consequences

- Customer apps map API codes → copy above 1:1 (no vague “unavailable”).
- Changing H3 resolution is a **migration**, not an admin toggle.
- Rides adopts `@roam/spatial` after Rush presence soaks; Track A only fixes live footguns first.
