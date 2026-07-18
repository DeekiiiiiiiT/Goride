# Fleet Data Isolation - Gradual Rollout Guide

## Phase 7: Deployment and Gradual Rollout

This document describes how to safely deploy and gradually enable the Fleet Data Isolation features.

## Pre-Deployment Checklist

- [ ] All code changes from Phases 0-6 are deployed
- [ ] Database migration `20260614120000_organizations.sql` has been applied
- [ ] Feature flags are initialized (all set to `false`)
- [ ] Monitoring dashboards are configured
- [ ] Rollback procedures are documented and tested

## Step 7.1: Deploy with All Feature Flags OFF

After deploying the code changes, verify that all feature flags are disabled:

```bash
# Call the feature flags API to check status
curl -X GET "https://your-api-url/make-server-37f42386/admin/feature-flags" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

Expected response:
```json
{
  "flags": {
    "strict_auth": { "enabled": false },
    "strict_org_filter": { "enabled": false },
    "product_line_filter": { "enabled": false }
  }
}
```

If flags don't exist, initialize them:
```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/initialize" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

## Step 7.2: Enable Logging and Monitor

Monitor the logs for 24-48 hours to establish baseline:

### Key Log Patterns to Watch

1. **Filter statistics** (look for `[filterByOrg]` logs):
   - Input vs output record counts
   - Number of records removed by reason
   - Endpoints being called

2. **Auth passthrough** (look for `[RBAC] Auth passthrough`):
   - Frequency of anon key usage
   - Which endpoints are being accessed with anon key

3. **Organization context** (look for `orgId=null`):
   - Requests without organization context
   - Which users/endpoints have missing org data

### Baseline Metrics to Capture

- Total requests per endpoint per hour
- Filter removal rates per endpoint
- Auth passthrough frequency
- Error rates

## Step 7.3: Run Organization Backfill

Before enabling strict filtering, ensure all fleet owners have organizations:

```bash
# Dry run first
curl -X POST "https://your-api-url/make-server-37f42386/admin/organizations/backfill" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Review results, then run for real
curl -X POST "https://your-api-url/make-server-37f42386/admin/organizations/backfill" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

## Step 7.4: Enable strict_org_filter for Single Test Fleet

Choose a test fleet owner who has agreed to test the changes.

```bash
# Enable for a specific organization
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/strict_org_filter/enable-for-org" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"orgId": "TEST_ORG_UUID"}'
```

### Test Checklist for Test Fleet

- [ ] Fleet owner can see their drivers
- [ ] Fleet owner cannot see other fleet's drivers
- [ ] Trips load correctly and are scoped
- [ ] Ledger data is correctly filtered
- [ ] No errors in driver detail view
- [ ] No errors in trip detail view
- [ ] Search functionality works
- [ ] Exports work correctly

## Step 7.5: Enable strict_org_filter Globally

Once testing is successful:

```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/strict_org_filter" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Monitor for 24 hours

Watch for:
- Increased error rates
- Support tickets about missing data
- Empty driver lists for legitimate fleet owners

### Rollback if needed

```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/strict_org_filter" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## Step 7.6: Enable strict_auth Globally

**Wave 1C (edge audit remediation):** `strict_auth` now defaults **ON** when the flag is missing or the flag store errors. Money/admin controllers also pass `requireAuth({ strict: true })` so they reject anon keys regardless of the global flag.

If a legacy KV row still has `enabled: false`, flip it on:

```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/strict_auth" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

Also set `AUDIT_HMAC_SECRET` on the Fleet edge function (required for tamper-evident audit hashes).

### Expected Behavior

- Requests with anon key will get 401 errors
- All logged-in users should be unaffected
- Monitor for increased 401 error rates

### Emergency disable (if Fleet breaks)

```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/strict_auth" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Note: routes that hard-code `requireAuth({ strict: true })` will still reject anon keys until that code is redeployed with `strict: false` or the flag-only path.
## Step 7.7: Enable product_line_filter

Once auth and org filtering are stable:

```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/product_line_filter" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Verification

- Roam Fleet users see only fleet data
- Roam Enterprise users see only enterprise data
- No cross-product data visibility

## Emergency Rollback

If critical issues occur, disable all strict flags immediately:

```bash
curl -X POST "https://your-api-url/make-server-37f42386/admin/feature-flags/emergency-disable" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

This will:
1. Set `strict_auth` to false
2. Set `strict_org_filter` to false
3. Set `product_line_filter` to false
4. Log the emergency action

## Success Criteria

The rollout is successful when:

1. ✅ Kenny's fleet portal shows ONLY Kenny (no other drivers)
2. ✅ Independent drivers (Phillip, SADIKI) appear ONLY in Platform Admin
3. ✅ "Unknown Driver" synthetic entries no longer appear
4. ✅ Roam Enterprise customers see zero Roam Fleet data
5. ✅ New fleet signups are isolated from day one
6. ✅ Zero production incidents during rollout
7. ✅ All feature flags can be removed (strict mode is default)

## Timeline Recommendation

| Phase | Duration | Action |
|-------|----------|--------|
| Day 1 | Deploy | Deploy code, initialize flags |
| Days 2-3 | Monitor | Establish baseline metrics |
| Day 4 | Backfill | Run organization backfill |
| Day 5 | Test | Enable for single test fleet |
| Day 6 | Verify | Get feedback from test fleet |
| Day 7 | Global org | Enable strict_org_filter globally |
| Days 8-9 | Monitor | Watch for issues |
| Day 10 | Strict auth | Enable strict_auth globally |
| Days 11-12 | Monitor | Watch for issues |
| Day 13 | Product line | Enable product_line_filter |
| Days 14-15 | Final verify | Complete verification |
