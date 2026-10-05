# Tag Inventory + Low Balance Tags — Root Cause & Enterprise Audit

| Rev | Date | What changed |
|---|---|---|
| 1 | 2026-10-05 | Root cause found (client calls `fleet-toll`, routes lived in `fleet-core`), plus enterprise review. Audit only. |
| **2** | **2026-10-05** | **Verification of the remediation in the working tree.** Code, tests, CI scripts and production DB checked. Status per finding in §0 and §4. |

**Scope:** `apps/fleet` → Fleet Operations → *Tag Inventory* and *Low balance tags*, plus every caller of `toll-tags`, `toll-plazas` and `toll-info`. **Mode:** audit only, no code changed by this review.

Related: [`tag-inventory-audit.md`](./tag-inventory-audit.md) (Tag *Detail* page, Aug 2026).

---

## 0. Rev 2 verdict

**The code work is good and mostly complete, but the outage is not fixed in production yet.** The database migration is live. The `fleet-toll` edge function that serves the new routes **was never redeployed**, so the browser still gets 404.

### Blockers (must do before calling this closed)

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| **R1** | 🔴 | **`fleet-toll` is not deployed with the new controller.** The deployed bundle (v24, deployed 2026-10-05 04:02 UTC) contains none of `toll_inventory_controller`, `toll-tags/low-balance`, `fleet_assign_toll_tag` or `topup-requested`. The last production requests (21:54 UTC) were still 404. `localhost:3000` calls the production functions, so the screenshots will keep failing. | `list_edge_functions` → fleet-toll `updated_at` 04:02 UTC; marker search of the deployed source = 0 hits | Deploy **`fleet-toll` and `fleet-core` together**. `fleet-core` drops the old routes; deploying only that one would turn the remaining fallback into 404s. Then run §6. |
| **R2** | 🟠 | **The Admin app now gets 401 on plazas and tags, silently.** `apps/admin` (and `apps/driver`) still send `Authorization: Bearer ${publicAnonKey}`. The new controller runs `requireAuth({ strict: true })`, which rejects the anon key (the old monolith route used non-strict `requireAuth()`). Admin **Toll Settings** (`TollSettingsPage.tsx:71`) and **Toll Live Monitor** (`TollLiveMonitorPage.tsx:71`) wrap the call in `.catch(() => [])`, so they render an empty plaza list with no error. Admin data export and restore of tags also fail. The new route-contract check passes because it checks paths, not auth. | `apps/admin/src/services/api.ts:846, 1540`; `rbac_middleware.ts:443-455` | Send the user session JWT (`requireAuthHeaders`, as the fleet app does) for all toll calls in admin and driver. Replace the `.catch(() => [])` with a visible "plazas unavailable" state, as done in fleet `useTollLogs`. |
| **R3** | 🟡 | **17 new `deno check` errors in `toll_inventory_controller.tsx`.** `presentTag()` spreads `tag` but its return type drops the original fields, so `tag.status`, `tag.id`, `tag.tagNumber` and similar are `TS2339` in the low-balance handler (lines 168-194, 334-409, 554). Runtime is unaffected (the Supabase bundler doesn't type-check), but it adds to the debt and would fail a `deno check` gate. | `deno check supabase/functions/fleet-toll/src/main.ts` → 61 errors, 17 in this file, all new | Type `presentTag`'s parameter as `Record<string, unknown>` and return `Record<string, unknown> & {…}`, or define a `TollTagRecord` type. Add the controller to the `deno check` list in `ci.yml:124`. |

### What was verified as correct

| Area | Result |
|---|---|
| Root-cause fix (Option B) | ✅ Routes moved into `toll_inventory_controller.tsx`, mounted in `fleet-toll/src/main.ts`, removed from `register_residual_monolith_routes.tsx`. Route lists regenerated (`fleet-toll` 81→98, `fleet-core` 581→567). |
| CI guard (P1) | ✅ `scripts/check-client-route-contract.mjs` in `ci.yml`. **It would have caught the original bug:** run against the pre-fix client files it fails with **41 misrouted calls**, including every `toll-tags`, `toll-plazas` and `toll-info` call in fleet, admin and driver. It passes on the current tree. |
| Other CI scripts | ✅ `edge-route-manifest --all --check`, `check-edge-manifest-overlap` (0 collisions), `check-toll-org-scope` all pass. |
| Tests | ✅ `toll_route_auth.test.ts` 6/6 (new mutating routes added to the inventory and forced through `toll.manage`), fleet toll tests 15/15 (incl. new `tollLoadFailure.test.tsx`), `toll-core/tollTagWrite.test.ts` 4/4. |
| Fleet `tsc` | ✅ No new errors in any touched toll file. Total is 504 against the recorded 500 baseline; the +4 come from other uncommitted work (the `api.ts:4755` error is fuel code, and the `useTollLogs.ts:43` error predates this change). |
| Migration in production | ✅ `20261005180000_toll_tag_inventory_hardening` is applied: 5 RPCs, `fleet.toll_tag_assignments` with both no-overlap exclusion constraints, unique `(organization_id, lower(tag_number))` index, `fleet-toll-low-balance` cron job. |
| Balance correctness (B1) | ✅ Verified on real data for tag `212100286450`: top-ups **J$25,000** − tag usage **J$23,030** = **J$1,970**, matching the server RPC. The 200+ cash tolls on the same vehicle are correctly excluded. The old J$550 figure was just a stale browser cache. Tag, vehicle and assignment rows agree (`vehicle_id = 5179KZ`, 1 open assignment window). |
| Error states (F1–F3) | ✅ Both pages show a `TollLoadError` panel with Retry; KPIs show "—" on failure; the all-clear text only renders after a successful load. Errors keep status, server message and request ID (`X-Request-Id` is in `CORS_EXPOSE_HEADERS`, so the browser can read it). |
| Security (S1–S6) | ✅ Org checks on every tag/plaza write (`belongsToOrgStrict`), field allow-list (`packages/toll-core/src/tollTagWrite.ts`), client ID honoured only for new records, soft retire with reason + audit log + "unassign first" rule, `toll.view` on reads, SQL-side org filter, concurrency token required on PATCH/DELETE/top-up-requested. |

---

## 1. Root cause (Rev 1, unchanged)

The client called `GET /functions/v1/fleet-toll/toll-tags`, but `fleet-toll` had no `toll-tags` route; it only existed in the residual monolith (`fleet-core`). Hono returned 404, `getTollTags()` threw, and both pages toasted.

- **How:** commit `2515c995` (F4 extraction, 2026-09-16) changed `${API_ENDPOINTS.fuel}/toll-tags|toll-plazas|toll-info` to `${API_ENDPOINTS.toll}/…` in fleet, admin and driver without moving the routes. Before F4 every endpoint key pointed at the monolith, so it worked.
- **Seen and waved through:** `docs/fleet-domain-extraction-completion.md:101` (D9, closed 2026-09-17): *"`/toll-tags` 404 noted, non-CORS"*.
- **Why CI missed it:** only server-vs-server overlap was checked; nothing checked that a client URL resolves on the slug it targets. **Closed in Rev 2** by the route-contract check.
- **Production evidence (Rev 1):** `fleet-toll/toll-tags` 404 ×3, `/toll-plazas` 404 ×3, `/toll-info` 404 ×1. **Still 404 as of Rev 2** (see R1).

---

## 2. Blast radius (Rev 1) and Rev 2 status

| Route family | Fleet callers | Rev 2 |
|---|---|---|
| `toll-tags` | Tag Inventory, Low balance, Assign, Bulk import, Tag Detail threshold, VehicleDetail, exports, Delete Center | Code fixed; live after R1 |
| `toll-plazas` | `useTollLogs` (now shows `plazasUnavailable` instead of silently `[]`), plaza CRUD, exports | Code fixed; live after R1 |
| `toll-info` | Toll class picker, Toll Analytics, Rate Drift | Code fixed; live after R1 |
| Admin / Driver apps | `TollSettingsPage`, `TollLiveMonitorPage`, data export/restore | ❌ **Still broken**: 404 → 401 after R1 (see R2) |

---

## 3. Fix chosen

Option B (finish the extraction into `fleet-toll`) was implemented together with the security and data-model hardening, which is the better long-term choice. The only missing step is deploying it (R1).

---

## 4. Findings — status after Rev 2

Legend: ✅ closed and verified · ⚠️ closed with a residual note · ❌ open

### Failure handling

| # | Finding | Status | Notes |
|---|---|---|---|
| F1 | Low-balance page showed an all-clear on load failure | ✅ | `TollLowBalanceQueue.tsx:220-230` error panel; KPIs "—"; covered by `tollLoadFailure.test.tsx` |
| F2 | Tag Inventory showed "No tags found" on failure | ✅ | `loadError` state plus `TollLoadError` |
| F3 | Client threw away status, body and request ID | ✅ | `services/tollApiError.ts`; toast shows `(ref <request id>)` |
| F4 | Silent fallbacks elsewhere | ⚠️ | Fixed in fleet `useTollLogs` (`plazasUnavailable`). **Still silent in admin** `TollSettingsPage` / `TollLiveMonitorPage` (part of R2). |

### Balance correctness

| # | Finding | Status | Notes |
|---|---|---|---|
| B1 | Balance was a browser cache, refreshed on view only | ✅ | `fleet.toll_tag_balance_rows` RPC; `GET /toll-tags` returns the ledger balance; `kv.set` on `toll_ledger:*` refreshes the tag; daily cron backfills. Tag Detail no longer writes `lastCalculatedBalance` or `tollBalance` on view. Verified on real data (J$1,970). |
| B2 | Missing balance counted as J$0 / "Empty" | ✅ | New `unknown` ring, KPI tile and badge |
| B3 | Two different "low" rules | ✅ | `classifyTagBalance` / `isLowBalance` / `resolveLowBalanceThreshold` in `tollTagBurnRate.ts`, used by List, Inventory counts and server (same `<=0 / <t / <2t` bands) |
| B4 | J$500 hardcoded, no fleet default | ⚠️ | Server and cron resolve tag → org `tollLowBalanceDefaultJmd` → 500. **Residuals:** (a) no UI sets `tollLowBalanceDefaultJmd` (only read, in `register_fleet_bank_routes.ts` / controller / migration), so the org default is unreachable; (b) Tag Detail calls `resolveLowBalanceThreshold(tag.lowBalanceThreshold)` without `resolvedLowBalanceThreshold` (`TollTagDetail.tsx:82`), so its alert can disagree with the list once an org default exists. |
| B5 | "Days to empty" was dead code | ✅ | Computed server-side from usage span; "Days left" and "Trips left" columns; queue sorted by days-to-empty |
| B6 | Pull-only, no alerting or action | ✅ | `fleet-toll-low-balance` cron (11:15 UTC daily) writes `alert:toll-low:*`; "Record top-up" and "Mark requested" inline; alert clears when topped up |

### Security & tenant isolation

| # | Finding | Status | Notes |
|---|---|---|---|
| S1 | DELETE had no org check; hard delete | ✅ | `fleet_retire_toll_tag` RPC: org check, `stale_write`, refuses while assigned, soft `Retired` with reason, `logAdminAction` |
| S2 | POST upsert allowed cross-org takeover | ✅ | POST is create-only (409 if the ID exists); edits go through `PATCH /:id` with an org check |
| S3 | Mass assignment | ✅ | Allow-list: provider, tagNumber, status (not Retired), dateAdded, lowBalanceThreshold, notes |
| S4 | No validation or uniqueness | ✅ | Validation plus a unique partial index in production. Duplicate check also in app code. |
| S5 | Legacy org filter, no read permission, in-memory filter | ✅ | `toll.view`, SQL org filter, strict org match, cursor paging (200/page) |
| S6 | Concurrency opt-in | ⚠️ | Required on PATCH, DELETE and top-up-requested. **Residual:** PATCH and top-up-requested compare `updatedAt` in app code, then `kv.set`, which is not an atomic compare-and-set, so two simultaneous saves can both pass. Low risk at current volume; move into an RPC like retire if it matters. |

### Data model / architecture

| # | Finding | Status | Notes |
|---|---|---|---|
| D1 | `fleet.toll_tags.vehicle_id` always NULL | ✅ | Mapper fixed (`fleet_domains.ts:232`) and backfilled; production row shows `5179KZ` |
| D2 | "Atomic" assign was 4 KV writes | ✅ | `fleet_assign_toll_tag` / `fleet_unassign_toll_tag`: one transaction, `FOR UPDATE` locks |
| D3 | Assignment history only in JSON | ✅ | `fleet.toll_tag_assignments` with tag and vehicle no-overlap exclusion constraints, backfilled |
| D4 | Low-balance computed client-side from the full list | ✅ | `GET /toll-tags/low-balance` |

### Process

| # | Finding | Status | Notes |
|---|---|---|---|
| P1 | No client→server route contract | ✅ | Proven to catch the original bug (41 failures on the pre-fix code). **Gap:** path-only, so it cannot catch R2 (right path, wrong auth). |
| P2 | Close-out passes checked CORS only | ❌ | Process item, nothing changed in repo. Make "any 4xx/5xx on a page's primary load fails the pass" part of the checklist. R1 is the same pattern: code done, not deployed. |
| P3 | No error-state tests | ✅ | `tollLoadFailure.test.tsx` |

### UX

| # | Finding | Status |
|---|---|---|
| U1 | KPI filters, search, provider filter, export | ✅ Low balance page. Tag Inventory has search and provider filter. |
| U2 | Inventory counts summary | ✅ |
| U3 | Last refreshed and Refresh feedback | ✅ |
| U4 | Bulk import had no button | ✅ `TagInventory.tsx:256` |
| U5 | `window.confirm` on unassign | ✅ dialog |

### New observations (Rev 2, non-blocking)

| # | Sev | Finding | Where | Suggestion |
|---|---|---|---|---|
| N1 | 🟡 | **The ledger-write balance hook recomputes the whole org on every toll row.** `kv.set("toll_ledger:*")` → `refreshTagBalanceForLedgerWrite` → `fleet_toll_tag_balance_rows(org)` (aggregates every tag's ledger) → picks one row. A 500-row import means 500 full-org aggregations, awaited inside each `kv.set`. `kv.mset` doesn't run the hook, so batched writes rely on the daily cron instead. | `kv_store.tsx:95-102`, `toll_tag_balance.ts:13` | Add a `p_tag_id` filter to the RPC, or debounce per tag. Make sure bulk imports trigger one refresh at the end. |
| N2 | 🟡 | **`GET /toll-tags/low-balance` repeats work.** It pages through `listTags` (each page re-runs the balance RPC and org-settings lookup), then runs the balance RPC again. With 1 tag that's fine; at 10 pages it's 11 full aggregations per load. | `toll_inventory_controller.tsx:155-166` | Compute balances once and pass them into the paging loop. |
| N3 | 🔵 | **The "Open" button in Low balance refetches every tag** to find one. | `TollLowBalanceQueue.tsx:277` | Add `GET /toll-tags/:id`, or include the record in the queue item. |
| N4 | 🔵 | **Bulk import is case-sensitive on status.** A CSV with `active` now gets a 400 from the allow-list, where it used to be accepted. | `BulkImportTagsModal.tsx:62`, `tollTagWrite.ts:64` | Normalise case on the client before saving. |
| N5 | 🔵 | **Duplicate-number check uses `ilike` with the raw tag number.** A `%` or `_` in the input acts as a wildcard. The unique index is the real guard, so this only affects which error message appears. | `toll_inventory_controller.tsx:243, 292` | Use `eq` on `lower(tag_number)`. |

---

## 5. What's left, in order

1. **R1 — deploy `fleet-toll` and `fleet-core` together**, then run §6. Until then, nothing in the UI is fixed.
2. **R2 — switch admin and driver toll calls to the session JWT**, and remove the silent `.catch(() => [])` on the two admin plaza pages.
3. **R3 — fix the `presentTag` typing** and add the controller to the `deno check` list in CI.
4. B4 residuals: a setting for `tollLowBalanceDefaultJmd`, and pass `resolvedLowBalanceThreshold` into Tag Detail.
5. N1 and N2 performance, before the fleet has many tags or large toll imports.
6. P2: update the close-out checklist.
7. Commit. Everything above is uncommitted in the working tree, mixed with unrelated fuel and Rush changes. Commit the toll work as its own change so it can be reverted on its own.

---

## 6. Verification after deploy

```sql
-- Supabase logs (project csfllzzastacofsvcdsc): expect 200s, zero 404/401
select log_attributes['request.url'] url, log_attributes['response.status_code'] status, count(*)
from logs where source='function_edge_logs'
  and (log_attributes['request.url'] like '%toll-tags%'
    or log_attributes['request.url'] like '%toll-plazas%'
    or log_attributes['request.url'] like '%toll-info%')
group by 1,2;
```

- **Tag Inventory:** lists `212100286450 · T-Tag · Active · 5179KZ` with balance **J$1,970**.
- **Low balance:** Needs attention **0**. J$1,970 is above 2 × J$500, so the tag is "healthy" and correctly not queued.
- **Failure path:** block `fleet-toll` in DevTools. Both pages must show the error panel with Retry and a `ref` ID, never "No tags found" or the all-clear text.
- **Admin:** after R2, Toll Settings and Toll Live Monitor show plazas.
- **Write path:** assign → unassign → retire one test tag. Expect one row per window in `fleet.toll_tag_assignments`, the vehicle's `toll_tag_id` cleared, and a `toll_tag.retire` audit entry.
