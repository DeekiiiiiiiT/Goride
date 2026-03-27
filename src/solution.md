# Fuel GPS matching: geofence enforcement & review workflows

This document breaks implementation into **phases**. **Do not start a phase until the product owner confirms** to proceed. After each phase is complete, **wait for explicit approval** before moving to the next phase.

---

## Scope summary

| Problem | Desired behavior |
|--------|-------------------|
| Log GPS is **outside** a verified station’s **`geofenceRadius`** but still inside the global smart-match window (~600m) | **Do not** auto-link to that verified station; treat as **no verified match** → **Learnt (STAGING)** for admin. |
| **Two (or more) verified stations** close together; matcher cannot pick safely | **Do not** guess; route to a **dedicated admin “review” queue** (new tab or equivalent) until an admin assigns the correct station. |
| Forensic / display consistency | Use **`geofenceRadius`** (and optional GPS accuracy) consistently with super-admin **Regional Efficiency** settings. |

---

## Phase 1 — Core matcher: per-station geofence acceptance

**Goal:** Single source of truth in `findMatchingStationSmart` (and any shared helper): a station is only an acceptable **verified** match if distance to that station (primary + aliases) is within **`geofenceRadius + GPS accuracy buffer`**.

### Steps

1. **Inventory current behavior**
   - Open `src/supabase/functions/server/geo_matcher.ts`.
   - Document in comments (brief) the three outcomes: single candidate, multiple candidates (ambiguity rules), zero candidates.
   - Confirm default `maxRadiusMeters` (600) remains the **search radius** for *who enters the candidate pool*, not the **acceptance** threshold.

2. **Define acceptance rule (precise)**
   - For a candidate station with resolved distance `d` (shortest to primary or alias):
     - Let `R = station.geofenceRadius ?? <project default, e.g. 150>` to match existing `StationProfile` / KV data.
     - Let `A = gpsAccuracy` passed into `findMatchingStationSmart` (meters; 0 if unknown).
     - **Accept** this candidate as a possible match only if `d <= R + A`.
   - Decide policy when **`geofenceRadius` is missing**: use same default as duplicate-check / admin UI (`getDefaultGeofenceRadius` pattern) — **record the decision in code comments**.

3. **Apply acceptance after candidate ordering, not only in multi-station branch**
   - After building the sorted candidate list within `maxRadiusMeters + A`:
     - **Filter** or **re-evaluate** each candidate: drop any where `d > R + A` for *that* station (per-station `R`).
   - **Single-candidate path:** If the only candidate within 600m is **outside** its own `R + A`, treat as **no station** (`confidence: 'none'`), not `high`.
   - **Multi-candidate path:** Re-run ambiguity logic **only on candidates that pass** their own `R + A`. If none pass, result is `none` (or a new explicit confidence — see step 5).

4. **Ambiguity vs “outside geofence”**
   - If **two+** stations are within **600m** but **all** are outside their respective `R + A`:
     - Prefer returning **`none`** → Learnt funnel, **unless** product requires “ambiguous” for UI — **confirm with PO**.
   - If **two+** pass their geofence but distances are “too similar” (existing ratio logic), keep **`ambiguous`** → review workflow (Phase 4).

5. **Optional: explicit `confidence` value**
   - If useful for logging/UI, add e.g. `'outside_geofence'` instead of collapsing to `'none'`, but **only if** all call sites handle it (otherwise stick to `'none'` to minimize churn).

6. **Logging**
   - Add structured `console.log` when rejecting due to geofence: station id, name, `d`, `R`, `A`.

7. **Local verification (no deploy)**
   - Manually trace: 442m vs 75m → must **not** return `high` for that station.
   - Trace: 50m vs 75m → **high** (sole candidate).
   - Trace: two stations both inside 600m, one at 40m (inside 75m) one at 200m (outside 200m geofence) — closest valid wins per existing ambiguity rules.

**Exit criteria:** `geo_matcher.ts` behavior matches the table in “Scope summary” for geofence; unit tests added if the project has a test runner for this file (optional sub-step).

**Phase 1 implementation (done):**

- `findMatchingStationSmart` first collects stations within **search radius** `maxRadiusMeters + gpsAccuracy` (unchanged default 600m + A).
- Each candidate is **accepted** only if `distance <= (station.geofenceRadius ?? 150) + gpsAccuracy`.
- Rejections log: `[SmartMatch] Geofence reject: id=… name=… d=… R=… A=…`.
- If no station passes acceptance → `confidence: 'none'`, `distance` = closest **search-radius** distance (for audit), `candidatesInRange: 0`.
- Ambiguity rules (3a/3b/3c) run on the **accepted** list only; per solution doc, if multiple stations are in search radius but **none** pass geofence → **none** (Learnt), not ambiguous.

