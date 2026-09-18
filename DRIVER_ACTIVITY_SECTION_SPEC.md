# Driver Activity — Build Specification

**Section:** `Activity` tab on Driver Detail, positioned between **Financials** and **Service Quality**
**App:** `apps/fleet` (Roam Fleet)
**Status:** Specification only — no code written
**Date:** 2026-09-18

---

## 1. Executive summary

Build this as an **extension of three subsystems you already have**, not a new one. The ride
lifecycle is already fully event-logged in `rides.audit_events` (append-only, with `offer_accepted`,
`driver_transition`, `ride_completed`, `ride_cancelled` and their `from`/`to` payloads), the delivery
lifecycle is logged in `delivery.order_events`, and Driver Detail already has a lazy-tab shell with
period, permissions and RBAC wiring that a new tab drops into with a one-line registry change. The
Activity tab is therefore mostly a **read-model plus a timeline UI**.

There is exactly one genuinely net-new write path, and it is the critical one: **driver presence has
no history**. `rides.driver_locations` is a `PRIMARY KEY (user_id)` upsert and
`delivery.courier_availability` is the same shape — the moment a driver goes offline, the fact they
were ever online is overwritten. Nothing in the system can reconstruct "Online 10:53 AM → Offline
11:28 AM." **This history is being destroyed continuously and is not recoverable after the fact**, so
the append-only presence transition log should ship before any UI work, as a standalone change.

The second structural risk is honesty. The Uber screens show a dense, continuous timeline; your data
is continuous for Roam and Rush, and **does not exist at all for Uber and InDrive** (CSV period
aggregates only — `driverOperationalMetrics.ts` reconstructs Enroute/Open/Unavailable hours from
weekly CSV rows). A timeline that renders a Uber driver's week as an empty page reads as "this driver
did nothing," which is a wrong-status failure that will be used in pay and discipline conversations.
The design makes **absence of data a first-class rendered state**, never an implied one.

This can be enterprise-grade in the proposed shape. The volume is small (~140 events/driver/day, a
few million rows/year), the query shape is one composite index, the ingest is an idempotent
watermarked batch job, and the correctness surface is narrow enough to be closed by invariants rather
than by testing. The two things that make it enterprise rather than demoware are the **heartbeat
timeout sweeper** (without it, every crashed app leaves a driver "online" forever) and
**server-side segment derivation** (durations computed across a paginated client list are wrong at
every page boundary).

---

## 2. Scope and assumptions

### 2.1 In scope

| | |
|---|---|
| A new `Activity` tab on Driver Detail, third position, deep-linkable at `/drivers/:id/activity` | |
| A chronological, day-grouped event timeline for one driver over the selected period | |
| Status segments (Online / Offline / On Trip) with durations between events | |
| Trip/order clustering — collapsed "Accepted N trips" rows that expand to their lifecycle events | |
| Filters: service line, event type, status, sort direction | |
| A period summary strip: online hours, utilization, true acceptance and cancellation rates | |
| Explicit "not recorded" and "no coverage" rendering for windows with no data | |
| An append-only presence transition log (net-new write path) + heartbeat timeout sweeper | |
| An idempotent projection/ingest job from existing source event logs | |
| Org-scoped RBAC, location-data gating, and read-access auditing | |

### 2.2 Out of scope

- Changing any money, settlement, ledger, fuel, toll or reconciliation behaviour. **Activity is
  read-only with respect to finance and must never become an input to a money engine.**
- Redesigning Overview, Financials, Service Quality, Cash Wallet or Profile.
- Live realtime streaming / websocket tail (deferred to Later).
- Map replay of GPS breadcrumbs (deferred to Later; see the privacy note in §5.6).
- Any attempt to synthesise Uber/InDrive per-event activity. It does not exist and will not be faked.
- Driver-facing visibility of this timeline in the driver portal.

### 2.3 Assumptions (labelled — correct me where wrong)

| # | Assumption | Impact if wrong |
|---|---|---|
| A1 | The primary user is fleet ops / a fleet manager investigating a specific driver-day, not a live dispatcher watching a board. | If it's live dispatch, realtime moves from Later into MVP and the whole caching strategy changes. |
| A2 | The critical workflow is **reconstructing a driver's shift timeline for a disputed period** — a pay dispute, a no-show claim, a customer complaint, a safety incident. | If it's aggregate productivity reporting instead, the timeline becomes secondary to the summary strip. |
| A3 | You have no Uber/InDrive API access — only the CSV exports the app imports today. | If a partner API exists, a fourth ingest lane is additive and the design accommodates it unchanged. |
| A4 | Fleet driver `id` equals the auth user id for Roam drivers. **Observed** in `rideToFleetTrip.ts:76` (`driverId: String(ride.assigned_driver_user_id …)`) and consistent with the UUID in your screenshot. | If aliasing exists, the ingestor needs the alias map from `driver_identity.ts` — one extra resolution step. |
| A5 | Scale is tens of drivers, not thousands. Screenshot shows lifetime trips 2,855 for one driver. | At 1000+ drivers, partition the projection table by month; nothing else changes. |
| A6 | You want MVP quickly and polish later. | Drives the phasing in §9–11. |
| A7 | Location coordinates are sensitive and their exposure should be permission-gated and audited. | If you decide coords are freely viewable, drop workstream `ACT-13`. |

### 2.4 Blockers needing your answer before locking

Only **Q1 and Q2 in §14** actually block the design. Everything else can proceed under the
assumptions above.

---

## 3. Product & UX specification

### 3.1 Primary jobs-to-be-done

1. **"What was this driver doing between 8am and noon on the 13th?"** — reconstruct a contiguous
   timeline, with gaps visible as gaps.
2. **"Was this driver actually online when they said they were?"** — online hours and session
   boundaries, with the reason each session ended.
3. **"Why is this driver's acceptance rate low?"** — see offers received vs accepted vs declined vs
   expired, per offer, with timestamps.
4. **"They claim they completed the trip; the customer says otherwise."** — trip lifecycle with exact
   arrive/start/complete timestamps and who cancelled.
5. **"How much of their online time was productive?"** — utilization for the period, with the basis
   stated.

### 3.2 Information architecture

```
Driver Detail  /drivers/:id/activity
├── (shell, unchanged) Toolbar: platform filter · All Day · date range · Add note
├── (shell, unchanged) Header: name, ID, vehicle, tier, period trips, rating
└── Activity tab
    ├── Coverage banner            ← only when the window has partial/no recording
    ├── Summary strip (5 tiles)    ← Online hours · Utilization · Offers · Acceptance · Cancels
    ├── Filter row                 ← Service line · Event type · Status · Sort · Export
    ├── Session rail + timeline
    │   ├── Day header  "September 13 2026"
    │   ├── Event row   "Offline        11:28 AM"
    │   │   └── gap chip "33m"
    │   ├── Event row   "Online         10:54 AM"
    │   ├── Cluster row "Accepted 1 trip   10:54 AM   ▾"
    │   │   ├── "Driver cancelled   10:54 AM"
    │   │   └── "Offer accepted     10:54 AM"
    │   └── …
    └── Footer: "Showing 200 of 1,431 events · Load more" · "Data as of 12:04 PM"
```

