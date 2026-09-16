# Fleet Edge Function 5 MB Deploy Split — Completion Playbook

**Status:** **A0–G4 + H1–H3 + Phase I + I-a/I-b CLOSED (2026-09-16).** Deploy size solved; fuel cutover proven; both bundles on npm `hono@4.3.11` only; `fleet-fuel` CORS matches the monolith via shared `corsDefaults`; CORS smoke is a standing gate on `deploy:fleet-fuel` (preflight always; expose-headers skip without credentials). **No open blockers.** Remaining program work is optional **Phase F** (toll split).  
**Trigger error:** `413 Function source code exceeds the maximum deployment size (5 MB)` on `make-server-37f42386`  
**Audience:** Agent executing “make fleet edge deploy reliably, then split it” end-to-end  
**Related (do not replace):** [`docs/fleet-monolith-extraction.md`](./fleet-monolith-extraction.md), [`docs/FLEET_DOMAIN_ROUTE_MAP.md`](./FLEET_DOMAIN_ROUTE_MAP.md)

> **Historical note (§1):** Early revisions assumed Docker was the only working deploy path. **Current state:** both `make-server` and `fleet-fuel` prebundle via esbuild and deploy with `--use-api` (no Docker special-case).
>
> **If you are picking this up now:** the 5 MB / fuel-split program is complete (including CORS deploy gate I-a). Optional next: **Phase F** (toll) via [`docs/fleet-domain-extraction-completion.md`](./fleet-domain-extraction-completion.md). After you push Phase I `_shared` CORS changes, glance at `deploy-supabase-edge.yml` once (I-b deferred until that push). Do not re-run A0–I unless a regression is proven.

---

## 0. How to use this doc

When the Product Owner says:

> Read `docs/fleet-edge-5mb-split-plan.md` and execute to completion.

the agent must:

1. Re-measure sizes first — numbers below drift within a single day.
2. **Execute Phase A0 before anything else**, and run its A0.1 proof step before writing the rest of it. A0 is hours of work and removes the deploy problem; Phases B–E are weeks and move money paths across an HTTP boundary.
3. Execute remaining phases in order; do **not** skip the hard coupling steps (§5).
4. Stay on the current git branch (no checkout/switch/stash unless PO asks).
5. Do **not** treat `.md` / `.sql` repo cleanup as the fix.
6. Stop and ask only if a phase requires a product decision marked **PO GATE**, or if A0.1 fails.

---

## 1. Verdict (plain English)

There were **two deploy paths**; the size emergency is **solved**.

| Path | Bundler | Cap | Status today |
|------|---------|-----|--------------|
| `supabase functions deploy … --use-api` | **esbuild prebundle** then API upload | **5 MB** | ✅ make-server **1.552 MB**, fleet-fuel **0.544 MB** |
| `supabase functions deploy …` (no flag) | local Docker eszip bundler | **~20 MB** | ✅ still works; **CI no longer needs it** for fleet |

`.github/workflows/deploy-supabase-edge.yml` always uses `--use-api` after `scripts/build-edge-bundle.mjs`. Docker special-casing for `make-server-37f42386` was removed.

**Outcome:** production deploys are under the API cap; fuel is extracted to `fleet-fuel`; H1–H3 hygiene and **Phase I CORS parity** are closed. Remaining program work is optional Phase F (toll).

Historical audit notes below (why prebundle beat a raw-source split) are retained for context.

---

## 2. Audit snapshot (2026-09-15, re-measured)

### 2.1 Measured sizes

| Scope | Files | Size |
|-------|------:|-----:|
| `_fleet-server/` on disk | 296 | **4.6 MB** |
| Static import graph from `make-server-37f42386/index.ts` | 369 | **4.524 MB** (4,743,341 bytes) |
| `--use-api` upload limit | — | **5.00 MB** |
| Headroom before packaging overhead | — | **~0.48 MB** (effectively none) |
| Docker/eszip cap (CI path) | — | ~20 MB |

Drift since the first audit: 4.51 → 4.524 MB in the same day's work. The graph grows faster than anyone budgets for; treat any fix that leaves < 1.5 MB headroom as temporary.

### 2.2 Graph breakdown (approx.)

| Bucket | Files | MB |
|--------|------:|---:|
| `_fleet-server` | 228 | 3.73 |
| `packages/fuel-core` | 34 | 0.22 |
| `packages/finance-core` | 35 | 0.19 |
| `packages/types` | 11 | 0.11 |
| `_shared` | 27 | 0.10 |
| `packages/toll-core` | 13 | 0.08 |
| `packages/dash-pricing` + `gct-core` (leak) | 15 | ~0.08 |
| Shim | 1 | ~0 |

### 2.3 Largest modules in the live graph

| File | ~KB |
|------|----:|
| `_fleet-server/index.tsx` (~17.6k lines) | 695 |
| `toll_controller.tsx` | 391 |
| `fuel_controller.tsx` | 319 |
| `maintenance_routes.ts` | 124 |
| `driver_financial_periods.ts` | 111 |
| `week_close.ts` | 90 |
| `fuel_period_routes.ts` | 80 |
| `settlement_commands_controller.tsx` | 65 |
| `dispute_refund_controller.tsx` | 64 |
| `fuel_logic.ts` | 58 |

Fuel-named files reachable in the graph: **75 files, 0.881 MB.** That is the ceiling on what a fuel split can remove, before shared deps that stay anyway.

### 2.4 Sizing — every option, measured

Split rows were produced by cutting the relevant import edges at the BFS and re-walking, so they include shared deps that survive the cut. Bundle rows are real esbuild builds of the actual shim entrypoint with `npm:` / `node:` / `https:` externalized.

| Scenario | Upload MB | Headroom vs 5 MB | Build errors |
|----------|----------:|-----------------:|:-------------|
| Today (raw source, `--use-api`) | 4.524 | 0.48 | — |
| Drop `dash-pricing` + `gct-core` leak only | ~4.45 | 0.55 | — |
| Fuel split | 3.613 | 1.39 | — |
| Toll split instead of fuel | 3.831 | 1.17 | — |
| Fuel **and** toll split | 2.920 | 2.08 | — |
| **esbuild bundle, no minify** | **3.220** | **1.78** | **0** |
| **esbuild bundle, minify + `keepNames`** | **1.831** | **3.17** | **0** |
| esbuild bundle + linked sourcemap | 8.893 | ❌ over | 0 |
| esbuild bundle + inline sourcemap | 11.246 | ❌ over | 0 |

**Conclusions:**

1. **Prebundling beats splitting two domains**, in hours rather than weeks, without touching a money path. Take it first.
2. **Sourcemaps are unaffordable** at this size. Ship `keepNames: true` and no map — function names survive in stack traces, which covers most of the debugging value.
3. If fuel is split anyway, it remains the **correct first cut** — 0.91 MB removed vs toll's 0.69 MB, already first in the strangler-fig cutover order, and already has a dedicated client key (`API_ENDPOINTS.fuel`).

### 2.5 Two latent bugs surfaced by the bundle run

Not size issues; found for free because esbuild resolves every export and the current packager does not. Fix these regardless of which path is taken:

| Where | Problem |
|-------|---------|
| `_fleet-server/index.tsx:16977` | calls `unverifiedVendor.bulkCreateUnverifiedVendors(...)` — `unverified_vendor_controller.tsx` exports `createOrUpdateUnverifiedVendor`, not this. Route throws `TypeError` at runtime. |
| `_fleet-server/index.tsx:17106` | calls `unverifiedVendor.rejectUnverifiedVendor(...)` — the controller exports `rejectVendor`. Same failure. |

Both survive today because `index.tsx` is never typechecked (see §2.6).

### 2.6 Typecheck coverage (constraint on any plan)

`deno check` over the full graph (`make-server-37f42386/index.ts`) reports **518 errors** — mostly Hono context generics (`c.get("rbacUser")` against an untyped `Variables`) plus `SupabaseClient` schema-generic mismatches, not 518 real defects. CI therefore checks only 9 hand-picked files (`.github/workflows/ci.yml:121`).

Consequence: **there is no whole-graph type gate today, and esbuild does not add one** (it strips types without checking). Do not present bundling as a loss of safety — it isn't, there is nothing to lose — but do not present it as a gain either. What bundling *does* add is a **resolution** gate: a build that fails on a missing module or export, which is strictly more than the current packager offers. Adopting whole-graph `deno check` is a separate, larger piece of work.

### 2.7 What is already prepared

| Asset | Role |
|-------|------|
| `supabase/functions/make-server-37f42386/index.ts` | Thin shim; forces explicit imports so CLI packager does not drop modules — **obsolete once Phase A0 lands** (esbuild resolves dynamic imports correctly) |
| `supabase/functions/_fleet-server/` | Source of truth for fleet edge code |
| `supabase/functions/fleet-ops/` | Strangler target (health + extraction-status; **fuel not mounted yet**) |
| `packages/api-client/src/config.ts` | Single place for `fuel` / `fleet` / `admin` base URLs (`fuel` still points at monolith) |
| `docs/fleet-monolith-extraction.md` | Cutover order: fuel → toll → claims → driver pay → retire shim |
| `pnpm deploy:edge` | Asserts + deploys `make-server-37f42386` + smoke `/health` — **hardcodes `--use-api`, so this is the command that 413s** |
| `.github/workflows/deploy-supabase-edge.yml` | Deploys changed functions; `_fleet-server` / `_shared` changes force broad redeploy. Pins CLI **2.99.0** and drops `--use-api` for `make-server-37f42386` only (Docker eszip path) |
| `esbuild` (already in the workspace, 0.25.12) | Bundler for Phase A0 — no new dependency needed |

