# Vehicle Catalog Enterprise Readiness Audit — Dominion → Vehicle Database

**Date:** 2026-09-14 · **Rev 2 verification:** 2026-09-14 · **Rev 3 verification:** 2026-09-14 · **Rev 4 close-out:** 2026-09-14
**Status:** **All 13 original findings closed. §E1–§E6 closed (Rev 3–4).** §E2 remains documented-by-design (no code change). **Catalog enterprise programme complete for this audit scope.**
**Scope:** Dominion → Vehicle Database → **Vehicle Catalog** and **Pending catalog**. Covers the admin UI (`VehicleCatalogManager`, `VehicleCatalogTable`, `VehicleCatalogEditDialog`, `VehicleCatalogImportDialog`, `PendingVehicleCatalogManager`, `CatalogGateObservabilityPanel`), the service layer, the `_fleet-server` catalog + pending routes, and the schema's referential behaviour.
**Method (Rev 1):** Static read of all 8 catalog components, both services, the edge CRUD/purge/pending routes, and every FK referencing `public.vehicle_catalog`. No code was changed.
**Method (Rev 2):** Re-read every remediated path — provenance migration, the new `vehicle_catalog_enterprise.ts` edge module, all 6 catalog write routes, the bulk/undo-batch/orphans/dependencies routes, and the manager UI. Traced provenance stamping order, undo-batch dependency guard, and checkpoint persistence. Catalog suites **54/54 pass**; typecheck shows no new catalog errors.
**Method (Rev 4):** Closed §E5 (server `confirm` on force undo-batch) and §E6 (`npm:` type import). Edge redeployed. Parity **12/12** green.
**Trigger:** Pre-flight before a 190-row bulk CSV import (`catalog_expansion_2026-09-14.csv`). The question asked was "what must be enterprise-grade before I load data."
**Companions:** [MOTORCYCLE_CATALOG_AUDIT.md](MOTORCYCLE_CATALOG_AUDIT.md) · [VEHICLE_SYSTEM_AUDIT.md](VEHICLE_SYSTEM_AUDIT.md)

---

## 0a. Rev 2 status board

| ID | Finding | Sev | Status |
|---|---|---|---|
| §C1 | No import provenance, no undo | Critical | ✅ **Closed** — 4 columns + edge stamping + `/undo-batch` |
| §C2 | Single-row delete silently cascades | Critical | ✅ **Closed** — `/:id/dependencies` + 409 guard + dialog counts |
| §C3 | No referential integrity to fleet | Critical | ✅ **Closed** — `/orphans` + `CatalogOrphansPanel` |
| §H1 | Import is N sequential requests, no retry/resume | High | ✅ **Closed** — `/bulk` + backoff retry + checkpoint |
| §H2 | Catalog list unpaginated, truncates silently | High | ✅ **Closed** — `LIST_PAGE=500` `.range()` loop |
| §H3 | Pending fetches 100, no page controls | High | ✅ **Closed** — offset paging + prev/next |
| §H4 | No optimistic concurrency on PATCH | High | ✅ **Closed** — `expected_updated_at` → 409 |
| §M1 | No search in catalog UI | Medium | ✅ **Closed** — search + auto-expand matches |
| §M2 | Full refetch after every mutation | Medium | ✅ **Closed** — local state updates |
| §M3 | `window.confirm` for destructive delete | Medium | ✅ **Closed** — dialog with dependency counts |
| §M4 | No rate limiting on write routes | Medium | ✅ **Closed** — all 6 catalog write routes |
| §L1 | Gate panel not actionable | Low | ✅ **Closed** — noise filter + vehicle links |
| §L2 | Purge warning omits part fitments | Low | ✅ **Closed** — copy names fitments |
| §E1 | `window.confirm` returns for force-undo-batch | Low | ✅ **Closed** — typed-phrase dialog + dependency counts |
| §E2 | `/bulk` is not transactional | Low | 🔵 Documented, mitigated by design |
| §E3 | Gate backfill route has no rate limit | Low | ✅ **Closed** — `assertCatalogWriteRateLimit` added |
| §E4 | Chunk size duplicated client/server | Low | ✅ **Closed** — `VEHICLE_CATALOG_BULK_MAX_ROWS` shared |
| §E5 | Undo confirm phrase is client-side only | Medium | ✅ **Closed** — edge requires `confirm: "UNDO BATCH"` when `force:true` |
| §E6 | `supabase-js` import style differs from sibling module | Low | ✅ **Closed** — `npm:@supabase/supabase-js@2` |