### 3.3 Key screens and states

| State | Rendering | Why it matters |
|---|---|---|
| **Happy path** | Day-grouped timeline, newest first, durations between adjacent rows, trips collapsed into clusters. | Matches the mental model in the reference screens. |
| **Loading** | `TabLoadingSkeleton` (existing) — skeleton rows shaped like the timeline, not a spinner. The summary strip skeletons independently, since it resolves from a separate, cheaper query. | Matches Overview/Service Quality behaviour in the shell. |
| **Empty — driver was genuinely idle** | "No activity recorded in this period. Presence logging was active for the whole window." plus the coverage bar in green. | Distinguishes real idleness from missing data. **This is the single most important UI distinction in the section.** |
| **Empty — no coverage** | Hatched grey band across the whole range: "Activity was not recorded before 1 Oct 2026." No event list. | Prevents "driver did nothing" misreadings of a pre-launch window. |
| **Partial coverage** | Timeline renders; the uncovered portion of the range is a hatched band with the same copy. | A week that straddles the launch date is the common case at rollout. |
| **Unsupported platform** | When the platform filter is Uber/InDrive: "Per-event activity isn't available for Uber. Uber reports weekly totals only — see Overview → Time Metrics." with a link to the Overview tab. | Directly prevents the wrong-status failure described in §1. |
| **Permission denied** | Tab is hidden from `TabsList` entirely when the user lacks `drivers.view`; a direct URL renders the standard denied card the other tabs use. | Consistent with how the shell already gates `canEditDrivers`. |
| **Location withheld** | Event rows render normally; the location column shows a lock chip "Location hidden" with a tooltip naming the permission required. | Partial data is shown, not a wholesale denial. |
| **Partial failure** (rides lane loads, delivery lane errors) | Timeline renders the lanes that succeeded; an inline warning names the failed lane and offers Retry. Summary tiles that depend on the failed lane show `—`, never `0`. | **A zero here is a lie.** Never substitute 0 for unknown. |
| **Stale ingest** | Footer watermark "Data as of 12:04 PM"; if lag > 15 min, an amber chip "Activity may be up to 34 minutes behind." | The user is often looking at something that happened minutes ago. |
| **Session still open** | Final row reads "Online — still online" with a live-ticking duration, not a fixed duration. | An open session with a frozen duration reads as a closed one. |
| **Session closed by timeout** | The Offline row carries a muted chip "app stopped reporting" and the tooltip explains the grace period. | Never present an inferred offline as a driver action. |

### 3.4 Interaction rules

- **Read-only section.** There are no destructive actions, no mutations, no optimistic updates and
  therefore no undo. This is deliberate and should stay true: the value of an activity log is that
  nobody can edit it. If a future need arises to annotate an event, it must be an *additional*
  annotation record, never an edit to the event.
- **Loading:** skeletons, never spinners for the list; the tab is lazy-loaded behind `Suspense` like
  every other tab, so the first paint is the existing `SpinFallback` and then the skeleton.
- **Pagination:** cursor-based "Load more", 200 rows per page, appended. No infinite scroll — ops
  users need a stable scroll position while cross-referencing.
- **Filters** apply server-side and are reflected in the URL query string so a timeline view is
  linkable into a dispute thread. Changing a filter resets the cursor.
- **Expansion** of a trip cluster is client-side only — the cluster's child events arrive with the
  page. Expansion state is not persisted.
- **Sort** toggles Newest/Oldest; it is a server-side ordering change, not a client reverse, so the
  cursor stays correct.
- **Export** produces a CSV of the currently filtered window (not just the loaded page) and writes an
  audit row. This is the artefact that ends up attached to a dispute.

### 3.5 Accessibility and enterprise UX requirements

- The timeline is a semantic `<ol>`; each event is an `<li>` with an accessible name of the form
  `"Offline at 11:28 AM, 33 minutes after the previous event"`. Duration chips are decorative in the
  visual rail and carried in the accessible name — a screen reader user must not have to infer the
  gap from position.
- Every status is conveyed by **text plus shape**, never colour alone. The reference screens use a
  green/black/blue dot; that pattern needs a text label beside it (it already has one) and distinct
  dot shapes for the colour-blind case.
- The expand/collapse control on a cluster is a real `<button>` with `aria-expanded` and
  `aria-controls`, and the tab list keeps the existing `aria-label` convention
  (`aria-label="Activity tab"`) used by the other five triggers.
- Time is rendered in the fleet's configured timezone with the zone abbreviation visible
  (the reference screen shows "12:00 PM EST"). **Never render a bare local time.** A dispute about a
  10:54 event across two timezones is unresolvable without the zone on the artefact.
- Keyboard: `j`/`k` or arrow keys move between events, `Enter` expands a cluster, `Escape` collapses.
  Focus is preserved across "Load more".
- Respects `prefers-reduced-motion` for the expand transition.
- Dense mode: rows are compact enough to see a full shift without scrolling on a 1080p screen; the
  reference screens fit ~14 rows, aim for the same.

---

## 4. Functional walkthrough — the critical workflow

> **Critical workflow (CW): reconstruct a driver's shift timeline for a given period, completely and
> honestly, such that the result is usable as evidence in a pay or conduct dispute.**
>
> The thing that must never go wrong: **the timeline must never imply a state the system did not
> observe.** A gap in recording must render as a gap. An inferred offline must be labelled as
> inferred. A session that is still open must never show a closed duration. If these hold, a wrong
> answer is impossible to produce silently; if any one fails, the section becomes a machine for
> producing confident false narratives about a person's working day.

**Step by step, once built:**

1. Ops opens `/drivers/73e5b1dc…/activity`. The shell has already resolved period (Sep 14–20),
   permissions and the driver header. The tab is lazy-imported and mounts.
2. Two queries fire, both gated on `activeTab === 'activity'` (the existing pattern in
   `useDriverDetailTrips.ts:88`): a **summary** query and a **page** query. Neither runs while the
   user is on another tab.
3. The server resolves the driver's identity set (fleet id → auth user id → courier id) and clamps
   the window to a maximum of 31 days.
4. The server reads the projection table for `(org, driver, window)` on the composite index,
   **derives status segments over the entire window** (not the page), then returns the first page of
   events plus the full segment list plus the coverage windows.
5. The client renders coverage first. If the window is wholly uncovered, it renders the hatched band
   and stops — no misleading empty list.
6. The timeline renders day-grouped. Between adjacent events the client renders the duration the
   **server computed** for that segment — it never subtracts two visible timestamps, because the
   adjacent visible row may not be the adjacent actual event.
7. Ops sees "Online 10:53 AM", a trip cluster, "Offline 11:28 AM". They expand the cluster and see
   `Offer accepted 10:54:02 → Driver cancelled 10:54:31 (29s)`.
8. Ops changes the platform filter to Uber. The tab renders the unsupported-platform state with a
   pointer to Overview → Time Metrics. **No empty timeline is ever shown for Uber.**
