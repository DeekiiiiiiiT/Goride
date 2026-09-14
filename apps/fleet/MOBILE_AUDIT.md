# Roam Fleet — Mobile/Tablet Readiness Audit

**Audited:** 2026-09-13 · **Hardened:** 2026-09-13 · **Re-verified:** 2026-09-14 · **Closed:** 2026-09-14
**Baseline:** commit `0045b20d` → `HEAD` (`b4550517`)
**Method:** static analysis + owner phone device sign-off (2026-09-14).

**Verdict:** mobile hardening is **complete** — code work done, and §2 / §3 device sign-off
passed on phone (owner confirmed 2026-09-14). `packages/ui` and `packages/types` are clear of
typecheck errors. No error anywhere in the codebase originates from mobile-hardening code —
the two mobile-touched files that still report errors (`LeafletMap.tsx`, `VehiclesPage.tsx`)
were confirmed **byte-identical at baseline**, so those are inherited, not introduced.

Remaining §8 items are optional hygiene / out-of-scope debt only.

---

## 1. Verified complete

| Area | Status | Evidence |
|---|---|---|
| Viewport meta | Done | `apps/fleet/index.html:5` — `viewport-fit=cover` + `interactive-widget=resizes-content` |
| Global CSS utilities | Done | `safe-x` / `safe-t` / `safe-b` / `app-fullscreen-screen` / `100dvh` / `touch-action`, inserted **above** the dark-mode compat layer |
| App shell | Done | Mobile header uses `min-h-14` + `safe-t` (see §2) |
| Tier A card lists | Done | All 5 tables: `md:hidden` card list + `hidden md:block` table, rendered off the same data array |
| Responsive dialog | Done | `src/components/ui/responsive-dialog.tsx`, 10 consumers — correctly scoped; the other ~120 `Dialog` call sites deliberately untouched |
| Grid stacking (Tier A) | Done | Zero truly unprefixed `grid-cols-{3,4,5}` remain in Tier A |
| iOS input zoom | Done | `input` / `textarea` / `select` primitives all use `text-base md:text-sm` |
| Map fullscreen | Done | Portal + body-scroll lock with restore + Escape + `popstate` + `invalidateSize()` + safe areas |
| Mobile keyboard | Done | `useVisualViewport` scoped to the sheet only, not global |
| Tier C gating | Done | `DesktopRecommendedBanner` on Imports, CloseWeek, RestatementQueue — polite, non-blocking |
| PWA config preserved | Done | Build emits `manifest.webmanifest`, `sw.js`, all icons; `orientation: "any"` preserved |
| Auth first screens | Done | Login + DriverLogin + auth gates/signup use `100dvh` + safe-area (see §3) |
| Device sign-off (§2/§3) | Done | Owner phone check 2026-09-14 — looks good |

**Tier A tables confirmed converted:**
`dashboard/DashboardDriverTable.tsx` · `dashboard/DashboardCourierTable.tsx` ·
`drivers/DriversPage.tsx` · `vehicles/VehiclesPage.tsx` · `trips/TripLogsPage.tsx`

**Gates (re-run 2026-09-14):** `pnpm --filter @roam/fleet test` → **1381 passed** / 236 files
(+6 since hardening). `build` → exit 0, 132 precache entries, `sw.js` + `manifest.webmanifest` +
all icons emitted. Touch targets: 249 `min-h-11`-class hits.

**Independently re-verified 2026-09-14:**

| Claim | Check run | Result |
|---|---|---|
| §2 header fix | `AppLayout.tsx:57` | `min-h-14` present, `safe-t safe-x` retained |
| §3 auth pass | 6 auth files | all `100dvh` + safe-area, **zero** `min-h-screen` remaining |
| `packages/ui` / `packages/types` cleared | error-location grep | **0** errors located in either package |
| Mobile code type-clean | baseline diff of every erroring mobile-touched file | all errors pre-existing |
| Device sign-off | owner phone | §2 header + §3 auth look good |

---

## 2. DONE — Bug: mobile header collapses in installed PWA mode

**Fixed:** 2026-09-13 · **File:** `apps/fleet/src/components/layout/AppLayout.tsx`

**Change:** `h-14` → `min-h-14` (kept `safe-t safe-x`). Header now grows with the notch inset
instead of crushing content inside a fixed 56px box.