**Verification result:** this is a thorough implementation that went past the recommendation in two places worth calling out.

**First — the undo-batch semantics are subtly correct.** `stampCatalogProvenance` stamps `import_batch_id` **only on creates**, never on updates:

```ts
// Only new rows carry the batch id — undo-batch must not delete pre-existing updates.
if (opts.importBatchId !== undefined) row.import_batch_id = opts.importBatchId;
```

That is the non-obvious half of §C1. A re-import that *updates* existing rows must not tag them, or "undo this batch" would delete rows that predated the import. Getting this wrong would have made undo actively destructive; it was got right.

**Second — the parity test grew the correct assertion pair.** Provenance keys are excluded from the "writable ⊆ alias targets" check (they are edge-stamped, not CSV columns) *and* a new test asserts they **are** in `VEHICLE_CATALOG_WRITABLE_KEYS`, so an edge stamp can never be silently dropped by `pickVehicleCatalogRow`. That closes the exact §M2/§M14 trap flagged in the motorcycle audit.

Also notable: `created_by` / `updated_by` are client-writable in the allowlist (they must be, or `pickVehicleCatalogRow` drops them) but `stampCatalogProvenance` runs **after** `pickVehicleCatalogRow` and overwrites both from the authenticated user id. Client-supplied provenance cannot win.

---

## 0. Executive summary (Rev 1 — historical)

The **correctness** layer of this section is in good shape — the motorcycle programme (Rev 1–3) closed the data-integrity findings, the variant identity index is sound, the import parser hard-blocks unknown columns, and RBAC correctly restricts writes to `platform_owner` / `superadmin` / `platform_support`.

What is **not** enterprise-grade is everything around *operating* the catalog at scale: provenance, reversibility, blast radius of deletes, and behaviour above a few hundred rows.

**The single most important finding: you cannot undo this import.**

`public.vehicle_catalog` has no `created_by`, no `updated_by`, and no import-batch identifier. After loading 190 rows there is no way to select, audit, or reverse that batch. The only bulk removal available is **Delete all** — which cascades into maintenance templates and part fitments platform-wide. A bad import is therefore either corrected by hand, row by row, or recovered by destroying adjacent subsystems.

**Severity counts:** 3 Critical · 4 High · 4 Medium · 2 Low.

**Fix before importing:** §C1 (batch provenance) is the only true blocker. §H1 (no retry/resume) is strongly advised at 190 rows.

**What is genuinely solid — leave alone:** the import preview + unknown-header hard block, the typed-phrase purge confirmation, variant identity uniqueness, the `vehicle_class` filter chips, RBAC on all catalog routes, and the pending approve class-resolution chain.

---

## 1. Section map

| Surface | Component | Route | Store |
|---|---|---|---|
| Vehicle Catalog | `VehicleCatalogManager` (862 ln) | `GET/POST/PATCH/DELETE /admin/vehicle-catalog` | `public.vehicle_catalog` |
| — Delete all | purge dialog | `POST /admin/vehicle-catalog/purge` | chunked delete loop |
| — Import CSV | `VehicleCatalogImportDialog` (290 ln) | N × `POST`/`PATCH` | — |
| — Edit | `VehicleCatalogEditDialog` (1414 ln) | `PATCH …/:id` | — |
| Pending catalog | `PendingVehicleCatalogManager` (560 ln) | `/admin/vehicle-catalog-pending-requests*` | `vehicle_catalog_pending_requests` |
| Gate activity | `CatalogGateObservabilityPanel` (87 ln) | `/admin/catalog-gate-events?limit=30` | gate audit log |

---

## 2. Critical

### §C1 — No import provenance, and therefore no undo

`public.vehicle_catalog` carries only `created_at` / `updated_at`. There is **no `created_by`, no `updated_by`, no `source`, and no import-batch id**. (By contrast `vehicle_catalog_pending_requests` *does* have `source` and audit columns — the master table does not.)

Consequences for the pending 190-row load:

- You cannot answer "which rows came from the 2026-09-14 import?"
- You cannot answer "who changed this variant, and when?"
- You cannot reverse one import batch. There is no selection criterion to delete on.
- Recovery from a bad import is manual row-by-row deletion, or **Delete all** — which triggers §C2.

