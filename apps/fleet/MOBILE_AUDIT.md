# Roam Fleet — Mobile/Tablet Readiness Audit

**Audited:** 2026-09-13 · **Hardened:** 2026-09-13 · **Baseline:** commit `0045b20d` → `HEAD`
**Method:** static analysis of source + build output. Device matrix below still requires a physical check.

**Verdict:** substantially mobile-friendly. Tier A (phone-first) surfaces are complete.
§2 (PWA header) and §3 (auth polish) are **Done**. Typecheck audit-named packages are cleared;
full `fleet typecheck` remains red on unrelated pre-existing debt (see §4).

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

**Tier A tables confirmed converted:**
`dashboard/DashboardDriverTable.tsx` · `dashboard/DashboardCourierTable.tsx` ·
`drivers/DriversPage.tsx` · `vehicles/VehiclesPage.tsx` · `trips/TripLogsPage.tsx`

**Gates (post-hardening):** `pnpm --filter @roam/fleet test` → 1375 passed / 236 files.
`build` → exit 0, 132 precache entries. Touch targets: 249 `min-h-11`-class hits.

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

**Device sign-off still required:** iOS Add to Home Screen — hamburger + title centred below notch;
bar background fills status/notch area.

---

## 3. DONE — Gap: auth screens mobile pass

**Fixed:** 2026-09-13

**Mandatory files:**
- `LoginPage.tsx` / `DriverLoginPage.tsx` — `min-h-[100dvh]`, mobile header `safe-t safe-x`
  (no stacked `px-6`), form `pb-[max(1rem,env(safe-area-inset-bottom,0px))]`

**Same-pass first-touch siblings:**
- `PassengerFleetSurfaceGate.tsx` · `WrongProductLineGate.tsx`
- `signup/FleetOwnerSignupPage.tsx` · `signup/FleetOwnerSignupComplete.tsx`

**Residual (low priority, unchanged):** admin portals, `App.tsx` loading/error shells,
`DriverLayout`, maintenance splash — convert opportunistically.

**Device sign-off still required:** iOS Safari tab **and** standalone for login/driver login.

---

## 4. Typecheck gate — audit-named packages cleared; full gate still red

**Audit-named fixes applied (2026-09-13):**
- `packages/ui` — `chart.tsx` (Recharts content prop shapes), `LocationInput.tsx`
  (geolocation `coords` + `AddressResult.display_name`), `SafeResponsiveContainer.tsx` (CSS size coercion)
- `packages/types` — `formatDateJM(unknown)`, tollLog formatters return `string`,
  barrel: `BankReconciliation` only from `financial_enhanced`, removed duplicate `TollTag` from `data`,
  `vehicleCatalogGate` imports status unions from `vehicle` (no duplicate re-export)

**Reality check:** `pnpm --filter @roam/fleet typecheck` still fails with ~490 errors across fleet
app sources and other packages (`admin-core`, expense-hub permissions, finance-core, etc.).
Those are **pre-existing and outside mobile hardening scope**. Clearing them is a separate
platform debt track so the gate can become meaningful end-to-end.

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

Automated (verified 2026-09-13 after hardening):

```bash
pnpm --filter @roam/fleet test      # 1375 passed / 236 files
pnpm --filter @roam/fleet build     # exit 0, 132 precache entries
ls apps/fleet/build/manifest.webmanifest apps/fleet/build/sw.js apps/fleet/build/icons/
```

Still required on a physical device — **static analysis cannot substitute for this**:

| Check | Where | Looking for |
|---|---|---|
| Header fix (§2) | iOS, **Add to Home Screen** | Hamburger and title vertically centred below the notch; bar background fills the notch area |
| Login polish (§3) | iOS Safari tab **and** standalone | Form fits without odd first-paint scroll; header clears the notch; submit button clears the home indicator |
| No horizontal scroll | 390×844, every Tier A screen | Page body must not scroll sideways. Tables scrolling **inside** their own container is correct. |
| Tablet | 768×1024 (iPad portrait) | Tier B screens readable without pinch-zoom |
| Desktop unchanged | 1440px | Pixel-identical to pre-change |
| Dark mode | Every changed screen | New chrome must not fight the compat layer at the bottom of `globals.css` |

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