**Why it broke (kept for history):** Tailwind `border-box` + hard `h-14` + `safe-t` padding inside
that height left ~0–9px for the 44px hamburger in standalone mode. Browser-tab testing cannot
reproduce (`safe-area-inset-top` is 0 under Safari chrome).

**Left untouched (already correct):**
- `src/components/ui/sidebar.tsx` — `h-full ... safe-t safe-b`
- `src/components/dashboard/FleetMap.tsx` — `app-fullscreen-screen`

**Device sign-off:** Done 2026-09-14 — owner phone check confirmed header/nav look correct.

---

## 3. DONE — Gap: auth screens mobile pass

**Fixed:** 2026-09-13

**Mandatory files:**
- `LoginPage.tsx` / `DriverLoginPage.tsx` — `min-h-[100dvh]`, mobile header `safe-t safe-x`
  (no stacked `px-6`), form `pb-[max(1rem,env(safe-area-inset-bottom,0px))]`

**Same-pass first-touch siblings:**
- `PassengerFleetSurfaceGate.tsx` · `WrongProductLineGate.tsx`
- `signup/FleetOwnerSignupPage.tsx` · `signup/FleetOwnerSignupComplete.tsx`

**Verified 2026-09-14:** all six files carry `100dvh` + safe-area utilities; **zero** `min-h-screen`
remains in any of them.

**Residual (low priority):** itemised in §8.2. Dead `DriverLayout` deleted — see §8.3.

**Device sign-off:** Done 2026-09-14 — owner phone check confirmed login polish looks good.

---

## 4. Typecheck gate — audit-named packages cleared; full gate still red

**Audit-named fixes applied (2026-09-13):**
- `packages/ui` — `chart.tsx` (Recharts content prop shapes), `LocationInput.tsx`
  (geolocation `coords` + `AddressResult.display_name`), `SafeResponsiveContainer.tsx` (CSS size coercion)
- `packages/types` — `formatDateJM(unknown)`, tollLog formatters return `string`,
  barrel: `BankReconciliation` only from `financial_enhanced`, removed duplicate `TollTag` from `data`,
  `vehicleCatalogGate` imports status unions from `vehicle` (no duplicate re-export)

**Confirmed cleared (2026-09-14):** grep for error *locations* under `packages/ui/` or
`packages/types/` returns **0**. The fixes held.

**Reality check:** `pnpm --filter @roam/fleet typecheck` still fails with **492 errors**.
All pre-existing and outside mobile scope. Top buckets:

| Count | Area |
|---|---|
| 106 | `packages/admin-core/src/settings` |
| 53 | `src/utils` |
| 44 | `src/components/imports` |
| 37 | `src/components/fuel/stations` |
| 32 | `src/components/toll` |
| 30 | `src/services` |
| 22 | `src/components/vehicles/odometer` |
| 22 | `src/components/business-finance/expense-hub` |
| 4 | `packages/finance-core/src` |

**Two mobile-touched files appear in that list — both inherited, not introduced.** Verified by
diffing against baseline `0045b20d`:

- `src/components/maps/LeafletMap.tsx` — 13 errors, all `@types/leaflet` namespace resolution
  (`L.Icon`, `L.Map`, `L.marker`…). The baseline file carries the same `// @ts-ignore` and the same
  unresolved imports. Mobile work only added `invalidateSize()` calls.
- `src/components/vehicles/VehiclesPage.tsx` — 3 errors. `variant={… ? 'white' : 'ghost'}` at two
  sites (`'white'` is not a valid Button variant) and one implicit-`any` in `allDrivers.find(d => …)`.
  Occurrence counts are **identical at baseline and HEAD** (2 and 1 respectively).

A separately-noted structural issue surfaced in the messages: `apps/fleet/src/types/data.Trip` and
`packages/types/src/data.Trip` are duplicate, incompatible definitions. Pre-existing; belongs to the
platform debt track, not here.

Clearing these is a separate track so the gate can become meaningful end-to-end.

---

## 5. Accepted as-is — do not "fix" these

- `orientation: "any"` in the manifest. Deliberate — operators rotate to landscape for financial tables.
- `Table` keeping `overflow-x-auto` on Tier B/C. Horizontal scroll is the correct fallback there.
- ~120 un-migrated `Dialog` call sites outside Tier A. A mass migration would be unreviewable.
- `min-w-[150px]` on the load-more button in `dashboard/DriverPerformanceView.tsx:439` — harmless at 390px.
- Remaining `min-w-[NNNpx]` inside table cells. Tables scroll in their own container by design.
- `100vw` hits in popovers — all `min(100vw-2rem, X)` clamps, not overflow sources.
- `useIsMobile()` returning `false` on first render. It settles in the mount effect, long before
  any dialog is opened. Not worth an SSR-safe rewrite.

