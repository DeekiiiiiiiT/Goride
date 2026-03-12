# IDEA_1: Root-Cause Analysis — "connection reset" / EarlyDrop Errors

## The Error

```
Error fetching dashboard stats: connection error: connection reset
```

Plus the Supabase Logs screenshot showing a wall of **shutdown** events
with `reason: "EarlyDrop"` and `boot_time: null`.

---

## Root Cause: "Request Stampede" on a Giant Edge Function

The error is **not** a random network blip. It has a clear, reproducible cause
involving two problems that multiply each other:

### Problem A — 13 Parallel API Calls on Dashboard Load

When `Dashboard.tsx` mounts, React Query fires **13 simultaneous requests**
(all with independent `queryKey`s, so they all launch in parallel):

| # | Query Key | Server Route |
|---|-----------|-------------|
| 1 | `dashboard.stats` | `/dashboard/stats` |
| 2 | `trips` | `/trips` |
| 3 | `driverMetrics` | `/driver-metrics` |
| 4 | `vehicleMetrics` | `/vehicle-metrics` |
| 5 | `batches` | `/batches` |
| 6 | `notifications` | `/notifications` |
| 7 | `persistent-alerts` | alerts endpoint |
| 8 | `alertRules` | `/alert-rules` |
| 9 | `fuelEntries` | `/fuel-entries` |
| 10 | `adjustments` | `/mileage-adjustments` |
| 11 | `checkIns` | `/check-ins` |
| 12 | `maintenanceLogs` | `/maintenance-logs` |
| 13 | `ledger.fleet-summary` | `/ledger/summary` |

That's **13 concurrent HTTP requests** all hitting the edge function at the
exact same moment.

### Problem B — The Edge Function is 10,000+ Lines

`/supabase/functions/server/index.tsx` is **10,161+ lines** with **155+
route handlers** in a single file. Every cold-start must parse and compile
this entire file before it can serve even one request.

### How A x B = Connection Resets

1. User opens the dashboard.
2. 13 `fetch()` calls fire simultaneously from the browser.
3. Each one hits the Supabase Edge Functions gateway.
4. The gateway tries to route each request to a function instance.
5. If no warm instance is available, it **cold-starts** a new one — which
   means compiling the 10K-line file.
6. Supabase Edge Functions have a **concurrency limit** (varies by plan).
   With 13 requests arriving at once, the gateway either:
   - Queues them behind a limited pool, causing **timeouts**.
   - Starts too many instances, exhausting resources → **EarlyDrop**.
7. The `EarlyDrop` shutdown kills the instance before it can complete its
   internal `fetch()` to Supabase's PostgREST API → **connection reset**.

The screenshot confirms this: `event_type: "Shutdown"`, `reason: "EarlyDrop"`,
`boot_time: null` (instance never fully booted), `cpu_time_used: 152` (barely
ran).

---

## Why It's Intermittent

- If a warm instance exists (recent traffic), it handles the request fine.
- If the function has been idle for a few minutes (Supabase's ~60s idle
  timeout), the next dashboard visit triggers 13 cold starts simultaneously
  → stampede → some fail.
- The `fetchWithRetry` helper in `api.ts` (3 retries, exponential backoff)
  masks many failures — the dashboard often recovers silently, but the
  console still shows the first-attempt errors.

---

## Possible Fixes (Ranked by Impact and Safety)

### Fix 1 (Safest, Biggest Win): Stagger Dashboard Requests

Instead of firing all 13 in parallel, stagger them so only 3-4 are in
flight at any time. This keeps Supabase's concurrency pool from being
overwhelmed.

**How:** Add a `maxConcurrent` limiter or use React Query's `enabled`
flag to chain batches:
- Batch 1 (critical): `dashboard/stats`, `trips`, `driverMetrics`
- Batch 2 (secondary): `vehicleMetrics`, `batches`, `notifications`
- Batch 3 (deferred): everything else

**Risk:** Very low — just changes request timing, not logic.

### Fix 2 (Medium Effort): Server-Side Aggregation Endpoint

Create a single `/dashboard/init` endpoint that returns stats + drivers +
vehicles + trips in one response. This turns 13 requests into ~4-5.

**Risk:** Low — additive (new endpoint), doesn't break existing ones.

### Fix 3 (Longer Term): Split the Edge Function

Break the 10K-line monolith into multiple smaller edge functions
(e.g., `fuel-server`, `ledger-server`, `trips-server`). Each cold-starts
faster and the concurrency pressure is spread across isolated pools.

**Risk:** Medium — requires routing changes on both frontend and backend.
Not something to rush, but would help long-term.

### Fix 4 (Quick Win): Reduce Cold-Start Frequency

Add a `/health` ping from the frontend every 30 seconds (or on tab
focus) to keep at least one warm instance alive.

**Risk:** Very low — tiny network cost, prevents the cold-start stampede
entirely for active users.

---

## Recommendation

**Start with Fix 1 (stagger) + Fix 4 (keep-alive ping).** Both are low-risk,
require only frontend changes, and together should eliminate 90%+ of these
errors. Fix 2 can follow later for a cleaner architecture. Fix 3 is a
strategic refactor for when the app outgrows the single-function model.