Timestamps are not a substitute: a re-import (§M10 update path) mutates `updated_at` on pre-existing rows, so "rows created in this window" silently mixes edits into the batch.

**Fix before import:**

```sql
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','csv_import','pending_approve'));

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_import_batch
  ON public.vehicle_catalog (import_batch_id) WHERE import_batch_id IS NOT NULL;
```

Then have the import dialog mint one `import_batch_id` per run and stamp every row, add all four to `VEHICLE_CATALOG_WRITABLE_KEYS` (§M2/§M14 — a column missing there drops silently), and expose "undo this batch" as a filtered delete.

---

### §C2 — Deleting one catalog row silently destroys maintenance templates and part fitments

Two tables reference the catalog with **`ON DELETE CASCADE`**:

| Table | Migration | Behaviour |
|---|---|---|
| `public.maintenance_task_templates` | `20260412120000_maintenance_schedule_system.sql:9` | `vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE` |
| `public.part_fitment` | `20260501140000_part_sourcing.sql:63` | `vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE` |

The single-row delete path (`VehicleCatalogManager` → `handleDelete`) asks only:

```
Delete Honda Accord (2013–2015)?
```

It does not say that confirming also permanently deletes every maintenance task template scoped to that variant and every part fitment record pointing at it. There is no dependency count, no preview, and no server-side guard — `DELETE /admin/vehicle-catalog/:id` performs the delete with no reference check.

The **Delete all** dialog is better — it does warn about maintenance templates and fleet re-linking — but it **omits `part_fitment` entirely**, so the stated blast radius is still incomplete.

**Fix:** return dependent counts from the API, show them in both confirmations ("this will also remove 14 maintenance templates and 3 part fitments"), and refuse single-row deletes with dependents unless explicitly force-confirmed.

---

### §C3 — No referential integrity between fleet vehicles and the catalog

`supabase/migrations/20260811200000_fleet_schema_foundation.sql:77`:

```sql
vehicle_catalog_id text,
```

It is **`text`, not `uuid`, and carries no foreign key**. Nothing at the database level prevents a catalog row from being deleted, replaced, or re-keyed while live fleet vehicles still point at it.

When that happens the vehicle's `vehicle_catalog_id` becomes a dangling string, `isVehicleCatalogMatched()` returns false, and the catalog gate **parks the vehicle** — restricting it to `Inactive` / `Decommissioned` (see `vehicleCatalogGate.ts:23-30`). It can no longer take trips, accrue fuel, or be settled.

There is no detection, no warning at delete time, and no repair tool. A single mistaken catalog delete can silently take live vehicles out of service, and the first signal is an operator reporting that a vehicle will not go Active.

This is a pre-existing structural gap, not something the import introduces — but the import materially raises the odds of someone deleting or re-keying catalog rows.

**Fix:** either promote the column to `uuid` with a real FK and `ON DELETE RESTRICT`, or (if KV-backed vehicles make that impractical) add an orphan-detection report plus a delete-time reference check.

---

## 3. High

### §H1 — Import is N sequential requests with no retry, no batching, and no resume

`VehicleCatalogManager` lines 302-327:

```ts
for (let i = 0; i < ready.length; i++) {
  const r = ready[i];
  try {
    if (r.catalogId) { await updateVehicleCatalog(token, r.catalogId, r.payload); … }
    else            { await createVehicleCatalog(token, r.payload); … }
  } catch (err) {
    apiErrors.push(`Row ${r.rowIndex}: …`);
  } finally {
    setImportProgress({ current: i + 1, total: ready.length });
  }
}
```

For the pending load that is **190 sequential HTTP round trips**, each a full edge-function invocation with its own insert and fallback ladder.

Compounding problems:

- **No retry.** `vehicleCatalogService.ts` uses bare `fetch` — zero occurrences of `fetchWithRetry`. (`fuelService.ts` implements exactly such a helper; the catalog service never got one.) A single transient 502 or 429 permanently fails that row.
- **No resume.** Progress lives in React state. Close the tab, sleep the laptop, or expire the access token at row 140 and there is no checkpoint — and per §C1, no way to tell which 140 landed.
- **Not atomic.** Failures are collected into `apiErrors` and reported at the end; the catalog is left partially written with no transaction boundary.
- **Token expiry is unhandled.** The `accessToken` is captured once before the loop. A long run that outlives the JWT fails every subsequent row with an auth error.