---

## Phase 2 — Wire matcher outputs through all server paths

**Goal:** Every code path that calls `findMatchingStationSmart` (or duplicates its logic) produces consistent metadata and correct **Learnt** vs **ambiguous** vs **verified** outcomes.

### Steps

1. **`fuel_controller.tsx` — fuel entry POST**
   - Locate the block that calls `findMatchingStationSmart(..., 600, 0)`.
   - Confirm: when result is `none`, existing branch creates **Learnt** and sets `verificationMethod: 'none'` / `locationStatus: 'unknown'` as today — **no duplicate** Learnt records (guard if entry already has `learnt_location` key).
   - Pass **GPS accuracy** from `extractEntryCoords` / `entry.metadata` if available instead of hardcoded `0` (align with Phase 1 `A`).
   - Re-read **ambiguous** branch: ensure it still sets `review_required` and does not create Learnt **unless** product wants both — **default: ambiguous → review only, not Learnt**.

2. **`fuel_controller.tsx` — orphan reconcile (`/admin/reconcile-ledger-orphans`)**
   - Same matcher call: after Phase 1, entries **outside** geofence should **not** be backfilled to verified.
   - Confirm counters (`skippedNoMatch`, etc.) still make sense; add `skippedOutsideGeofence` log if helpful.

3. **`index.tsx` — financial / AI fuel transaction path**
   - Locate `findMatchingStationSmart` with `600` and `locationMetadata.accuracy`.
   - Align: verified link only when matcher returns acceptable match **and** Phase 1 rules satisfied (inherited automatically if only matcher changes).
   - When `none`: existing **Learnt location** creation — verify idempotency if transaction is retried.

4. **Manual station picker override**
   - Confirm **manual** verified selection still bypasses GPS (existing `skipGpsMatching`) — **do not** break admin/driver explicit picks.

5. **Grep for other callers**
   - Search repo for `findMatchingStationSmart`, `findMatchingStation(`, and any hardcoded `600` proximity for fuel — list each file and either align or document exception (e.g. analytics-only).

**Exit criteria:** Grep clean; manual smoke: submit fuel with coords outside 75m of nearest verified → **Learnt** created; inside → verified link.

**Phase 2 implementation (done):**

- **`extractEntryGpsAccuracyMeters(entry)`** in `fuel_controller.tsx` — reads accuracy from `geofenceMetadata`, `metadata.geofenceMetadata`, `metadata.locationMetadata`, `locationMetadata`; caps at 500m; used for `findMatchingStationSmart(..., 600, gpsAccuracyM)` on **fuel POST** and **orphan reconcile**.
- **Fuel POST — ambiguous:** Always sets `review_required` / `gps_ambiguous` / `matchDistance` / `ambiguityReason`; optional `matchedStationId` only if matcher ever returns a station (currently `null` for ambiguous). **No Learnt** on ambiguous.
- **Fuel POST — no match:** **`metadata.learntLocationId`** set on create; **reuses** existing Learnt KV id on retry if `learntLocationId` already present (no duplicate `learnt_location:*` rows).
- **Reconcile:** New counter **`skippedOutsideGeofence`** when `confidence === 'none'` and `distance` is finite (search radius hit but geofence rejected); **`skippedNoMatch`** when no station in search radius (`distance` Infinity). Response JSON includes `skippedOutsideGeofence`.
- **`index.tsx` (fuel transactions):** `locationMetadata.accuracy` was already passed to matcher; **Learnt idempotency** via `metadata.learntLocationId` (same pattern as fuel POST); **`metadata` guard** on ambiguous / no-match branches; **`matchDistance`** on ambiguous.
- **`findMatchingStationSmart` callers:** Only `fuel_controller.tsx` (2) and `index.tsx` (1) — **no code changes** elsewhere required for Phase 2.

---

## Phase 3 — Forensic verification & audit scoring alignment

**Goal:** Server-side “forensic” distance checks and any **audit confidence** logic use **`geofenceRadius`** consistently with Phase 1, avoiding `location.radius` / wrong defaults where that contradicts super-admin settings.

### Steps

1. **`fuel_controller.tsx` — Phase 5 forensic block**
   - Find `radiusThreshold = matchedStationForVerification.location?.radius || 100`.
   - Replace with **`geofenceRadius`** (and same default policy as Phase 1). Optionally keep `location.radius` as legacy fallback **only if** data migration proves some stations only have `location.radius`.

2. **`fuel_logic` / confidence score**
   - Search `calculateConfidenceScore` and related for distance thresholds; align with `geofenceRadius` or document why a different metric is used (e.g. scoring vs gating).