9. Ops exports the window to CSV. The export writes a `driver_audit` row recording who exported
   what window for which driver — reusing `appendDriverAuditEvent` from `drivers_audit.ts:23`.
10. Behind all of this, every 60 seconds the ingestor advances its watermark over
    `rides.audit_events` and `delivery.order_events`, and every 60 seconds the sweeper closes
    presence sessions whose heartbeat has gone stale.

---

## 5. Architecture proposal

### 5.1 Data model

Three pieces: one **new source** (presence transitions), one **projection** (the read model), one
**coverage registry**. Everything else is read from existing tables.

#### (a) `fleet.driver_presence_log` — NET-NEW SOURCE OF TRUTH

The only new write path. Append-only, transition-only.

```sql
id             bigserial primary key
user_id        uuid        not null      -- auth user id
service_line   text        not null      -- 'roam_rides' | 'roam_rush'
is_online      boolean     not null
occurred_at    timestamptz not null      -- SERVER time, never device time
reason         text        not null      -- 'app_toggle' | 'heartbeat_timeout'
                                         -- | 'admin_force' | 'logout' | 'trip_forced_online'
session_id     uuid                      -- groups an online→offline pair
device_id      text
app_version    text
payload        jsonb       not null default '{}'  -- device-reported time, lat/lng if captured

unique (user_id, service_line, occurred_at)
index  (user_id, occurred_at desc)
index  (occurred_at)                     -- ingest watermark scan
```

**Write rule.** The existing presence upsert paths — `public.rides_upsert_driver_presence` and
`upsertCourierPresence` in `supabase/functions/delivery/courierPresence.ts` — compare the incoming
online flag against the current row and insert a transition row **only on change**, in the same
statement/transaction as the upsert. Heartbeats that don't change state write nothing. This holds the
volume at roughly 10–40 rows per driver per day instead of one per heartbeat.

**Lifecycle:** rows are immutable. A session is the pair `(went_online, next went_offline)`. A row
with no following offline is an open session.

#### (b) `fleet.driver_activity_events` — PROJECTION (read model)

Never a source of truth. Rebuildable from scratch by replaying the sources. **Never an input to any
money engine.**

```sql
id                bigserial primary key
organization_id   text        not null
driver_id         text        not null    -- fleet canonical driver id
service_line      text        not null    -- 'roam_rides' | 'roam_rush' | 'fleet_ops'
source            text        not null    -- 'rides.audit_events' | 'delivery.order_events'
                                          -- | 'fleet.driver_presence_log' | 'fleet.driver_audit'
source_event_id   text        not null    -- natural key in that source
event_type        text        not null    -- canonical vocabulary, below
occurred_at       timestamptz not null    -- the SOURCE's time, never ingest time
ingested_at       timestamptz not null default now()
job_ref           text                    -- ride_request_id / order_id; null for presence
job_seq           int                     -- ordering within a job for equal timestamps
payload           jsonb       not null default '{}'

unique (source, source_event_id)                        -- idempotency
index  (organization_id, driver_id, occurred_at desc)   -- the one query index
index  (job_ref) where job_ref is not null              -- cluster expansion
index  (ingested_at)                                    -- lag monitoring
```

**Canonical event vocabulary** — one verb set across all service lines, so the UI never branches on
source:

| Verb | Roam rides source | Rush source |
|---|---|---|
| `went_online` / `went_offline` | `driver_presence_log` | `driver_presence_log` |
| `offer_received` | `driver_offers` row created | offer/assignment created |
| `offer_accepted` | `audit_events.offer_accepted` | order accepted |
| `offer_declined` / `offer_expired` / `offer_superseded` | `driver_offers.status` | same |
| `en_route_pickup` | `driver_transition to=driver_en_route_pickup` | `order_events` en route |
| `arrived_pickup` | `driver_transition to=driver_arrived_pickup` | arrived at merchant |
| `job_started` | `driver_transition to=on_trip` | picked up |
| `job_completed` | `ride_completed` | delivered |
| `driver_cancelled` / `rider_cancelled` / `system_cancelled` | `ride_cancelled` + `cancelled_by` | order cancelled |
| `admin_action` | `fleet` driver audit KV | same |

#### (c) `fleet.activity_source_coverage` — COVERAGE REGISTRY

Tiny table; makes "we weren't recording" expressible rather than inferred.

```sql
service_line  text not null
source        text not null
covered_from  timestamptz not null
covered_to    timestamptz            -- null = still recording
note          text
primary key (service_line, source, covered_from)
```

One row is inserted the day presence logging goes live. Any requested window before `covered_from`
renders as the hatched band. Outage windows get a `covered_to`/`covered_from` pair.

#### (d) Read unchanged, not copied

`rides.ride_requests` (lifecycle timestamps `en_route_at`, `arrived_pickup_at`, `trip_started_at`),
`rides.driver_offers`, `rides.audit_events`, `delivery.order_events`, `delivery.orders`,
`fleet.trips`. The projection **references** these; it does not become their owner.

### 5.2 API / service boundaries

All routes live in a new `_fleet-server/driver_activity_routes.ts`, registered the same way
`drivers_audit.ts` is, under the existing `/make-server-37f42386` prefix, with
`requireAuth({ requireOrg: true })` + `requirePermission("drivers.view")`.

```
GET /make-server-37f42386/drivers/:id/activity
    ?from=ISO&to=ISO
    &serviceLines=roam_rides,roam_rush
    &eventTypes=offer_accepted,job_completed
    &sort=desc&cursor=<opaque>&limit=200

200 {
  success: true,
  orgId: string,
  window:   { from, to, clamped: boolean },
  coverage: Array<{ from, to|null, recorded: boolean, reason?: string }>,
  segments: Array<{                       // derived SERVER-side over the whole window
    kind: 'online' | 'offline' | 'on_job',
    from, to: string | null,              // null = still open
    seconds: number | null,
    closedBy?: 'driver' | 'timeout' | 'admin',
  }>,
  data: ActivityEvent[],                  // one page, already clustered
  nextCursor: string | null,
  truncated: boolean,
  watermark: string,                      // max(ingested_at) — powers "Data as of"
  lanes: Array<{ serviceLine, ok: boolean, error?: string }>,  // partial-failure surface
}
```

```
GET /make-server-37f42386/drivers/:id/activity/summary?from&to&serviceLines

200 {
  onlineSeconds, onJobSeconds, utilizationPct,
  offersReceived, offersAccepted, offersDeclined, offersExpired,
  acceptanceRate: number | null,          // null when denominator is 0 — NEVER a fallback
  cancellationRate: number | null,
  basis: 'event' | 'partial' | 'unavailable',
  openSessionCount: number,
  sessionsClosedByTimeout: number,
}
```

```
GET /make-server-37f42386/drivers/:id/activity/export.csv?…   (same filters; writes an audit row)
POST /make-server-37f42386/internal/activity/ingest            (cron-only, watermarked)
POST /make-server-37f42386/internal/activity/presence-sweep    (cron-only, idempotent)
```

