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
