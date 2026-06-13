# Multi-Tenancy Architecture - Roam Fleet

## Overview

Roam Fleet implements a multi-tenant architecture where each fleet owner (organization) has isolated data. This document describes how org scoping and product line filtering work.

## Core Concepts

### Organizations

An **Organization** represents a fleet owner's business entity. Each organization:
- Has a unique UUID (typically the owner's user ID)
- Belongs to a product line (fleet or enterprise)
- Has a business type (rideshare, delivery, etc.)
- Contains multiple drivers, vehicles, trips, and transactions

### Organization Scoping

All fleet data is scoped by `organizationId`:

```
┌─────────────────────────────────────────────────────────┐
│                    Platform Admin                        │
│               (sees all organizations)                   │
└─────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Org: Kenny    │  │  Org: Mike      │  │  Org: Sara      │
│   (fleet)       │  │  (fleet)        │  │  (enterprise)   │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • Drivers       │  │ • Drivers       │  │ • Drivers       │
│ • Vehicles      │  │ • Vehicles      │  │ • Vehicles      │
│ • Trips         │  │ • Trips         │  │ • Trips         │
│ • Transactions  │  │ • Transactions  │  │ • Transactions  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Product Line Separation

Data is further separated by product line:
- **fleet** - Roam Fleet (roamfleet.co) - Rideshare fleet management
- **enterprise** - Roam Enterprise (roamenterprise.co) - Multi-vertical business management

## Authentication Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Frontend    │────▶│  requireAuth()  │────▶│  Data Endpoint   │
│  (JWT)       │     │  Middleware     │     │  (filtered)      │
└──────────────┘     └─────────────────┘     └──────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │  rbacUser set   │
                     │  - userId       │
                     │  - organizationId│
                     │  - resolvedRole │
                     └─────────────────┘
```

### JWT Requirements

All data endpoints require a valid JWT token:

```typescript
// The JWT contains user information including organizationId
{
  sub: "user-uuid",
  email: "user@example.com",
  user_metadata: {
    organizationId: "org-uuid",
    role: "fleet_owner",
    productLine: "fleet"
  }
}
```

### Role Hierarchy

| Role | Org Scope | Product Scope |
|------|-----------|---------------|
| platform_owner | All orgs | All products |
| platform_support | All orgs | All products |
| platform_analyst | All orgs (read) | All products |
| fleet_owner | Own org only | Own product |
| fleet_manager | Own org only | Own product |
| fleet_accountant | Own org only | Own product |
| fleet_viewer | Own org only | Own product |
| driver | Own data only | Own product |

## Data Filtering

### Server-Side Filtering

All data endpoints apply organization filtering:

```typescript
// Standard filtering pattern
const records = await fetchRecordsFromKV();
const filtered = await filterByOrgSafe(records, c, { endpoint: '/drivers' });
return c.json(filtered);
```

### Filter Functions

| Function | Behavior | Use Case |
|----------|----------|----------|
| `filterByOrg()` | Legacy - includes unscoped records | Backward compatibility |
| `filterByOrgStrict()` | Excludes unscoped records | Strict mode |
| `filterByOrgSafe()` | Feature-flag controlled | Gradual rollout |
| `filterByOrgAndProduct()` | Org + product line | Full isolation |

### Data Stamping on Write

All new records are stamped with org and product line:

```typescript
// When saving a driver
const stampedDriver = stampRecord(driver, c);
// Result: { ...driver, organizationId: "org-uuid", productLine: "fleet", updatedAt: "..." }
await kv.set(`driver:${id}`, stampedDriver);
```

## Feature Flags

Three feature flags control the isolation behavior:

| Flag | Purpose | Default |
|------|---------|---------|
| `strict_auth` | Reject anon key (require JWT) | false |
| `strict_org_filter` | Exclude unscoped records | false |
| `product_line_filter` | Enable product separation | false |

### Per-Org Overrides

Flags can be enabled/disabled per organization for gradual rollout:

```typescript
// Enable for specific org
await enableFlagForOrg('strict_org_filter', 'org-uuid');

// Check with org context
const enabled = await isFeatureEnabled('strict_org_filter', orgId);
```

## Database Schema

### Organizations Table

```sql
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  product_line TEXT NOT NULL CHECK (product_line IN ('fleet', 'enterprise')),
  business_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  -- ...
);
```

### RLS Policies

Row Level Security ensures database-level isolation:

```sql
-- Fleet owners can only see their organization
CREATE POLICY "Owners can view own organization"
  ON public.organizations FOR SELECT
  USING (owner_id = auth.uid());

-- Platform staff can see all
CREATE POLICY "Platform staff can view all organizations"
  ON public.organizations FOR SELECT
  USING (/* platform role check */);
```

### KV Store Data Model

Fleet data is stored in `kv_store_37f42386` with typed keys:

```
driver:{uuid}     → { id, name, organizationId, productLine, ... }
trip:{uuid}       → { id, driverId, organizationId, productLine, ... }
transaction:{uuid}→ { id, driverId, organizationId, productLine, ... }
```

## API Endpoints

### Org-Scoped Endpoints

These endpoints require organization context:

| Endpoint | Method | Requires Org |
|----------|--------|--------------|
| `/drivers` | GET | Yes |
| `/trips` | GET | Yes |
| `/transactions` | GET | Yes |
| `/vehicles` | GET | Yes |
| `/ledger` | GET | Yes |
| `/ledger/drivers-summary` | GET | Yes |

### Public Endpoints

These endpoints allow anonymous access:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/platform-status` | GET | Public status |
| `/platform-feature-flags` | GET | Public feature flags |

## Frontend Integration

### Product Line Headers

All frontend requests include the product line header:

```typescript
// In api.ts
async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token || publicAnonKey}`,
    ...getProductLineHeaders(),  // Adds 'X-Roam-Product-Line: fleet'
  };
}
```

### Client-Side Validation

The frontend also validates organization ownership:

```typescript
// In DriversPage.tsx
const orgValidatedDrivers = useMemo(() => {
  if (!currentOrgId) return drivers;
  return drivers.filter(d => 
    !d.organizationId || d.organizationId === currentOrgId
  );
}, [drivers, currentOrgId]);
```

## Migration Path

### For New Fleet Owners

1. User signs up with admin/fleet_owner role
2. Organization is auto-created (trigger in database)
3. User metadata is updated with organizationId
4. All data created by user is automatically stamped

### For Existing Fleet Owners

1. Run organization backfill endpoint
2. Run KV org-id backfill endpoint
3. Run KV product-line backfill endpoint
4. Enable feature flags gradually

## Troubleshooting

### User Sees No Data

1. Check if user has organizationId in metadata
2. Check if feature flag `strict_org_filter` is enabled
3. Check if their data has organizationId stamped
4. Check server logs for filter statistics

### User Sees Other Fleet's Data

1. Verify JWT is being sent (not anon key)
2. Check if records have correct organizationId
3. Check if `strict_org_filter` flag is enabled
4. Review filter logs for the endpoint

### Emergency Rollback

```bash
POST /admin/feature-flags/emergency-disable
```

This disables all strict flags and returns to legacy behavior.