---

## 3. Architecture rules (non-negotiable)

1. **Live edge code stays under `supabase/functions/`** — never move production handlers back into `apps/fleet/`.
2. **Shared modules** (`kv_store`, `rbac_middleware`, `org_scope`, `fleet_sql_bridge`, etc.) may remain in `_fleet-server/` and be imported by multiple functions — that is OK; the upload is **per function graph**, not one shared blob.
3. **Path contract — CORRECTED 2026-09-15.** Supabase **does not strip** the function slug; the worker sees it in `c.req.path`. (Earlier revisions of this doc claimed the opposite, and the claim was self-contradictory: if the slug were stripped, the monolith's `/make-server-37f42386/<route>` registrations could never match.) Clients call `…/functions/v1/<fn>/<route>`, and the worker must match `/<fn>/<route>`.
4. **Every new function must own its slug prefix.** Either register routes with the slug baked in (monolith style, `/make-server-37f42386/<route>`) **or** wrap the app in `new Hono().basePath("/<fn>")` — the house pattern used by `identity`, `fleet-ops`, `delivery` and now `fleet-fuel`. Getting this wrong is nastier than it sounds: a global `app.use("*", requireAuth(...))` still matches and returns **401**, so an unauthenticated probe cannot tell a live route from a missing one. **Only an authenticated 200 proves the route resolves** — budget for that in Phase E rather than accepting 401s as a pass (see §6 Phase H1).
5. **Money integrity:** fuel finalize / week seal / ledger posts must not double-run on both functions after cutover.
6. **Auth/CORS/RBAC:** copy the same patterns (`requireAuth`, `requirePermission`, `buildCorsOriginFn` / `applyCors`) — do not invent a weaker gate.
7. **Every fleet function is prebundled the same way** once Phase A0 lands. `fleet-fuel`, `fleet-ops` and any future split target get the same build step — do not create a second class of hand-written entrypoints.
8. **`_fleet-server/` stays the only source of truth.** Generated entrypoints under `supabase/functions/<name>/index.ts` are build artifacts and must never be hand-edited.

---

## 4. Recommended solution (pick this; do not offer options mid-flight)

Two tracks, in this order. They compose — the bundle step applies to `fleet-fuel` too.

### Track 1 (do first, hours) — prebundle with esbuild

Build `_fleet-server/index.tsx` into a **single minified ES module** and let the CLI upload that one file. Measured **1.831 MB**, zero build errors.

What it buys:

| | Prebundle | Fuel split |
|---|---|---|
| Upload after | **1.83 MB** (3.17 headroom) | 3.61 MB (1.39 headroom) |
| Effort | one build script + one package.json line | new function, cross-function money boundary, client cutover |
| Money-path risk | **none** — same code, same process, same call graph | week-close seal moves over HTTP; double-post exposure |
| Client changes | none | `API_ENDPOINTS` + URL sweep across 4 apps |
| Rollback | delete the build step | repoint URLs, remount, redeploy |
| Docker dependency | **removed** — local and CI use the same `--use-api` path | unchanged (still needed until under 5 MB) |
| Side benefit | forced-import shim becomes unnecessary; build failures catch missing exports | — |
| Durability | ~3.2 MB of bundled growth ≈ **~8 MB of new raw TS** | ~1.4 MB of raw TS |

### Track 2 (do second, unhurried) — `fleet-fuel`

**`fleet-fuel`** — new Edge Function (not a rename of `fuel-brain`).

> `fuel-brain` already exists as a small classifier service. Do **not** overload it.

**Re-motivated.** After Track 1 the split is no longer a deploy-size fix — 1.83 MB is not an emergency. Justify and schedule it on its actual merits:

- **Blast radius** — a bad fuel deploy currently takes down toll, claims, settlement and driver pay with it.
- **Cold start** — every fuel request pays for parsing the whole fleet surface.
- **Deploy cadence** — fuel recon iterates fastest and is coupled to the slowest-moving code in the repo.
- **Maintainability** — a 17.6k-line `index.tsx` is the real problem; size was only its most visible symptom.

If it is executed, fuel remains the correct first cut (§2.4 conclusion 3).

### Why not “slim the monolith”?

Dropping the `dash-pricing` / `gct-core` leak recovers ~0.07 MB — a rounding error against 4.52 MB, and the graph drifted by 0.014 MB during the audit itself. Still worth doing as hygiene (Phase A), never as the fix.

---

## 5. Hard couplings (must solve or the split is fake)

These keep fuel code inside the **monolith graph** even after `app.route("/", fuelApp)` is removed, if left as static imports:

| Coupler | Where | Why it matters |
|---------|-------|----------------|
| `sealFuelWeek` | `week_close.ts` → `fuel_week_seal.ts` | Week close statically imports fuel seal → fuel tree stays in monolith bundle |
| Fuel period / finalize | `fuel_controller.tsx` ↔ `fuel_period_routes.ts` ↔ `packages/fuel-core` | Must move as one unit |
| Canonical ledger posts | `fuel_financial_reset.ts`, `canonical_from_ops.ts`, `ledger_canonical.ts` | Fuel finalize writes money; keep **one** writer path |
| Odometer projection | `fuel_controller` → `odometer_ledger.ts` | Shared infra — OK to import from both functions |
| Transaction sync | `fuel_transaction_sync.ts` / admin cash paths in `index.tsx` | Some fuel-adjacent routes still live on monolith; inventory before cutover |
| Evidence / stations / geo | fuel controller + platform-ops UI via `API_ENDPOINTS.fuel` | Move with fuel or keep temporary proxy on monolith |

**Required pattern for week close after split:**

- Prefer **HTTP call** from monolith week-close → `fleet-fuel` internal seal/finalize endpoint (service role or shared secret), **or**
- Extract a **tiny** seal HTTP surface on `fleet-fuel` and delete the static import from `week_close.ts`.

Do **not** rely on `await import("./fuel_week_seal.ts")` to shrink the upload — **but not for the reason the first revision gave.** That revision claimed packaging "still includes dynamic import targets." The opposite is true on the `--use-api` path, and this repo already documents it: the shim carries the comment *"Statement Summary toll P&L snapshot — dynamic import alone is dropped by CLI packager"* above a forced static import of `fleet_toll_statement_snapshot.ts`.

So the CLI's walker **misses** dynamic imports. The module is genuinely excluded from the upload and then fails at runtime with *Module not found* — a smaller bundle that does not work. Same verdict (don't do it), opposite mechanism, and the difference matters: the only size lever that is both real and safe on the raw-source path is **not referencing the module from that entrypoint at all**.

**After Phase A0 this entire hazard class disappears** — esbuild resolves dynamic imports correctly and inlines them into the single output file, which is why the forced-import shim can be retired.

---

## 6. Execution plan

### Phase A0 — Prebundle (do this first; hours, not weeks)

**Goal:** `pnpm deploy:edge` succeeds on `--use-api` with ≥ 3 MB headroom, and CI stops needing Docker.

#### A0.1 Proof step (30 min, do before anything else)

The whole approach rests on one assumption: **the 5 MB cap is measured against the uploaded import graph, not the function directory or the whole `supabase/functions` tree.** Evidence is strong (the graph measures 4.52 MB against a 5 MB cap, and the tree is far larger), but prove it rather than assume it:

1. Build the bundle (A0.2).
2. Deploy `make-server-37f42386` with `--use-api`.
3. If it succeeds → assumption holds, continue. If it still 413s → the cap is directory-based; **stop, record the finding here, and fall back to Track 2 (split) as the primary fix.**

#### A0.2 Build script

Add `scripts/build-edge-bundle.mjs`. Settings that matter, all measured:

```js
await esbuild.build({
  entryPoints: ["supabase/functions/_fleet-server/index.tsx"],
  outfile:     "supabase/functions/make-server-37f42386/index.ts",
  bundle: true, format: "esm", platform: "neutral", target: "esnext",
  minify: true,
  keepNames: true,      // stack traces stay readable
  sourcemap: false,     // inline map = 11.2 MB, linked = 8.9 MB — both blow the cap
  legalComments: "none",
  plugins: [/* mark npm: | jsr: | node: | https: | data: specifiers external */],
});
```

- **Externalize remote specifiers.** `npm:@supabase/supabase-js@2`, `npm:hono`, `npm:hono/cors`, `npm:hono/logger`, `npm:hono/streaming`, `npm:openai`, `npm:@google/generative-ai`, `node:buffer`. esbuild must not try to resolve these; the edge runtime resolves them as it does today.
- **`platform: "neutral"`** — do not let esbuild inject Node shims.
- **Deno globals** (`Deno.serve`, `Deno.env`) pass through untouched.
- No `const enum` or decorators exist in the graph (verified), so esbuild's TS transform is safe here.

#### A0.3 Wiring