3. **KV / station schema**
   - Verify persisted stations from super-admin include `geofenceRadius` on the object used at runtime; if some old records lack it, defaults must match Phase 1.

**Exit criteria:** Forensic flags (`isSpoofingRisk`, etc.) use the same radius concept as matching; no contradictory 100m default unless documented.

**Phase 3 implementation (done):**

- **`fuel_controller.tsx` — POST forensic block:** `radiusThreshold = geofenceRadius ?? location.radius ?? 150` (matches `geo_matcher` / Regional Efficiency; legacy `location.radius` when `geofenceRadius` absent).
- **`fuel_controller.tsx` — `/admin/verify-record-forensics`:** Drift plausibility uses `metadata.radiusUsed` then station **`geofenceRadius`**, then **`location.radius`**, then **150** (replaces bare `|| 100`).
- **`fuel_logic.ts` — `calculateConfidenceScore`:** GPS proximity bonus uses **`min(50, R × 0.5)`** with **`R = station.geofenceRadius ?? 150`** instead of a fixed **50m** threshold (scales with tight vs loose stations).

---

## Phase 4 — Admin UI: “Spatial review” (or similar) for ambiguous proximity

**Goal:** Verified stations **close together** → entries that are **`ambiguous`** / **`review_required`** appear in a **dedicated Station Database tab** (or sub-view) so admins resolve **which station** applies, without mixing with **Learnt** unknown locations.

### Steps

1. **Product naming**
   - Finalize tab label: e.g. **“Spatial review”**, **“Ambiguous GPS”**, **“Proximity review”** — avoid generic **“Review”** if it conflicts with other admin queues.

2. **Data source**
   - List what to show: fuel entries / transactions with `metadata.locationStatus === 'review_required'` and `verificationMethod` in `gps_ambiguous`, … (complete enum from codebase).
   - Decide pagination, filters (date, vehicle, driver), and actions: **assign to station A**, **assign to station B**, **send to Learnt**, **merge**.

3. **API**
   - If no endpoint exists: add GET (scoped, admin) that queries `fuel_entry:` / `transaction:` prefixes with review flags — **or** reuse existing Fuel Audit dashboard API with a dedicated filter. Prefer **one** list endpoint to avoid drift.

4. **UI implementation**
   - Add tab to Station Database shell (same pattern as **Learnt (STAGING)**).
   - Reuse table/card components from Fuel Audit if possible for consistency.
   - Empty state copy explaining difference vs **Learnt**.

5. **Permissions**
   - Restrict to super-admin or same role as other Station Database tabs.

6. **Out of scope for this phase (unless PO insists)**
   - Full merge/promote flows may already exist on Fuel Audit — **link** or **embed** instead of duplicating.

**Exit criteria:** Ambiguous matches are visible and actionable in the new tab; Learnt tab still only for true unknown-location funnel.

**Phase 4 implementation (done):**

- **`GET /make-server-37f42386/admin/spatial-review-queue`** — Loads `fuel_entry:` and `transaction:` (Fuel / Fuel Reimbursement only), filters **`locationStatus === 'review_required'`** and **`verificationMethod === 'gps_ambiguous'`**, returns `{ items, count }` sorted by date desc.
- **`POST .../admin/bulk-assign-station`** — Resolves **`fuel_entry:{id}`** first, then **`transaction:{id}`** for the same id; rejects non-fuel transactions; clears **`metadata.ambiguityReason`** on assign; idempotency checks top-level and **`metadata.matchedStationId`**.
- **UI:** **`SpatialReviewTab`** — Table + empty state (explains difference vs Learnt), **Assign station** dialog with verified-station **Select**, calls **`api.bulkAssignStation`**.
- **Station Database** — New tab **Spatial review** (badge **GPS**) after **Learnt (STAGING)**.

---

## Phase 5 — Client consistency & copy

**Goal:** Dashboards and analytics do not **re-bridge** fuel logs to verified stations using a **600m** rule alone; tooltips and labels match backend behavior.

### Steps

1. **`GasStationAnalytics.tsx` (and similar)**
   - Replace or gate “closest within 600m” logic so it respects **master station geofence** or **defers** to server-side `matchedStationId`.

2. **`FuelLogTable.tsx` / transaction logs**
   - Tooltip text for “Verified Station” / `gps_smart_matching` should mention **distance vs geofence** when relevant, or “pending review” for ambiguous.

3. **i18n / strings**
   - Centralize new strings if the project uses a message catalog.

**Exit criteria:** UI does not show a log as “verified at 442m” for a 75m station after Phases 1–2 are live (unless manual override).