**Fix:** add bounded-concurrency batching (4–8 in flight), a retry wrapper with exponential backoff on 429/5xx, and persist completed row indices so a run can resume. A server-side bulk endpoint taking N rows in one transaction would be better still.

---

### §H2 — Catalog list has no pagination and will truncate silently

`vehicle_catalog_schema_fallback.ts:222` / `:234`:

```ts
.from("vehicle_catalog").select("*").order("make").order("model").order("production_start_year")
```

No `.range()`, no `.limit()`, and `listVehicleCatalog()` on the client simply returns `data.items`. PostgREST applies its own max-rows cap (commonly 1000) and returns a truncated set **with no error and no indicator**.

At ~166 rows today plus 190 incoming you are at ~356 — safe. But the ceiling is invisible, and when the catalog crosses it the UI will quietly show a subset while reporting nothing. Every downstream count ("14 models · 95 variants") would silently understate.

This is the same defect class already recorded as §A1 in `VEHICLE_SYSTEM_AUDIT.md` ("`api.getVehicles()` sends no limit; the server defaults to 500 — every consumer silently truncates"). It was never fixed for the catalog.

**Fix:** paginate the route explicitly and loop `.range()` server-side until exhausted (the pattern `facetsFromCatalog()` in `commandoBodyTypes.ts` already uses), or return an explicit `total` the UI can assert against.

---

### §H3 — Pending catalog fetches 100 rows and has no pagination controls

`PendingVehicleCatalogManager.tsx:97`:

```ts
const res = await listPendingVehicleCatalogRequests(token, { status: statusFilter, limit: 100 });
```

`res.total` is stored and rendered at line 325 as plain text — *"Total matching filter (reported): {total}"* — but there are **no page controls, no offset state, and no "load more."**

If more than 100 requests match a filter, everything past the first 100 is unreachable from the UI while the page truthfully displays a larger total. For a queue that fleet operators write into, that is an unbounded backlog with a hard visibility ceiling.

**Fix:** add offset/cursor paging, or at minimum a "load more" that advances the window.

---

### §H4 — No optimistic concurrency on catalog edits

`PATCH /admin/vehicle-catalog/:id` validates fields and writes. It does not accept or check an `If-Match`, a version, or the client's last-seen `updated_at`.

Two platform staff editing the same variant — entirely plausible during a catalog-building push — produce a silent last-write-wins overwrite. The loser gets no error and no indication their change was discarded.

The pattern exists elsewhere in this codebase (`optimistic_concurrency.test.ts` in `_fleet-server`), so this is an omission rather than a missing capability.

**Fix:** send `updated_at` with the PATCH and reject with 409 when it no longer matches.

---

## 4. Medium

### §M1 — No search in the Vehicle Catalog UI

The only filters are the three class chips (All / Cars / Motorcycles) and the make → model accordion. `groupedCatalog` builds the whole tree in a `useMemo` over every row.

To reach one variant you expand a make, then a model, then scan. After the import that is 125 additional make+model pairs — Toyota alone goes from 14 models to roughly 60. There is no free-text search over make, model, chassis code, or engine code, which is how anyone actually looks a vehicle up.

**Fix:** a debounced search box filtering on make/model/chassis/engine before grouping.

### §M2 — Full catalog refetch after every mutation

`handleSave`, `handleDelete`, and the import completion all call `await load()`, which re-downloads the entire catalog. Editing one field re-fetches all ~356 rows (and, per §H2, does so unpaginated). Combined with §H1's per-row writes this makes a large import noticeably slower than necessary.

**Fix:** update the row in local state, or invalidate a scoped query rather than refetching everything.

### §M3 — Destructive single-row delete uses `window.confirm`

`handleDelete` calls native `window.confirm`. It is unstyled, untestable, unthemed (ignores the dark mode toggle visible in the screenshot), and inconsistent with the well-built typed-phrase purge dialog three functions away. It is also where the §C2 cascade warning needs to live, and a native confirm cannot present dependency counts.

### §M4 — No rate limiting on catalog write routes

No rate-limit middleware is applied to the catalog routes. RBAC restricts *who* can write, but an accidental double-submitted import or a runaway loop can issue unbounded writes against the edge function.

---

## 5. Low

### §L1 — Gate activity panel is not actionable