**Boundary rule:** the Activity service reads from source schemas and writes only to
`driver_activity_events`. It has no write access to `fleet.trips`, any ledger table, or any money
path. Enforce this with a distinct DB role or an explicit review gate, so the boundary is
structural rather than a convention.

### 5.3 Client state vs server source of truth

| Concern | Owner | Why |
|---|---|---|
| Event list, segments, durations, coverage, rates | **Server** | Durations across a paginated list are wrong at page boundaries; two clients must never compute different durations for the same shift. |
| Which tab is active, expansion state, scroll position | Client | Ephemeral. |
| Period / date range | **Existing shell** (`DriverPeriodContext`) | Reuse. Do not add a second date picker; the shell toolbar already has one and the reference screens use a week window too. |
| Filters and sort | Client → URL → server query | Linkable into a dispute thread. |
| Cache | `@tanstack/react-query`, `staleTime: 60s` for the page, `staleTime: 120s` for the summary | Matches `useDriverDetailTrips`' 2-minute staleness convention. Activity is fresher because it's closer to live. |

Query keys follow the existing convention:
`['driverActivity', driverId, from, to, serviceLines, eventTypes, sort]`.

### 5.4 Jobs / async work / idempotency / retries

**Ingest job** (`activity/ingest`, every 60s):
- Maintains a watermark per source: `(last_occurred_at, last_source_id)`.
- Scans `where created_at >= watermark - 5 minutes` (an overlap window, to absorb clock skew and
  late-committing transactions) ordered by `(created_at, id)`, batch 5,000.
- Writes with `ON CONFLICT (source, source_event_id) DO NOTHING`. The overlap window is therefore
  free — re-reading the same rows costs nothing and writes nothing.
- Advances the watermark only after a successful batch commit. A crash mid-batch replays safely.
- **Never** deletes or updates a projection row.
- Emits `activity_ingest_lag_seconds` and `activity_ingest_rows`.

**Presence sweeper** (`activity/presence-sweep`, every 60s):
- Finds presence rows marked online whose `last_location_update` / heartbeat is older than
  `grace = 5 minutes`.
- Writes `went_offline` at `last_seen + grace`, `reason='heartbeat_timeout'`, and flips the live
  presence row.
- Idempotent by `unique (user_id, service_line, occurred_at)` plus a guard on current state — running
  it twice writes one row.
- **Without this job the timeline is wrong every time an app crashes**, which is often.

**Backfill job** (one-off, re-runnable): replays `rides.audit_events` and `delivery.order_events`
from a given date into the projection. Safe to run repeatedly because of the unique key. Note it
**cannot** backfill presence — that history does not exist.

Reuse the existing cron surface: `registerInternalCronRoutes` already exists in
`supabase/functions/rides/index.ts`, and the fleet server has its own internal route conventions.

### 5.5 Permissions and audit trail

| Action | Permission | Notes |
|---|---|---|
| View the Activity tab and timeline | `drivers.view` | Same as the existing `GET /drivers/:id/audit` route. Tab is hidden, not just disabled, when absent. |
| See lat/lng on events | `drivers.location.view` **(new)** | Coordinates are stripped server-side when absent. |
| Export CSV | `drivers.view` + writes an audit row | The export is the artefact that leaves the system. |
| Run ingest / sweeper | service role only | Internal cron routes. |

**Every read that includes coordinates, and every export, writes a `driver_audit` row** via the
existing `appendDriverAuditEvent`. Watching where a person was is itself an auditable act; in an
enterprise deployment this will be asked about.

Org scoping uses the existing `stampOrg` / `getOrgId` helpers. `organization_id` is denormalized onto
the projection row so the composite index does the filtering — never filter org in application code
after the fetch.

### 5.6 Failure modes and recovery

| Failure | Detection | Behaviour | Recovery |
|---|---|---|---|
| Ingestor stops | `activity_ingest_lag_seconds` alert at 15 min | Watermark chip turns amber; the UI says how far behind | Restart; the watermark replays automatically |
| Projection corrupted / vocabulary change | Drift check (§13) | — | Truncate and replay from source. **This is why the projection must never be a source of truth.** |
| Duplicate ingestion | Unique violation count = 0 net effect | None | Nothing needed |
| `actor_user_id` is null on a source event | Ingest metric `unattributed_events` | Resolve the driver from `ride_requests.assigned_driver_user_id` instead of the actor. **Observed:** `rides/index.ts:1031` calls `audit(rideId, undefined, …)` for system events. | Re-run backfill after fixing resolution |
| Missing `went_offline` (app crash) | `sessions_closed_by_timeout` ratio | Sweeper closes it with a labelled reason | — |
| Device clock skew | — | `occurred_at` is always server time; device time is kept in `payload` for forensics only | — |
| One lane errors (delivery down) | `lanes[]` in the response | Successful lanes render; failed lane named inline; dependent tiles show `—` not `0` | Retry button |
| Window too large | Server clamps to 31 days and sets `window.clamped` | Banner explains the clamp | User narrows the range |
| Presence log write fails while the upsert succeeds | Mismatch check between live presence state and the last transition | The gap is visible as a coverage hole | Alert; the two writes should share a transaction to make this impossible |

### 5.7 Explicit reuse map

**Reuse (do not rebuild):**

| Existing building block | Where | Used for |
|---|---|---|
| `DRIVER_DETAIL_TABS` registry + `isDriverDetailTab` + `parseDriversPath` | `apps/fleet/src/navigation/pageRegistry.ts:87` | Add `'activity'` between `'financial'` and `'quality'` — deep links, tab guards and `pathForDriverDetail` all follow automatically |
| Lazy tab + `Suspense` + `TabsContent` pattern | `DriverDetailTabs.tsx:18-38` | Identical wiring for the new tab |
| Tab-gated fetching (`enabled: activeTab === …`) | `useDriverDetailTrips.ts:88` | Don't fetch activity from other tabs |
| `DriverPeriodContext` + toolbar date range | `drivers/context/DriverPeriodContext.tsx`, `DriverDetailToolbar.tsx` | The period. **No new picker.** |
| `ContentVisibilityList` | `drivers/ContentVisibilityList.tsx` (used by Service Quality) | Long-list rendering without adding a virtualization dependency |
| `MetricCard` / `OverviewMetricsGrid` | `drivers/OverviewMetricsGrid.tsx` | The summary strip tiles |
| `TabLoadingSkeleton`, `Card`, `Badge`, `Tooltip`, `Collapsible`, `Select`, `ScrollArea` | `components/ui/*` | All timeline chrome |
| `requireAuth` / `requirePermission` / `stampOrg` / `getOrgId` | `_fleet-server/rbac_middleware.ts`, `org_scope.ts` | Route auth, unchanged |
| `appendDriverAuditEvent` | `_fleet-server/drivers_audit.ts:23` | Location-read and export auditing |
| `rides.audit_events`, `delivery.order_events`, `rides.driver_offers` | source schemas | The event substrate — **already exists, already correct, already append-only** |
| `fleet.*` table pattern + `fleet_domains` registry | `_fleet-server/fleet_domains.ts`, `fleet_table_flags.ts` | New tables follow the established fleet-native shape; KV is legacy and must not be used |
| `api` service + react-query conventions | `services/api.ts`, `hooks/*` | Client data access |
| `sonner` toast on query error | `useDriverDetailTrips.ts:112` | Error surfacing convention |

