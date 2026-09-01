# Rush synthetic live-sync batches (G13)

Rush deliveries projected to `fleet.trips` use **synthetic batches** (`rush-live-sync:{orgId}:{weekStart}`), not CSV upload batches.

## Behavior

| Tool | Synthetic batch |
|------|-----------------|
| Live projection | `ensureRushSyntheticBatch()` creates KV + import_batches row on first trip of the week |
| Delete preview | Shows batch metadata; synthetic batches marked `isSynthetic: true` |
| Batch delete | **Do not delete** synthetic live-sync batches in production — use flag rollback + filter `platform = 'Roam Rush'` |
| Re-import / quarantine | N/A for live-sync — CSV tools skip `type: live_sync` batches |

## Rollback

1. Disable `rush_trip_projection` for org
2. Optional cleanup: delete trips where `platform = 'Roam Rush'` for that org via admin tooling
3. Synthetic batch rows may remain inert in KV

## Identification

- `batchId` prefix: `rush-live-sync:`
- `platform`: `Roam Rush`
- `isSynthetic`: true on batch record
