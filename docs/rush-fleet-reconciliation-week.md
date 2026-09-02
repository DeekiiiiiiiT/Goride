# Rush × Fleet — reconciliation week (production sign-off)

Use this checklist before enabling `rush_settlement` for a both-lines org.

## Scope

One pilot org with `service_lines = ['rideshare', 'rush_delivery']`, Rush projection on, settlements overlay live.

## Daily checks (5 business days)

| Day | Orders vs trips | Settlement overlay | COD bank-receive | Notes |
|-----|-----------------|-------------------|------------------|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

### Orders vs projection

```sql
-- Staging: compare Rush orders to fleet.trips for org
SELECT COUNT(*) FROM delivery.orders o
WHERE o.organization_id = '<org_id>' AND o.created_at > now() - interval '7 days';
```

Fleet portal: Trip Logs (Deliveries scope) vs Rush Command order count.

### Settlement overlay

Driver Settlements → open period → verify `serviceLineBreakdown` matches scoped trip totals.

### COD bank-receive

Run `pnpm --filter @roam/fleet test fleetBankReceive.rush` — must be green.

### Recon cron

```sql
SELECT jobid, schedule, command FROM cron.job WHERE command LIKE '%rush%trip%recon%';
```

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Fleet ops | | | |
| Finance | | | |
| Engineering | | | |

**Gate:** All five days clean + sign-off → enable `rush_settlement` via Dominion rollout panel.