**Net-new (justified):**

| New piece | Why reuse doesn't work |
|---|---|
| `fleet.driver_presence_log` | No presence history exists anywhere. `rides.driver_locations` is `PRIMARY KEY (user_id)` upsert; `delivery.courier_availability` is the same shape. Unrecoverable once overwritten. |
| Transition-only write in the two presence paths | The upsert functions currently have no notion of a state change. |
| `fleet.driver_activity_events` projection | Querying `rides.audit_events` by driver+time directly is a sequential scan (**observed:** only `idx_rides_audit_ride` on `ride_request_id` exists), and cross-service-line unioning at read time would fan out across three schemas per request. |
| `fleet.activity_source_coverage` | Nothing today can express "we were not recording then," and the alternative is inferring it — which is exactly the failure this section must not produce. |
| Presence heartbeat sweeper | No such job exists for either service line. |
| Activity routes + ingest job | New concern. |
| `drivers.location.view` permission | No location-specific permission exists today. |
| Timeline / cluster / gap-chip components | No timeline component exists in the UI kit. |

**Explicitly NOT reused — and why this matters:**

> `metrics.acceptanceRate` from `driverOperationalMetrics.ts:153` **falls back to
> `Math.round(completionRate)` when the CSV value is absent.** That is a fabricated number wearing a
> real metric's name. The Activity summary must compute acceptance from actual offer events
> (`accepted / (accepted + declined + expired)`) and return **`null`** when the denominator is zero.
> Never a fallback, never a zero. Reusing the existing value here would put a made-up acceptance rate
> next to a real, timestamped offer log on the same screen — and the log would contradict it.
> *(Worth fixing in Service Quality too, but that's outside this section's scope.)*

---

## 6. Correctness design

### 6.1 Invariants

| # | Invariant | Enforcement |
|---|---|---|
| I1 | Every projection row is unique per `(source, source_event_id)`. | DB unique constraint. Makes duplicate side effects structurally impossible rather than defensively avoided. |
| I2 | `occurred_at` is always a server-observed time. | Ingestor never reads a device timestamp into this column; device time goes to `payload`. Unit test. |
| I3 | No two `online` segments overlap for one `(driver, service_line)`. | Segment derivation test + a periodic SQL check. |
| I4 | Every `went_online` is followed by a `went_offline` **or** is the newest event for that driver and is rendered as open. | Sweeper guarantees the first; the API's `to: null` expresses the second. |
| I5 | A rendered duration always equals the server-computed segment duration. | The client has no duration arithmetic at all. Enforce by not passing adjacent timestamps to the row component. |
| I6 | Segment seconds over a fully covered window sum to the window length. | Property test over generated event sequences. |
| I7 | A window with no coverage row renders zero events **and** a not-recorded band. | Component test — the highest-value test in the suite. |
| I8 | `acceptanceRate` is `null`, never `0` and never a fallback, when no offers exist. | Contract test on the summary endpoint. |
| I9 | The projection is fully rebuildable: truncate + replay yields byte-identical rows except `ingested_at`. | Replay test in CI against a fixture dataset. |
| I10 | The Activity service performs no writes outside `driver_activity_events` (+ audit rows). | Separate DB role or an explicit review gate. |
| I11 | `job_completed` event counts reconcile to `fleet.trips` completed counts for the same driver-window. | Nightly drift check — see §13. |

### 6.2 Edge cases

- **Trips spanning midnight** — an event belongs to the day of its `occurred_at` in fleet timezone;
  the cluster header shows the job's start day and the child rows keep their own timestamps.
- **Events with identical timestamps** — the reference screen shows three events at 10:54 AM.
  Ordering falls back to `job_seq`, then source id. Never rely on timestamp alone for ordering.
- **Multiple concurrent jobs** (stacked orders in Rush) — clusters may interleave. The rail renders
  concurrent jobs as parallel tracks; `on_job` segments union rather than sum, so utilization can
  never exceed 100%.
- **Driver online on Rides and Rush simultaneously** — presence is per service line. Combined online
  time is the **union** of the two, not the sum. Getting this wrong inflates online hours.
- **Driver goes offline mid-trip** — both states are real. `on_job` and `offline` can overlap; render
  it and let ops see it, since it's exactly the anomaly they're looking for.
- **A ride reassigned to another driver** — the first driver's timeline ends at their last event; the
  ride's later events belong to the second driver. Attribution is per event, never per ride.
- **Driver deleted / anonymised** — projection rows are retained under a tombstoned driver id;
  timeline renders with the id, not the name.
- **Period straddles a daylight-saving change** — durations are computed on UTC instants; display is
  converted. A "1 hour" gap across the boundary must still read as 1 hour.
- **Backdated source events** (a late commit arriving after the watermark passed) — the 5-minute
  overlap window catches nearly all; anything later is caught by the nightly drift check and a
  full-day replay.

### 6.3 Concurrency

- The ingestor is single-writer per source; use an advisory lock keyed by source so two cron
  invocations cannot interleave. Even if they do, I1 makes it harmless.
- The sweeper races with a driver's own "go offline" tap. Both write a transition; the unique key on
  `occurred_at` makes a same-instant double-write impossible, and a near-instant double-write yields
  two rows where the second is a no-op transition (offline → offline), which the segment deriver
  collapses. Collapse identical consecutive states at derivation, never at write.
- Reads are never blocked by ingest — the projection is append-only, so readers see a consistent
  prefix. A row landing mid-read shows up on the next poll, not as a torn page.

### 6.4 How the CW stays complete, idempotent and auditable

- **Complete:** coverage is data, not inference. If we were not recording, the UI says so explicitly.
  The sweeper guarantees no session dangles. The drift check catches silent loss.
- **Idempotent:** every write in the pipeline is `ON CONFLICT DO NOTHING` on a natural key. The
  entire read model can be destroyed and rebuilt at any time with no data loss, because it owns
  nothing.
- **Auditable:** sources are append-only and independently inspectable; the projection records its
  source and source id on every row, so any displayed event can be traced back to the exact source
  row; location reads and exports are themselves audited.

### 6.5 Things that would create wrong status or unrecoverable state — flagged

1. **Reusing `metrics.acceptanceRate`** → a fabricated rate displayed beside a real offer log. (§5.7)
2. **Rendering an empty timeline for an uncovered window** → "this driver did nothing." (I7)
3. **No heartbeat sweeper** → drivers permanently "online"; online-hours totals inflate without
   bound. (I4)
4. **Client-side duration arithmetic over a paginated list** → wrong durations at every page
   boundary, wrong in a way nobody notices. (I5)
5. **Summing online time across service lines** → double-counted hours. (§6.2)
6. **Letting the projection become a source of truth** → it can no longer be rebuilt, and a
   vocabulary change becomes a migration instead of a replay. (I9)