1. The generated `make-server-37f42386/index.ts` becomes a **build artifact**. Either `.gitignore` it and build in CI before deploy, or commit it with a `// GENERATED — do not edit` banner and a CI check that it is current. **Pick one and enforce it** — a hand-edited generated file is the failure mode that makes this approach look bad.
2. `package.json` → `deploy:edge` runs the build before `supabase functions deploy … --use-api`.
3. `.github/workflows/deploy-supabase-edge.yml`:
   - run the build before deploy;
   - **remove the `make-server-37f42386` Docker special case** in `deploy_with_retry` so every function takes the same `--use-api` path;
   - the CLI pin (2.99.0) can then move forward freely — the Docker bundler's deprecation stops being a risk.
4. Retire the forced static imports in the shim — they exist only to work around the packager esbuild replaces.
5. Fix the two export mismatches in §2.5 (they are the reason to read build warnings, not suppress them).

#### A0.4 Risks and honest limits

| Risk | Mitigation |
|------|------------|
| Stack traces point into bundled output | `keepNames: true`; line numbers are lost — accept, or run unminified at 3.22 MB while debugging |
| esbuild does not typecheck | Neither does the current path (§2.6). Keep the 9-file `deno check` allowlist; the build itself gates module/export resolution |
| Generated file drifts from source | CI freshness check, or gitignore it entirely |
| Bundling masks a Deno/esbuild transform difference | Smoke `/health` plus §7 Phase E checks 3–9 after first deploy |

**Exit gate:** `--use-api` deploy of `make-server-37f42386` succeeds; `/health` boots; bundle size recorded in §11.

---

### Phase A — Re-measure + hygiene slim (same day)

**Goal:** Hygiene, and a fallback source of bytes if Phase A0's proof step fails.

Checklist:

1. Re-run import-graph size from `supabase/functions/make-server-37f42386/index.ts` (BFS relative specifiers, sum file bytes, ignore `npm:` / `jsr:` / `https:`).
2. Remove or gate **unnecessary** graph weight:
   - Trace and break accidental pulls of `packages/dash-pricing` (8 files, 0.065 MB) / `gct-core` (7 files, 0.008 MB) into fleet if not required for fleet money paths. Note `fn:rides` (2 files) also leaks in via `_shared`.
   - Ensure **no** `*.test.ts` are imported from production entrypoints (audit: 0 tests in graph — keep it that way).
   - Do not add new side-effect imports to the shim unless packager-required.
3. Expect ~0.07 MB total. This is hygiene, **not** the fix — see §4. Do not spend a day here.

**Exit gate:** Document new graph MB in a short note at the top of this file’s “Last execution” section.

---

### Phase B — Create `fleet-fuel` (server)

**Goal:** New deployable function that serves the fuel HTTP surface.

#### B1. Scaffold

Create:

```
supabase/functions/fleet-fuel/
  index.ts          # Deno.serve + CORS + health + mount fuel app
```

Requirements:

- CORS: reuse `_shared/corsAllowlist.ts` (`applyCors` or same allowlist as monolith).
- `GET /health` → `{ service: "fleet-fuel", status: "ok" }`.
- Mount fuel Hono app at `/`.
- `verify_jwt`: match fleet norms (monolith uses in-app `requireAuth`; config.toml usually leaves JWT verify to the app). Mirror `make-server` behavior — do not accidentally disable auth inside handlers.

#### B2. Path-prefix normalization

In the fuel app (today `fuel_controller.tsx` uses `BASE_PATH = "/make-server-37f42386"`):

- Introduce a shared constant, e.g. `FUEL_HTTP_PREFIX`, defaulting to `""` for `fleet-fuel`.
- During dual-run, monolith may keep legacy prefix; `fleet-fuel` must use **empty** prefix so clients call `/functions/v1/fleet-fuel/fuel-entries`.

Prefer extracting a thin `fuel_app.ts` that both can mount, rather than duplicating 7k+ lines.

#### B3. Move / mount these as one unit

Minimum move set (import graph must be reachable from `fleet-fuel/index.ts` only):

- `fuel_controller.tsx` (+ `registerFuelPeriodRoutes`)
- `fuel_period_routes.ts` and fuel week engine/seal/closable/finalize family (`fuel_week_*`, `fuel_period_*`, `fuel_finalize_*`, `fuel_pnl_offset.ts`, `fuel_financial_reset.ts`, …)
- Supporting fuel_* modules only pulled by that tree
- `packages/fuel-core` (already relative-imported)

Shared OK to import in place from `_fleet-server/`:

- `kv_store.tsx`, `rbac_middleware.ts`, `org_scope.ts`, `fleet_sql_bridge.ts`, `odometer_ledger.ts`, `canonical_from_ops.ts`, `ledger_canonical.ts`, timezone helpers, etc.

#### B4. Break monolith static coupling

1. Remove `import fuelApp from "./fuel_controller.tsx"` and `app.route("/", fuelApp)` from `_fleet-server/index.tsx`.
2. Replace `week_close.ts` static `sealFuelWeek` import with cross-function call to `fleet-fuel` (or equivalent) — **mandatory** for size win.
3. Grep for other static imports of `fuel_controller` / `fuel_week_seal` / `fuel_period_routes` from non-fuel entrypaths; eliminate or convert to HTTP.
4. Update shim `make-server-37f42386/index.ts`: drop fuel-only forced imports if any; keep packager-required non-fuel imports.

#### B5. Temporary compatibility (optional, dual-run)

If PO needs zero client downtime:

- Keep thin **proxy routes** on monolith that forward `/make-server-37f42386/fuel-*` → `fleet-fuel` for one release, **or**
- Feature-flag `API_ENDPOINTS.fuel` (preferred — see Phase C).

Proxy doubles cold-start cost; prefer flag cutover within the same release train.

**Exit gate:**

```bash
# Deploy both (project ref as in package.json)
npx supabase functions deploy fleet-fuel --use-api --project-ref csfllzzastacofsvcdsc
npx supabase functions deploy make-server-37f42386 --use-api --project-ref csfllzzastacofsvcdsc
```

Both must succeed without 413. Record upload sizes if CLI prints them.

---

### Phase C — Client + package cutover

**Goal:** All fuel traffic uses `fleet-fuel`.

#### C1. Single source of truth

Update `packages/api-client/src/config.ts`:

```ts
fuel: `${BASE_URL}/fleet-fuel`,
```

Leave `fleet` / `financial` / `ai` / `admin` on `make-server-37f42386` until later domains split.

Also update mirrors if still duplicated:

- `apps/fleet/src/services/apiConfig.ts` (if not already re-exporting api-client only)
- `apps/driver/src/services/apiConfig.ts`

#### C2. Hardcoded URL sweep

> ⚠️ **This step was executed incompletely on 2026-09-15 — see §6 Phase G1 for the 94 remaining call sites.** Read the warning below before repeating this phase for `fleet-toll` or any later domain.

Repo-wide (exclude docs/history):

```bash
rg "make-server-37f42386" --glob '!docs/**' --glob '!**/*.md' --glob '!**/node_modules/**'
```

For each hit: if the path is fuel/stations/fuel-audit/fuel-reconciliation/fuel weeks/odometer-from-fuel UI, point at `API_ENDPOINTS.fuel` / `fleet-fuel`.  
Known consumers: `apps/fleet`, `apps/driver`, `apps/admin`, `packages/platform-ops-ui` (`stationFuelService`, tollOps mistakenly on `.fuel` — verify).

**Searching for `make-server-37f42386` is not sufficient, and this is the trap that produced G1.** The dangerous call sites do not mention the function name at all — they read `${API_ENDPOINTS.fuel}/toll-plazas`. Repointing the `fuel` key silently redirects *every* caller of that key, including the many that were only ever using it as "some fleet base URL".

Before repointing any `API_ENDPOINTS` key, diff callers against what the new function actually serves:

