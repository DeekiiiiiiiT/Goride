# H3 Spatial Master Plan — Implementation Notes

Implemented 2026-08-27 against ADR 0013 and `docs/H3_SPATIAL_INDEX_REVIEW.md`.

## Apply migrations (required before flags)

```bash
supabase db push
# or apply in order:
# 20260829140000_h3_phase1_safety.sql
# 20260829150000_rush_h3_foundation.sql
# 20260829160000_rides_h3_res_and_bounded_supply.sql
```

## Env flags

| Flag | Effect |
|------|--------|
| `MATCHING_H3_SUPPLY=1` | Matching waves use H3 cell RPC |
| `MATCHING_H3_SURGE=1` | Dual-write H3 surge keys (legacy grid still primary until cutover) |
| `RUSH_H3_DISPATCH_ENABLED=1` | Courier dispatch uses H3 candidates |

## Soft-launch checklist

1. Publish one market → confirm `delivery.coverage_cells` populated at res 7+8
2. Courier goes online → `courier_availability.h3_cell` set
3. Shadow: leave `RUSH_H3_DISPATCH_ENABLED=0`, compare logs later with `=1`
4. Matching Brain: resolution slider locked; enable supply only with `MATCHING_H3_SUPPLY=1`