7. **Feeding activity data into any pay calculation without a separate design review** → this is a
   derived, lossy read model sitting next to seven money engines that already have no shared
   accounting layer. It must not become an eighth. (I10)
8. **Shipping the UI before the presence write** → every day without the transition log is a day of
   permanently missing history. This is the only item on the list that gets worse with delay.

---

## 7. Performance design

### 7.1 Expected scale

An active driver: ~15 jobs/day × ~6 lifecycle events + ~30 offer events + ~20 presence transitions ≈
**140 events/day**. At 50 drivers: ~7k/day, ~2.5M/year. At 500 drivers: ~25M/year. A single table
with the composite index handles this comfortably; partition by month past ~50M rows.

### 7.2 Query shape and indexes

The one hot query is
`WHERE organization_id = $1 AND driver_id = $2 AND occurred_at BETWEEN $3 AND $4 ORDER BY occurred_at DESC LIMIT 200`,
which is a pure index range scan on `(organization_id, driver_id, occurred_at DESC)`. A week for one
driver is ~1,000 rows. **p95 target: < 300 ms server, < 400 ms end-to-end.**

Required new indexes:
- `fleet.driver_activity_events (organization_id, driver_id, occurred_at desc)` — the read path
- `fleet.driver_activity_events (ingested_at)` — lag monitoring
- `fleet.driver_presence_log (user_id, occurred_at desc)` — presence reads
- `rides.audit_events (created_at)` — **needed for incremental ingest.** Today the only index is
  `idx_rides_audit_ride` on `ride_request_id`, so a time-window scan is sequential. This index is
  required before the ingestor runs at any volume.
- `delivery.order_events (created_at)` — same reason.

> Deliberately **not** adding `rides.audit_events (actor_user_id, created_at)`. The ingestor scans by
> time, not by actor, and `actor_user_id` is null for system-emitted events anyway (`rides/index.ts:1031`).

### 7.3 Client rendering

- Page size 200. The tab is lazy-loaded (`React.lazy`), matching the other five.
- `ContentVisibilityList` (already in the codebase, used by Service Quality) rather than a new
  virtualization dependency. `content-visibility: auto` handles 1,000 rows without layout cost.
- Segments and clusters are memoized off the server response; the row component receives a
  pre-computed duration string and does no arithmetic.
- Day headers use `position: sticky` — no scroll listeners.
- The summary strip is a separate, cheaper query so the tiles paint before the list.

### 7.4 Caching and background work

- `staleTime`: 60s page / 120s summary. `gcTime` default.
- The summary aggregate over a week is small enough to compute on demand; **do not pre-aggregate in
  MVP.** Revisit only if p95 exceeds target, and then as a materialized daily rollup keyed
  `(driver_id, day, service_line)` — the repo already has the `perf_audit_wave4_driver_stats_matview`
  precedent.
- Ingest and sweep run on the existing cron surface; neither is on a request path.
- CSV export streams rather than buffering, and is capped at the same 31-day clamp.

---

## 8. Delivery plan

Sortable by Priority (P0 highest). Effort in engineer-days.

| ID | Priority | Workstream | Deliverable | Depends on | Risk if skipped | Effort |
|---|---|---|---|---|---|---|
| ACT-01 | **P0** | Data capture | `fleet.driver_presence_log` table + indexes | — | — | 0.5 |
| ACT-02 | **P0** | Data capture | Transition-only writes in `rides_upsert_driver_presence` and `upsertCourierPresence` | ACT-01 | **Online/offline history is permanently lost every day this is not shipped. Unrecoverable.** | 1.5 |
| ACT-03 | **P0** | Data capture | Heartbeat-timeout sweeper (cron, idempotent) + grace config | ACT-02 | Crashed apps leave drivers "online" forever; online hours inflate without bound | 1.5 |
| ACT-04 | **P0** | Data capture | `fleet.activity_source_coverage` + the launch-date row | ACT-01 | "Not recorded" becomes indistinguishable from "did nothing" — the core wrong-status failure | 0.5 |
| ACT-05 | **P1** | Read model | `fleet.driver_activity_events` + indexes + fleet-domain registration | — | — | 1 |
| ACT-06 | **P1** | Read model | Source indexes: `rides.audit_events(created_at)`, `delivery.order_events(created_at)` | — | Ingest sequentially scans; degrades linearly forever | 0.5 |
| ACT-07 | **P1** | Read model | Ingestor: rides lane, watermarked, idempotent, overlap window | ACT-05, ACT-06 | — | 2.5 |
| ACT-08 | **P1** | Read model | Canonical vocabulary mapper + driver attribution (incl. null-actor fallback) | ACT-07 | Events attributed to nobody; system events silently dropped | 1.5 |
| ACT-09 | **P1** | API | `GET /drivers/:id/activity` — server-side segments, coverage, cursor, lanes | ACT-05, ACT-08 | — | 2.5 |
| ACT-10 | **P1** | UI | `Activity` tab registration (registry, trigger, lazy content, deep link) | — | — | 0.5 |
| ACT-11 | **P1** | UI | Timeline: day groups, event rows, gap chips, status rail, clusters | ACT-09, ACT-10 | — | 3 |
| ACT-12 | **P1** | UI | Coverage banner, not-recorded band, unsupported-platform state, open-session state | ACT-09, ACT-11 | The four states that prevent a false narrative about a person's day | 1.5 |
| ACT-13 | **P1** | Security | `drivers.location.view` permission, coord stripping, read/export auditing | ACT-09 | Unlogged location surveillance of employees | 1 |
| ACT-14 | **P1** | Correctness | Invariant suite I1–I9 (unit + property + component) | ACT-09, ACT-11 | — | 2 |
| ACT-15 | **P2** | Read model | Ingestor: delivery/Rush lane | ACT-07, ACT-08 | Rush activity invisible; utilization understated for couriers | 2 |
| ACT-16 | **P2** | API | `…/activity/summary` — event-derived AR/CR with `basis`, null-not-zero | ACT-09 | Falls back to the fabricated `acceptanceRate` | 1.5 |
| ACT-17 | **P2** | UI | Summary strip + basis labelling | ACT-16 | — | 1 |
| ACT-18 | **P2** | UI | Filters (service line / event / status / sort) + URL sync | ACT-09, ACT-11 | A week is unnavigable; timelines aren't linkable into disputes | 1.5 |
| ACT-19 | **P2** | Ops | Backfill job (rides + delivery lanes, re-runnable) | ACT-07, ACT-15 | Launch day starts from zero history even where sources have it | 1 |
| ACT-20 | **P2** | Ops | Metrics, alerts, nightly drift check vs `fleet.trips` (I11) | ACT-07 | Silent data loss; nobody notices a dead ingestor | 1.5 |
| ACT-21 | **P2** | UI | Accessibility pass: semantics, keyboard, timezone labelling, reduced motion | ACT-11 | — | 1.5 |
| ACT-22 | **P3** | UI | CSV export (streamed, audited) | ACT-09, ACT-13 | Disputes have no exportable artefact | 1 |
| ACT-23 | **P3** | UI | Admin-action lane from existing `driver_audit` KV | ACT-09 | — | 1 |
| ACT-24 | **P3** | Ops | Retention policy (400 days) + partitioning runbook | ACT-05 | Unbounded growth | 1 |
| ACT-25 | **P3** | Correctness | Replay test (I9) in CI | ACT-07, ACT-19 | Projection quietly stops being rebuildable | 1 |