Every event visible in the Catalog gate activity panel reads `extractor_miss · POST /trips · _empty` — the vehicle id is empty on all of them. The panel fetches `?limit=30`, has no filtering, no pagination, and no link from an event to the vehicle or catalog row involved.

As rendered it tells you misses are happening but not which vehicle, so nothing can be done with it. Worth either enriching the event payload with a resolvable vehicle id or reconsidering the panel's prominence.

### §L2 — Purge warning omits part fitments

The Delete all dialog names maintenance templates and fleet re-linking but not `part_fitment`, which also cascades (§C2). The warning understates what the button destroys.

---

## 5a. Rev 2 — what was built

**Schema** — `20260914140000_vehicle_catalog_provenance.sql`: `created_by`, `updated_by`, `import_batch_id` (partial index), `source` (`NOT NULL DEFAULT 'manual'`, CHECK `manual|csv_import|pending_approve`), with a pre-CHECK backfill and an idempotent `pg_constraint` guard.

**New edge module** — `supabase/functions/_fleet-server/vehicle_catalog_enterprise.ts` (242 ln): `countCatalogDependencies`, `countCatalogDependenciesForIds`, `dependenciesBlockDelete`, `findFleetVehiclesForCatalogIds`, `listCatalogOrphanVehicles`, `stampCatalogProvenance`, plus a catalog-existence cache with explicit invalidation.

**New routes** — `GET /orphans` · `POST /bulk` · `POST /undo-batch` · `GET /:id/dependencies`. Every one of the six catalog write routes (purge, bulk, undo-batch, POST, PATCH, DELETE) now calls `assertCatalogWriteRateLimit`.

**Guards** — DELETE and undo-batch both count dependents first and return **409 `CATALOG_HAS_DEPENDENTS`** with the counts unless `force` is passed. PATCH compares `expected_updated_at` against the stored value and returns 409 on mismatch.

**Client** — `fetchWithRetry` with exponential backoff on 5xx/429 and network errors; `BULK_CHUNK = 40` per request; `catalogImportCheckpoint.ts` persists `{importBatchId, completedRowIndices}` to `localStorage` behind try/catch so a run resumes after a closed tab.

**UI** — search box with match auto-expand (§M1); `setItems((prev) => …)` in place of blanket refetch (§M2); a real delete dialog itemising maintenance templates / part fitments / fleet vehicles (§M3, §C2); `CatalogOrphansPanel` (§C3); pending paging with "Showing X–Y of Z" and prev/next (§H3); gate panel noise-filtered with links to affected vehicles (§L1); purge copy now names fitments (§L2).

**Verified:** catalog suites **54/54** (parity now 11 tests). Typecheck shows no new catalog errors — the only catalog-scoped error is the pre-existing `vehicleCatalogWriteDrift.ts` `TS2352`, whose file was not touched.

---

## 5b. Rev 2 residuals

### §E1 — Low — OPEN — `window.confirm` returns for the most destructive action

`VehicleCatalogManager.tsx:514`

```ts
const ok = window.confirm(
  `This batch has dependents (templates ${…}, fitments ${…}, fleet ${…}). Force undo anyway?`,
);
```

§M3 correctly replaced `window.confirm` on single-row delete with a proper dialog. But the **force-undo-batch** path — which bulk-deletes an entire import batch *and* is only reached when dependents exist — now uses the native confirm that was just removed elsewhere.

This is the highest-blast-radius action in the section: it can destroy many catalog rows plus their cascaded maintenance templates and part fitments in one click. It deserves at least the ceremony of the single-row delete dialog, and arguably the typed-phrase treatment the purge already has.

### §E2 — Low — Documented — `/bulk` is not transactional

The bulk route loops server-side:

```ts
if (rows.length > 50) return c.json({ error: "Max 50 rows per bulk request" }, 400);
…
for (const entry of rows) { … results.push(…) }
```

There is no transaction. A failure at row 20 of a 40-row chunk leaves rows 1–19 written and reports per-row results. This is a deliberate trade — the insert fallback ladder (legacy `year`, PostgREST cache, column-stripping retry) cannot run inside a single statement — and the consequences are well mitigated: the checkpoint records per-row success, and `/undo-batch` can reverse whatever landed.

Recorded so nobody later assumes "bulk" implies atomicity. No action needed.

### §E3 — Low — OPEN — Gate backfill route has no rate limit