```bash
# 1. routes the new function registers
rg -o 'app\.(get|post|put|patch|delete)\(\s*`\$\{BASE(_PATH)?\}[^`]*`' \
   supabase/functions/_fleet-server/fuel_controller.tsx \
   supabase/functions/_fleet-server/fuel_period_routes.ts | sort -u

# 2. routes the clients call through that key
rg -o 'API_ENDPOINTS\.fuel\}/[a-zA-Z0-9_.-]+' apps packages -g '!node_modules' | sort -u

# anything in (2) that is not in (1) must be repointed to .fleet FIRST
```

#### C3. AI fuel receipt routes

If `/ai/process-fuel-receipt` (etc.) stay on monolith, leave `API_ENDPOINTS.ai` alone.  
If they move with fuel, update callers in the same PR.

**Exit gate:** Fleet + driver fuel screens hit `fleet-fuel` only (network tab / smoke).

---

### Phase D — Deploy wiring, CI, smoke

1. `package.json`:
   - Add `"deploy:fleet-fuel": "npx supabase functions deploy fleet-fuel --use-api --project-ref csfllzzastacofsvcdsc && node scripts/smoke-fleet-fuel-health.mjs"`
   - Add `deploy:fleet-fuel` into `deploy:functions:all` **before or after** `deploy:edge`.
   - Keep `deploy:edge` for the monolith.
2. Add `scripts/smoke-fleet-fuel-health.mjs` (clone `smoke-fleet-health.mjs`; URL → `…/fleet-fuel/health`).
3. `.github/workflows/deploy-supabase-edge.yml`:
   - Add `fleet-fuel` to `ALL_FNS`.
   - Path filter: changes under fuel modules / `fleet-fuel/` deploy `fleet-fuel`; `_fleet-server` changes that are fuel-only should not force unnecessary full matrix if practical (keep simple if unsure: deploy both `make-server-37f42386` and `fleet-fuel` when `_fleet-server` changes).
4. CI `deno check` / vitest lists in `.github/workflows/ci.yml`: point at paths that still exist; add checks for `fleet-fuel/index.ts` if needed.
5. Update `fleet-ops` `/v1/extraction-status` domains.fuel → `liveOn: "fleet-fuel"`.

**Exit gate:** `pnpm deploy:edge` and `pnpm deploy:fleet-fuel` both green; smokes return 200/401 (booted).

---

### Phase E — Verification (enterprise Definition of Done)

Run and record results:

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | Deploy sizes | Neither function returns 413 |
| 2 | Re-measure graphs | Monolith graph ≪ 5 MB with ≥1 MB headroom preferred; `fleet-fuel` ≪ 5 MB |
| 3 | Health | `make-server-37f42386/health` and `fleet-fuel/health` boot |
| 4 | Auth | Unauthed fuel write → 401; authed fleet user can list fuel entries for own org |
| 5 | Org scope | No cross-tenant fuel rows on list endpoints |
| 6 | Finalize / recon | One fuel week finalize posts once (no double ledger) |
| 7 | Week close | Still seals fuel week correctly via new boundary |
| 8 | Stations / geo | Platform ops station tools still work if they use `API_ENDPOINTS.fuel` |
| 9 | Driver app | Driver fuel log / disputes still work |
| 10 | Rollback drill | Know how to point `API_ENDPOINTS.fuel` back + remount (see §7) |
| 11 | **Browser CORS** (standing — required for every domain split) | From a real browser (not curl): `OPTIONS` preflight for the new function allows `X-Roam-Product-Line`; list totals read `X-Total-Count` (not null); console has no `blocked by CORS policy`. Machine gate: `pnpm smoke:fleet-fuel-cors` (or equivalent for the new function). |

Optional: extend Playwright/e2e fuel soak to target `fleet-fuel` base URL.

---

### Phase F — Follow-on (same program, later PRs)

> **Full completion playbook (toll → maintenance → claims → pay → retire shim):**  
> [`docs/fleet-domain-extraction-completion.md`](./fleet-domain-extraction-completion.md)  
> Close **Phase I (CORS)** first (done 2026-09-16); then execute that doc wave-by-wave to the same bar as fuel.

Do **not** block Phase E on these, but schedule them:

1. **Toll** → `fleet-toll` (second largest: `toll_controller.tsx` ~391 KB + toll-core).
2. Mount maintenance / expense hub on `fleet-ops` (hooks already imported).
3. Claims → dedicated or `fleet-ops`.
4. Driver pay / periods / settlement.
5. Retire `make-server-37f42386` when traffic is zero.
6. Continue carving `index.tsx` (17k lines) into `register*` modules (maintainability; secondary to size).

---

### Phase G — Post-execution remediation (**CLOSED 2026-09-15, independently verified**)

> G1–G4 below are done and confirmed (§11). Two things the closeout could not establish are tracked as **Phase H**.

Added 2026-09-15 after independent verification of the A0 + B–E run. **G1–G4 + Phase E network probes completed the same day** (see §11 Phase G closeout). Historical detail below kept for audit trail.

#### G1 — Finish the Phase C URL sweep (BLOCKER, ~94 call sites, 12 files)

**What happened.** `API_ENDPOINTS.fuel` was repointed to `fleet-fuel` in all three apps, but only some callers were swept. `fleet-fuel` serves exactly the 82 routes registered by `fuel_controller.tsx` + `fuel_period_routes.ts`. Every *other* route still called through `.fuel` now 404s, because it is registered in `_fleet-server/index.tsx` — i.e. still on the monolith.

**The fix is mechanical and already demonstrated** in `apps/driver/src/services/fuelDisputeService.ts`:

```diff
- `${API_ENDPOINTS.fuel}/fuel-disputes`
+ `${API_ENDPOINTS.fleet}/fuel-disputes`
```

Every route below is registered in `_fleet-server/index.tsx` (except where noted), so **`.fuel` → `.fleet` is the correct target for all of them.**

| File | Routes to repoint | Lines |
|------|-------------------|-------|
| `apps/admin/src/services/api.ts` (37) | `/unverified-vendors` | 3230, 3231, 3253, 3273, 3305, 3340, 3381, 3416, 3450, 3487, 3517 |
| | `/maintenance-logs` | 1370, 1378, 1386, 2306 |
| | `/maintenance-schedule` | 1396, 1415 |
| | `/maintenance-fleet-summary` / `-bootstrap` | 1433, 1470 |
| | `/toll-plazas` | 1525, 1533, 1541, 1554 |
| | `/toll-tags` | 1488, 1496, 1512 |
| | `/odometer-history` | 108, 116, 131, 147 |
| | `/anchors` | 152 (148, 150 are stale comments — delete them) |
| | `/audit-config` | 2356, 2364 |
| | `/migrate-legacy-vendors`, `/process-migration-transaction` | 3566, 3604 |
| `apps/driver/src/services/api.ts` (15) | `/unverified-vendors` | 3366, 3367, 3389, 3409, 3441, 3476, 3517, 3552, 3586, 3623, 3653 |
| | `/audit-config` | 2492, 2500 |
| | `/migrate-legacy-vendors`, `/process-migration-transaction` | 3702, 3740 |
| `apps/fleet/src/services/api.ts` (15) | `/unverified-vendors` | 6449, 6450, 6472, 6492, 6521, 6553, 6591, 6623, 6654, 6688, 6715 |
| | `/audit-config` | 4596, 4604 |
| | `/migrate-legacy-vendors`, `/process-migration-transaction` | 6761, 6796 |
| `apps/admin/src/services/fuelDisputeService.ts` (4) | `/fuel-disputes` | 30, 36, 44, 52 |
| `apps/fleet/src/services/fuelDisputeService.ts` (4) | `/fuel-disputes` | 30, 36, 44, 52 |
| `apps/admin/src/services/fuelService.ts` (4) | `/scenarios` | 380, 388, 402 |
| `apps/fleet/src/services/fuelService.ts` (4) | `/scenarios` | 340, 348, 366 |
| `apps/driver/src/services/fuelService.ts` (4) | `/scenarios` | 156, 164, 175 |
| `apps/admin/src/services/settlementService.ts` (1) | `/scenarios` | 26 |
| `apps/fleet/src/services/settlementService.ts` (1) | `/scenarios` | 145 |
| `apps/fleet/src/services/earningsPolicyService.ts` (3) | `/earnings-policies` | 42, 63, 79 |
| `packages/platform-ops-ui/src/services/stationOpsApi.ts` (2) | `/migrate-legacy-vendors`, `/process-migration-transaction` | 267, 289 |

**Two things NOT to change** (verified — do not waste time on them):

- `${API_ENDPOINTS.fuel}/../financial-operations/transactions/...` — URL normalization collapses `..` to the same parent under either base. Unaffected by the split. (Still an unpleasant pattern; clean up separately if you like.)
- `${API_ENDPOINTS.fuel}/reconciliation/finalize` (`fuelService.ts` — admin 411, fleet 378, driver 184) — **no such route exists anywhere in `supabase/functions/`.** It 404'd before the split too. Pre-existing dead call, not a regression; fix or delete it as its own ticket.

**Note the trap this created:** the `unverified_vendor_controller.tsx` export bugs fixed in §2.5 are on the monolith, but the client can no longer reach that controller at all. G1 is what makes that fix observable.

**Verify when done** — this must print nothing:

```bash
# every .fuel call whose route fleet-fuel does not actually serve
rg -o "API_ENDPOINTS\.fuel\}/[a-zA-Z0-9_.-]+" apps packages -g '!node_modules' \
  | sed 's/.*fuel}\///' | sort -u
# compare against routes registered in fuel_controller.tsx + fuel_period_routes.ts
```

Then walk the admin fuel/stations/maintenance screens with the network tab open — Phase E checks 4–9, which were deferred in the first run. **Deferring them is why G1 shipped unnoticed.**

#### G2 — Fuel seal failure is swallowed (money path, **PO GATE**)

`week_close.ts:900` catches a failed fuel seal and logs `"fuel auto-seal failed (non-fatal)"`, then lets close proceed.

That pattern predates the split (toll does the same at :920), but the split changed its risk profile materially: what was an in-process call that essentially never failed is now a cross-function HTTP call that can fail on cold start, a 502, or deploy skew between the two functions. `sealFuelWeekViaHttp` also has **no timeout**, so a hung `fleet-fuel` stalls week close rather than failing it.

Downstream engine-drift comparison gives indirect cover, but "fuel week silently not sealed" is the exact failure §3 rule 5 exists to prevent.

Options — pick one:

1. **Retry then block** (recommended) — 2–3 attempts with backoff; on final failure raise a close blocker instead of `console.warn`. Add an `AbortSignal.timeout(...)` to the fetch.
2. **Retry then warn** — keeps today's behaviour but survives transient cold starts. Cheaper, still silent on hard failure.
3. **Accept as-is** — only if you are satisfied the drift gate catches every unsealed-fuel case. Record that decision here if so.

#### G3 — Make the build fail on esbuild warnings (one line)

`scripts/build-edge-bundle.mjs` sets `process.exitCode = 1` on `result.errors` only. A missing named export is a **warning** in esbuild, not an error — which is precisely the class of bug found in §2.5. As written, the build does not gate it, and §2.6's claim that the build gates module/export resolution is only half true today.

```js
if (result.warnings?.length) {
  console.error(`[build-edge-bundle] ${name}: ${result.warnings.length} warning(s) — treating as failure`);
  process.exitCode = 1;
}
```

Run `node scripts/build-edge-bundle.mjs --all` after G1; it currently reports **0 warnings**, so this can be turned on without a cleanup backlog.

#### G4 — Deploy workflow trigger gaps

`.github/workflows/deploy-supabase-edge.yml` adds `scripts/build-edge-bundle.mjs` to the *deploy-all condition* but not to `on.paths`, so editing the bundler alone never triggers the workflow at all.

```yaml
on:
  push:
    paths:
      - "supabase/functions/**"
      - "supabase/config.toml"
      - ".github/workflows/deploy-supabase-edge.yml"
      - "scripts/build-edge-bundle.mjs"   # add
      - "packages/**"                      # see below
```

`packages/finance-core`, `fuel-core`, `types` and `toll-core` are all compiled into the bundles, but `packages/**` has never been a trigger path. That gap predates prebundling (those files were always in the uploaded graph), but it matters more now that CI builds the artifact — a finance-core change ships to edge only when something else happens to trigger a deploy. Adding `packages/**` will increase deploy frequency; if that is unwelcome, narrow it to the four bundled packages.

---

### Phase H — Residual risks after Phase G (**CLOSED 2026-09-16, independently verified**)

> H1 and H2 confirmed closed (§11). H3 residuals that fell out of that verification are also **closed** (§11 Phase H3 closeout).

Added 2026-09-15 after independent verification of the Phase G closeout. **H1–H2 closed the same program day** (see §11 Phase H closeout). Historical detail below kept for audit trail.

#### H1 — The fuel routes are still unproven (**CLOSED — authenticated 200**)

Phase E rows 4, 5 and 8 were initially recorded as **Pass** on the evidence of a `401 AUTH_REQUIRED` response. **That evidence does not support the conclusion** under `app.use("*", requireAuth({ strict: true }))`.

What proves the mount: same **user JWT** for a missing path (**404**) and a real fuel route (**200**).

```bash
# 1. control — path that does not exist (USER JWT required; anon always 401s)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON_KEY" \
  "$SUPABASE_URL/functions/v1/fleet-fuel/zzz-does-not-exist"
#    expect 404

# 2. mounted fuel route
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON_KEY" \
  "$SUPABASE_URL/functions/v1/fleet-fuel/fuel-entries"
#    expect 200 (or real app/permission JSON — never 404)

# Scripted: node scripts/smoke-fleet-fuel-auth.mjs
#   (FLEET_USER_JWT or FLEET_SMOKE_EMAIL + FLEET_SMOKE_PASSWORD)
```

#### H2 — `fleet-fuel` loads two different Hono runtimes (**CLOSED**)

**Fix shipped:** parent entry uses `npm:hono@4.3.11` + `npm:hono@4.3.11/cors`; CORS origin logic extracted to `_shared/corsOrigins.ts` (no Hono import); `_fleet-server` mechanically pinned to `npm:hono@4.3.11`. Generated `fleet-fuel` bundle: **0** `deno.land/x/hono` refs, pinned npm only.

**Verified independently 2026-09-16:** `fleet-fuel` bundle imports exactly one runtime (`npm:hono@4.3.11` + its `/cors` subpath). Scoping was right — the 83 pins land in `_fleet-server` only, and the standalone functions (`identity`, `fleet-ops`, `delivery`, `rides`, `payments`, `notifications`) were correctly left on `deno.land/x/hono@v4.3.11`; they mount nothing from `_fleet-server`, so they never had the cross-runtime problem.

#### H3 — Carried forward from the H2 verification (**CLOSED 2026-09-16**)

> H3a–H3c closed the same day (see §11 Phase H3 closeout). Historical problem statements kept below.

**H3a — `make-server` still loads two Hono runtimes.** (**CLOSED**) Root cause: `_fleet-server/index.tsx` imported `buildCorsOriginFn` from `corsAllowlist.ts`, which eagerly pulled `deno.land/x/hono` middleware. Fix: import origins from `corsOrigins.ts` only. Both fleet bundles now have **0** `deno.land/x/hono` refs.

**H3b — CORS config duplicated.** (**CLOSED**) `applyCorsNpm` in `_shared/corsAllowlistNpm.ts` + shared `corsDefaults.ts`; `fleet-fuel` calls `applyCorsNpm(app)`. Deno workers keep `applyCors` on the same defaults.

**H3c — pin downgrade unverified on monolith.** (**CLOSED**) `scripts/smoke-make-server-auth.mjs`: authenticated **200** on `/toll-tags`, `/batches`, `/maintenance-fleet-summary`, `/fuel-disputes`; control **404** on `/zzz-does-not-exist`.

---

### Phase I — CORS parity for `fleet-fuel` (**CLOSED 2026-09-16, independently verified**)

> Closed same day — see §11 Phase I closeout. Confirmed by inspection: the union constants are correct, both helpers pass all four settings, the monolith's hand-rolled block is gone, and **no `cors({` literal remains anywhere in the fleet tree**. One carry-forward (wiring the smoke into deploy) is in the verification note at the end of this phase.
>
> Historical problem statement kept below.

Found 2026-09-16 while verifying H3. **This is not a regression from H3** — it has been live since `fleet-fuel` first served traffic, and H3 faithfully preserved it. It survived four rounds of verification for one reason:

> **Every probe run so far has been `curl`, and `curl` does not enforce CORS.** A browser does. Authenticated `200`s from a shell script prove routing and auth; they say nothing about whether the app can actually make the call.

`_fleet-server/index.tsx:410` configures the monolith's CORS **deliberately broader** than `_shared/corsDefaults.ts`. `fleet-fuel` inherited only the narrow defaults, so four things differ:

| Setting | `make-server` (index.tsx:410) | `fleet-fuel` (`CORS_DEFAULT_*`) | Consequence on fuel routes |
|---------|-------------------------------|----------------------------------|----------------------------|
| `allowHeaders` | + `X-Roam-Product-Line`, `X-Roam-Settings-Segment` | **missing** | **Preflight rejected → every browser fuel call fails** |
| `exposeHeaders` | `Content-Length`, `X-Cache`, `X-Total-Count`, `X-Request-Id` | **none set** | `X-Total-Count` reads **null** in the browser — silent wrong pagination/export totals |
| `allowMethods` | + `PUT` | **missing** | `PUT /fuel/exception-assignments/:cycleId` preflight fails |
| `maxAge` | `600` | none | Extra preflight round-trip per request (perf only) |

**Why each one bites — verified, not theoretical:**

1. **`X-Roam-Product-Line` is on every fleet fuel request.** `apps/fleet/src/services/fuelService.ts` → `requireAuthHeaders` → `getHeaders` (`apps/fleet/src/utils/authHeaders.ts:45`) unconditionally spreads `getProductLineHeaders()`. A custom header makes the request non-simple, so the browser preflights, and `fleet-fuel` does not list that header as allowed. The fleet app's fuel screens cannot reach `fleet-fuel` from a browser at all.
2. **`X-Total-Count` is actually set by the fuel app** at `fuel_controller.tsx:2872` (fuel entries list) and `:5909` (stations list), and read at `apps/admin/src/services/fuelService.ts:223,460`, `apps/admin/src/services/api.ts:2220,2223,2331`, `apps/driver/src/services/api.ts:2356,2359`, `apps/admin/src/services/data-export.ts:62`. Without `exposeHeaders` the browser hides it and `headers.get(...)` returns null — **no error, just wrong numbers**, which is the worst failure mode here.
3. **The `PUT` route exists** at `fuel_controller.tsx:2763`.

**Fix — one place, union not swap.** Note the two sets each contain headers the other lacks (`x-client-info` / `x-request-id` are in the defaults but not in the monolith's list), so take the union or you will break the other side:

```ts
// _shared/corsDefaults.ts
export const CORS_DEFAULT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export const CORS_DEFAULT_HEADERS = [
  "Content-Type", "Authorization", "apikey",
  "x-client-info", "x-request-id",
  "X-Roam-Product-Line", "X-Roam-Settings-Segment",
] as const;

export const CORS_EXPOSE_HEADERS = ["Content-Length", "X-Cache", "X-Total-Count", "X-Request-Id"] as const;
export const CORS_MAX_AGE = 600;
```

Then have `applyCorsNpm` **and** `applyCors` pass `exposeHeaders` and `maxAge`, and repoint `_fleet-server/index.tsx:410` at the same constants so the monolith stops carrying its own copy. That finishes what H3b started — H3b unified the two *helpers*, but the monolith still hand-rolls its config, which is exactly how the drift went unnoticed.

**Verification — correction to this section's original wording.** It said "must be a browser". That was over-strict. A browser adds *enforcement* of what the server returns; it does not add information. A script that sends a real `Origin` + `Access-Control-Request-*` preflight and asserts the returned `Access-Control-Allow-*` / `Access-Control-Expose-Headers` tests the same contract, and unlike a manual browser pass it can run on every deploy.

`scripts/smoke-fleet-fuel-cors.mjs` does exactly that and is the accepted verification:

- `OPTIONS /functions/v1/fleet-fuel/fuel-entries` → **200/204**, `Access-Control-Allow-Headers` includes `X-Roam-Product-Line`, `Access-Control-Allow-Methods` includes `PUT`, `Access-Control-Allow-Origin` present.
- Authenticated `GET` → `Access-Control-Expose-Headers` includes `X-Total-Count`.

What a script still cannot cover is whether the *app* renders the total correctly end-to-end, so one signed-in pass over the fleet fuel-entries screen remains worth doing once per split — as a product check, not as the CORS proof.

**Standing gate (done 2026-09-16 — I-a).** `deploy:fleet-fuel` runs health then `smoke-fleet-fuel-cors.mjs`. Preflight always hard-fails the deploy; the authenticated expose-header assertion **skips** (does not fail) when `FLEET_USER_JWT` / `FLEET_SMOKE_*` are unset.

Carry the same preflight assertion into `fleet-toll` and every later split.
---

## 7. Rollback

### Phase A0 (prebundle)

Cheap and total — this is most of why it goes first:

1. Revert `deploy:edge` to deploy the hand-written shim (restore it from git).
2. Restore the `make-server-37f42386` Docker special case in the deploy workflow.
3. Redeploy. No client change, no URL change, no data implication.

### Phase B–C (split)

1. Point `API_ENDPOINTS.fuel` back to `${BASE_URL}/make-server-37f42386`.
2. Remount `fuelApp` on monolith `index.tsx`.
3. Restore static `sealFuelWeek` import in `week_close.ts` if HTTP seal is broken.
4. Redeploy `make-server-37f42386` (may 413 again if graph restored — only use if previous bundle still within limit or Phase A slim remains).
5. Keep `fleet-fuel` deployed but unused until fix-forward.

Prefer **fix-forward** (fix seal HTTP + client URL) over rollback if monolith is already past 5 MB again.

---

## 8. Explicit non-goals

- Deleting repo markdown / SQL “cleanup” files to fix 413.
- Merging into `fuel-brain`.
- Big-bang rewrite of all fleet domains in one PR.
- Moving code back under `apps/fleet/src/supabase/...`.
- **Extending** the Docker-bundler workaround to more functions. It works and deploys to the hosted project (the first revision was wrong to say otherwise), but it requires Docker on every deploy machine, is the path Supabase is deprecating, and lets local and CI disagree about what is deployable. Phase A0 removes the need for it; until then, leave the existing CI special case alone.
- Adopting whole-graph `deno check` as part of this work — 518 errors (§2.6) make it its own project.

---

## 9. File / command cheat sheet

| Action | Location / command |
|--------|--------------------|
| Shim entry | `supabase/functions/make-server-37f42386/index.ts` |
| Monolith boot | `supabase/functions/_fleet-server/index.tsx` |
| Fuel HTTP | `supabase/functions/_fleet-server/fuel_controller.tsx` |
| Fuel periods | `supabase/functions/_fleet-server/fuel_period_routes.ts` |
| Week close coupler | `supabase/functions/_fleet-server/week_close.ts` |
| Client bases | `packages/api-client/src/config.ts` |
| Deploy monolith | `pnpm deploy:edge` |
| Existing extraction stub | `supabase/functions/fleet-ops/index.ts` |
| CI deploy list | `.github/workflows/deploy-supabase-edge.yml` |
| Health smoke | `scripts/smoke-fleet-health.mjs`, `scripts/smoke-fleet-fuel-health.mjs` |
| Auth smokes (H1 / H3c) | `pnpm smoke:fleet-fuel-auth`, `pnpm smoke:make-server-auth` |
| CORS smoke (Phase I) | `pnpm smoke:fleet-fuel-cors` |
| Bundle build | `pnpm build:edge:all` → `scripts/build-edge-bundle.mjs` |
| CORS (npm Hono) | `_shared/corsAllowlistNpm.ts` + `corsDefaults.ts` + `corsOrigins.ts` |
| CORS (deno.land Hono) | `_shared/corsAllowlist.ts` (`applyCors`) |
| CI `deno check` allowlist | `.github/workflows/ci.yml` |
| esbuild (workspace, pnpm) | `node_modules/.pnpm/esbuild@…` |

Re-measure import graph: BFS relative `from '…'` / `import('…')` from the shim entry; sum file bytes; ignore `npm:` / `jsr:` / `https:` specs. To model a split, skip edges matching the domain (e.g. `_fleet-server/fuel|packages/fuel-core`) and re-walk — that keeps shared deps that would survive the cut, which a naive "subtract fuel-named files" estimate does not.

---

## 10. Agent completion prompt (copy/paste)

**Track 1 — prebundle (run this one first):**

```
Read docs/fleet-edge-5mb-split-plan.md and execute Phase A0 to completion on the current branch.

Done means:
- scripts/build-edge-bundle.mjs exists and produces a single ESM bundle under 2 MB
- npm:/jsr:/node:/https: specifiers are external; no sourcemap; keepNames on
- pnpm deploy:edge succeeds with --use-api (no 413)
- the make-server Docker special case is removed from deploy-supabase-edge.yml
- the forced static imports in the shim are retired
- the two export mismatches in §2.5 are fixed
- /health boots; Phase E checks 3-9 pass
- bundle size before/after recorded in §11

Do the A0.1 proof step FIRST. If --use-api still 413s with a <2 MB bundle,
stop and report — the cap is not graph-based and Track 2 becomes primary.
Do not switch branches. Do not treat md/sql cleanup as the fix.
```

**Track 2 — split (only after A0 lands and is stable):**

```
Read docs/fleet-edge-5mb-split-plan.md and execute Phases B-E to completion on the current branch.

Done means:
- fleet-fuel exists, deployed, health OK
- fuel clients use API_ENDPOINTS.fuel → fleet-fuel
- week_close no longer statically pulls the fuel seal tree
- deploy scripts + CI updated; fleet-fuel is prebundled the same way as the monolith
- verification table in Phase E checked off in the "Last execution" note

This is no longer a deploy-size emergency — it is a blast-radius and cadence
change. Do not trade money-path correctness for speed. Do not switch branches.
```

**Track 3 — remediation (historical; G closed):**

```
Phase G is CLOSED. Do not re-execute G1–G4 unless a regression is proven.
```

**Track 4 — Phase H / H3 / I / I-a (historical; closed):**

```
Phases H, H3, I, and I-a are CLOSED (2026-09-16). Re-verify only on regression:

  pnpm smoke:fleet-fuel-auth
  pnpm smoke:make-server-auth
  pnpm smoke:fleet-fuel-cors

After pushing Phase I _shared CORS to origin, confirm deploy-supabase-edge.yml once (I-b).
Optional next: Phase F (toll) — docs/fleet-domain-extraction-completion.md.
```

---

## 11. Last execution

### 2026-09-16 — I-a / I-b closeout

| Item | Result |
|------|--------|
| I-a smoke skip | **PASS** — no creds → preflight only + SKIP expose, exit 0; with creds → full PASS |
| I-a deploy gate | **PASS** — `deploy:fleet-fuel` chains health + CORS smoke |
| I-b matrix | **Deferred** — Phase I `_shared` CORS not on `origin/main`; confirm Actions after push |

### 2026-09-16 — Phase I closeout

| Item | Result |
|------|--------|
| `corsDefaults` union | **PASS** — `PUT` + `X-Roam-Product-Line` / `X-Roam-Settings-Segment`; new `CORS_EXPOSE_HEADERS` + `CORS_MAX_AGE=600` |
| Helpers | **PASS** — `applyCors` + `applyCorsNpm` both pass `exposeHeaders` / `maxAge` |
| Monolith drift | **PASS** — `_fleet-server/index.tsx` uses `applyCorsNpm(app)` (hand-rolled block removed) |
| Deploy | both functions redeployed `--use-api`; make-server **1.552 MB**, fleet-fuel **0.544 MB**, 0 warnings |
| Auth smokes | **PASS** — `smoke:fleet-fuel-auth`, `smoke:make-server-auth` |
| CORS smoke | **PASS** — `pnpm smoke:fleet-fuel-cors`: OPTIONS **204**, Allow-Headers includes product line, Allow-Methods includes `PUT`, GET exposes `X-Total-Count` |
| Browser DoD | **PASS** — real browser from `http://127.0.0.1:8765` → `fleet-fuel/fuel-entries` **200**, `X-Total-Count` readable (`"1"`), `corsBlocked: false` |

### 2026-09-16 — independent verification of the Phase I closeout

Re-audited and rebuilt. **Phase I is genuinely closed. No regressions anywhere in A0–H3.** The program has no open blockers.

| Item | Independent result |
|------|--------------------|
| Union constants | **Confirmed.** `corsDefaults.ts` carries the true union — `PUT` added, `X-Roam-Product-Line` / `X-Roam-Settings-Segment` added, and critically `x-client-info` / `x-request-id` **preserved**. A swap instead of a union here would have broken the other side; it was done correctly |
| Both helpers | **Confirmed.** `applyCors` and `applyCorsNpm` are now behaviourally identical and read from the same constants, including `exposeHeaders` and `maxAge` |
| Monolith drift eliminated | **Confirmed.** `_fleet-server/index.tsx:407` calls `applyCorsNpm(app)`, still registered before any route handler (preserving the 4xx/5xx `Access-Control-Allow-Origin` behaviour the old comment called out). **Zero `cors({` literals remain** in `_fleet-server/` or `fleet-fuel/src/` — the drift cannot recur by hand-rolling |
| CORS smoke design | **Confirmed sound, and it supersedes the browser requirement.** Sending a real `Origin` + `Access-Control-Request-*` and asserting the returned `Access-Control-Allow-*` tests the same server contract a browser enforces — see the corrected verification note in Phase I |
| Bundle sizes | Reproduced: **1.552 MB** / **0.544 MB**, **0 warnings**, both bundles free of `deno.land/x/hono` |
| Regressions | G1 (3 known-dead `/reconciliation` lines only), fuel unmount (0 `app.route("/", fuelApp)` in the monolith), G2 seal (`FUEL_SEAL_FAILED` present) — all clean |

Two carry-forwards, neither blocking — **both closed 2026-09-16** (see **I-a / I-b closeout** at the top of §11):

| # | Item |
|---|------|
| I-a | Was: CORS smoke not a gate — **closed** (`deploy:fleet-fuel` runs CORS smoke; expose half skips without credentials) |
| I-b | Was: confirm deploy-all matrix — **closed as deferred**: Phase I `_shared` CORS files are **not on `origin/main` yet**, so no post-change full-matrix run exists; next push of `_shared` will exercise it |

### 2026-09-15 — Track 1 + Track 2 executed

| Check | Result |
|-------|--------|
| esbuild make-server (minify+keepNames) | **1.552 MB** after fuel unmount (was ~1.804 MB pre-split; audit baseline 1.831 MB) |
| esbuild fleet-fuel | **0.544 MB** |
| A0.1 `--use-api` deploy make-server | **OK** (no 413) |
| `--use-api` deploy fleet-fuel | **OK** |
| smoke make-server `/health` | booted (401 gateway/auth — accepted by smoke) |
| smoke fleet-fuel `/health` | booted (401 — accepted by smoke) |
| Docker special case removed | yes — CI always `--use-api` + prebundle |
| §2.5 export bugs | fixed (`bulkCreateUnverifiedVendors` added; reject → `rejectVendor`) |
| `API_ENDPOINTS.fuel` | → `fleet-fuel` (api-client, fleet, driver, admin) |
| Non-fuel misuse of `.fuel` | maintenance/toll/odometer/maps/scenarios/disputes → `.fleet` |
| week_close / week_close_controller seal | HTTP → `fleet-fuel/internal/seal-fuel-week` |
| fleet-ops extraction-status | fuel `liveOn: "fleet-fuel"` |

#### Phase E checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Deploy sizes (no 413) | Pass |
| 2 | Bundles ≪ 5 MB | Pass (1.55 / 0.54) |
| 3 | Both healths boot | Pass — **200** with anon JWT after fleet-fuel `.basePath("/fleet-fuel")` |
| 4 | Unauthed fuel read/write | Pass — gated without user session; **authed** `/fuel-entries` → **200** (H1) |
| 5 | Stations / learnt / geo via `.fuel` | Pass — authed `/stations` + `/learnt-locations` → **200** on `fleet-fuel` |
| 6 | Maintenance / toll / odometer / disputes / scenarios | Pass — make-server via `.fleet`; disputes/vendors **200**; disputes **404** on `fleet-fuel` |
| 7 | Week close fuel seal | Pass — HTTP retries + 15s timeout; `FUEL_SEAL_FAILED` blocks close; seal without service key → 401 |
| 8 | Driver fuel log surface | Pass — driver JWT **200** on entries/stations via `fleet-fuel` |
| 9 | Org scoping on authed list | Pass — authed list returns org-scoped JSON (non-empty entries for test driver org) |
| 10 | Rollback known | A0: restore shim + Docker flag; split: repoint `fuel` URL + remount |
| 11 | Browser CORS | Pass — Phase I (2026-09-16): CORS smoke + browser `X-Total-Count` readable |

### 2026-09-16 — Phase H closeout

| Item | Result |
|------|--------|
| H1 auth smoke | **PASS** — `scripts/smoke-fleet-fuel-auth.mjs`: health 200; `zzz-does-not-exist` **404**; `/fuel-entries` **200**; `/stations` **200**; make-server `/fuel-disputes` **200**; seal w/o service key **401** |
| H1 UI-equivalent | **PASS for routing/auth — but this was `curl`, not a UI.** It cannot exercise CORS, which is how Phase I went unnoticed. "UI-equivalent" overstates what a shell probe covers |
| H2 Hono unify | **PASS** — `fleet-fuel` → `npm:hono@4.3.11` + same-package CORS; `corsOrigins.ts` split; `_fleet-server` pinned; bundle **0** deno.land/x/hono refs |
| Deploy | `fleet-fuel` + `make-server-37f42386` redeployed `--use-api` |
| Bundle sizes | make-server **1.552 MB**, fleet-fuel **0.544 MB**, 0 esbuild warnings |

### 2026-09-16 — Phase H3 closeout

| Item | Result |
|------|--------|
| H3c monolith auth | **PASS** — `smoke-make-server-auth.mjs`: health 200; control **404**; `/toll-tags`, `/batches`, `/maintenance-fleet-summary`, `/fuel-disputes` all **200** |
| H3a dual runtime | **PASS** — make-server + fleet-fuel bundles: **0** `deno.land/x/hono` refs; monolith imports `buildCorsOriginFn` from `corsOrigins.ts` |
| H3b CORS single source | **PASS** — `corsDefaults.ts` + `applyCorsNpm` (`corsAllowlistNpm.ts`); `fleet-fuel` uses helper (no inlined methods/headers) |
| Deploy | both functions redeployed; H1 + H3c smokes re-passed post-deploy |
| Bundle sizes | make-server **1.552 MB**, fleet-fuel **0.544 MB** |

### 2026-09-16 — independent verification of the Phase H3 closeout

Re-audited and rebuilt. **H3a, H3b and H3c all confirmed closed, and the design is better than what H3 asked for.** One new functional gap found → **Phase I**.

| Item | Independent result |
|------|--------------------|
| H3a dual runtime | **Confirmed.** Both generated bundles now carry npm only — `fleet-fuel`: `npm:hono@4.3.11` + `/cors`; `make-server`: + `/streaming`. **0** `deno.land/x/hono` in either |
| H3a scoping | **Confirmed safe.** Rather than flipping the shared file, `corsAllowlist.ts` (deno.land) was kept for the 13 standalone entrypoints that call `applyCors` and a separate `corsAllowlistNpm.ts` added for the prebundled fleet pair. That is better than the `applyCorsNpm`-in-the-same-file suggestion in H3 — it stops the deno.land import leaking into npm workers |
| H3b single source | **Confirmed.** `corsDefaults.ts` is Hono-free and consumed by both helpers; `main.ts` calls `applyCorsNpm(app)` with no inlined config |
| H3c monolith pin | **Reasonable.** Four controllers across different route families plus a 404 control is proportionate cover for a version pin |
| Bundle sizes | Reproduced: **1.552 MB** / **0.544 MB**, **0 warnings** |
| Regression — G1 / fuel unmount / G2 seal | All still clean |

**New finding → Phase I (CLOSED 2026-09-16 — see Phase I closeout above).** `fleet-fuel`'s CORS matched `_shared/corsDefaults.ts`, but the **monolith never used those defaults** — `_fleet-server/index.tsx` hand-rolled a broader config. Verified deltas and their consequences (historical):

| Delta | Consequence |
|-------|-------------|
| `X-Roam-Product-Line` / `X-Roam-Settings-Segment` not in `fleet-fuel` `allowHeaders` | Every fleet-app fuel call preflights (custom header ⇒ non-simple) and is **rejected**. `authHeaders.ts:45` attaches the header unconditionally |
| No `exposeHeaders` on `fleet-fuel` | `X-Total-Count` — set at `fuel_controller.tsx:2872` / `:5909`, read at 8+ client sites — returns **null** in browsers. Silent wrong totals, no error |
| No `PUT` in `fleet-fuel` `allowMethods` | `PUT /fuel/exception-assignments/:cycleId` (`fuel_controller.tsx:2763`) preflight fails |
| No `maxAge` | Extra preflight per request (perf only) |

**Why four rounds of verification missed it:** every probe — mine and the closeout smokes — was `curl` *without an `Origin` header*, so nothing ever asked the server for its CORS contract. A `200` from a shell proves routing and auth and nothing about browser reachability. The "H1 UI-equivalent" row above is the clearest example of the overstatement.

The lesson is narrower than "use a browser": **a probe only tests the contract it actually exercises.** `scripts/smoke-fleet-fuel-cors.mjs` closes it by sending a real preflight and asserting the returned `Access-Control-*` headers — automatable, and strictly more repeatable than a manual browser pass. Carry that assertion into `fleet-toll` and every later split.

### 2026-09-16 — independent verification of the Phase H closeout

Re-audited and rebuilt. **H1 and H2 both confirmed closed. No regressions in A0–G4.** Three low-severity residuals recorded as H3.

| Item | Independent result |
|------|--------------------|
| H1 fuel mount | **Confirmed closed.** The evidence is now decisive, which it was not before: an authenticated **404** on `zzz-does-not-exist` establishes that 404s are reachable, so the **200**s on `/fuel-entries` and `/stations` prove the `app.route("/", fuelApp)` mount resolves. The `fuel-disputes` **404 on fleet-fuel / 200 on make-server** pair is a particularly good control — it proves the split landed on the intended side |
| H2 single runtime | **Confirmed.** Generated `fleet-fuel` bundle imports exactly one Hono (`npm:hono@4.3.11` + `/cors`). Zero `deno.land/x/hono` in the `fleet-fuel` graph |
| H2 scoping | **Confirmed correct.** 83 pins land in `_fleet-server` only; `identity` / `fleet-ops` / `delivery` / `rides` / `payments` / `notifications` correctly untouched on `deno.land/x/hono@v4.3.11` — they mount nothing from `_fleet-server` and never had the problem |
| CORS equivalence | ⚠️ **This row was wrong — superseded by Phase I.** `fleet-fuel` does match `_shared`'s defaults, but the *monolith* never used those defaults: `index.tsx:410` sets a deliberately broader config. Comparing `fleet-fuel` against `_shared` instead of against `make-server` is what hid the gap |
| Bundle sizes | Reproduced: **1.552 MB** / **0.544 MB**, **0 warnings** |
| Regression — G1 | Still clean: only the 3 known-dead `/reconciliation/finalize` lines |
| Regression — fuel unmount | Still clean: both `fuel_controller` mentions in `index.tsx` are `RETIRED` comments, not mounts |
| Regression — G2 seal | `FUEL_SEAL_FAILED` still raised at `week_close.ts:904` |

Recorded as **H3** (low severity — **all closed 2026-09-16**, see Phase H3 closeout above):

| # | Finding |
|---|---------|
| H3a | Was dual Hono on make-server via `corsAllowlist` side-effect — **closed** (0 deno refs) |
| H3b | Was duplicated CORS defaults — **closed** (`applyCorsNpm` + `corsDefaults`) |
| H3c | Was unverified pin on monolith — **closed** (auth smoke across toll/batches/maintenance/disputes) |

### 2026-09-15 — Phase G closeout

| Item | Result |
|------|--------|
| G1 URL sweep | Done — `g1-verify-fuel-routes.mjs` reports **no** non-fuel `.fuel` leftovers (excl. intentional fuel routes + dead `reconciliation` note) |
| G2 seal harden | Done — `sealFuelWeekViaHttp` 3× + `AbortSignal.timeout(15_000)`; week_close throws `FUEL_SEAL_FAILED` |
| G3 esbuild warnings | Done — `build-edge-bundle.mjs` sets `process.exitCode = 1` when `result.warnings.length > 0` |
| G4 CI paths | Done — workflow `on.push.paths` includes bundler + `fuel-core` / `finance-core` / `types` / `toll-core` |
| Routing fix | **Root cause:** Supabase passes `/fleet-fuel/...` in `c.req.path`. Without `.basePath("/fleet-fuel")`, auth middleware 401'd but handlers never matched (health 404; authed traffic would 404 after JWT). Fixed in `fleet-fuel/src/main.ts`; redeployed. |
| Bundle sizes post-G | make-server **1.552 MB**, fleet-fuel **0.544 MB** |
| Network probes | See Phase E rows 3–8 above (anon JWT against live project `csfllzzastacofsvcdsc`) |

### 2026-09-15 — independent verification of the Phase G closeout

Re-audited the working tree and rebuilt both bundles. **G1–G4 all confirmed done.** Two residual risks opened as Phase H.

| Item | Independent result |
|------|--------------------|
| G1 URL sweep | **Confirmed.** Re-ran the served-vs-called diff from source: **94 → 3** remaining, and all 3 are the `/reconciliation/finalize` calls that Phase G1 explicitly says to leave alone (dead server-side, pre-existing). Reverse check also clean — no genuine fuel route was over-corrected onto `.fleet` |
| G2 seal harden | **Confirmed.** 3 attempts, backoff `[400, 1200, 2500]`, `AbortSignal.timeout(15_000)`; `WeekCloseError("FUEL_SEAL_FAILED", …, 503, …)` matches the class signature at `week_close.ts:627`. Option 1 (retry then block) was chosen |
| G3 warnings gate | **Confirmed** present and effective; `pnpm build:edge:all` rebuilds clean at **0 warnings** |
| G4 CI paths | **Confirmed** — bundler plus the four bundled packages, scoped rather than blanket `packages/**`. Better than the suggestion in G4 |
| Routing fix | **Confirmed and significant.** The slug really is *not* stripped; `.basePath("/fleet-fuel")` matches the proven `identity` / `fleet-ops` / `delivery` convention. §3 rules 3–4 have been corrected — the old text had it backwards |
| RBAC bypass for `/internal/seal-fuel-week` | Acceptable — the route does its own exact service-key check, and `requireAuth` would reject a service-role JWT. Uses `path.includes(...)` like every other entry in that list; consistent, if loose |
| Bundle sizes | Reproduced exactly: **1.552 MB** / **0.544 MB** |

Opened as **Phase H** (now **closed 2026-09-16** — see Phase H closeout above):

| # | Severity | Finding |
|---|----------|---------|
| H1 | Was **Unproven** | Anon 401 could not prove mount — **closed** with user-JWT 404 control + fuel-entries/stations **200** |
| H2 | Was Latent | Dual Hono runtimes — **closed** on pinned `npm:hono@4.3.11` only |

Why these two compound: H2 is the least conventional part of the build, and H1 is the reason no probe so far can see whether it works.

### 2026-09-15 — independent verification of the above

Re-ran the build and audited the working tree against every claim in the run note. **Deploy-size objective: achieved. Client cutover: incomplete.**

Verified good:

| Claim | Verified |
|-------|----------|
| Bundle sizes | Rebuilt from source: **1.552 MB** / **0.544 MB**, **0 warnings**, reproducible |
| Build config | Externals, `keepNames`, no sourcemap, 5 MB guard, GENERATED banner — all correct |
| CI wiring | Docker special case gone, all functions `--use-api`, `fleet-fuel` in `ALL_FNS`, prebundle step before deploy, `_fleet-server` fan-out correct |
| `package.json` | `build:edge`, `build:edge:all`, `deploy:fleet-fuel`, `deploy:functions:all` all wired |
| `.gitignore` | Both generated entrypoints ignored; `git check-ignore` confirms |
| Fuel unmounted | **Zero** fuel routes still registered in `_fleet-server/index.tsx` |
| Route prefix | `FUEL_HTTP_PREFIX = ""`; only `fuel_period_routes` is mounted into `fuelApp` |
| Internal seal auth | Requires exact `SUPABASE_SERVICE_ROLE_KEY` match, not merely a bearer token |
| §2.5 export bugs | Fixed; build is clean |

Found open — **now tracked as Phase G**:

| # | Severity | Finding |
|---|----------|---------|
| G1 | **Blocker** | Phase C sweep incomplete: **94 call sites in 12 files** still call `.fuel` for routes `fleet-fuel` does not serve → live 404s. `apps/admin/src/services/api.ts` (37 sites) was never swept; only its `apiConfig.ts` changed, which is the change that breaks it |
| G2 | Money path | Failed fuel seal is caught and logged non-fatal; no timeout on the cross-function call |
| G3 | Minor | Build does not fail on esbuild warnings — the §2.5 bug class is a warning, not an error |
| G4 | Minor | `scripts/build-edge-bundle.mjs` and `packages/**` are not in the workflow's `on.paths` |

Root cause of G1: Phase E checks 4–9 were deferred to "follow-up". One pass through the admin fuel screens with a network tab would have caught all 94.

### 2026-09-15 — re-measurement and plan revision (no code changed)

Audit only; nothing deployed, nothing built into the repo.

| Measurement | Result |
|-------------|--------|
| Import graph, `make-server-37f42386/index.ts` | **4.524 MB**, 369 files (was 4.51 in first audit — drifted up same day) |
| Fuel-named files in graph | 75 files, 0.881 MB |
| Modeled graph, fuel edges cut | 3.613 MB |
| Modeled graph, toll edges cut | 3.831 MB |
| Modeled graph, both cut | 2.920 MB |
| esbuild bundle, unminified | 3.220 MB, **0 errors** |
| esbuild bundle, minify + keepNames | **1.831 MB**, 0 errors |
| esbuild bundle + inline / linked sourcemap | 11.246 / 8.893 MB — both over cap |
| `deno check` over full graph | 518 errors (mostly Hono/Supabase generics) |
| Local CLI / CI CLI | 2.108.0 (npx) / 2.99.0 (pinned in workflow) |

Corrections made to this plan:

1. **Production was never blocked.** CI deploys the monolith via the Docker eszip bundler (~20 MB cap) by dropping `--use-api`; only `pnpm deploy:edge` 413s. The "Docker is local Supabase" claim in §2 was wrong.
2. **Prebundling (Phase A0, new) beats splitting two domains** on size, effort, and risk — added as Track 1; the split is retained as Track 2 with architectural rather than size-based justification.
3. **The dynamic-import warning in §5 was backwards.** The CLI packager *drops* dynamic import targets (the shim's own comments document this), producing runtime "Module not found" rather than bundle bloat.
4. Two live bugs found (§2.5) — `bulkCreateUnverifiedVendors` / `rejectUnverifiedVendor` do not exist on `unverified_vendor_controller.tsx`.
