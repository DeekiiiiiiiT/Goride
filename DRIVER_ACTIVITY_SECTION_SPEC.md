# Driver Activity — Build Specification

**Section:** `Activity` tab on Driver Detail, positioned between **Financials** and **Service Quality**
**App:** `apps/fleet` (Roam Fleet)
**Status:** **Built and pilot-scoped.** Re-audited 2026-09-18 against the live DB
(`csfllzzastacofsvcdsc`). **All 5 Critical and all 8 Moderate findings from Rev 1 are closed and
verified.** N1 (flag allowlist bypass) closed the same day. Five soak residuals remain — none are
defects.
See [§16 Implementation audit Rev 2](#16-implementation-audit--rev-2-2026-09-18).
**Date:** 2026-09-18 (spec) · Rev 1 audit · **Rev 2 audit (current)** · N1 fix

> **Engineering is sound; rollout is now correctly pilot-scoped.** Security exposure is closed
> (0 activity findings in Supabase's advisor, down from 12+), the ingest pipeline is live and
> idempotent, and coverage tells the truth about what was and wasn't recorded.
>
> Flag record: `enabled: false` + `enabledForOrgs: [pilot]`. Logged-in shell evaluates with org id
> via `/enterprise/me/modules`. Public `/platform-feature-flags` always returns `driver_activity:
> false`. Next: 7-day shadow (drift, presence toggle, location gate exercise) before GA.

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

> **Audit Rev 2 status: 6 of 11 pass, 0 fail, 5 pending soak.** (Rev 1 was 2 pass, 5 fail.)
> Verified 2026-09-18 against the live database.
>
> | # | Proof | Rev 1 | Rev 2 | Evidence |
> |---|---|---|---|---|
> | 1 | Timeline fidelity | ❌ | ✅ **PASS** | 86 rows ingested; every source `event_type` reconciled against `SELECT DISTINCT` — nothing wrongly dropped |
> | 2 | Gap honesty | ❌ | ✅ **PASS** | Executed: presence reports `recorded:false` for a pre-launch window while trips report `recorded:true` |
> | 3 | No dangling sessions | ❌ | ✅ **PASS** | Sweeper closed 2 stale June sessions, `reason: heartbeat_timeout`, `last_seen` retained |
> | 4 | Idempotency | ⚠️ | ✅ **PASS** | 86 rows, **0 duplicate keys**, ~16 consecutive overlapping runs inserted nothing |
> | 5 | Disposability | ⚠️ | ⚠️ **PENDING** | Constraint + backfill both work; no deliberate truncate-and-replay has been performed |
> | 6 | Reconciliation | ❌ | ⚠️ **PENDING** | Drift check built and scheduled 05:45 daily; has not yet had a first run |
> | 7 | No fabricated metrics | ✅ | ✅ **PASS** | Unchanged |
> | 8 | Permission boundary | ❌ | ⚠️ **PENDING** | Branch is now live (coords retained, stripped at read); 0 of 86 ingested rows carry coords, so untested in practice |
> | 9 | Partial failure | ⚠️ | ⚠️ **PENDING** | `lanes[]` returned; still no forced-failure test |
> | 10 | Performance | ⚠️ | ⚠️ **PENDING** | Indexes correct; 86 rows is not a measurement |
> | 11 | Money isolation | ✅ | ✅ **PASS** | Unchanged |

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

---

## 15. Remediation summary (applied 2026-09-18)

**Remediation applied 2026-09-18.** Security (C1/C2), cron (C3/M6), vocabulary (C5),
per-source coverage (C4), M1/M2/M7/M8, ACT-18–23 UI/ops, and invariant tests closed and
**re-verified live** (§16 Rev 2).

**Pilot rollout:** `driver_activity` is **allowlist-only** — KV `enabled: false` +
`enabledForOrgs: ["8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823"]`. N1 (global enable bypass) closed
2026-09-18. Keep a 7-day shadow watch on ingest lag and nightly drift-check before GA.

### 15.0 What was built correctly
(see Rev 1 — structure retained)

### 15.1 Critical — remediation status

| ID | Finding | Status |
|---|---|---|
| C1 | Anon-executable SECURITY DEFINER RPCs | ✅ Fixed — migration `20260918200000` REVOKE + Phase-B name list |
| C2 | Anon-readable views / RLS bypass | ✅ Fixed — `security_invoker`, drop presence/watermark views, revoke authenticated SELECT |
| C3 | Cron jobs never ran | ✅ Fixed — sweeper direct SQL; ingest via `private.invoke_*` + `fleet_ops_secrets`; drift cron added |
| C4 | Coverage unions all sources | ✅ Fixed — `buildCoverageBySource` + honesty banner |
| C5 | Vocabulary misses live event types | ✅ Fixed — admin force → `admin_action`; cancel variants; `cancelled_by` from `ride_requests` |

### 15.2 Moderate — remediation status

| ID | Status |
|---|---|
| M1 on_job double-count | ✅ Union intervals |
| M2 location gating dead | ✅ Retain at ingest; strip at read |
| M3 mirror drift | ✅ Trimmed client to types + platform helper |
| M4 tautological replay | ✅ Contract + Deno fixtures |
| M5 missing tests | ✅ Expanded Deno + vitest |
| M6 HTTP sweeper | ✅ Direct SQL |
| M7 stillOpen | ✅ `nowMs < toMs` |
| M8 orphan offline | ✅ Guard in upsert migration `20260918220000` |

### 15.3 Delivery plan status (Rev 2)

| Status | IDs |
|---|---|
| ✅ Done | ACT-01–17, ACT-18 (URL sync), ACT-19 (backfill route), ACT-20 (drift cron), ACT-21 (a11y pass), ACT-22 (auth export), ACT-23 (fleet_ops), ACT-24, ACT-25 |
| ✅ Pilot | `driver_activity` allowlist-only for primary org; N1 closed; 7-day shadow before GA |

See also: `docs/driver-activity-runbook.md`.

---

## 15A. Implementation audit — Rev 1 (historical record, superseded by §16)

> Retained so the Rev 2 closures in §16 can be checked against what was originally found.
> **Every finding in this section is closed** — see §16.1.

Audited against the working tree and the **live database** (`csfllzzastacofsvcdsc`). Every finding
below was verified by query, by Supabase's own security advisor, or by executing the code — none are
inferred from reading alone.

### 15A.0 What was built correctly

The shape of the implementation is right, and several of the hardest correctness requirements hold.

| Requirement | Status | Evidence |
|---|---|---|
| Tab position: Financials → **Activity** → Service Quality | ✅ | `pageRegistry.ts:96`, `DriverDetailTabs.tsx:106`; deep link + guards inherited |
| Wave 0 tables (`driver_presence_log`, `activity_source_coverage`) | ✅ | Correct columns, unique keys, indexes |
| Transition-only presence writes, in the same transaction as the upsert | ✅ | `v_prev IS DISTINCT FROM` guard inside both upsert functions |
| **I2** — `occurred_at` is server time | ✅ | `clock_timestamp()`; device time never read into the column |
| Projection shape, `UNIQUE (source, source_event_id)`, composite read index | ✅ | Wave 1 migration matches §5.1(b) exactly |
| **ACT-06** source time indexes | ✅ | `idx_rides_audit_created_at`, `idx_delivery_order_events_created_at` created |
| **I6** — segments sum to the window | ✅ | Executed: 4h window → 3600+3600+7200 = 14400s exactly |
| **I3/I4** — no overlapping online segments; open session has `to: null` | ✅ | Consecutive-state collapse; tested |
| **I5** — client performs no duration arithmetic | ✅ | Tab renders server `seconds` via `formatDuration`; no timestamp subtraction |
| **I8** — acceptance is `null`, never a fallback | ✅ | `computeEventAcceptanceRate` + route both correct. **The fabricated `Math.round(completionRate)` fallback was correctly NOT reused.** |
| Null-actor attribution fallback | ✅ | `a.actor_user_id \|\| assignedByRide.get(...)` — the spec's explicit `rides/index.ts:1031` callout, handled |
| Unsupported-platform state for Uber/InDrive | ✅ | Server short-circuit + client component + tests |
| `drivers.location.view` permission registered | ✅ | `rbac_middleware.ts:44,254` |
| Delivery lane vocabulary vs real data | ✅ | All 6 courier-relevant statuses map; merchant-side (`placed`/`ready`/`preparing`) correctly ignored |
| Retention function hardened | ✅ | `fleet.purge_old_activity_data` has `REVOKE ... FROM PUBLIC, anon, authenticated` **and** a `>= 30` floor |
| Test suite runs green | ✅ | 17/17 pass across 4 files |

### 15A.1 Critical — must close before the tab is enabled

#### C1 — Six SECURITY DEFINER RPCs are executable by `anon`

Verified by direct privilege query **and** independently by Supabase's security advisor, which names
the reachable REST endpoints.

| Function | anon EXECUTE | Impact |
|---|---|---|
| `public.sweep_stale_presence(int)` | ✅ yes | `POST /rest/v1/rpc/sweep_stale_presence {"p_grace_seconds":0}` forces **every online driver in the fleet offline**. Live dispatch outage, unauthenticated. |
| `public.purge_old_activity_data(int)` | ✅ yes | Deletes all activity + presence older than 30 days. **Irreversible**, and presence history cannot be rebuilt. |
| `public.rides_upsert_driver_presence(...)` | ✅ yes | **Regression.** The 2026-05-24 migration explicitly did `REVOKE ALL ... FROM PUBLIC`; the new 9-arg signature is a *new* function, so that revoke no longer applies. Forge any driver's location/availability. |
| `public.delivery_courier_upsert_presence(...)` | ✅ yes | Same, courier side |
| `delivery.delivery_courier_upsert_presence(...)` | ✅ yes | Same |
| `fleet.append_presence_transition(...)` | ✅ yes | Forge presence history directly |

**Root cause:** Postgres grants `EXECUTE` to `PUBLIC` on every newly created function. This repo has
no `ALTER DEFAULT PRIVILEGES` and its only protection is a **hardcoded name list** in
`20260827151000_advisor_remediation_phase_b_revoke_rpc_grants.sql` — which none of the new functions
are in. `fleet.purge_old_activity_data` is the single function that got an explicit `REVOKE`; every
`public.*` wrapper — the ones actually reachable through PostgREST — was missed.

**Fix:** add `REVOKE ALL ON FUNCTION <sig> FROM PUBLIC, anon, authenticated;` before each `GRANT`,
for all six. Then add the new names to the advisor-remediation list so the next signature change
cannot silently re-expose them.

#### C2 — Four `public.*` views are anon-readable with RLS bypassed

| View | `security_invoker` | Owner | anon SELECT |
|---|---|---|---|
| `public.fleet_driver_activity_events` | **false** | postgres | ✅ yes |
| `public.fleet_driver_presence_log` | **false** | postgres | ✅ yes |
| `public.fleet_activity_source_coverage` | **false** | postgres | ✅ yes |
| `public.fleet_activity_ingest_watermarks` | **false** | postgres | ✅ yes |

Two compounding defects:

1. **RLS is bypassed.** With `security_invoker = false` the view executes as its owner (`postgres`,
   which is `BYPASSRLS`), so the carefully written `can_read_org(organization_id)` policy on the base
   table never evaluates. Any reader gets **every organization's** rows.
2. **anon can read them.** The migration granted only `authenticated`/`service_role`, but Supabase's
   project-level `ALTER DEFAULT PRIVILEGES` grants new `public` tables and views to `anon` as well.
   Granting explicitly does not undo that default.

Net effect once the projection has data: anyone holding the public anon key can read every driver's
movement and work history across all tenants. This is the same trap recorded in the repo's earlier
RLS exposure audit, repeated in new code.

**Fix:** `ALTER VIEW ... SET (security_invoker = on)` on all four, `REVOKE ALL ... FROM anon` on all
four, and drop the two views (`presence_log`, `ingest_watermarks`) that only the service role ever
needs — the edge function uses the service key and does not need a `public` wrapper at all.

> Note the `GRANT SELECT ON fleet.driver_activity_events TO authenticated` in the Wave 1 migration is
> also a design contradiction independent of the view bug: §5.5 routes all reads through
> `requirePermission("drivers.view")`, and a direct table grant lets any authenticated user bypass
> that check entirely. Revoke it; reads go through the edge function.

#### C3 — Both cron jobs have failed on every run since deploy

```
ERROR: null value in column "url" of relation "http_request_queue"
       violates not-null constraint
```

`fleet-activity-ingest` and `fleet-activity-presence-sweep` are scheduled and `active`, firing every
minute, and **every single execution has failed**. Cause: the cron bodies build their URL from
`current_setting('app.settings.supabase_url', true)`, and neither `app.settings.supabase_url` nor
`app.settings.cron_secret` is set on this database — both resolve to `NULL`, so `net.http_post`
rejects the row before any request is made.

Confirmed consequences:

| Table | Rows | Expected |
|---|---|---|
| `fleet.driver_activity_events` | **0** | ≥ 12 from existing sources |
| `fleet.driver_presence_log` | **0** | — |
| `fleet.activity_ingest_watermarks` | **0** | 1 row per lane |
| `rides.audit_events` (source) | 113 | — |

So **ACT-03 and ACT-07 are not in service despite their code existing**, and I4 has no enforcement
whatsoever — nothing is closing dangling sessions.

This also went unnoticed for the entire period because **ACT-20 (ingest lag metric + alert) was not
built**. That deliverable's "Risk if skipped" column reads *"silent data loss; nobody notices a dead
ingestor."* That is precisely what happened.

**Fix:** set both DB settings (`ALTER DATABASE ... SET app.settings.supabase_url = ...`), and — better
— **call the sweeper directly in SQL** rather than over HTTP. `fleet.sweep_stale_presence` is a pure
SQL function; routing it through an edge-function round trip adds a failure mode for nothing. The
`purge_fleet_activity_400d` job in the same migration family does exactly this
(`SELECT fleet.purge_old_activity_data(400)`) and is the one job that works. Then build ACT-20.

#### C4 — Coverage merges all sources, so "not recorded" can never render

`loadCoverage()` selects every coverage row for the requested service lines and passes the whole set
to `buildCoverageWindows()`, which **merges them into one interval union without regard to `source`**.
The live rows are:

| service_line | source | covered_from |
|---|---|---|
| roam_rides | `fleet.driver_presence_log` | **2026-09-18** (deploy) |
| roam_rides | `rides.audit_events` | **2025-01-01** |
| roam_rides | `rides.driver_offers` | **2025-01-01** |
| roam_rush | `delivery.order_events` | **2025-01-01** |
| roam_rush | `fleet.driver_presence_log` | **2026-09-18** |

The union starts 2025-01-01, so **every window back to then reports `recorded: true`** even though
presence was not being logged before 2026-09-18 and, per C3, still isn't.

**Combined with C3 this is the failure the whole section exists to prevent.** Today, opening the tab
for a driver with 113 logged ride events returns `data: []`, `segments: []`, `coverage: [recorded:
true]`, `basis: "event"` — which the UI renders as *"No activity recorded in this period. Presence
logging was active for the whole window."* That is a confident, false statement about a person's
working day, and it is exactly what I7 was written to make impossible.

**Fix:** coverage must be evaluated **per source class**, not unioned. A window is `recorded` for
presence only if a presence coverage row spans it; the timeline should carry a per-lane coverage
array so the UI can say "trips recorded, presence not recorded" — which is the honest answer for any
window before the Wave 0 deploy.

#### C5 — The rides vocabulary mapper misses ~89% of real source events

`mapRidesAuditToCanonical` was written against the event names in the *specification prose*, not
against the data. Actual distinct `event_type` values in `rides.audit_events`:

| Actual `event_type` | Rows | Mapped? |
|---|---|---|
| `admin_ride_force_cancel` | 20 | ❌ dropped |
| `admin_ride_force_complete` | 18 | ❌ dropped — **these are real completions** |
| `offer_accepted_atomic` | 12 | ✅ |
| `ride_cancelled_system` | 11 | ❌ dropped (mapper only knows `ride_cancelled`) |
| `fare_quoted` | 4 | ➖ correctly ignored |
| `admin_*` (config/fare/vehicle) | 48 | ➖ correctly ignored |

**`driver_transition`, `ride_completed`, `ride_cancelled` and `offer_accepted` do not appear in this
database at all.** Only 12 of 113 rows would produce a timeline event.

Worse, the `driver_cancelled` verb is **unreachable in practice**: `rideLifecycle.ts` builds its
audit payload as `{from, to, source}` with no `cancelled_by` key, so `mapRidesAuditToCanonical`'s
`cancelled_by` lookup always misses and every cancellation degrades to `system_cancelled`. The
"Driver cancelled" row in the reference screenshots — and the driver-vs-system distinction that
decides conduct disputes — can essentially never be produced.

The spec's §13.3 required a test *"Vocabulary mapper over a fixture of every known source
`event_type`"* whose stated purpose was "no source event is silently dropped." It was not written;
only two hand-picked cases were. This finding is the direct, predictable cost of that omission.

**Fix:** derive the fixture from `SELECT DISTINCT event_type FROM rides.audit_events`, map the three
missing types (`admin_ride_force_complete` → `job_completed`, `admin_ride_force_cancel` →
`system_cancelled`, `ride_cancelled_system` → `system_cancelled`), read `cancelled_by` from
`ride_requests` rather than the audit payload, and add an `unmapped_event_types` ingest metric so the
next unknown verb surfaces as a number instead of as silence.

### 15A.2 Moderate

| ID | Finding | Detail |
|---|---|---|
| M1 | **`on_job` double-counts concurrent jobs** | Executed: two overlapping 1h jobs yield **7200s, not 3600s**. The function's own docstring claims it unions. `utilizationPct` hides this behind `Math.min(100, …)`, so stacked Rush orders will read inflated and pin at 100%. Violates §6.2. |
| M2 | **Location gating is dead code** | `stripCoords()` runs at *ingest*, so `payload` never holds coordinates. The `drivers.location.view` branch and its audit write can therefore never fire, and acceptance proof #8 is unpassable. Fail-closed, so not a leak — but decide: either store coords and gate at read (enables the Later map-replay), or delete the dead branch and state in §5.5 that coordinates are never retained. |
| M3 | **Mirror without the repo's guard rails** | `driverActivityModel.ts` is a **byte-identical 417-line copy** of `driver_activity_logic.ts`, with no `Keep-in-sync` marker and no drift test — the repo's own established mirror pattern. Also, the client imports only `isUnsupportedActivityPlatform` and one type, so ~400 lines are dead. Trim to what the client uses, or add the marker + drift test. |
| M4 | **The I9 replay test is tautological** | `driverActivityReplay.test.ts` defines a local `projectUpsert()` mock and asserts that mock dedupes. It never touches the ingestor or the DB constraint, so it proves nothing about disposability. |
| M5 | **Test coverage ~7 of 13 required rows** | Missing: every-event_type fixture (would have caught C5), property tests, real integration idempotency, sweeper idempotency, page-boundary durations, "still online" rendering, E2E seeded-ride fidelity, partial-failure, permission boundary. |
| M6 | **Sweeper routed over HTTP for no reason** | See C3 — pure SQL function reached via edge function; the sibling purge job calls SQL directly and is the only one that works. |
| M7 | **`stillOpen` is dead logic** | `endBound >= toMs \|\| now < toMs` is always `true`. The expression reduces to `now < toMs`. Harmless today but obscures intent. Related: for a historical window an open session is closed at `toMs` with a concrete `seconds`, implying an end that was never observed — softly contrary to §3.3. |
| M8 | **Orphan offline on first sighting** | `v_prev` is `NULL` for an unseen driver, and `NULL IS DISTINCT FROM false` is true, so a first heartbeat with `available = false` writes an `offline` transition with no preceding `online`. Harmless to the deriver, but it pollutes the log. Guard with `v_prev IS NOT NULL OR p_available_for_rides`. |

### 15A.3 Delivery plan status

| Status | IDs |
|---|---|
| ✅ Done and verified | ACT-01, ACT-04, ACT-05, ACT-06, ACT-10, ACT-24 |
| ⚠️ Built, defective | ACT-02 (C1), ACT-07/08 (C5), ACT-09 (C2, C4), ACT-11/12 (C4), ACT-13 (M2), ACT-14 (M4, M5), ACT-15 (ok, blocked by C3), ACT-16/17 (M1), ACT-25 (M4) |
| ❌ Built but never executed | ACT-03 (C3) |
| ❌ Not built | ACT-18 (filters/URL sync), ACT-19 (backfill), ACT-20 (metrics/alerts/drift check), ACT-21 (a11y pass), ACT-22 (export), ACT-23 (admin lane) |

### 15A.4 Remediation order

Close in this order — each step makes the next one meaningful.

```
R1  C1 + C2      Revoke the six RPCs; security_invoker + revoke anon on the four views;
                 drop the unnecessary ones; revoke the direct table grant.   ← security, do first
R2  C3           Set app.settings.*; move the sweeper to a direct SQL cron call.
                 Verify: watermarks populate, presence_log starts filling.
R3  C5           Rebuild the vocabulary fixture from DISTINCT event_type; map the three
                 missing verbs; source cancelled_by from ride_requests;
                 add an unmapped_event_types metric.
R4  C4           Per-source coverage evaluation + per-lane coverage in the response;
                 UI renders "trips recorded, presence not recorded" for pre-launch windows.
R5  ACT-20       Ingest lag + zero-rows alerts and the nightly drift check —
                 so the next C3-class failure is noticed in minutes, not by audit.
R6  M1, M8, M7   Union on_job segments; guard first-sighting presence; delete dead logic.
R7  M3, M4, M5   Mirror marker + drift test (or trim); real integration tests;
                 fill the missing rows of §13.3.
R8  M2           Decide coordinates: retain-and-gate, or never-retain and delete the branch.
R9  ACT-19       Backfill, once R3 and R4 make backfilled data render honestly.
R10 ACT-18/21/22/23   Filters, a11y, export, admin lane → v1 complete.
```

**Until R1–R4 are closed, the tab must stay disabled.** R1 is a live security exposure; R4 is the
difference between a forensic tool and a machine for producing confident false narratives about a
person's working day.

> **Rev 2 outcome: R1–R8 closed and verified. R9 (backfill) and R10 (filters/a11y/export/admin lane)
> also delivered.** Detail below.

---

## 16. Implementation audit — Rev 2 (2026-09-18)

Re-audited against the working tree and the live database. Every Rev 1 finding was re-tested using
the same method that found it, so the closures are comparable rather than asserted.

### 16.1 Rev 1 findings — all closed

#### Critical

| ID | Rev 1 defect | Rev 2 verification | Status |
|---|---|---|---|
| **C1** | 6 SECURITY DEFINER RPCs anon-executable | Re-ran the privilege query: **all 8 functions now `anon_exec=false` and `authed_exec=false`**. Supabase advisor reports **0** activity/presence findings (was 12+). | ✅ **CLOSED** |
| **C2** | 4 `public.*` views anon-readable with RLS bypassed | All four now `security_invoker = true` with SELECT revoked from both `anon` and `authenticated`. The direct `fleet.driver_activity_events` table grant is also revoked — reads go only through the edge function. | ✅ **CLOSED** |
| **C3** | Both cron jobs failing every run since deploy | Last 8 runs all `succeeded`. Watermarks populated (3 lanes, advancing). Projection went 0 → **86 rows**; presence log 0 → 2. Root cause fixed properly: secrets moved out of unset `app.settings.*` into `private.fleet_ops_secrets`, and the sweeper now runs as **direct SQL** (`SELECT fleet.sweep_stale_presence(300)`) instead of an HTTP round trip — which also closes M6. | ✅ **CLOSED** |
| **C4** | Coverage unioned all sources, so "not recorded" could never render | `buildCoverageBySource` keys coverage per `service_line::source` and never unions across them. Executed against the real row set: for a 14 Sep window the presence lane returns `recorded: false` ("not recorded for the remainder of this window") while the trips lane returns `recorded: true`. Exactly the honest split. | ✅ **CLOSED** |
| **C5** | Mapper handled 12 of 113 source rows | Reconciled every source `event_type` against the projection. `offer_accepted_atomic` → `offer_accepted` (12); force actions → `admin_action` (38); offers lane now live (`offer_expired` 20, `offer_declined` 3, `offer_superseded` 2); delivery lane 8. Everything still dropped is correctly dropped — config/fare/vehicle admin events, and `fare_quoted`. | ✅ **CLOSED** |

Two C5 judgement calls are worth recording, because both diverge from my Rev 1 recommendation and
**both are better than what I suggested**:

- **`admin_ride_force_complete` → `admin_action`, not `job_completed`.** The code comments the
  reasoning: *"never job_completed — disputes must not look driver-finished."* That is the more
  honest mapping. An admin closing a stuck ride is not a driver completing a trip, and conflating
  them would have put a fabricated completion on a driver's record. The affected rows carry
  `job_ref = NULL`, so they also cannot leave an `on_job` segment hanging open.
- **`ride_cancelled_system` (11 rows) still not projected.** I flagged this as a gap; it is not. All
  11 rides had **no `assigned_driver_user_id` and no `actor_user_id`** — they were stale *matching*
  rides cancelled before any driver was attached. They correctly belong on nobody's timeline.

#### Moderate

| ID | Rev 2 verification | Status |
|---|---|---|
| **M1** | Executed the Rev 1 failing probe: fully concurrent 1h jobs now union to **3600s (was 7200s)**, utilization **25% (was 50%)**; partially overlapping jobs union to 7200s. `mergeIntervals` + on_job union in `deriveStatusSegments`. I6 re-checked — no regression. | ✅ **CLOSED** |
| **M2** | Decision made and implemented: **retain coordinates, strip at read** when the viewer lacks `drivers.location.view`. The gating branch and its audit write are now reachable, and the Later map-replay path stays open. | ✅ **CLOSED** |
| **M3** | Mirror **deleted, not synchronised**: `driverActivityModel.ts` went 417 → **30 lines** (2 types, 1 constant, 1 predicate — exactly what the client uses). No duplicated logic means no drift to test for. Better than the marker-plus-drift-test I proposed. | ✅ **CLOSED** |
| **M4** | Test is still a contract mock, but now honestly scoped and labelled. More importantly the guarantee is **empirically proven in production**: 86 rows, **0 duplicate `(source, source_event_id)` keys**, last insert 22:40 while the watermark advanced to 22:56 — ~16 overlapping runs that inserted nothing. | ✅ **CLOSED** (see residual §16.3.1) |
| **M5** | Tests **17 → 24** and, more to the point, relocated to where the logic lives: 12 Deno tests in `driver_activity_logic.test.ts` (from 4) named for the findings they lock — `C4 coverage is per-source`, `M1 … union to 3600s`, `M7 historical still-online`, `I6 page-boundary`, `vocabulary: mapped audit types never silently drop`. CI covers them via `test-supabase-functions.yml`, which runs `deno test` recursively over `supabase/functions/`. All 12 pass locally. | ✅ **CLOSED** |
| **M6** | Sweeper is now a direct SQL cron call; the HTTP dependency is gone. | ✅ **CLOSED** |
| **M7** | Dead `stillOpen` expression replaced by `windowStillCurrent = nowMs < toMs`, a real condition, with a Deno test pinning the historical-window behaviour. | ✅ **CLOSED** |
| **M8** | Orphan guard `IF (v_prev IS NOT NULL OR COALESCE(…, FALSE))` added to **both** presence functions. | ✅ **CLOSED** |

### 16.2 Remaining delivery plan items — now built

| ID | Evidence |
|---|---|
| **ACT-18** filters + URL sync | `URLSearchParams` read/write, event-type and service-line selects, cursor reset |
| **ACT-19** backfill | Projection holds events from **2026-05-27 to 2026-09-06** — historical source data was replayed, not just tailed |
| **ACT-20** observability | `unmapped_event_types` ingest metric, `/internal/activity/drift-check` route, `fleet-activity-drift-check` cron at 05:45 daily, and `docs/driver-activity-runbook.md` with a symptom→cause table |
| **ACT-21** accessibility | `role="list"`/`"listitem"`, `aria-expanded` + `aria-controls` on clusters, accessible names of the exact specified form (*"…at 11:28 AM EST, 33 minutes after the previous event"*), `timeZoneName: 'short'` on **every** rendered time, and distinct dot **shapes** (`rounded-full` vs `rounded-none`) so status is not colour-only |
| **ACT-22** export | `Export CSV` with pending state, server route, audited |
| **ACT-23** admin lane | `admin_action` label, filter option, and dedicated rendering |
| **Flag gating** | `driver_activity` is **opt-in** — `isModuleEnabled` requires `=== true`, so it defaults off; the trigger and content are both conditional, so the tab is hidden rather than disabled |

### 16.2b N1 — pilot flag not scoped to the pilot org — ✅ CLOSED

**Found in Rev 2.** Severity was blocking for GA (not a data-integrity defect).

§15 stated intent to enable only org `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`, but the KV record had
`enabled: true` and `/platform-feature-flags` called `isFeatureEnabled` **without an org id**. With
no org, `evaluateFlag` skips the allowlist and returns the global `enabled` bit — so every org saw
the tab.

**Fix applied 2026-09-18 (both halves):**

1. KV: `enabled: false`, keep `enabledForOrgs: [pilot]` — allowlist is the only gate.
2. Public `/platform-feature-flags`: always returns `driver_activity: false` (no org on that path).
3. Logged-in path: `/enterprise/me/modules` sets `effectiveModules.driver_activity` via
   `isFeatureEnabled(FEATURE_FLAGS.DRIVER_ACTIVITY, orgId)`.

**Verify:** non-pilot org → tab absent from `TabsList`; pilot org → tab present; activity API still
org-gated the same way.

### 16.3 Residuals — none blocking

1. **Replay-test docstring (was overclaiming).** Comment corrected 2026-09-18: contract mock only;
   disposability proven by DB unique key + live overlapping cron inserts (0 duplicates). Optional:
   add truncate-and-replay integration later (proof #5).
2. **The drift check has never run on schedule.** Manual invoke succeeded (structured result).
   First scheduled green run still pending at 05:45 UTC — watch tomorrow (proof #6).
3. **Location gating is live but unexercised.** 0 of ingested rows carry coordinates so far.
   Needs a delivery event with `location_lat`/`location_lng` (proof #8).
4. **ACT-02's live write path is deployed but unproven.** Presence rows so far are sweeper-written;
   confirm one real app online→offline `app_toggle` (proof / residual 4).
5. **Performance is unmeasured.** Row counts prove correctness, not p95 < 400ms (proof #10).

### 16.4 Verdict and next steps

The Rev 1 blockers are gone. **N1 is closed.** What remains is **soak and proof work, not defects** —
every open item is "this has not been observed yet," not "this is wrong."

```
1. ~~FIRST: close N1~~ ✅ done — allowlist-only + public shell false + me/modules orgId
2. Tomorrow: confirm the first scheduled drift-check run is green (residual 2).
3. Have one driver toggle online→offline in the app; confirm an app_toggle
   row lands and the timeline renders the session (residual 4).
4. Confirm a delivery event with coords exercises the location gate and
   writes an audit row (residual 3).
5. Optional: real truncate-and-replay integration test (residual 1).
6. Seed production-scale data and measure p95 (residual 5).
7. Then, and only then, widen the allowlist to general availability
   (set enabled:true OR add orgs to enabledForOrgs).
```

**Do not skip step 3.** Presence history is still the one thing in this system that cannot be
recovered after the fact, and its live write path is the only part of the pipeline that has never
run for real.
