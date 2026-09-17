# Fleet domain extraction — completion playbook

**Status (2026-09-17, Rev 10):** Extraction is **complete and deployed**. Six functions live; D9 browser pass closed; four external callers re-pointed; soak instruments armed (full offender tail + inventory-driven gate 3). **One gate remains: 7 consecutive `ok:true` soak days**, then retire `make-server-37f42386`.

**Nothing else is open.** See §1 for the clock and plateau watch.

> **History:** Rev 1–9 audit detail (findings A1–A9, B1–B5, C–J) lived in this file and is now in git history (`git log -p docs/fleet-domain-extraction-completion.md`). What survived the trim: everything still actionable, the Definition of Done, the hard lessons, and the settled decisions in §7 that stop the program being re-litigated.

---

## 1. What's left

### 1.1 Instruments armed (Rev 10)

Closed in this closeout:

- **D13 / repo = production** — external-caller check, retire gate 3, `fleet_wipay` fleet-core URLs, and migration `20260917140000_rush_trip_recon_cron_fleet_core` are in git (migration was already applied live).
- **Full soak tail** — `check-shim-traffic.mjs` persists every shim offender (no `slice(0, 10)`). `--append-log` refuses multi-day windows so it cannot write empty `topOffenders`.
- **Inventory-driven gate 3** — `f5-external-callers-check.mjs` asserts every `callers[].shimPathSuffix` against the latest soak day; Uber-only regex removed. `--force` still cannot skip this gate.

Day 1 history (2026-09-17 truncated row: nonHealth 157, top-10 sum 127) stays as evidence of the old bug. From the Rev 10 re-baseline forward, every path is attributable.

### 1.2 Let the tail decay, and watch for plateaus

Both early soak days are `ok:false` (4,368 → 157). The streak starts the first day `nonHealth` hits **0** — a single non-health request fails the day, and that is intended. Do not reach for `--force`.

With the four known external callers re-pointed, the remainder should be stale clients (cached bundles, un-updated apps) decaying as caches expire. **A path that plateaus instead of falling across 2–3 red days is a fifth external caller you have not found** — add it to [`docs/f5-external-callers.json`](./f5-external-callers.json), re-point, then continue. Full-tail persistence is what makes that signal visible.

Daily: CI workflow `shim-traffic-soak.yml` appends [`docs/f5-soak-log.json`](./f5-soak-log.json), or run `pnpm check:shim-traffic:log` locally (`ROAM_MGMT_PAT` or `SUPABASE_ACCESS_TOKEN`). After each append: `pnpm f5:external-callers`.

At **7 consecutive `ok:true`** ending today or yesterday UTC: `pnpm f5:retire-shim` → commit → CI. Never `--force`.

---

## 2. Current architecture

| Surface | Function | Client key | Notes |
|---|---|---|---|
| Fuel | `fleet-fuel` | `API_ENDPOINTS.fuel` | 115 routes |
| Toll | `fleet-toll` | `.toll` | 76 routes |
| Maintenance / expense | `fleet-ops` | `.fleetOps` | 76 routes |
| Claims | `fleet-claims` | `.claims` | 75 routes; shim returns **410 + `useEndpoint`** for moved paths |
| Pay / settlement / periods | `fleet-pay` | `.fleetPay` | 103 routes; week-close conductor stays on core (ADR-0021) |
| Residual (drivers, ledger, enterprise, tags, assets, platform) | `fleet-core` | `.fleetCore` | 567 routes; `API_ENDPOINTS.fleet` = **0 sites**, legacy keys aliased |
| Shim | `make-server-37f42386` | — | Dual-serves the same registrar as `fleet-core` during soak; retire at 7 greens |

All six boot via `createFleetFunction` (`_shared/edgeKernel.ts`), which owns path normalization → CORS → correlation ID → error boundary → **maintenance gate** → health/ready → `/internal/*` service-role guard → domain mount. `lint-edge-kernel.mjs` enforces this in CI, so the middleware-drift class of bug cannot return.

**Armed CI gates** (`.github/workflows/deploy-supabase-edge.yml`):
`lint-edge-kernel` · `edge-route-manifest --all --check` · `check-edge-manifest-overlap` · `generate-extraction-status` + staleness diff · post-deploy `smoke-edge-fn` per slug.