**Total through P2: ~32 engineer-days. MVP (P0 + the P1 core): ~20.**

---

## 9. MVP slice

**Goal: the critical workflow is real and safe for Roam rides.**

Ship in two waves.

**Wave 0 — today, no UI (ACT-01 → ACT-04, ~4 days).**
Presence transition log, transition-only writes, heartbeat sweeper, coverage registry. Ship this
first and separately. It has no user-visible surface and no dependency on the rest of the design.
Every day it is not shipped is a day of history you cannot get back.

**Wave 1 — the tab (ACT-05 → ACT-14, ~16 days).**
Roam rides lane only. Timeline with day grouping, clusters, gap chips, server-derived segments.
Coverage band, not-recorded state, unsupported-platform state for Uber/InDrive, open-session
rendering. `drivers.view` gating, location stripping, read auditing. The invariant suite.

**Explicitly deferred out of MVP:** Rush lane, summary strip, filters, export, admin-action lane,
realtime. The MVP timeline with honest gaps is more valuable than a complete-looking one with
inferred states.

**MVP is done when:** for any Roam driver and any day in the covered window, the timeline matches
that day's `rides.ride_requests` timestamps event-for-event, and any uncovered portion renders as an
explicit band rather than as emptiness.

---

## 10. v1 completeness (enterprise-grade, not demoware)

Everything in MVP, plus:

- **Rush/delivery lane** (ACT-15) — a courier's day is otherwise invisible.
- **Event-derived acceptance and cancellation rates** with an explicit `basis` label (ACT-16/17), and
  `null` rather than a fallback. This is what makes the tab trustworthy next to Service Quality.
- **Filters and URL-synced state** (ACT-18) — a week of events is unusable without them, and a
  linkable timeline is what gets pasted into a dispute.
- **Backfill** (ACT-19) — launch with the history the sources already hold, not from zero.
- **Operability** (ACT-20): ingest lag metric + alert, sessions-closed-by-timeout ratio as a
  data-quality signal, nightly reconciliation of `job_completed` counts against `fleet.trips`, and a
  documented runbook for "the ingestor died."
- **Accessibility** (ACT-21) — semantics, keyboard navigation, and timezone-labelled times. A
  timeline used as evidence must be unambiguous about *when*.
- **Audited CSV export** (ACT-22).
- **Retention and partitioning runbook** (ACT-24).
- **Replay test in CI** (ACT-25) — the guarantee that the projection stays disposable.

The distinguishing property of v1: **you can hand a printed export of this tab to a driver in a pay
dispute and defend every line of it**, including the lines that say "we weren't recording."

---

## 11. Later enhancements (1–2 quarters, only after v1 is solid)

1. **Live tail** — a 30s-polling "now" view for the current day, upgraded to realtime only if a
   dispatch use case actually appears (see Q3).
2. **Map replay** — GPS breadcrumbs alongside the timeline. Gated on the retention/privacy decision
   in Q4 and on `drivers.location.view` already existing from v1.
3. **Idle anomaly detection** — flag long online-but-no-offers stretches, and online-but-declining
   patterns. Surface as chips on the timeline, never as an automated action.
4. **Shift vs schedule** — if scheduling is ever introduced, overlay planned against actual.
5. **Fleet-wide activity view** — the same read model, aggregated across drivers, as an Analytics
   page. The projection already supports it; only the query and UI are new.
6. **Uber ingest** — if partner API access is ever obtained, it becomes a fourth ingest lane with no
   change to the model, the API or the UI. This is the payoff for keeping the vocabulary canonical.

---

## 12. New architecture: trade-offs and adoption path

The net-new architectural element is the **event projection + ingest pipeline**. Everything else is
an extension of an existing subsystem.

**Why a projection rather than querying the sources directly:**

| | Direct source query | Projection (recommended) |
|---|---|---|
| Driver+time query cost | Sequential scan — `rides.audit_events` has no time or actor index | Single composite index range scan |
| Cross-service-line union | Fan-out across `rides`, `delivery`, and presence per request | One table, one query |
| Vocabulary | UI branches on source shape | Canonical verbs; UI has no source knowledge |
| Adding Uber later | New UI branch | New ingest lane only |
| Coupling | Fleet read path coupled to two other teams' schemas | Coupling isolated in the ingestor |
| Cost | No new storage; always current | ~2.5M rows/yr; ingest lag (~60s) |
| Failure blast radius | A schema change in `rides` breaks the Fleet UI | A schema change breaks the ingestor; UI keeps serving |

The lag and the storage are the real costs, and both are acceptable: 60 seconds is invisible for a
forensic tool, and the storage is trivial. The decisive argument is the last row — this keeps the
Fleet UI decoupled from two schemas it does not own.

**Phased adoption:**

1. **Phase A (no UI):** presence log + sweeper + coverage. Lands independently, benefits nothing
   until Phase C, loses data every day it waits.
2. **Phase B (shadow):** ingestor runs, projection fills, nothing reads it. Run the drift check
   against `fleet.trips` for a week. Zero user-visible risk.
3. **Phase C (read):** the tab ships reading the projection. Behind a feature flag, following the
   codebase's existing flag convention, defaulted off until the drift check has been green for a week.
4. **Phase D (extend):** Rush lane, summary, filters, export.
5. **Phase E (optional):** materialized daily rollups, only if the p95 target is missed.

No migration of existing data is required and nothing is retired, because this section reads
substrates that already exist and adds one that never did.

---

## 13. Instrumentation & acceptance plan

### 13.1 Metrics

| Metric | Target | Alert |
|---|---|---|
| `activity_ingest_lag_seconds` | p95 < 120s | > 900s for 5 min |
| `activity_ingest_rows_total` by source | — | zero for 15 min while sources are non-empty |
| `activity_unattributed_events_total` | 0 | any sustained non-zero |
| `presence_sessions_closed_by_timeout_ratio` | < 20% | > 50% (indicates a client bug) |
| `presence_open_sessions_gauge` | ≈ drivers currently online | > 2× the plausible count |
| `activity_query_duration_seconds` | p95 < 300ms | p95 > 1s |
| `activity_location_reads_total` | — | reviewed, not alerted |
| `activity_drift_job_completed_vs_trips` | 0 | any non-zero for a closed day |

### 13.2 Logs and traces

- Every ingest batch logs `{source, watermark_from, watermark_to, scanned, inserted, conflicted, ms}`.
  `conflicted > 0` is normal (the overlap window) and is not an error.
- Every sweep logs the closed sessions with driver id and the inferred offline instant.
- Every location read and every export logs to the driver audit trail with actor, driver and window.
- Trace the API route end-to-end: identity resolution → projection query → segment derivation →
  serialization, so a slow response is attributable to one of four spans.

