# Admin Portal Consolidation

This document describes the consolidation of dispatch settings management from the
per-product Rides Control Panel to the centralized Platform Matching Brain at
`roamdominion.co`.

## Overview

Previously, dispatch settings were managed in two places:
1. **Rides Control Panel** (`roam-s.co/admin/control-panel`) - wrote to `rides.dispatch_settings`
2. **Matching Brain** (`roamdominion.co/admin/platform/matching-brain`) - wrote to `matching.policies`

This created a conflict: when `MATCHING_BRAIN_ENABLED=1`, the system reads from
`matching.policies`, but admins might still edit the legacy Control Panel which
wrote to `rides.dispatch_settings`, causing settings to be silently ignored.

## Solution

The consolidation ensures all settings are managed from a single source of truth:

1. **Matching Brain UI Enhanced** - All settings from the old Control Panel are now
   available in the Matching Brain UI under organized tabs:
   - **Dispatch**: Wave dispatch, serial dispatch, quotes
   - **Driver**: Presence, body type policy, driver rollout
   - **Automation**: In-trip automation, wait time billing, PIN verification, toll detection
   - **Advanced**: H3 spatial indexing
   - **Products**: Product profile overrides
   - **Flags**: Feature flags and sync status

2. **Control Panel Deprecated** - The old Control Panel shows a deprecation banner
   and is read-only when `VITE_CONTROL_PANEL_DEPRECATED=1`.

3. **Dual-Write Sync** - When `MATCHING_DUAL_WRITE_ENABLED=1`, policy updates in
   the Matching Brain automatically sync to `rides.dispatch_settings` for backward
   compatibility.

## Feature Flags

### Admin UI Flags (Vite environment variables)

| Flag | Default | Description |
|------|---------|-------------|
| `VITE_MATCHING_BRAIN_UI_ENHANCED` | `true` | Show all settings in Matching Brain UI |
| `VITE_CONTROL_PANEL_DEPRECATED` | `false` | Make Control Panel read-only with deprecation banner |
| `VITE_PRODUCT_PROFILE_OVERRIDES` | `false` | Enable product profile override UI |
| `VITE_DUAL_WRITE_ENABLED` | `true` | Show dual-write sync status in UI |

### Backend Flags (Supabase Edge Function secrets)

| Flag | Default | Description |
|------|---------|-------------|
| `MATCHING_BRAIN_ENABLED` | `0` | Master switch for matching brain |
| `MATCHING_DUAL_WRITE_ENABLED` | `0` | Sync policy updates to legacy table |

## Migration Path

### Phase 1: Enable Enhanced UI (Current)
- `VITE_MATCHING_BRAIN_UI_ENHANCED=true`
- All settings visible in Matching Brain
- Both Control Panel and Matching Brain functional

### Phase 2: Enable Dual-Write
- `MATCHING_DUAL_WRITE_ENABLED=1`
- Policy updates sync to both tables
- Ensures backward compatibility

### Phase 3: Deprecate Control Panel
- `VITE_CONTROL_PANEL_DEPRECATED=true`
- Control Panel becomes read-only
- Deprecation banner points users to Matching Brain

### Phase 4: Remove Dual-Write (Future)
- `MATCHING_DUAL_WRITE_ENABLED=0`
- Remove `rides.dispatch_settings` reads from codebase
- Single source of truth: `matching.policies`

## File Structure

```
apps/admin/src/components/admin/matching-brain/
├── index.ts                    # Exports
├── types.ts                    # TypeScript types and constants
├── MatchingBrainPage.tsx       # Main page component
├── ProductProfileEditor.tsx    # Product profile overrides
├── SyncStatusCard.tsx          # Sync status and manual sync
└── sections/
    ├── index.ts
    ├── WaveDispatchSection.tsx
    ├── SerialDispatchSection.tsx
    ├── DriverPresenceSection.tsx
    ├── BodyTypePolicySection.tsx
    ├── DriverRolloutSection.tsx
    ├── QuotesSection.tsx
    ├── H3IndexingSection.tsx
    ├── InTripAutomationSection.tsx
    ├── WaitTimeBillingSection.tsx
    ├── PinVerificationSection.tsx
    └── TollDetectionSection.tsx

apps/admin/src/components/admin/shared/
├── index.ts
└── SettingsSection.tsx         # Reusable section component

apps/admin/src/hooks/
└── useSettingsSection.ts       # Form state hook

apps/admin/src/utils/
└── featureFlags.ts             # Feature flag utilities
```

## API Endpoints

### Admin Policy Management

- `GET /matching/admin/policies` - List all policies
- `GET /matching/admin/policies/:id` - Get policy by ID
- `PATCH /matching/admin/policies/:id` - Update policy (with dual-write)

### Sync Management

- `GET /matching/admin/policies/:id/sync-status` - Compare matching vs legacy
- `POST /matching/admin/sync-to-legacy` - Manual sync to legacy table

### Product Profiles

- `GET /matching/admin/product-profiles` - List all profiles
- `POST /matching/admin/product-profiles` - Create profile
- `PATCH /matching/admin/product-profiles/:id` - Update profile

## Rollback

If issues occur:

1. Set `VITE_CONTROL_PANEL_DEPRECATED=false` to re-enable Control Panel editing
2. Set `MATCHING_BRAIN_ENABLED=0` to fall back to legacy dispatch logic
3. Set `MATCHING_DUAL_WRITE_ENABLED=0` to stop dual-write

The system will automatically fall back to reading `rides.dispatch_settings` when
the matching brain is disabled.
