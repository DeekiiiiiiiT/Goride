# Vehicle System Audit — RoamFleet Vehicle Operations ↔ Dominion Vehicle Database

**Date:** 2026-08-26
**Scope:** RoamFleet → Fleet Vehicles, Vehicle Analytics, Maintenance, Inventory & Asset Management. Dominion → Motor Vehicles, Pending motor vehicles, Maintenance templates, Parts sourcing. Plus the server/edge layer behind them.
**Method:** Static read of every vehicle/maintenance/inventory/catalog file across `apps/fleet`, `apps/admin`, `packages/*`, `supabase/functions/*`. No code was changed.
**Companions:** [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md) · [FUEL_SYSTEM_AUDIT.md](FUEL_SYSTEM_AUDIT.md)

---

## 0. Executive summary

This section contains both **the best-engineered subsystem in the whole codebase** and **the worst-shipped page in the whole codebase**, sitting two nav items apart.

The **vehicle catalog gate** (`vehicle_catalog_gate.ts`) is genuinely excellent: a documented policy module shared verbatim between client and Deno edge, applied as middleware at eight route sites, with audit logging, RBAC bypass, and an env kill-switch that defaults to enforcing. Nothing in toll or fuel comes close. **Vehicle Analytics** is likewise the most complete analytics hook in the repo — real pagination instead of a silent cap, prior-period deltas on every KPI, canonical-ledger cost attribution, and an explicit cost-coverage percentage so the user knows how much of the cost base is attributed.

**Inventory & Asset Management** is the opposite. It ships with Edit and Delete buttons wired to empty functions, a service method whose entire body is an abandoned AI monologue explaining why it wasn't built, two completely unauthenticated write endpoints, and stock quantities that never decrement.

**The five highest-impact findings:**

1. **`POST /inventory` and `POST /inventory/bulk` have no `requireAuth()` at all.** The bulk route also skips `stampOrg` and writes raw client-supplied objects straight to KV by id — it can overwrite any org's inventory (§G1).
2. **Inventory's Edit and Delete buttons are `onEdit={() => {}} onDelete={() => {}}`.** `deleteStock()` is an empty stub containing an assistant's abandoned reasoning as comments (§D1, §D2).
3. **`api.getVehicles()` sends no limit; the server defaults to 500.** Every vehicle consumer in the app silently truncates past 500 with no indicator (§A1).
4. **The `Vehicle` type exists in three mutually-divergent versions.** Dominion's copy is missing Uber sync fields, driver assignment history, Jamaica plate class, and toll class entirely (§F2).
5. **`profitSpark` is a verbatim copy of `revenueSpark`.** The "profit" sparkline plots gross revenue with no costs subtracted (§B1).

**Severity counts:** 4 Critical · 10 High · 15 Medium · 7 Enhancement.

**What is genuinely solid** (do not touch): `vehicle_catalog_gate.ts` and its client mirror, the `requireCatalogMatched` middleware applications, `maintenance_routes.ts`'s platform-staff guards, `filterByOrgSafe` on `/vehicles`, and `fetchAllPeriodTrips`'s honest pagination loop.

---

## 1. System map

| Surface | RoamFleet | Dominion | Component | Store |
|---|---|---|---|---|
| Fleet Vehicles | ✅ `vehicles` | ❌ | `VehiclesPage` | `vehicle:*` KV / `vehicles` table |
| Vehicle Analytics | ✅ `vehicle-analytics` | ❌ | `VehicleAnalytics` | trips + canonical ledger |
| Maintenance | ✅ `maintenance-hub` | ❌ | `FleetMaintenanceHub` | Postgres `maintenance_*` |
| Inventory & Assets | ✅ `fleet` | ❌ | `FleetPage` | `inventory:*` KV |
| Motor Vehicles | ❌ | ✅ `motor-vehicles` | `VehicleCatalogManager` | `vehicle_catalog` |
| Pending motor vehicles | ❌ | ✅ `pending-motor-vehicles` | `PendingVehicleCatalogManager` | `vehicle_catalog_pending` |
| Maintenance templates | ❌ | ✅ `maintenance-templates` | `MaintenanceTemplatesManager` | `maintenance_task_templates` |
| Parts sourcing | ❌ | ✅ `parts-sourcing` | `PartsSourcingManager` | parts tables |

**The division is clean and correct in principle:** Dominion owns the global *reference catalogue* (what a 2019 Toyota Probox is, what services it needs, where parts come from); RoamFleet owns *instances* (this specific plate, its trips, its costs). The catalog gate enforces the join. This is the right architecture — the problems below are execution, not design.

---

## A. Fleet Vehicles — `VehiclesPage.tsx` (867 lines), `VehicleDetail.tsx` (2,100 lines)