### 13.3 Fixtures and tests

| Layer | Test | Proves |
|---|---|---|
| Unit | Vocabulary mapper over a fixture of every known source `event_type` | No source event is silently dropped |
| Unit | Attribution resolves the driver when `actor_user_id` is null | I-fix for `rides/index.ts:1031` |
| Property | Random event sequences → segments; assert no overlap (I3), durations sum to window (I6), every online terminates or is open (I4) | Segment derivation |
| Integration | Ingest the same window three times → row count unchanged | I1 idempotency |
| Integration | Truncate + full replay → identical rows modulo `ingested_at` | I9 disposability |
| Integration | Sweeper run twice → one offline row | Sweeper idempotency |
| Contract | Summary with zero offers returns `acceptanceRate: null` | I8 — no fabricated rate |
| Component | Uncovered window renders the band and **zero** event rows | I7 — the highest-value test |
| Component | Open session renders "still online", not a fixed duration | §3.3 |
| Component | Uber platform filter renders the unsupported state, not an empty timeline | §3.3 |
| Component | Page-boundary durations equal server segment durations | I5 |
| E2E | Seeded ride → timeline matches `ride_requests` timestamps event-for-event | The critical workflow |
| Smoke | Extend `drivers/tabs/driverTabs.smoke.test.tsx` to cover the new tab | Tab wiring + deep link |

### 13.4 Acceptance proofs — "this section is done and correct"

Sign off when all of these are demonstrable:

1. **Timeline fidelity.** For a seeded Roam ride, every timestamp in the Activity timeline matches
   `rides.ride_requests` / `rides.audit_events` exactly. Zero events missing, zero invented.
2. **Gap honesty.** A window spanning the coverage boundary renders events on the covered side and a
   labelled band on the uncovered side. Screenshot as the proof artefact.
3. **No dangling sessions.** Kill a driver client mid-session; within grace + 60s the timeline shows
   an Offline row labelled "app stopped reporting," and `presence_open_sessions_gauge` returns to the
   true count.
4. **Idempotency.** Run the ingestor three times over the same window; the row count is identical and
   the timeline is unchanged.
5. **Disposability.** Truncate the projection and replay; the timeline renders identically.
6. **Reconciliation.** The nightly drift check reports zero difference between `job_completed` counts
   and `fleet.trips` completed counts for a closed day, for every driver.
7. **No fabricated metrics.** A driver with zero offers in the period shows `—` for acceptance, not a
   number, and the basis label reads "no offers in period."
8. **Permission boundary.** A `drivers.view`-only user sees the timeline with coordinates stripped; a
   `drivers.location.view` user sees coordinates and the read appears in the driver audit trail.
9. **Partial failure.** With the delivery lane forced to error, the rides timeline still renders, the
   failed lane is named, and no dependent tile shows `0`.
10. **Performance.** p95 < 400ms end-to-end for a 7-day window on the busiest driver, measured against
    production-scale seeded data.
11. **Money isolation.** A grep/review gate confirms the Activity service writes to no table other
    than `driver_activity_events` and the audit trail.

---

## 14. Open questions

Ranked by how much they block the design.

| # | Question | Blocks | Why it matters |
|---|---|---|---|
| **Q1** | **Do you have any Uber/InDrive API access for per-event driver activity, or is CSV the only source?** My reading is CSV-only — Enroute/Open/Unavailable hours come from weekly CSV rows in `driverOperationalMetrics.ts:793-795`. If so, the Uber timeline in your reference screenshots **cannot be reproduced for Uber drivers**, and the tab shows an explicit unsupported state for that platform. Confirm you accept that. | **Design-blocking** | If the answer is "Uber drivers are most of the fleet," this section is largely empty on day one and the sequencing should change. |
| **Q2** | **Do your fleet drivers use the Roam driver app while working Uber trips?** If yes, presence (online/offline) is capturable for *them* even though Uber trip events are not — a half-timeline that is still genuinely useful. If no, Uber drivers have no activity data at all. | **Design-blocking** | Determines whether the presence log covers the whole fleet or only Roam/Rush work. |
| Q3 | **Who uses this, and is it forensic or live?** My assumption (A1/A2) is forensic: ops investigating a specific driver-day. If anyone needs to watch it live, realtime moves from Later into v1. | High | Changes caching, polling and the whole Later roadmap. |
| Q4 | **Retention and privacy policy for location data.** How long may GPS coordinates be kept, who may see them, and does any jurisdiction you operate in require notice to the driver? | High | Sets the retention job, `drivers.location.view` assignment, and whether map replay is ever viable. |
| Q5 | **What is the heartbeat grace period?** I've assumed 5 minutes for the timeout sweeper. It should match the driver app's actual heartbeat interval — what is it? | Medium | Too short creates phantom offline rows; too long inflates online hours. |
| Q6 | **Should drivers see their own activity timeline** in the driver portal? Out of scope as specified, but it changes whether the API needs a self-scoped variant. | Medium | Additive later, but cheaper to design for now than to retrofit. |
| Q7 | **Expected driver count in 12 months.** Assumed tens (A5). | Low | Only decides whether to partition the projection at launch. |
| Q8 | **Does the fabricated `acceptanceRate` fallback in Service Quality bother you enough to fix there too?** Out of this section's scope, but Activity will visibly contradict it. | Low | Scope decision, not a design dependency. |

---

## Prioritized implementation order

**Ship in this order.**

```
WAVE 0 — Stop the bleeding (ship this week, standalone, no UI)
  ACT-01  fleet.driver_presence_log
  ACT-02  transition-only presence writes        ← history is lost daily until this lands
  ACT-03  heartbeat timeout sweeper
  ACT-04  coverage registry + launch-date row

WAVE 1 — MVP: Roam rides timeline (behind a flag)
  ACT-06  source time indexes
  ACT-05  projection table
  ACT-08  vocabulary mapper + attribution
  ACT-07  ingestor, rides lane            → run in shadow for one week
  ACT-09  GET /drivers/:id/activity
  ACT-10  tab registration
  ACT-11  timeline UI
  ACT-12  coverage / not-recorded / unsupported / open-session states
  ACT-13  permission gating + read auditing
  ACT-14  invariant suite I1–I9
          ── flag on once the drift check is green for 7 days ──

WAVE 2 — v1: enterprise-grade
  ACT-15  delivery/Rush lane
  ACT-16  summary endpoint (event-derived AR/CR, null-not-zero)
  ACT-17  summary strip
  ACT-18  filters + URL sync
  ACT-19  backfill
  ACT-20  metrics, alerts, nightly drift check
  ACT-21  accessibility pass

WAVE 3 — completeness
  ACT-22  audited CSV export
  ACT-23  admin-action lane
  ACT-24  retention + partitioning runbook
  ACT-25  replay test in CI

LATER (1–2 quarters, after v1 is solid)
  live tail · map replay · idle anomalies · shift-vs-schedule
  · fleet-wide view · Uber lane if API access appears
```

**If you only do one thing this week, do ACT-02.** Everything else in this document can be built at
any time from data that already exists. Presence history cannot.