`check-edge-manifest-overlap` deliberately excludes `fleet-core` (it serves the shim's registrar by design during soak) and prints that exception in its success line.

---

## 3. Retiring the shim

**Pass rule:** 7 consecutive calendar days with `ok: true` in [`docs/f5-soak-log.json`](./f5-soak-log.json) **and** `check-shim-traffic --days 7` exit 0. Only `/health` and `/ready` are ignored.

**Commands:** `pnpm check:shim-traffic` · `pnpm check:shim-traffic:log` (append today's row). Auth: `ROAM_MGMT_PAT` or `SUPABASE_ACCESS_TOKEN`. Daily workflow `.github/workflows/shim-traffic-soak.yml` commits the log back on red *and* green.

**`pnpm f5:retire-shim` has three prechecks:**

| # | Gate | `--force` skips? |
|---|---|---|
| 1 | Live `check-shim-traffic --days 7` exits 0 | yes |
| 2 | 7 consecutive `ok:true` log rows **ending today or yesterday UTC** | yes |
| 3 | `f5-external-callers-check` — inventory all cleared/fixed + no inventory `shimPathSuffix` in offenders | **no — data-loss path** |

The recency condition on gate 2 is deliberate: it stops a stale green streak authorizing a retirement weeks later. Gate 3's `--force` exemption is deliberate: traffic and log-continuity are judgement calls an operator may override; silently dropping partner webhook events is not.

### F5 soak log

| Day | Date (UTC) | Non-health | Health | Notes |
|-----|------------|------------|--------|-------|
| 0 | 2026-09-16 | **4,368** | 45 | Post-SQL-filter rebaseline (≈ prior ~4,400 — filter validated). Expected red, pre-client-ship. |
| 1 | 2026-09-17 | **157** | 0 | Post-cutover decay, 96% drop. `platform-status` 26, `drivers` 22, `transactions` 21. Still `ok:false`. |
| 2–7 | | | | Streak starts the first `ok:true` day. |

### External callers (never decay on their own)

[`docs/f5-external-callers.json`](./f5-external-callers.json) — all four cleared/fixed:

| Caller | Kind | Fix |
|---|---|---|
| `uber-webhook` | third-party dashboard | Re-pointed to `…/fleet-core/uber/webhook` (the URL `/uber/status` advertises) |
| `rush-trip-recon-cron` | **pg_cron** | Migration `20260917140000` — unschedule + reschedule on `fleet-core` |
| `wipay-fleet-modules` | partner callback builder | `fleet_wipay.ts` no longer mints shim URLs |
| `fuel-period-auto-close` | GitHub Actions | Already posting `fleet-fuel`; docs corrected |

Verified separately: **no live server-side caller targets the shim URL** — a sweep of `_fleet-server/`, every `src/`, and `scripts/` returns only a comment and two smoke scripts whose job is to probe the shim.

### D9 browser pass — **CLOSED 2026-09-17**

All six slugs PASS on logged-in `roamfleet.co` with per-row evidence: fuel `X-Total-Count: 24`; toll logs 200 (`/toll-tags` 404 noted, non-CORS); ops maintenance hub 200; claims export **215 = API 215**; pay Settlements **2 of 2**; core drivers list 200. No CORS errors anywhere. Notes: [`docs/phase-i-cors-browser-checklist.md`](./phase-i-cors-browser-checklist.md).

**Rollback (ADR-0022):** code remount + revert timed at **14 ms**; single-domain edge redeploy (`fleet-toll`) **~6.1 s** + smoke green. Full RTO is dominated by the client app ship, which was not timed — **≤4h stays a planning ceiling, not a measured number**.

---

## 4. Definition of done (D1–D15)

The bar for any future extraction. D1–D11 are the original fuel gates; D12–D15 were added by audit.

| # | Gate | Pass |
|---|------|------|
| D1 | Own deployable function under 5 MB with esbuild prebundle | Deploy succeeds `--use-api` |
| D2 | Routes use `.basePath("/<slug>")` (slug **not** stripped by Supabase) | `/health` → 200 |
| D3 | Single Hono family: `npm:hono@4.3.11` for anything mounting `_fleet-server` | Bundle has 0 `deno.land/x/hono` |
| D4 | CORS parity with monolith (`corsDefaults` union: product-line headers, `exposeHeaders`, `PUT`, `maxAge`) | Browser preflight 204; no console errors |
| D5 | Controllers unmounted from the shim | Zero live registrations for that domain |
| D6 | Dedicated `API_ENDPOINTS.<domain>` + full client sweep | Generated manifest: called prefixes ⊆ served routes |
| D7 | Money couplings are HTTP + retry/timeout + **block on hard failure** | Seal failure fails close |
| D8 | Auth proof with a real user JWT: missing path 404, real path 200 (or 403 — never 404) | Smoke green |
| D9 | **Browser** soak in devtools: list screens load, totals real if `X-Total-Count` used | No CORS blocks, no silent null totals |
| D10 | CI: function in deploy list; path triggers include bundler + domain packages | Workflow updated |
| D11 | Execution log row filled; extraction-status agrees | Docs + status endpoint agree |
| D12 | Built by `createFleetFunction` — maintenance gate, error boundary, correlation ID, path normalization | Kernel lint green |
| D13 | **Committed, pushed, deployed by CI** — not a local `pnpm deploy:*` | Workflow run links the artifact |
| D14 | Cross-function money calls carry an idempotency key and write `week_seal_log` | Replay drill: duplicate seal is a no-op |
| D15 | Route manifest committed and non-overlapping with the shim's | `manifest ∩ shim = ∅` |

**Never** mark complete on an anon `curl` 401 — that only proves the worker is alive. **Never** mark complete on a working tree (D13).

---

## 5. Hard lessons

1. **Repointing a base URL is not cutover.** Changing an endpoint without sweeping every caller moved maintenance/toll onto the wrong function (~94 404s).
2. **Slug stays in `c.req.path`** — use `.basePath("/<slug>")`. Health without it 404s.
3. **One Hono runtime on mount boundaries.** Parent and child must both be `npm:hono@4.3.11`.
4. **Don't import `corsAllowlist.ts` into npm workers** — use `corsOrigins.ts` / `corsAllowlistNpm.ts`.
5. **CORS must match the monolith, not a narrower shared default.** Apply the union to every new function *before* client cutover.
6. **`curl` ≠ UI.** Shell smoke is required; the browser network tab is also required.
7. **Money path over HTTP:** retries + timeout; week close blocks on hard seal failure.
8. **Stay on the current branch** unless asked. No stash/switch for "isolation."
9. **Work that is not committed does not exist.** A green local smoke against a hand-deployed function proves nothing, and CI will happily skip what it cannot find.
10. **Extraction subtracts by default.** A controller brings its routes and authz but *not* the app-level middleware around it — the maintenance-mode gate was silently dropped this way. Use the kernel so the question cannot arise.
11. **A check that compares against a hand-typed list is not a check.** Derive the expected set from the code, or it rots into a green light.
12. **Asymmetric failure handling is a decision and must be written as one.** Any lane allowed to soft-fail needs an ADR and a persisted drift row, never a `console.warn`.
13. **The monolith's entry file is a domain too.** Routes with no module cannot be mounted, extracted, or retired.

**On verification specifically — the recurring failure mode across nine audit rounds:**

14. **Building a control is not arming it.** Manifests nothing validates and a smoke nothing invokes are decorative.
15. **An armed control does nothing until it's in the pipeline it was written for.**
16. **The last gate is the one nobody instruments.** F5 sat on "N-day zero traffic" with no traffic measurement and `N` undefined.
17. **An instrument that can only fail optimistically is worse than none** — it converts "we didn't check" into "we checked and it was clean." Validate a measurement change by re-measuring (the shim filter fix was confirmed by 4,368 vs the prior ~4,400, not by assertion).
18. **A measurement you have to remember to save is a measurement you will lose.**
19. **Decay curves hide the callers that don't decay.** A soak measures *whether* traffic stops, never *whether it can*. Split the tail into "will decay" and "must be re-pointed."
20. **A gate that reads a truncated log is asking a question it cannot hear the answer to.** Closed Rev 10: persist every offender; inventory-driven suffix asserts.

---

## 6. Every-PR checklist

- [ ] Committed and pushed — **CI deployed it, not a laptop** (D13)
- [ ] `pnpm build:edge:all` clean, each function ≪ 5 MB
- [ ] Built via `createFleetFunction`; kernel lint green (D12)
- [ ] 0 `deno.land/x/hono` in npm-based fleet bundles
- [ ] Auth smoke + browser soak + maintenance-mode drill
- [ ] Manifest committed; client ⊆ manifest; manifest ∩ shim = ∅ (D15)
- [ ] Seal behaviour documented in an ADR, idempotent, replay-tested (D14)
- [ ] `CODEOWNERS` entry for the new surface
- [ ] Execution log row updated (§8)

---

## 7. Settled — do not re-litigate

Each of these was raised, investigated, and closed. Re-raising them costs a round.

- **`register_residual_monolith_routes.tsx` is 16k lines and that is fine.** ADR-0021 gives the entire residual one destination (`fleet-core`), so F5 is a rename plus a soak, not a carve. Decomposing it is code health on its own schedule — **not an F5 blocker**.
- **`fleet-core`'s exclusion from the overlap checker's `FLEET_SLUGS` is correct.** It serves the shim's registrar by design during soak; including it would be a false positive. The checker names the exception in its output.
- **Client cutover precedes the soak, not the reverse.** The shim cannot reach zero traffic until clients stop calling it.
- **Week-close stays on `fleet-core`** until after retirement (ADR-0021) — it orchestrates fuel/toll/earnings seals.
- **All three seal lanes block** on hard failure (ADR-0019). Soft-fail is forbidden without a new ADR plus a persisted drift row.

### Locked decisions

ADR-0019 (all-lane seal block) · ADR-0020 (edge kernel) · ADR-0021 (residual homes) · ADR-0022 (rollback RTO).

### Non-goals

Big-bang extraction · merging into `fuel-brain`/`toll-brain` (different services) · Docker eszip as the deploy path (prebundle + `--use-api` only) · accepting `curl` 401 as browser proof · accepting a green local smoke as production evidence · adding another checklist item where a kernel would make it unnecessary.

---

## 8. Execution log

| Milestone | Date | Result |
|---|---|---|
| Fuel extraction (A0–H3) | 2026-09-15/16 | First domain out; set the template |
| Phase 0 control plane | 2026-09-16 | ADRs 0019–0022, `CODEOWNERS`, UX soak contract |
| Edge kernel (B1) | 2026-09-16 | `createFleetFunction` on all six + shim boot; `lint-edge-kernel` in CI — closes middleware drift permanently |
| Seal contract (B2) | 2026-09-16 | `week_seal_log`; deterministic `org:week:lane:gN` keys; conditional `in_progress` claim (CAS); fail-closed writes; all lanes block |
| Verification tooling (B3) | 2026-09-16 | Manifests, D15 overlap, extraction-status generator — all armed in CI |
| F0 carve | 2026-09-16 | Shim boot → 106 lines; residual registrar |
| F1–F4 + `fleet-core` | 2026-09-16 | Five domain functions + residual successor, smoke-proven on `a6722fb4` |
| Maintenance drill (D9) | 2026-09-16 | All six slugs 503 on business paths, `/health` 200, restored |
| Soak instrument | 2026-09-16 | `check-shim-traffic` + `f5-soak-log.json`; N = **7**; retire guard double-gated |
| Vercel path deploy | 2026-09-17 | Per-app Deploy Hooks; shared `packages/` fan-out (carries the api-client cutover); fails closed on missing FLEET/DRIVER/DOMINION |
| Client cutover | 2026-09-17 | `API_ENDPOINTS.fleet` → 0 sites, 296 on `.fleetCore`, legacy keys aliased. **Shim traffic 4,368 → 157 (96%)** |
| External callers | 2026-09-17 | Four found and re-pointed (incl. a live nightly `pg_cron`); third retire gate, `--force`-proof |
| D9 authenticated pass | 2026-09-17 | **CLOSED** — six slugs PASS with per-row evidence |
| **Rev 9 audit** | **2026-09-17** | Gates green. Open then: §1.1 commit/push, §1.2 soak-log truncation |
| **Rev 10 closeout** | **2026-09-17** | Full offender persist; inventory `shimPathSuffix` asserts; D13 commit/push; only the 7-day clock remains |

---

## 9. Agent kickoff prompt

```
Read docs/fleet-domain-extraction-completion.md §1 + docs/f5-soak-log.json
+ docs/f5-external-callers.json.

Extraction is COMPLETE and deployed. Six functions live, D9 closed, four external
callers re-pointed, soak instruments armed (Rev 10). Do NOT redo any of it, and
read §7 before proposing anything — those questions are settled.

IT IS ONLY THE CLOCK.

1) Let the tail decay to 0. Daily: pnpm check:shim-traffic:log (or CI soak workflow)
   then pnpm f5:external-callers. The streak starts the first ok:true day; one
   non-health request fails the day and that is intended.
2) A path that PLATEAUS rather than falls across 2–3 red days is a fifth external
   caller — add to f5-external-callers.json, re-point, do not --force.
3) At 7 consecutive ok:true ending today/yesterday UTC:
   pnpm f5:retire-shim -> commit -> CI. Never --force
   (--force cannot skip the external-caller gate by design).

Stay on the current branch. Do not retire early.
```
