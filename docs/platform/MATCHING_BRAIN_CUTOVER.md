# Platform Matching Brain — Production Cutover Runbook

This document describes the ordered flag enablement sequence and rollback procedures for the Matching Brain.

## Prerequisites

Before enabling any flags:

1. All migrations applied:
   - `20260625100000_matching_platform_schema.sql`
   - `20260625110000_matching_atomic_accept.sql`
   - `20260625120000_h3_supply_index.sql`
   - `20260625130000_h3_surge_cells.sql`
   - `20260625140000_matching_product_profile_stubs.sql`

2. Edge functions deployed:
   - `matching` (new)
   - `rides` (updated)

3. Secrets configured in Supabase:
   - `MATCHING_INTERNAL_SECRET` (shared between rides and matching)
   - `MATCHING_CRON_SECRET` (for batch reconcile cron)

## Flag Enablement Sequence

Enable flags in this exact order, waiting for stability at each step.

### Step 1: Enable Matching Brain (Master)

```bash
# Supabase Dashboard → Edge Functions → matching → Secrets
MATCHING_BRAIN_ENABLED=1
```

**Verification:**
```bash
curl https://YOUR_PROJECT.supabase.co/functions/v1/matching/health
# Expect: {"service":"matching","status":"ok","brain_enabled":true,...}
```

**Monitor:** 24 hours with low traffic

**Rollback:** Set `MATCHING_BRAIN_ENABLED=0`

---

### Step 2: Enable Rides Delegation

```bash
# Supabase Dashboard → Edge Functions → rides → Secrets
RIDES_USE_MATCHING_BRAIN=1
```

**Verification:**
- Book a test ride, verify matching starts
- Check logs for `matching` function activity
- Verify offers created in `rides.driver_offers`

**Monitor:**
- `accept_race_lost` metric (should be 0)
- Ride completion rate
- Driver offer accept rate
- Matching timeout rate

**Rollback:** Set `RIDES_USE_MATCHING_BRAIN=0` (rides immediately uses legacy path)

---

### Step 3: Enable Serial Dispatch (Optional)

```bash
MATCHING_SERIAL_DISPATCH=1
```

**Verification:**
- Book test ride
- Observe offers sent one at a time
- Decline offer, verify same wave retries

**Monitor:**
- Driver accept rate (should improve)
- Time to match (may increase slightly)
- Matching wave distribution

**Rollback:** Set `MATCHING_SERIAL_DISPATCH=0`

---

### Step 4: Enable H3 Supply Index

```bash
MATCHING_H3_SUPPLY=1
```

**Verification:**
- Check driver presence logs for `h3_cell` population
- Book test ride, verify `supply_source: h3` in logs
- Compare driver pool with legacy query

**Monitor:**
- Driver location query latency
- Match quality (driver distance distribution)
- H3 cell coverage in Kingston area

**Rollback:** Set `MATCHING_H3_SUPPLY=0`

---

### Step 5: Enable H3 Surge

```bash
MATCHING_H3_SURGE=1
```

**Verification:**
- Request fare quote in surge area
- Verify `h3_cell_key` populated in `surge_cells`
- Compare multiplier with legacy cell

**Monitor:**
- Surge cell query latency
- Fare accuracy in surge areas
- Dual-write consistency

**Rollback:** Set `MATCHING_H3_SURGE=0`

---

## Monitoring Checklist

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Matching success rate | > 85% | < 75% |
| Accept race lost | 0 | > 0 |
| Avg time to match | < 120s | > 180s |
| Driver offer timeout | < 15% | > 25% |
| Matching timeout | < 5% | > 10% |

### Log Queries

**Matching events:**
```sql
SELECT 
  created_at,
  event_type,
  product_key,
  payload
FROM matching.audit_events
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 100;
```

**Offer status distribution:**
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_sec
FROM rides.driver_offers
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

**H3 coverage check:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE h3_cell IS NOT NULL) as with_h3,
  COUNT(*) FILTER (WHERE h3_cell IS NULL) as without_h3,
  COUNT(*) as total
FROM rides.driver_locations
WHERE updated_at > NOW() - INTERVAL '5 minutes';
```

### Dashboards

Create Supabase Dashboard queries for:

1. **Matching Funnel**
   - Rides created → Matching started → Offers sent → Accepted → Completed

2. **Driver Supply by H3 Cell**
   - Heatmap of available drivers per H3 cell

3. **Surge Distribution**
   - Active surge cells with multipliers

## Rollback Procedures

### Immediate Rollback (< 1 minute)

For any critical issue, disable the relevant flag:

```bash
# In Supabase Dashboard → Edge Functions → [function] → Secrets

# Option 1: Disable rides delegation only
RIDES_USE_MATCHING_BRAIN=0

# Option 2: Disable matching brain entirely
MATCHING_BRAIN_ENABLED=0
```

### Partial Rollback

Disable specific features while keeping brain active:

```bash
# Disable serial dispatch
MATCHING_SERIAL_DISPATCH=0

# Disable H3 supply (falls back to legacy Haversine)
MATCHING_H3_SUPPLY=0

# Disable H3 surge (falls back to legacy grid)
MATCHING_H3_SURGE=0
```

### Data Rollback (if needed)

If offer data is corrupted:

```sql
-- Cancel all pending offers for stuck rides
UPDATE rides.driver_offers
SET status = 'expired', updated_at = NOW()
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes';

-- Reset stuck matching rides
UPDATE rides.ride_requests
SET status = 'cancelled', cancel_reason = 'admin_recovery'
WHERE status = 'matching' AND created_at < NOW() - INTERVAL '30 minutes';
```

## Post-Cutover Cleanup (Phase 8)

After 2 weeks of stable operation:

1. Remove legacy matching code from `rides` Edge function
2. Remove dual-write to `rides.dispatch_settings`
3. Remove debug logging
4. Update documentation

## Contacts

- **Platform Team:** platform@roam.co
- **On-Call:** PagerDuty rotation
- **Escalation:** Slack #platform-incidents

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-06-25 | System | Initial version |