All six catalog CRUD routes gained `assertCatalogWriteRateLimit`. `POST /admin/vehicle-catalog-gate/backfill` (index.tsx:14039) did not — and it performs a bulk mutation across fleet vehicles' `status` / `catalogStatus`. It sits just outside the strict catalog-CRUD boundary, which is likely why it was missed.

### §E4 — Low — OPEN — Chunk size is duplicated, not shared

Client `BULK_CHUNK = 40` (`VehicleCatalogManager.tsx:91`) and the server cap `rows.length > 50` are independent literals in different packages. They agree today. Raising the client constant past 50 would start returning 400s with no compile-time signal. Export one constant from `packages/types` and have both sides read it.

---

## 5c. Rev 3 — residual closures and one new finding

### §E1 — CLOSED — force-undo now has purge-grade ceremony

`window.confirm` is gone from every catalog component. The force-undo path is now a proper dialog carrying `forceUndoDeps` — itemising maintenance templates, part fitments, and fleet vehicle links — gated behind a typed confirmation phrase (`VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE = "UNDO BATCH"`), with the submit button disabled until it matches. That is the same ceremony the purge dialog uses, which is what the finding asked for.

### §E3 — CLOSED — backfill rate-limited

`POST /admin/vehicle-catalog-gate/backfill` now calls `assertCatalogWriteRateLimit` (index.tsx:14044). All seven catalog-adjacent write routes are covered.

### §E4 — CLOSED — one constant, shared, and tested

`packages/types/src/vehicleCatalogCsvImport.ts:244` exports `VEHICLE_CATALOG_BULK_MAX_ROWS = 40`. The manager chunks on it; the edge route caps on it (`index.tsx:13492`); the parity test asserts it is a positive integer ≤ 50. Client and server can no longer drift apart silently.

---

### §E5 — Medium — OPEN — The server does not enforce the undo confirmation phrase

The §E1 fix added real ceremony to the **UI**. The **API** did not get the matching guard.

`VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE = "UNDO BATCH"` is declared in `apps/admin/src/services/vehicleCatalogService.ts:11`. Tracing every reference, it is used only inside `VehicleCatalogManager` — to render the phrase, to gate the button, and to guard the local handler. **It is never sent to the server, and the server never asks for it.**

The route accepts:

```ts
const body = … as { import_batch_id?: string; force?: boolean };
…
if (dependenciesBlockDelete(deps) && body.force !== true) { … 409 … }
```

`force: true` alone is sufficient. Any caller holding a valid platform-staff token can `POST /admin/vehicle-catalog/undo-batch {import_batch_id, force:true}` and bulk-delete an entire import batch — cascading its maintenance templates and part fitments — without the phrase ever entering the picture.

**This is an asymmetry, not a theory.** The purge route, an equally destructive bulk delete, *is* enforced server-side:

```ts
const VEHICLE_CATALOG_PURGE_CONFIRM = "DELETE ALL";        // index.tsx:13426
if (String(body.confirm ?? "").trim() !== VEHICLE_CATALOG_PURGE_CONFIRM) {
  return c.json({ error: `Confirmation required: send JSON { "confirm": "…" }` }, 400);
}
```

The purge client constant even carries the comment *"Must match edge `VEHICLE_CATALOG_PURGE_CONFIRM` in `index.tsx`"*. The undo constant has no such counterpart.

**Fix:** mirror the purge pattern — declare `VEHICLE_CATALOG_UNDO_BATCH_CONFIRM` on the edge, have the client send `confirm` alongside `force`, and reject with 400 when it does not match. Rate limiting and RBAC already apply; this closes the last gap between the two destructive paths.

### §E6 — Low — Nit — `supabase-js` import style

`vehicle_catalog_enterprise.ts:5` uses `import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"`, while its sibling `vehicle_catalog_schema_fallback.ts` uses `npm:@supabase/supabase-js@2` for the same type.

It is a **type-only** import, erased at runtime, and the repo already carries three styles in this directory (34 `npm:`, 8 `jsr:`, 4 `esm.sh`). So this is pre-existing inconsistency rather than a regression, and it has no runtime effect — it only produces a `TS2307` under the Node tsconfig, which cannot resolve remote specifiers. Aligning it with the sibling would remove one line of typecheck noise.

---

## 5d. Rev 4 — §E5 / §E6 closed

### §E5 — CLOSED — force undo-batch confirm enforced on the edge