### A1 · CRITICAL — Every vehicle list in the app truncates at 500, silently
```js
async getVehicles() {
    const response = await fetchWithRetry(`${API_ENDPOINTS.fleet}/vehicles`, { … });
    return response.json();
}
```
([`api.ts:789-795`](apps/fleet/src/services/api.ts#L789))

No `limit`, no `offset`, no pagination loop. The server then applies its own default:
```js
const limit = limitParam ? parseInt(limitParam) : 500;
```
([`index.tsx:2628`](supabase/functions/_fleet-server/index.tsx#L2628))

Every consumer inherits the cap — `VehiclesPage`, `useVehicleAnalytics` (KPIs, leaderboard, status board, idle table, cost-by-vehicle), every vehicle dropdown, `AssignVehiclesToPolicySheet`, expense-hub selectors. There is no error, no warning, and no `X-Total-Count` equivalent. Vehicle 501 simply does not exist as far as the UI is concerned.

Contrast with `fetchAllPeriodTrips` in the same feature ([`useVehicleAnalytics.ts:106-118`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L106)), which loops pages properly. The pattern to copy is already in the codebase.

### A2 · HIGH — The catalog gate is excellent and worth protecting
`requireCatalogMatched` ([`vehicle_catalog_gate.ts:114`](supabase/functions/_fleet-server/vehicle_catalog_gate.ts#L114)) is applied at eight sites — trips, fuel, toll, equipment, driver assignment, status changes, maintenance logs. It defaults to enforcing (`ENFORCE_VEHICLE_CATALOG_GATE ?? "true"`), records a `recordGateEvent` audit row on every block, caches the parsed body so handlers don't re-read the stream, and has an explicit RBAC bypass path.

Two things to be aware of rather than fix:
- **Extraction is fail-open**: `if (extracted == null) return await next();` ([`:141`](supabase/functions/_fleet-server/vehicle_catalog_gate.ts#L141)). If a route's `vehicleId` extractor returns null because the request body shape changed, the gate silently stops guarding that route. A counter on `extracted == null` would surface drift.
- **A single env var disables it fleet-wide** with no UI indication that enforcement is off.

### A3 · MEDIUM — `VehicleDetail.tsx` is 2,100 lines in one component
Odometer, fuel settings, toll class, equipment, exterior, damage history, fixed expenses, maintenance inspection, service ledger, driver assignment and KM/L tracking all live in one file. Every one of those has its own extracted sub-component available (`OdometerDisplay`, `EquipmentManager`, `ExteriorManager`, `FixedExpensesManager`, `MaintenanceInspectionPanel`, `KmLTracking`, `DamageHistoryTimeline`) — the file assembles them but also carries substantial inline logic. This is the single highest-risk file to change in the vehicle section.

### A4 · MEDIUM — Name collision: `MaintenancePage` is not vehicle maintenance
[`apps/fleet/src/components/MaintenancePage.tsx`](apps/fleet/src/components/MaintenancePage.tsx) is the platform **"Under Maintenance" splash screen** — a dark full-page takeover with a countdown timer. It sits alongside `MaintenanceManager`, `FleetMaintenanceHub`, `MaintenanceIcon`, `MaintenanceInspectionPanel` and `MaintenanceServiceLedgerPanel`, which *are* vehicle maintenance. Rename one.

---

## B. Vehicle Analytics — `useVehicleAnalytics.ts` (623 lines)

The strongest analytics surface audited across all three sections. It paginates properly, computes prior-period deltas for revenue / profit / trips / distance, attributes costs from the canonical ledger, and — uniquely in this codebase — reports `costCoveragePct` and `unattributedCostTotal` so the user can see how much of the cost base actually got attributed to a vehicle. That honesty is worth calling out.

### B1 · HIGH — The profit sparkline is the revenue sparkline
```js
revenueSpark: sparklineBuckets(periodTrips, period, getTripGrossRevenue),
profitSpark:  sparklineBuckets(periodTrips, period, getTripGrossRevenue),
```
([`useVehicleAnalytics.ts:359-360`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L359))

Byte-identical. The "Net Profit per Vehicle" KPI card's trend line plots **gross revenue with no costs subtracted**. The card's headline number is computed correctly from `vehicleProfits`; only its sparkline lies. Users read the shape, so a profit trend that mirrors revenue exactly will read as "costs are flat" when it means "costs were never applied."

### B2 · HIGH — "Active vehicles" silently redefines vehicle status
```js
const hasCompleted = vTrips.some((t) => t.status === 'Completed' || !t.status);
map.set(v.id, hasCompleted ? 'Active' : 'Inactive');
```
([`:263-275`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L263))

`statusById` **overrides the vehicle's stored status** for anything not `Maintenance`/`Decommissioned`. A vehicle marked Active in the database, assigned to a driver, insured and on the road shows as **Inactive** if it happened not to complete a trip inside the selected period.

That flows into `activeRatePct` on the KPI grid and into the Status Board's sort order and colour coding. The metric is really "% of vehicles that drove this period" — a legitimate thing to measure, but it is labelled and coloured as fleet status. On a `this_week` default (the preset this hook uses) early in the week, most of the fleet will read Inactive.

### B3 · MEDIUM — Ten unconditional queries, two of them 40-page loops
On mount the hook fires: trips, prior trips, trip stats, prior trip stats, vehicles, vehicle metrics, maintenance fleet summary, ledger events, prior ledger events, all maintenance logs.

`fetchAllPeriodTrips` loops up to **40 sequential pages of 500** ([`:110-116`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L110)) — and runs twice (current + prior period). That is up to 80 serial round-trips before the page settles. Nothing is deferred behind a tab or a visibility check.

The 40-page ceiling is also a silent cap at 20,000 trips per period — far more headroom than fuel's 1,500, but the same class of bug and equally unsignalled.

### B4 · MEDIUM — `refresh()` refetches three of ten queries
```js
const refresh = () => { refetchTrips(); refetchVehicles(); refetchLedger(); };
```
([`:575-579`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L575))

`tripStats`, `priorTripStats`, `vehicleMetrics`, `maintenanceFleetSummary`, `maintenanceLogs`, and both prior-period queries are not refetched. Since `vehicleMetrics` and `maintenanceFleetSummary` carry a 5-minute `staleTime`, clicking Refresh leaves utilisation, idle hours and every maintenance alert stale — while the surrounding numbers update. The user sees a partial refresh and has no way to tell which half moved.

### B5 · MEDIUM — Daily-mileage labels can show the wrong day
```js
name: format(new Date(dateYmd), 'MMM d'),
```
([`:564`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L564))

`new Date("2026-08-24")` parses as UTC midnight → renders as Aug 23 in Jamaica. The same UTC-parsing trap documented at length in the toll audit (§B1 there). The `byDay` keys are built correctly with `.slice(0, 10)`; only the display label is wrong, so the chart is right and its axis is off by one.

### B6 · LOW — Odometer delta filter is a magic number
`if (delta <= 0 || delta > 2000) continue;` ([`:556`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L556)) — a hardcoded 2,000 km/day sanity bound, silently dropping both odometer resets and legitimate long-haul days with no counter or flag.

---

## C. Maintenance

The best-guarded module in the section. Routes live in Postgres (not KV), every `/admin/maintenance-*` route carries an inline `assertVehicleCatalogPlatformAccess(c)` check on top of `requireAuth()`, and the write paths carry `requirePermission("vehicles.edit")` plus `requireCatalogMatched`.

### C1 · HIGH — Template deletion is a hard delete with no dependency check
```js
route.delete("/make-server-37f42386/admin/maintenance-templates/:id", requireAuth(), async (c) => {
  const denied = assertVehicleCatalogPlatformAccess(c);
  if (denied) return denied;
  const id = c.req.param("id");
  const { error } = await supabase.from("maintenance_task_templates").delete().eq("id", id);
```
([`maintenance_routes.ts:595-606`](supabase/functions/_fleet-server/maintenance_routes.ts#L595))

No check for `maintenance_schedule` rows referencing `template_id`, no soft-delete, no usage count in the response, no confirmation payload. A platform admin tidying the template list in Dominion can silently orphan every fleet vehicle's schedule row for that service — and the fleet operator's only symptom is a service quietly vanishing from their checklist.

Given `maintenanceCatalogOptions` dedupes schedule rows *by* `template_id`, an orphaned row's behaviour after deletion is worth verifying against the actual FK constraint before this is touched.

### C2 · HIGH — Fleet and Dominion build different checklists from the same templates
`maintenanceCatalogOptions.ts` has drifted. The fleet copy filters system-level rows out of package membership:
```js
/** Package membership rows are components (leaf); drop systems if present. */
function asPackageComponents(categories) {
  return categories.filter((c) => c.kind !== "system" && !String(c.code || "").startsWith("sys_"));
}
```
The Dominion copy has **no such function** — it passes `categories` straight through, and is additionally missing `dueKind: tpl.due_kind`.

So a template containing system-level categories renders one checklist in RoamFleet and a different, longer one in Dominion. The platform admin authoring the template does not see what the operator will see.

`maintenanceSchedulePresets.ts` has a matching 3-line comment drift about when `items` fallback text applies — cosmetic, but it signals the same divergence.

### C3 · MEDIUM — RoamFleet has no `maintenanceTemplateService`
`apps/admin/src/services/maintenanceTemplateService.ts` exists; there is no fleet equivalent. Fleet reaches templates only indirectly through `api.getMaintenanceSchedule(vehicleId)`. That is a defensible split — but it means a fleet operator who sees a wrong interval on their schedule has no path to view the template that produced it, let alone request a change.

### C4 · MEDIUM — Maintenance alerts are not period-scoped
`maintenanceAlerts` derives from `maintenanceSummary?.items` ([`useVehicleAnalytics.ts:499-532`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L499)) which is fetched with no date range, while every other panel on the Vehicle Analytics page respects the period selector. Changing the period changes eight panels and leaves the alerts identical, with nothing saying so.

---

## D. Inventory & Asset Management — `FleetPage.tsx`, `InventoryTable.tsx`, `inventoryService.ts`

This page is not finished and should be treated as a prototype that reached production.

### D1 · CRITICAL — Edit and Delete are wired to empty functions
```jsx
<InventoryTable
    items={inventory}
    onEdit={() => {}}
    onDelete={() => {}}
/>
```
([`FleetPage.tsx:198-202`](apps/fleet/src/components/fleet/FleetPage.tsx#L198))

`InventoryTable` renders a pencil button and a red `Trash2` button per row ([`InventoryTable.tsx:49-56`](apps/fleet/src/components/fleet/InventoryTable.tsx#L49)). Both call the no-ops. The user clicks, and **nothing happens at all** — no toast, no error, no console warning, no disabled state. There is no way to correct a typo or remove an item once created. Inventory is create-and-read-only behind a UI that advertises full CRUD.

### D2 · CRITICAL — `deleteStock()` is an abandoned AI monologue
```js
async deleteStock(itemId: string): Promise<void> {
    // Note: Deletion route not explicitly added in backend yet, using kv.del wrapper if needed or add later.
    // …
    // Wait, I didn't add a specific DELETE /inventory/:id route in Phase 1.
    // …
    // But for completeness, I will implement it and mark as todo in backend if missed.
    // Actually, I missed adding DELETE /inventory/:id. I'll add it to the service but comment it out or warn.
    // …
    // The instructions say "after each phase is complete, then you should wait".
    // Let's just create the service without delete for now to be safe.
}
```
([`inventoryService.ts:36-53`](apps/fleet/src/services/inventoryService.ts#L36))

Eighteen lines of first-person assistant deliberation shipped as the entire function body. It is typed `Promise<void>`, so every caller's `await` resolves successfully and no type error is raised. The backend `DELETE /inventory/:id` route it describes does not exist — I checked; the only inventory routes are `GET /inventory`, `POST /inventory`, `POST /inventory/bulk`.

This should be deleted or implemented, but it must not stay. Anyone reading this file will reasonably assume deletion works.

### D3 · HIGH — Assigning inventory to a vehicle never decrements stock
```js
// Note: Backend handles inventory quantity decrement if implemented,
// or we need a separate call. Phase 1 didn't explicitly link them transactionally.
// Ideally the backend 'bulk' endpoint should handle this logic if extended.
// For now we just assign the item.
```
([`FleetPage.tsx:105-108`](apps/fleet/src/components/fleet/FleetPage.tsx#L105))

Bulk-assigning equipment creates `equipment` records but leaves `inventory.quantity` untouched. Quantities only ever go up (via Add Item). Which means:
- `InventoryTable`'s `quantity <= minQuantity ? "Low Stock" : "In Stock"` badge is decorative — nothing ever crosses the threshold downward.
- The Alerts tab's low-stock count can never fire from consumption.
- Stock on screen diverges from stock in the store from the first assignment onward.

### D4 · MEDIUM — Inventory money is unformatted and crash-prone
`${item.costPerUnit.toFixed(2)}` ([`InventoryTable.tsx:41`](apps/fleet/src/components/fleet/InventoryTable.tsx#L41)) — a bare `$`, no thousands separator, no JMD identity, and an unguarded `.toFixed` that throws if `costPerUnit` is undefined on any imported or seeded row. Every other money surface in the fleet app has a `formatJMD` helper available.

### D5 · MEDIUM — "Seed Default Data" is a live production button
`handleSeedData` sits in the page's Settings dropdown next to Bulk Assignment ([`FleetPage.tsx:161-163`](apps/fleet/src/components/fleet/FleetPage.tsx#L161)) and calls `seederService`, which runs `inventoryService.bulkUpdateStock(INITIAL_INVENTORY)`. No environment guard, no confirmation dialog, no permission gate — one click writes fixture data into the live store through the unauthenticated bulk endpoint (§G1).

---

## E. Dominion Vehicle Database

### E1 · MEDIUM — Motor Vehicles page is a 2,386-line component
`VehicleCatalogManager.tsx` handles list, search, facets, CSV import, inline edit, delete, and pending-request review in one file. It works, and `vehicleCatalogCsvImport.ts` / `vehicleCatalogMatch.ts` / `vehicleCatalogWriteDrift.ts` are properly extracted and tested — but the shell itself is the second-largest component in the section after `VehicleDetail`.

### E2 · MEDIUM — Pending motor vehicles: no visible SLA or ageing
`PendingVehicleCatalogManager` (501 lines) is the queue that unblocks parked vehicles. Because `requireCatalogMatched` blocks trips, fuel, toll, equipment and maintenance for any unmatched vehicle, **time in this queue is time a customer's vehicle cannot be operated**. The component has no age column, no oldest-first default, no SLA badge, and no count surfaced anywhere outside its own page. A request can sit unnoticed while an operator's vehicle is frozen and neither side has a shared view of why.

### E3 · LOW — Parts sourcing has no fleet-side counterpart
`PartsSourcingManager` (1,002 lines) is Dominion-only. The fleet side reaches parts through `api.getCompatibleParts(partsVehicleId)` inside `FleetMaintenanceHub` ([`:275`](apps/fleet/src/components/vehicles/FleetMaintenanceHub.tsx#L275)) — read-only lookup, no sourcing request path. An operator who needs a part not in the catalogue has no in-app route to ask for it.

---

## F. RoamFleet ↔ Dominion sync

Parity here is **substantially better than fuel or toll** — most shared files are byte-identical: `vehicleCatalog.ts`, `maintenance.ts`, `partSourcing.ts`, `vehicleCatalogMatch.ts`, `maintenanceScheduleEngine.ts`, `maintenanceOverdueDetails.ts`, `vehicleCatalogResolution.ts`, `vehicle_parts.ts`, `partSourcingService.ts`, `vehicleCatalogService.ts`, `pendingVehicleCatalogService.ts`, all four `data/vehicle*Reference.ts` files, `maintenanceCategoryIcons.ts`, `useVehicleCatalogAnchorFacets.ts` and `VehicleModelCombobox.tsx`.

The drift that exists is concentrated and consequential.

### F1 · CRITICAL — 4,275 lines of dead duplicated admin components in `apps/fleet`
`apps/fleet/src/components/admin/` contains full copies of `VehicleCatalogManager` (2,386), `PendingVehicleCatalogManager` (501), `PartsSourcingManager` (1,002), plus `EngineCatalogSelect` and `VehicleModelCombobox`.

**None of them are mounted anywhere in `apps/fleet`.** I grepped every `.tsx` outside `components/admin/` — zero references. The fleet sidebar has no Motor Vehicles, Pending, Templates or Parts entry.

Worse, the fleet copies have already rotted in a way that proves nobody renders them: the entire 76-line diff on `VehicleCatalogManager` is **theming**. Fleet's copy is hardcoded dark-only (`text-white`, `bg-slate-900`, `border-slate-800`); Dominion's copy is theme-aware with explicit light values and `dark:` variants. If the fleet copy were ever mounted in the fleet app's default light theme, it would render white text on white backgrounds throughout.

The fleet copies also import `sonner@2.0.3` where Dominion imports `sonner` — a pinned-specifier artifact that will resolve differently under the two bundlers.

### F2 · CRITICAL — Three divergent `Vehicle` types
| File | vs `packages/types` |
|---|---|
| `apps/fleet/src/types/vehicle.ts` | 36 differing lines |
| `apps/admin/src/types/vehicle.ts` | 16 differing lines |
| fleet vs admin directly | 34 differing lines |

**Dominion's `Vehicle` is missing entirely:**
- `uberVehicleId`, `uberOwnerId`, `uberComplianceStatus`, `uberAssignedDriverIds`, `uberLastSyncedAt` — the whole Uber Fleet sync block
- `driverAssignmentHistory[]` — *"Who had this vehicle over time — used to attribute fuel fills on shared cars"*
- `usageCategory` (Private / Motorcycle / Commercial / PPV / Trailer) and `plateClass` (White / Green / Red) — the Jamaica fitness and permit classification
- `fitnessFirstRegistration`
- `tollClassId` and `tollClassNeedsReview` — the link to Super Admin Toll Info

Any Dominion code that reads a vehicle, spreads it, and writes it back is typed to believe those fields don't exist. `driverAssignmentHistory` in particular is what the fuel engine uses to attribute fills on shared cars, and `tollClassId` is what `resolveTollExpectedCost` needs to pick the right toll rate — both documented in the companion audits.

Neither app imports `@roam/types` for vehicles, so the package copy is not the referee; it is a third opinion nobody consults.

### F3 · HIGH — `packages/types` vehicle files are stale and orphaned
| File | fleet vs pkg | admin vs pkg |
|---|---|---|
| `vehicleCatalogPending.ts` | 96 | 96 |
| `partSourcing.ts` | 186 | 186 |
| `vehicle.ts` | 36 | 16 |

For `vehicleCatalogPending.ts` and `partSourcing.ts`, **both apps agree with each other and both differ from the package by the same amount** — the apps moved forward together and the shared package was left behind. 282 lines of type definitions in `packages/types` that no longer describe anything real.

`vehicleCatalog.ts`, `maintenance.ts` and `fleet.ts` are in sync everywhere and should be the model.

### F4 · MEDIUM — `vehicleCatalogGate.ts` is forked for a good reason, undocumented in one direction
The fleet copy declares local unions with an explicit comment:
> `// Local unions — avoid importing apps/fleet/src/types/* into Deno edge (BOOT_ERROR / huge bundle).`

because `supabase/functions/_fleet-server/vehicle_catalog_gate.ts` imports it directly. Dominion's copy instead does `import type { Vehicle, VehicleCatalogStatus, VehicleStatus } from "../types/vehicle"` and widens `deriveCatalogStatus` to accept `Vehicle | CatalogGateVehicleShape`.

The fork is justified — but the Dominion copy carries no comment explaining that it must stay behaviourally identical to a file the edge runtime depends on. Given §F2, Dominion's `VehicleStatus` and `VehicleCatalogStatus` could drift from the edge's hardcoded unions without any build error.

### F5 · MEDIUM — Neither app can see the other's half
RoamFleet cannot view the catalogue its vehicles are gated against; Dominion cannot see a single vehicle instance, trip, or maintenance log. When a vehicle is parked pending catalog match, the operator sees "Pending catalog" with no visibility into the queue, and the platform admin sees a queue row with no visibility into what it is blocking.

This is the same shape as the toll and fuel findings, but here it has an operational cost the others don't: the gate makes it a hard block.

---

## G. Security & multi-tenancy

Vehicle routes are the best-scoped of the three sections — `/vehicles` uses `requireAuth({ requireOrg: true })` **plus** `filterByOrgSafe`, writes carry `vehicles.create` / `vehicles.delete`, and the maintenance admin routes carry inline platform-staff assertions. The exceptions are concentrated in inventory.

### G1 · CRITICAL — Two unauthenticated inventory write endpoints
```js
app.post("/make-server-37f42386/inventory", async (c) => {          // no requireAuth
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await kv.set(`inventory:${item.id}`, stampOrg(item, c));
});

app.post("/make-server-37f42386/inventory/bulk", async (c) => {     // no requireAuth, no stampOrg
    const items = await c.req.json();
    const keys = items.map((i: any) => `inventory:${i.id}`);
    await kv.mset(keys, items);
});
```
([`index.tsx:12896-12917`](supabase/functions/_fleet-server/index.tsx#L12896))

`index.tsx` has no blanket auth middleware (established in the fuel audit §D1), so these are genuinely open to anyone holding the anon key.

The bulk route is the worse of the two:
- **No `stampOrg`** — rows are written with whatever `organizationId` the caller supplies, or none.
- **Client-controlled key** — `inventory:${i.id}` with no validation. A caller who knows or guesses an id **overwrites another organisation's inventory record wholesale**. Whether a crafted `id` can escape the `inventory:` prefix depends on the `kv.mset` implementation and is worth checking directly.
- **No array element validation** — arbitrary JSON shapes land in the store.

The sibling `GET /inventory` correctly has both `requireAuth()` and `filterByOrg`. The asymmetry is the same one found in fuel (`POST /fuel-entries` open, `DELETE` gated) and toll (`POST /toll-info` open) — reads guarded, writes forgotten.

### G2 · MEDIUM — Inventory has no permission gate even once authenticated
Neither inventory route carries `requirePermission`. `equipment` right next door has `requirePermission('vehicles.edit')` on its DELETE ([`index.tsx:12384`](supabase/functions/_fleet-server/index.tsx#L12384)). Inventory should at minimum match it.

### G3 · MEDIUM — `POST /vehicles` requires a permission but no org assertion on update
`requirePermission('vehicles.create')` gates the route, but the same endpoint handles updates (it keys on the supplied license plate as id). There is no `belongsToOrg` check on an existing record before overwrite — compare `fuel_controller.tsx`, which does `if (!belongsToOrg(existing, c)) return c.json({ error: "Forbidden" }, 403)` on its update paths. Worth verifying against the handler body before acting.

---

## H. Enhancements you are currently lacking

1. **Paginate `getVehicles`** using the `fetchAllPeriodTrips` pattern already in this feature (§A1). Smallest fix with the widest blast radius.
2. **Finish inventory, or hide it.** Wire Edit/Delete, add `DELETE /inventory/:id`, decrement stock on assignment, gate the writes. If it is not going to be finished this quarter, removing the nav entry is more honest than shipping dead buttons.
3. **Pending-catalog SLA surfacing** (§E2). Age column, oldest-first default, and a badge count on the Dominion nav item — plus the same count visible to the operator on their parked vehicle, so both sides see the same queue.
4. **Template deletion safety** (§C1): usage count in the response, soft-delete, and a "N vehicles use this" confirmation.
5. **Catalog gate observability**: a counter on `extracted == null` and a Dominion panel showing recent `recordGateEvent` blocks. The audit rows are already being written and nothing reads them.
6. **Fleet-side parts request path** (§E3) so operators can ask for a missing part rather than emailing.
7. **Vehicle total cost of ownership** — you already have canonical ledger costs by vehicle, maintenance logs, fuel summaries and odometer history. A per-vehicle lifetime cost-per-km view is assembling existing pieces, not new data.

---

## I. Suggested order of work

**Fix first — open writes and dead UI:**

| # | Item | § | Why now |
|---|---|---|---|
| 1 | `requireAuth` + `requirePermission` + `stampOrg` on both inventory POST routes | G1 | Unauthenticated cross-tenant overwrite |
| 2 | Wire or remove Inventory Edit/Delete; delete the `deleteStock` stub | D1, D2 | Shipped dead buttons; abandoned scaffolding in source |
| 3 | Paginate `api.getVehicles()` | A1 | Silent 500-vehicle ceiling across the whole app |
| 4 | Reconcile the three `Vehicle` types; make one canonical | F2 | Dominion is blind to Uber sync, assignment history, plate class, toll class |
| 5 | Decrement stock on equipment assignment | D3 | Low-stock alerting cannot fire today |

**Then — makes the screens tell the truth:**

| # | Item | § |
|---|---|---|
| 6 | Compute `profitSpark` from profit, not revenue | B1 |
| 7 | Relabel "Active" → "Drove this period", or stop overriding stored status | B2 |
| 8 | Make `refresh()` refetch all ten queries | B4 |
| 9 | Fix the daily-mileage axis label UTC shift | B5 |
| 10 | Period-scope maintenance alerts, or label them as fleet-wide | C4 |
| 11 | JMD formatting + null guard on inventory cost | D4 |
| 12 | Gate or remove "Seed Default Data" | D5 |

**Then — sync and safety:**

| # | Item | § |
|---|---|---|
| 13 | Delete the 4,275 lines of unmounted admin components from `apps/fleet` | F1 |
| 14 | De-fork `maintenanceCatalogOptions` so both apps build the same checklist | C2 |
| 15 | Template-deletion dependency check | C1 |
| 16 | Refresh or delete the stale `packages/types` vehicle files | F3 |
| 17 | Document the `vehicleCatalogGate` fork contract in the Dominion copy | F4 |
| 18 | Pending-catalog SLA + shared visibility | E2, F5 |
| 19 | Catalog-gate fail-open counter | A2 |
| 20 | Split `VehicleDetail.tsx` | A3 |

---

*Audit only — no files were modified. Every finding is anchored to a specific file and line. Items 1 and 2 in §I are the ones I would act on today: one is an open write endpoint, the other is user-visible dead UI plus abandoned assistant scaffolding left in shipped source.*

---

## Remediation status (2026-08-26)

Implementation landed in-repo per Vehicle System Remediation Program:

| Phase | Status | What shipped |
|---|---|---|
| 0 Security | Done | `requireAuth` + `vehicles.edit` + `stampOrg` on inventory POST/bulk; DELETE `/inventory/:id`; `belongsToOrg` on vehicle update |
| 1 Inventory product | Done | Edit/Delete wired; stock decrement on equipment bulk-assign; `formatJMD`; Seed gated to platform roles + confirm; `deleteStock` implemented |
| 2 Ceilings + types | Done | `fetchAllVehicles` / paginated `getVehicles`; canonical `Vehicle` in `@roam/types`; pending/parts types re-exported |
| 3 Analytics truth | Done | `profitSpark` from net daily profit; “Drove this period” labels; full refresh; local date labels; fleet-wide alert copy |
| 4 Sync hygiene | Done | Dead fleet admin catalog/parts copies removed; checklist options unified; splash renamed to `PlatformMaintenanceSplash`; Dominion gate fork documented |
| 5 Ops safety UX | Done | Template soft-archive + usage count; pending age/SLA + oldest-first + nav badge; `parts_sourcing_requests` queue Fleet→Dominion |
| 6 Visibility | Done | `extractor_miss` gate events; Dominion Catalog Gate panel + enforcement-off banner; pending wait age on Fleet Vehicle Detail |
| 7 Polish | Done | Catalog match label on Vehicle Detail; TCO cost-per-km panel; schedule package `dueKind`/template id transparency |

**Ops follow-up:** apply migration `20260826140000_vehicle_remediation_templates_parts_requests.sql` (template `archived_at` + `parts_sourcing_requests`) and redeploy `make-server-37f42386`.

---

# Verification pass & re-audit (2026-08-31)

**Method:** every claim in the table above re-checked against current source, plus the live GoRide database (`csfllzzastacofsvcdsc`) for the migration/deploy follow-up, plus a fresh sweep for anything the original audit missed. No code changed.

## V1 · What is genuinely done — all 8 phases verified

Every phase claim above holds. Anchors for each, so this doesn't have to be re-derived:

| Phase | Verified at |
|---|---|
| 0 | `requireAuth()` + `requirePermission("vehicles.edit")` on both inventory writes ([`index.tsx:13006`](supabase/functions/_fleet-server/index.tsx#L13006), [`:13028`](supabase/functions/_fleet-server/index.tsx#L13028)); `belongsToOrg` pre-check on both ([`:13016`](supabase/functions/_fleet-server/index.tsx#L13016), [`:13048`](supabase/functions/_fleet-server/index.tsx#L13048)); `DELETE /inventory/:id` exists ([`:13062`](supabase/functions/_fleet-server/index.tsx#L13062)); `belongsToOrg` on the vehicle update path ([`:2724`](supabase/functions/_fleet-server/index.tsx#L2724)) |
| 1 | Edit/Delete wired to real handlers ([`FleetPage.tsx:252-253`](apps/fleet/src/components/fleet/FleetPage.tsx#L252)); `deleteStock` is a real DELETE call ([`inventoryService.ts:35-44`](apps/fleet/src/services/inventoryService.ts#L35)) — the AI monologue is gone; Seed behind an `AlertDialog` confirm ([`FleetPage.tsx:340`](apps/fleet/src/components/fleet/FleetPage.tsx#L340)) |
| 2 | `getVehiclesPage` / `fetchAllVehicles` / paginated `getVehicles` ([`api.ts:789-826`](apps/fleet/src/services/api.ts#L789)); `apps/fleet/src/types/vehicle.ts` and `apps/admin/src/types/vehicle.ts` are now 2-line re-exports of `@roam/types/vehicle`; `vehicleCatalogPending.ts` and `partSourcing.ts` likewise |
| 3 | `profitSpark` from `revenue - totalCost` ([`useVehicleAnalytics.ts:345`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L345)); "Drove this period" ([`AnalyticsKpiGrid.tsx:96`](apps/fleet/src/components/vehicles/analytics/AnalyticsKpiGrid.tsx#L96), [`AnalyticsUtilizationSection.tsx:29`](apps/fleet/src/components/vehicles/analytics/AnalyticsUtilizationSection.tsx#L29)); `refresh()` now fires all ten refetches ([`:593-602`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L593)); local-calendar date labels ([`:576-580`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L576)) |
| 4 | `apps/fleet/src/components/admin/` no longer contains `VehicleCatalogManager` / `PendingVehicleCatalogManager` / `PartsSourcingManager` — the 4,275 lines are gone; `maintenanceCatalogOptions.ts` now differs between fleet and admin by **one comment line only**; `PlatformMaintenanceSplash.tsx` renamed; Dominion gate fork carries an explicit CONTRACT block |
| 5 | Template soft-archive + usage count in the response ([`maintenance_routes.ts:608-625`](supabase/functions/_fleet-server/maintenance_routes.ts#L608)); `slaBadgeClass` + age column ([`PendingVehicleCatalogManager.tsx:65`](apps/admin/src/components/admin/vehicle-catalog/PendingVehicleCatalogManager.tsx#L65), [`:279`](apps/admin/src/components/admin/vehicle-catalog/PendingVehicleCatalogManager.tsx#L279)); parts-request routes ([`part_sourcing_routes.ts:834`](supabase/functions/_fleet-server/part_sourcing_routes.ts#L834)) |
| 6 | `extractor_miss` recorded on both null and empty extraction ([`vehicle_catalog_gate.ts:149-172`](supabase/functions/_fleet-server/vehicle_catalog_gate.ts#L149)); [`CatalogGateObservabilityPanel.tsx`](apps/admin/src/components/admin/vehicle-catalog/CatalogGateObservabilityPanel.tsx) exists |
| 7 | [`VehicleTcoPanel.tsx`](apps/fleet/src/components/vehicles/analytics/VehicleTcoPanel.tsx) exists |

**One correction to the phase-1 claim, in the fix's favour.** The audit said "stock decrement on equipment bulk-assign". The client only does a *pre-check* ([`FleetPage.tsx:139-145`](apps/fleet/src/components/fleet/FleetPage.tsx#L139)) — the actual decrement is **server-side**, in `POST /fleet/equipment/bulk` ([`index.tsx:12935-12972`](supabase/functions/_fleet-server/index.tsx#L12935)): it counts draws per `inventoryId`, verifies `belongsToOrg`, 409s on insufficient stock, then writes `quantity - draw` back to KV before creating the equipment rows. That is the stronger of the two possible implementations — the client pre-check is only a UX nicety and cannot be bypassed to overdraw. §D3 is properly closed.

## V2 · Ops follow-up — half done, and the ledger is now inconsistent

Checked directly against the live database and the deployed function.

| Item | State |
|---|---|
| `maintenance_task_templates.archived_at` | **Exists** in the DB |
| `public.parts_sourcing_requests` | **Exists** in the DB |
| Row in `supabase_migrations.schema_migrations` for `20260826140000` | **Missing** |
| `make-server-37f42386` redeploy | **Done** — v1792, updated ~2026-08-30, after the remediation |

So the DDL was applied **out of band** — by hand or via MCP `apply_migration` under a different version — rather than through the checked-in migration file. Production works today; the ledger does not know why.

### V2a · HIGH — The migration file is checked in but unrecorded
`supabase/migrations/20260826140000_vehicle_remediation_templates_parts_requests.sql` sits in the repo describing objects that already exist in production, with no `schema_migrations` row. Two consequences:

- The remote is at `20260830103321`; this file is dated `20260826140000`, i.e. **behind the head**. A `supabase db push` will treat it as pending and try to apply it out of order.
- It would in fact succeed — every statement is `IF NOT EXISTS` / `DROP POLICY IF EXISTS … CREATE POLICY`, so re-running is harmless. The risk is not corruption, it is that **nobody can tell from the ledger whether Phase 5 shipped**, and the next person to rebuild an environment from migrations gets a different history than production has.

The fix is a bookkeeping insert (the repo already has a `history_align` convention for exactly this — 20+ such migrations in the applied list), not a re-apply. Low effort, but it should not stay open.

### V2b · LOW — `parts_sourcing_requests` has a SELECT policy and no write policy
[`the migration:30-46`](supabase/migrations/20260826140000_vehicle_remediation_templates_parts_requests.sql#L30) enables RLS and creates only `parts_sourcing_requests_select_own`. Writes go through the edge service role, which bypasses RLS, so this is correct-by-design and the table is not anon-writable. Noting it because the table lives in `public` and is therefore PostgREST-exposed — worth carrying into the RLS exposure audit's inventory rather than rediscovering it there.

## V3 · New findings the original audit missed

The original audit scoped itself to `apps/fleet`, `apps/admin`, `packages/*` and `supabase/functions/*`. **It never looked at `apps/driver`** — which is a live consumer of the vehicle system. That omission is where all three new findings sit.

### V3a · HIGH — `apps/driver` is a fourth divergent `Vehicle` type, and it is the one §F2 warned about
Phase 2 consolidated fleet and admin onto `@roam/types/vehicle`. [`apps/driver/src/types/vehicle.ts`](apps/driver/src/types/vehicle.ts) was left as a standalone 253-line copy — 32 lines behind the 285-line canonical package.

It is missing **exactly the fields §F2 flagged as the dangerous ones**:

- the entire Uber sync block — `uberVehicleId`, `uberOwnerId`, `uberComplianceStatus`, `uberAssignedDriverIds`, `uberLastSyncedAt`
- `driverAssignmentHistory[]` — *"who had this vehicle over time, used to attribute fuel fills on shared cars"*
- `usageCategory`, `plateClass`, `fitnessFirstRegistration` — the Jamaica fitness/permit classification
- `tollClassId`, `tollClassNeedsReview` — the link to Super Admin Toll Info
- `lastBalanceSyncedAt`, plus the `@deprecated` annotation on `fuelScenarioId` that tells a reader to prefer `Driver.fuelScenarioId`

This is not dormant. The driver app actively consumes the type in [`fuelCalculationService.ts:6`](apps/driver/src/services/fuelCalculationService.ts#L6), [`exportHelpers.ts:3`](apps/driver/src/utils/exportHelpers.ts#L3), [`odometerUtils.ts:1`](apps/driver/src/utils/odometerUtils.ts#L1) and [`vehicleCatalogGate.ts:1`](apps/driver/src/utils/vehicleCatalogGate.ts#L1), and `FuelWalletView` renders off `FuelCalculationService`.

The sharpest edge: the server writes `driverAssignmentHistory` on every driver-assignment change ([`index.tsx:2756-2757`](supabase/functions/_fleet-server/index.tsx#L2756)), and the driver app — the app *closest to the driver* — is typed to believe the field does not exist. Any driver-side code that spreads a vehicle and writes it back drops the shared-car fuel attribution history silently.

Good news: driver's `vehicleCatalog.ts`, `vehicleCatalogPending.ts` and `partSourcing.ts` are **byte-identical** to the package. Only `vehicle.ts` drifted, and it is a 2-line re-export away from being fixed like the other two apps.

### V3b · MEDIUM — `vehicleCatalogGate.ts` has three client forks; the contract comment landed on only one
Phase 4 documented the fork contract in the Dominion copy. There are three:

| Copy | Contract comment | Types source |
|---|---|---|
| `apps/fleet/src/utils/vehicleCatalogGate.ts` | Local-unions rationale only | local unions (edge imports this) |
| `apps/admin/src/utils/vehicleCatalogGate.ts` | **Full CONTRACT block** ✅ | `../types/vehicle` → `@roam/types` |
| `apps/driver/src/utils/vehicleCatalogGate.ts` | **None** ❌ | `../types/vehicle` → **stale local copy** |

The driver copy is the same shape as the admin copy — `import type { Vehicle, VehicleCatalogStatus, VehicleStatus }`, widened `deriveCatalogStatus(v: Vehicle | CatalogGateVehicleShape)` — but it carries no warning that it must stay behaviourally identical to the edge gate, *and* it resolves its unions through the stale type file in V3a. This is precisely the drift §F4 predicted, reproduced in the one app that didn't get the fix.

### V3c · MEDIUM — The 500-vehicle ceiling became a silent 20,000-vehicle ceiling
`fetchAllVehicles` computes `truncated` honestly ([`api.ts:807-820`](apps/fleet/src/services/api.ts#L807)) — but `getVehicles()` destructures `{ vehicles }` and **throws the flag away** ([`:823-826`](apps/fleet/src/services/api.ts#L823)), and every consumer calls `getVehicles()`. A grep for `truncated` across `apps/fleet/src` finds it surfaced for catalog candidates, pending requests and driver balances — never for vehicles.

§A1's severity is genuinely reduced: the cap moved from 500 to 20,000 and no realistic fleet hits it. But the *class* of bug the finding named — a cap the user cannot see — is unchanged, and it is now the same shape as the §B3 criticism of `fetchAllPeriodTrips`. Wiring `truncated` into one banner would close both.

## V4 · Carried forward — open items never claimed as fixed

These were in §I but outside the 8 phases. Still open, correctly:

- **§A3 — `VehicleDetail.tsx` is now 2,122 lines** (up 22 from the original 2,100; phase 7 added the catalog-match label and TCO wiring). §I item 20, never claimed. Still the highest-risk file in the section.
- **§B6 — the 2,000 km/day odometer bound is still a magic number.** Phase 3 went halfway: `droppedDeltas` is now counted, then discarded with `void droppedDeltas; // available for future honesty badge` ([`useVehicleAnalytics.ts:571`](apps/fleet/src/hooks/useVehicleAnalytics.ts#L571)). The count exists; nothing renders it. Same shape as V3c — honesty computed, honesty dropped.
- **§B3 — ten unconditional queries on mount, two of them 40-page loops.** Untouched, and phase 3's full-refresh fix made `refresh()` heavier by design (three refetches → ten). Correct for truth, worse for load. Not a regression to undo, but worth knowing the trade was made.
- **§E1 — `VehicleCatalogManager.tsx` is still ~2,400 lines.** Never claimed.

### V4a · LOW — theming leftover in the surviving Dominion catalog manager
[`VehicleCatalogManager.tsx:867`](apps/admin/src/components/admin/vehicle-catalog/VehicleCatalogManager.tsx#L867) sets `text-slate-200` on the component's root container in an app whose shell is light. Most children set their own colour (`text-slate-900 dark:text-white` etc.), so it is largely masked — but any inherited text renders near-white on white. Likely a survivor of the dark-only fleet copy deleted in phase 4. Worth a visual check rather than a blind edit.

## V5 · Revised state

**Original findings:** 4 Critical · 10 High · 15 Medium · 7 Enhancement.

| Original | Status |
|---|---|
| A1 silent 500 cap | Fixed → downgraded to V3c (MEDIUM, silent 20k cap) |
| B1 profitSpark | **Closed** |
| D1 dead Edit/Delete | **Closed** |
| D2 `deleteStock` monologue | **Closed** |
| D3 stock never decrements | **Closed** (server-side, stronger than claimed) |
| F1 4,275 dead lines | **Closed** |
| F2 divergent `Vehicle` types | Fixed for fleet + admin → **reopened as V3a for `apps/driver`** |
| F4 gate fork undocumented | Fixed for admin → **reopened as V3b for `apps/driver`** |
| G1 open inventory writes | **Closed** |
| All 4 Criticals | **Closed** |

**Now open:** 0 Critical · 2 High (V2a, V3a) · 4 Medium (V3b, V3c, A3, B6) · 3 Low (V2b, V4a, B3 load).

**Order of work:**

| # | Item | § | Effort |
|---|---|---|---|
| 1 | Point `apps/driver/src/types/vehicle.ts` at `@roam/types/vehicle` | V3a | 2 lines — the other two apps are the template |
| 2 | Record `20260826140000` in `schema_migrations` via a `history_align` migration | V2a | Bookkeeping; do not re-apply the DDL |
| 3 | Copy the CONTRACT block into the driver gate fork | V3b | Comment only |
| 4 | Surface `truncated` from `getVehicles()`; render `droppedDeltas` | V3c, B6 | One banner each; both values already computed |
| 5 | Split `VehicleDetail.tsx` | A3 | Large, unchanged from the original recommendation |

Item 1 is the one to do today. It is a two-line change that closes the last live instance of the original audit's most consequential finding, in the app where `driverAssignmentHistory` and `tollClassId` matter most.

---

*Verification and re-audit: 2026-08-31. Audit only — no files were modified. Database and edge-deploy state read live from project `csfllzzastacofsvcdsc`. The 2026-08-26 remediation table above is accurate as written; the only correction is that phase 1's stock decrement is server-side rather than client-side, which is the better outcome.*

---

# Closure pass (2026-08-31)

Full closure plan executed in-repo. All V5 open items closed.

| Item | Status | Verify |
|---|---|---|
| V3a Driver `@roam/types` Vehicle | **Closed** | `apps/driver/src/types/vehicle.ts` re-exports `@roam/types/vehicle` |
| V3b Driver gate CONTRACT | **Closed** | CONTRACT header on `apps/driver/src/utils/vehicleCatalogGate.ts` |
| V2a `schema_migrations` for `20260826140000` | **Closed** | `20260831125346_vehicle_remediation_history_align.sql` + remote apply |
| V4a Catalog root theme | **Closed** | `text-slate-900 dark:text-slate-200` on Motor Vehicles root |
| V3c Silent 20k vehicle cap | **Closed** | `getVehiclesWithMeta` + amber banners on VehiclesPage + Vehicle Analytics |
| B6 droppedDeltas honesty | **Closed** | Hook returns count; health panel renders when &gt; 0 |
| A3 VehicleDetail split | **Closed** | `vehicles/detail/*` panels; shell ~1233 lines |
| E1 Catalog Manager peel | **Closed** | Import/Edit/Table siblings; manager ~808 lines |
| B3 Analytics mount load | **Closed** | Prior-period + maintenance logs `enabled` after coreReady |
| V2b parts_sourcing_requests RLS note | **Closed** | Documented in `docs/rls-audit.md` G1 addendum + Notion |

**Open severity after closure:** 0 Critical · 0 High · 0 Medium · 0 Low (for V5 backlog).