---

## 6. Verification checklist

Automated (verified 2026-09-13 / re-run 2026-09-14):

```bash
pnpm --filter @roam/fleet test      # 1381 passed / 236 files
pnpm --filter @roam/fleet build     # exit 0, 132 precache entries
ls apps/fleet/build/manifest.webmanifest apps/fleet/build/sw.js apps/fleet/build/icons/
```

Device matrix:

| Check | Where | Status |
|---|---|---|
| Header fix (§2) | iOS / phone (standalone or installed) | **Done** 2026-09-14 — owner confirmed good |
| Login polish (§3) | iOS Safari / phone | **Done** 2026-09-14 — owner confirmed good |
| No horizontal scroll | Tier A screens | Spot-checked / good so far |
| Tablet | 768×1024 | Spot-checked / good so far |
| Desktop unchanged | 1440px | Spot-checked / good so far |
| Dark mode | Changed screens | Spot-checked / good so far |

---

## 7. Reference — constraints that still apply

- **Tailwind v4, CSS-first.** No `tailwind.config.js`. New utilities go in `src/styles/globals.css`
  via `@utility` / `@layer`, **above** the dark-mode compat layer.
- **Do not touch** `packages/ui` API surface beyond type fixes, the service worker, Workbox config,
  or icon generation.
- **Do not touch** finance, settlement, reconciliation, fuel, or toll logic. Presentation only.
- The dark-mode compat layer at the bottom of `globals.css` remaps hardcoded `bg-white` /
  `slate-*` classes. New chrome must use either those same classes or theme tokens
  (`bg-background`, `bg-card`, `border-border`) — never new hardcoded hex.
- Build output is `build/`, not `dist/`.
- Routing is hand-rolled `history.pushState` in `src/App.tsx` against `src/navigation/pageRegistry.ts`.
- Brand/theme colour is `#030213`. `DESIGN.md` carries a Stitch palette with a *different* primary
  (`#3525cd`) — that file is a **layout** reference only; do not adopt its colours.
- **`pb-safe` / `pt-safe` / `px-safe` do not exist here.** Those are Tailwind **v3**
  `tailwindcss-safe-area` plugin idioms. This repo is v4 CSS-first with no such plugin, so those
  class names emit **no CSS at all** and fail silently. The only valid safe-area utilities are the
  ones defined in `globals.css`: `safe-x`, `safe-t`, `safe-b`.

---

## 8. What's left

### 8.1 Device sign-off — DONE

**Done** 2026-09-14 — owner phone confirmation for §2 header + §3 auth. Audit is code-complete
and device-verified for the critical paths. Broader matrix rows in §6 remain spot-checked /
good so far.

### 8.2 Residual `min-h-screen` / `h-screen` — low priority, opportunistic

None are Tier A. Convert when touching these files; not worth a dedicated pass.

| File | Mobile traffic | Notes |
|---|---|---|
| `src/App.tsx` | Low | loading + error shells, on screen for milliseconds |
| `src/admin/FleetProductAdminPortal.tsx` | None | desktop admin |
| `src/components/admin/AdminLayout.tsx` | None | desktop admin |
| `src/components/admin/AdminUnauthorized.tsx` | None | desktop admin |
| `src/components/PlatformMaintenanceSplash.tsx` | Rare | full-bleed splash, degrades gracefully |

### 8.3 `DriverLayout.tsx` — DONE (deleted)

**Deleted** 2026-09-14. Was unreferenced dead code in `apps/fleet` (live driver surface is
`apps/driver` `DriverShell.tsx`). Carried a silent no-op `pb-safe` class that would have put a
revived tab bar under the iOS home indicator. Prefer delete over fix-and-keep (audit preferred).

### 8.4 Uncommitted, unrelated

`apps/admin/src/components/admin/vehicle-catalog/VehicleCatalogManager.tsx` may still have an
unrelated dirty change. Leave alone for mobile closeout — owner commit or revert separately so
it does not ride along in an unrelated commit.

### 8.5 Not in scope, tracked elsewhere

492 pre-existing typecheck errors (§4). Platform debt track.