`VEHICLE_CATALOG_UNDO_BATCH_CONFIRM = "UNDO BATCH"` lives next to the purge constant in `_fleet-server/index.tsx`. When `force: true`, the route rejects with **400** unless `confirm` matches exactly. Soft undo (no `force`) stays phrase-free. The admin client sends `confirm: VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE` whenever `force` is set; the dialog still gates the click. Purge and force-undo are now symmetric.

### §E6 — CLOSED — type import aligned

`vehicle_catalog_enterprise.ts` now imports `SupabaseClient` from `npm:@supabase/supabase-js@2`, matching `vehicle_catalog_schema_fallback.ts`.

**Deploy:** `make-server-37f42386` redeployed to GoRide after Rev 4. Live production batch `84311f52-…` was **not** undone during verification.

---

## 6. What to do before importing the 190 rows

> **Rev 2: nothing here blocks the import any more.** §C1 is closed, so the batch is reversible via `/undo-batch`, and §H1 is closed, so a 190-row run is 5 chunked requests with retry and resume rather than 190 bare round trips. The original Rev 1 guidance is kept below for the record.

**Rev 4 follow-ups:** none for this audit scope. §E2 stays documented-by-design. Commit the Rev 4 edge/client/audit delta when ready.

**Verification state at Rev 4:** allowlist parity **12/12**. Edge redeployed with force-undo `confirm` gate. Unauthenticated probe of `/undo-batch` → 401 (auth still required before confirm check).

### Rev 3 follow-ups (historical — closed in Rev 4)

1. **§E5 — enforce the undo confirm phrase server-side.** Closed: client sends `confirm`, edge rejects 400 on mismatch when `force:true`.
2. **§E6** — align the `supabase-js` type import with the sibling module. Closed.
3. **Commit** — catalog enterprise work was committed by PO prior to Rev 4; Rev 4 delta still needs its own commit.

**Verification state at Rev 3:** catalog suites **55/55** (parity 12 tests). Typecheck shows no new catalog errors — only the pre-existing `vehicleCatalogWriteDrift.ts` `TS2352` (both mirrors, file untouched) and the §E6 remote-specifier note (resolved in Rev 4).

### Rev 1 guidance (historical)

**Blocking:**

1. **§C1 — add provenance columns** (`created_by`, `updated_by`, `import_batch_id`, `source`) and stamp them from the import dialog. Remember to add all four to `VEHICLE_CATALOG_WRITABLE_KEYS`, or they drop silently server-side. Without this the import is irreversible.

**Strongly advised at this row count:**

2. **§H1 — add retry with backoff** to `vehicleCatalogService` (port the `fetchWithRetry` pattern from `fuelService.ts`), and persist completed row indices so a failed run can resume.

**Safe to defer, but do them soon:**

3. §C2 — dependency counts in both delete confirmations; §L2 falls out of the same change.
4. §C3 — orphan-detection report for fleet vehicles pointing at missing catalog rows.
5. §H2 / §H3 — real pagination on both lists.
6. §H4 — `updated_at` concurrency check on PATCH.
7. §M1 — search box.

**Interim mitigation if you want to import today without §C1:** export the catalog to CSV immediately before the run and keep it. That gives you a manual restore point — the exported `ID` column drives the update path (§M10), so a re-import of the pre-import export can repair modified rows, though it will not remove rows the batch newly created.

---

## 7. What is already enterprise-grade

Worth recording so it is not "fixed" later:

- **Import safety rails.** Unknown CSV headers hard-block the import rather than silently dropping (§M2 of the motorcycle audit). The preview lists parse errors per row before anything is written.
- **Purge confirmation.** Typed exact-phrase (`DELETE ALL`), case-sensitive, matched server-side against the same constant.
- **RBAC.** `assertVehicleCatalogAccess` restricts every catalog route to `platform_owner` / `superadmin` / `platform_support`, applied consistently including on purge.
- **Variant identity.** The 26-column unique index makes duplicate variants unrepresentable, and the migration's `ROW_NUMBER()` dedupe pass handled pre-existing twins.
- **Class integrity.** `vehicle_class` is `NOT NULL DEFAULT 'car'` with a CHECK, flows through facets, Rides body types, maintenance templates, and the pending approve path.
- **Schema-drift resilience.** The edge insert fallback ladder degrades gracefully across aged schemas and correctly refuses to strip payload keys on PostgREST cache-only errors.