**Phase 5 implementation (done):**

- **`GasStationAnalytics.tsx`:** Removed flat **600m** client bridge. Offline bridge uses **`shortestDistanceMeters`** (primary + **`gpsAliases`**) and accepts only when **`d ≤ geofenceRadius (default 150) + GPS accuracy`** from log metadata — aligned with server matching. Bridge metadata: **`bridgeSource: 'gps_proximity_geofence'`**.
- **`FuelLogTable.tsx`:** Verified tooltip — **“GPS offset from station anchor”** (not “Accuracy”), optional **reference radius** when **`metadata.radiusUsed`** exists; verification method uses **`replace(/_/g, ' ')`**. Ambiguous review tooltip — **distance** copy + pointer to **Station Database → Spatial review (GPS)**. Unknown-location tooltip — clarifies **Learnt (STAGING)** vs waiting for server match.

---

## Phase 6 — QA, rollout, and regression checklist

**Goal:** Safe deploy with repeatable tests, monitoring, and a clear rollback story.

### Pre-deploy

- [ ] Deploy **Supabase Edge** (or your host) so **`fuel_controller`** / **`geo_matcher`** changes are live.
- [ ] Deploy **frontend** so Phase 4–5 UI (Spatial review tab, analytics, tooltips) is live.
- [ ] Confirm **staging** (or a test org) has at least one **verified** station with a **known `geofenceRadius`** (e.g. 75m) and GPS test coordinates **inside** and **outside** that radius.

### Regression matrix (record pass/fail + notes)

| # | Scenario | Expected | Pass |
|---|----------|----------|------|
| 1 | GPS **inside** station `geofenceRadius` (+ accuracy), single nearby verified station | `findMatchingStationSmart` → **high/medium**; fuel entry **verified** or correct handshake | |
| 2 | GPS **outside** geofence but **within ~600m** of only one verified station | **No** auto-link to verified; **Learnt** (or `locationStatus` per no-match path); **`[SmartMatch] Geofence reject`** in logs | |
| 3 | Two verified stations **close together**, distances ambiguous | **`gps_ambiguous`**; **Spatial review** tab lists row; **no** Learnt for this case alone | |
| 4 | **Manual** station picker (verified) on fuel entry | Skips GPS; **`manual_admin_override`** / picker path; no false Learnt | |
| 5 | **No GPS** on fuel entry | Gate / **Learnt** path unchanged; no crash | |
| 6 | **Retry** same fuel save after Learnt id created | **Same** `learntLocationId` (no duplicate learnt rows) | |
| 7 | **`POST /admin/reconcile-ledger-orphans`** on mixed orphans | `skippedOutsideGeofence` increments when in-range but outside geofence; matches only when inside acceptance | |
| 8 | **Spatial review** → **Assign station** | Entry updates; **`ambiguityReason`** cleared; verified metadata | |
| 9 | **GasStationAnalytics** for unresolved log | No **600m** phantom bridge; bridge only if within **geofence + accuracy** | |
| 10 | **FuelLogTable** tooltips | Verified shows **offset** + optional **radiusUsed**; ambiguous points to **Spatial review** | |

### Monitoring (first 48h after prod)

- Search logs for **`[SmartMatch]`**, **`Geofence reject`**, **`SpatialReviewQueue`**.
- Watch **Learnt** count: a **step change** is expected if many old logs were wrongly auto-verified (now correctly unlinked).
- Watch **Spatial review** queue depth; should drain as admins assign.

### Rollback

1. Revert the deployment commit(s) (server + client) or redeploy previous build.
2. **Data:** Entries already saved with new metadata (e.g. `learntLocationId`, `manual_bulk_assign`) are **not** auto-reverted — plan a **one-time reconcile** only if business requires re-linking old rows (out of scope unless requested).

### Sign-off

- [ ] Product owner accepts test matrix results for staging (or prod smoke).
- [ ] No open **P0** issues on matching, Learnt, or Spatial review.

**Phase 6 status:** Checklist ready — fill **Pass** column and checkboxes when QA is complete.

---

## Execution order & approvals

| Phase | Depends on | Requires PO confirmation before starting |
|-------|------------|------------------------------------------|
| 1 | — | Yes |
| 2 | 1 | Yes |
| 3 | 1–2 (matcher stable) | Yes |
| 4 | 1–2 (flags stable) | Yes |
| 5 | 1–2 (ideally 3) | Yes |
| 6 | All planned dev complete | Yes |

**Current status:** **Phases 1–6 documented.** **Phase 6** = run the checklist above and sign off when done (no further code required for this phase unless QA finds bugs).
