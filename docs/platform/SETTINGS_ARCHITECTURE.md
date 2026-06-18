# Platform Settings Architecture

Enterprise multi-segment settings are stored in Supabase KV with one key per business segment. Clients identify the target segment via HTTP headers; the edge function dual-reads from segment keys and falls back to the legacy monolithic key for fleet/enterprise only.

## Tier model

| Tier | KV key | Admin UI | Who can edit |
|------|--------|----------|--------------|
| Global | `platform:settings:global` | Dominion → Global Settings | Platform staff only |
| Fleet | `platform:settings:fleet` | Roam Fleet segment + roamfleet.co/admin | Platform staff, `fleet_admin` |
| Enterprise | `platform:settings:enterprise` | Roam Enterprise segment + roamenterprise.co/admin | Platform staff, `enterprise_admin` |
| Rides | `platform:settings:rides` | roam-s.co/admin | Platform staff, `rides_admin` |
| Driver | `platform:settings:driver` | roamdriver.co/admin | Platform staff, `driver_admin` |
| Haul | `platform:settings:haul` | roamhaul.co/admin | Platform staff, `haul_admin` |
| Dash | `platform:settings:dash` | roamdash.co/admin | Platform staff, `dash_admin` |

Legacy key `platform:settings` is **read-only** (dual-read fallback for fleet/enterprise). All writes go to segment keys.

## Request headers

| Header | Purpose |
|--------|---------|
| `X-Roam-Settings-Segment` | Primary segment selector (`global`, `fleet`, `enterprise`, `rides`, `driver`, `haul`, `dash`) |
| `X-Roam-Product-Line` | Backward compat for fleet/enterprise (`fleet` \| `enterprise`) |

Resolution order: `X-Roam-Settings-Segment` → `?segment=` query → `X-Roam-Product-Line` → Origin/Referer host hints → default `fleet`.

Host hints: `roamdominion` → global, `roamfleet` → fleet, `roamenterprise` → enterprise, `roam-s`/`roamrides` → rides, `roamdriver` → driver, `roamhaul` → haul, `roamdash` → dash.

## API endpoints

| Endpoint | Auth | Notes |
|----------|------|-------|
| `GET /platform-status` | Public | Segment-aware via headers/host; returns registration, maintenance, announcement subset |
| `GET /admin/platform-settings` | Segment admin or platform staff | Returns merged settings for resolved segment |
| `PUT /admin/platform-settings` | Segment admin or platform staff | Writes to `platform:settings:{segment}` only |
| `GET /admin/platform-settings/segments` | Platform staff | Diagnostic summary of all segment keys |

## Shared packages

- `@roam/platform-settings` — types, defaults, `mergeSettings`, KV key helpers
- `@roam/admin-core/settings` — `ProductLineSettingsPage`, `GlobalPlatformSettingsPage`, `ConsumerSegmentSettingsShell`

## Smoke test matrix

| Scenario | Expected |
|----------|----------|
| Dominion Global Settings save | Writes `platform:settings:global` only |
| Dominion Fleet Settings save | Writes `platform:settings:fleet` only |
| Dominion Enterprise Settings save | Writes `platform:settings:enterprise` only |
| roamfleet.co/admin settings | Reads/writes fleet segment; signup `/platform-status` returns fleet business types |
| roamenterprise.co/admin settings | Reads/writes enterprise segment; all business types available |
| roam-s.co/admin settings | Reads/writes rides segment; no fleet modules/features tabs |
| roamdriver.co/admin settings | Reads/writes driver segment |
| roamhaul.co/admin settings | Reads/writes haul segment |
| roamdash.co/admin settings | Reads/writes dash segment |
| Legacy `platform:settings` exists, segment empty | Fleet/enterprise GET merges legacy into response |
| Consumer segment empty KV | Fail-open defaults from `@roam/platform-settings` |

See also [`SETTINGS_BASELINE.md`](./SETTINGS_BASELINE.md) for pre-migration inventory.

## Migration

Run once after deploy (platform staff session):

```
POST /make-server-37f42386/admin/migrate-platform-settings
```

Idempotent: copies legacy `platform:settings` into fleet + enterprise segment keys if segment keys are empty.
