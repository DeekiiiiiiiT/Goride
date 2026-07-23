# RoamFleet Maintenance & Finance Wiring Audit

**Date:** 2026-07-22
**Scope:** `apps/fleet` (RoamFleet) maintenance module, `apps/admin` (Roam Dominion) maintenance-templates module, and the maintenance ↔ Business Finance/Expense Hub integration.
**Method:** Static code audit (read-only, no changes made) across components, services, Supabase edge functions, and SQL migrations, cross-referenced against current fleet-maintenance SaaS products (Fleetio, Samsara, Whip Around, AUTOsist, Simply Fleet, Driveroo).
**Lens:** Senior software engineer (architecture, correctness, tech debt) + UI/UX (does the flow make sense to a real user) + senior accountant (is the money trail complete and auditable).

---

## TL;DR — Are you ready to start logging maintenance?

**Yes, for day-to-day fleet-ops use.** The core loop — Dominion defines service catalogs → RoamFleet bootstraps a per-vehicle schedule → you log a service → the schedule auto-advances → overdue/due-soon shows up in the fleet hub — is genuinely built on Postgres with real RLS/RBAC and no mocked handlers. This is not a half-finished feature.

**No, if you expect it to feed your financials automatically.** It doesn't. Every dollar you log as a maintenance service has to be **manually re-typed a second time** into Business Finance for it to show up in your P&L, your expense reports, or your accountant's books. This isn't a bug — it was a deliberate design choice — but it is a real operational risk if nobody re-keys consistently, and today the app shows you two different "maintenance cost" numbers side-by-side that will not match each other, with no explanation of why.

**Three things worth fixing before you lean on this hard**, in priority order:
1. Close the maintenance → finance gap (auto-post completed services to the ledger) — **accounting-integrity risk**.
2. Add due-date reminders (currently 100% pull-based — you only find out something's overdue if you open the app) — **operational risk**.
3. Fix the driver "service request" flow, which currently dead-ends as a $0 placeholder expense instead of creating an actual maintenance record — **workflow gap**.

Everything else below is detail, context, and a prioritized roadmap.

---

## 1. Current Architecture: How Roam Dominion Feeds RoamFleet

### 1.1 What exists today (and works)

Roam Dominion (`apps/admin`) has a real, reachable **"Maintenance templates"** screen (Sidebar → Vehicle Database → Maintenance templates, `apps/admin/src/components/admin/AdminPortal.tsx:288-292`, nav config `adminNavConfig.ts:110`) with two authoring scopes:

- **Fleet defaults (`global`)** — tasks that apply to every vehicle regardless of make/model.
- **Per motor vehicle (`catalog`)** — tasks scoped to a specific `vehicle_catalog` row (make/model/year), i.e. manufacturer-style intervals.

Both write to a single shared table, `public.maintenance_task_templates`. When a RoamFleet vehicle is "bootstrapped," the server (`maintenance_bootstrap_core.ts:26-50`, `mergeGlobalAndCatalogTemplates`) merges global + catalog rows keyed by `task_code` (falling back to normalized `task_name`), with **catalog-scoped rows winning over global on a match**. This is a sound, deliberate pattern — not an accident — and it's documented in the UI copy itself ("Fleet defaults apply to every vehicle; catalog tasks add or override by model/year. Schedules merge both at bootstrap.").

Security is correct on both ends: `maintenance_task_templates`, `vehicle_maintenance_schedule`, and `maintenance_records` all have RLS locked to `USING (false)` for authenticated clients — **no direct DB access is possible from either app**; every read/write goes through a service-role edge function, and template CRUD is additionally gated to platform staff only (`assertVehicleCatalogPlatformAccess`).

### 1.2 The architectural problem: there is no real "Dominion → Fleet" boundary

This is the most important structural finding for your question. **The two apps do not talk to each other through an API boundary — they share one physical backend and, in one case, duplicated frontend code:**

- **Single shared edge function.** There is no `apps/admin`-owned backend at all — `apps/admin` has no `supabase/functions` directory. The one Deno edge function that serves *both* Dominion's template CRUD and RoamFleet's schedule/logging routes physically lives inside `apps/fleet/src/supabase/functions/server/` (`maintenance_routes.ts`, `maintenance_bootstrap_core.ts`, `maintenance_schedule_engine.ts`). A deploy or refactor of the fleet app's backend can silently break Dominion's admin screen, and there is no ownership boundary signaling that to whoever touches those files.
- **Dead duplicated frontend.** `apps/fleet/src/components/admin/maintenance-templates/MaintenanceTemplatesManager.tsx` is a **byte-for-byte identical copy** of the Dominion component (confirmed via diff), along with duplicate copies of `maintenanceTemplateService.ts`, `maintenanceScheduleEngine.ts`, `maintenanceCatalogOptions.ts`, `maintenanceOverdueDetails.ts`, `maintenanceSchedulePresets.ts`, and `types/maintenance.ts`. This isn't a "consumer extends what the admin publishes" pattern — it's leftover copy-paste from the original monorepo split (`git log` shows exactly one commit touching this tree: the Phase-0 "convert to pnpm monorepo" move). It is **never imported anywhere in `apps/fleet/src/App.tsx`** and is unreachable from the running app. Even if someone wired it up by accident, the backend would reject it (403) because template routes require platform-staff role — so it's not a security hole, just dead weight that inflates the bundle and is a trap for a future engineer who might edit the wrong copy.
- **No cross-tenant compliance visibility in Dominion.** Once templates are pushed down, Dominion has no way to see which tenant fleets are actually behind on maintenance. That view only exists per-tenant, inside each RoamFleet instance. For a platform operator, this means you can define the rules centrally but can't monitor centrally whether fleets are following them.
- **Schedule bootstrap is manual, not event-driven.** When a vehicle gets matched to a `vehicle_catalog` entry, nothing automatically creates its `vehicle_maintenance_schedule` rows — a fleet manager has to click "Bootstrap schedules" (single-vehicle or fleet-wide). A newly onboarded/matched vehicle can silently sit with zero schedule until someone remembers to click the button.

### 1.3 Recommended target architecture

You asked specifically what the best architecture is for Dominion to feed Fleet. My recommendation, in order of impact vs. effort:

| # | Recommendation | Why |
|---|---|---|
| 1 | **Delete the orphaned `apps/fleet/src/components/admin/*` tree** (maintenance-templates + its service/util duplicates, and check whether the rest of the copied admin shell is equally dead). | Zero functional risk to remove (unreachable code); removes a maintainability trap and shrinks the tenant bundle. |
| 2 | **Auto-bootstrap schedules on catalog match**, instead of requiring a manual button click. Trigger it from wherever a vehicle's `vehicle_catalog_id` gets set (DB trigger or a hook in that route), reusing the existing `executeMaintenanceBootstrap`. | Removes the "silently un-scheduled vehicle" failure mode — this is the single highest-leverage fix in this section. |
| 3 | **Give template edits a lightweight audit trail / staged rollout.** A global-scope edit in Dominion instantly affects every tenant fleet's next bootstrap. Right now there's no visible history of who changed an interval or when. At minimum, log changes; ideally, support draft → publish so a bad edit doesn't propagate immediately. | A wrong interval pushed globally is a platform-wide liability/safety issue, not just a UI bug — this deserves the same rigor as a pricing or policy change. |
| 4 | **Add a cross-tenant maintenance-compliance dashboard to Dominion** (aggregate overdue/due-soon counts per tenant fleet, reusing the existing `maintenanceOverdueDetails.ts` logic that's already computed per-tenant). | You're the platform operator — if a vehicle-safety issue becomes a liability question, you want visibility before a tenant tells you, not after. |
| 5 | **Formalize backend ownership.** Either move the shared maintenance edge-function code into a package/location that's clearly co-owned (e.g. a `packages/server-shared` the fleet function imports from), or explicitly document in the admin repo that its backend lives in the fleet app's deploy pipeline, with a check to catch breaking changes (e.g. a contract test that Dominion's template routes still respond correctly, run in the fleet app's CI). | Today a fleet-app-only PR could break Dominion with no signal in that PR's review. |
| 6 | **Fix migration hygiene**: one migration file (`20260417140000_vehicle_maintenance_next_due_miles_max.sql`) is UTF-16LE-with-BOM-encoded while every sibling migration is UTF-8 — this is a real risk depending on how your migration runner parses files. Also, two "history-alignment stub" migrations exist whose *real* DDL lives in a differently-timestamped sibling file, which is confusing (though functionally harmless) if anyone ever replays migrations from scratch. | Low current risk, but this kind of drift compounds — worth a cleanup pass. |

None of the above blocks you from logging maintenance today. Items 1 and 6 are pure hygiene; item 2 is the one I'd actually prioritize before you rely on this at scale, since an un-bootstrapped vehicle just silently never shows up as needing service.

---

## 2. Competitive Gap Analysis — What RoamFleet Is Missing

I compared your current feature set against Fleetio, Samsara, Whip Around, AUTOsist, Simply Fleet, and Driveroo (all leading fleet-maintenance/CMMS products as of 2026).

### 2.1 What you already have (don't rebuild these)

- Recurring maintenance scheduling by **mileage, calendar date, or both**, with a due/due-soon/overdue window (`interval_miles` → `interval_miles_max`) — this is genuinely on par with the category leaders' PM scheduling.
- A real templates/catalog system with global defaults + per-vehicle-model overrides — comparable to Fleetio's "import OEM service programs, customize, auto-apply by attribute."
- Service logging with itemized cost breakdown (materials + labor per checklist item), provider name, odometer capture, and **invoice OCR scanning** (a nice touch most competitors charge extra for).
- Fleet-wide overdue/due-soon dashboard and a cost-analytics view.
- Photo/document (invoice) attachment per service record.

### 2.2 What competitors have that you don't

| Feature | Who has it | Your current state |
|---|---|---|
| **Work orders with technician assignment & labor time tracking** (clock in/out, planned vs. actual time, MTTR reporting) | Fleetio | Not modeled at all — you have a service *log* (after the fact) not a work order (in-progress job tracking). |
| **Parts inventory tied to consumption per service** (stock levels, reorder points, auto-deduct on work order) | Fleetio, Autosist | You have a *separate*, disconnected "compatible parts" lookup catalog — it's a reference list, not inventory, and doesn't tie to what was actually used in a service. |
| **Vendor/shop master data + performance tracking** (on-time %, cost trends per vendor) | Fleetio (100k+ shop network), most CMMS tools | `provider` is a free-text field on the service log — no vendor entity, no history-per-vendor, no way to answer "which shop is overcharging me." |
| **Driver-facing DVIR / digital pre-trip & post-trip inspections with automatic defect → work order routing** | Whip Around (core strength), Simply Fleet, Webfleet | You have a driver "service request" form, but it doesn't create a maintenance record or defect — it creates a **$0 placeholder expense transaction** with status "Pending" and a comment that a fleet manager will price it manually. This is the single biggest functional gap relative to competitors — it's the #1 feature category for smaller fleets in this space. |
| **Automated due-date reminders** (push/email/SMS) | All of the above | You are 100% pull-based — the only way to know something's overdue is to open the analytics tab. No cron/notification job exists. |
| **True accounting sync** (QuickBooks/Xero/Sage — auto-post categorized transactions, mapped to GL accounts) | Fleetio, FleetRabbit, Oxmaint, HVI | Your "integration" is a documented manual re-entry workflow, not a sync (see §3). |
| **Total cost of ownership / cost-per-mile combining maintenance + fuel + insurance + depreciation** | Fleetio, Geotab, most enterprise tools | You have a cost-per-vehicle chart that *attempts* this, but the maintenance figure feeding it is wrong today (see §3.3) because it only reflects manually re-entered costs, not the real service log total. |
| **Telematics-triggered predictive maintenance** (live engine data triggers a PM task) | Samsara | Reasonable to skip for now — this requires IoT hardware and is likely out of scope/cost given your fleet size and current stage; flagging only for completeness. |

### 2.3 Suggested enhancement roadmap

**Quick wins (days, not weeks):**
- Auto-post completed maintenance costs to the finance ledger (§3.4 has the concrete design).
- Add due/overdue email or in-app push notifications — you already compute the status server-side (`analyzeMaintenanceScheduleRow`), you just need a scheduled job to act on it.
- Delete the dead-code duplication (§1.2).
- Fix the migration encoding issue.

**Medium effort (a sprint or two):**
- Promote `provider` from free text to a real vendor entity (even a simple lookup table with name/contact/notes) and start attributing cost history per vendor.
- Tie the existing "compatible parts" catalog into service logging so a logged service can reference parts actually used (even without full stock-level tracking yet, this closes the biggest disconnect).
- Structure the "inspection results" data that's currently captured in the UI but only saved into an opaque JSON blob — make it a queryable table so you can actually report on recurring defects.
- Bulk actions beyond fleet-wide bootstrap (e.g., logging a recall-driven service across multiple vehicles at once).

**Bigger investments (worth planning, not urgent):**
- Replace the driver "service request" dead-end with a real defect-report → work-order flow that lands in the actual maintenance module, not a placeholder expense.
- Full work-order lifecycle (assigned tech, labor clock, planned vs. actual) if you ever bring maintenance in-house rather than using outside shops.
- Dominion cross-tenant compliance dashboard (§1.3, item 4).

---

## 3. Maintenance ↔ Business Finance / Expense Hub Wiring

This is the part of the audit that most needs an accountant's eye, and it's the area with the clearest, most consequential gap.

### 3.1 The two systems, as they exist today

**Maintenance side** (`maintenance_records` table, Postgres): a standalone table — `organization_id`, `vehicle_id`, `cost numeric(12,2)`, `service_type`, `provider`, `status`, `invoice_url`, etc. **No currency column at all.** No foreign key to anything finance-related. RLS locked to service-role only.

**Finance side** (Business Finance / Expense Hub, `apps/fleet/src/components/business-finance/*`): a much richer, event-sourced system. Expense documents, payments, and journal entries are written to a Supabase KV store, then projected into a canonical `ledger_event:*` stream that is the single source of truth for P&L — per the team's own internal doc: *"If a dollar never becomes a `ledger_event:*` row, it does not exist to Business Finance."* Every ledger event carries `currency` (defaults `JMD`), `vehicleId` allocations, `sourceType`/`sourceId`, and an idempotency key.

**"Maintenance" is a first-class expense category** in the quick-entry form (`LogBusinessExpenseDialog.tsx`) — it's even the *default* selected category — but that form has **no vehicle picker at all**, so a quickly-logged maintenance expense isn't even reliably tagged to the vehicle it was for unless someone uses the fuller Expense Hub document flow instead.

### 3.2 The gap: no automatic link, in either direction

- Logging a service in `LogMaintenanceServiceDialog.tsx` writes **only** to `maintenance_records` and advances the schedule. There is no call anywhere in `maintenance_routes.ts` to the ledger/expense functions.
- Logging an expense in Business Finance writes **only** to the expense/ledger stores. It never touches `maintenance_records`, so it doesn't show up in a vehicle's service history.
- The one-time ledger backfill/reconciliation job (`POST /ledger/canonical-backfill`) scans trips, fuel, tolls, InDrive, fixed expenses, and generic transactions — **it never scans `maintenance_records`**. So even a historical catch-up sync can't pull your existing service costs into the books; maintenance simply isn't a recognized source type for that job.
- **This is by design, not an oversight.** Two internal docs (`business-finance-coverage-audit.md`, `business-overhead-finance-wiring.md`) explicitly instruct the workflow as "log a completed Maintenance expense from BF → Expenses," with the stated reasoning that `FleetMaintenanceHub` also tracks *supplier quotes* (procurement estimates), and the team didn't want quotes accidentally counted as real spend. That's a legitimate concern — but the mitigation chosen (manual double-entry for everything) is a heavier cost than necessary, because the data to distinguish quote vs. actual **already exists** (see §3.4).

### 3.3 The user-facing symptom: two numbers that don't match

This is the most important thing for you to know as the app's owner, because it's already live and visible today, not just a backend gap:

Open a vehicle's **Analytics** tab. You will see:
- A **"Maintenance Log" total** in `AnalyticsMaintenanceSection` — this sums the real `cost` field across every row in `maintenance_records`. This is the true, complete number.
- A **"Cost per Vehicle" chart** in `AnalyticsFinancialSection`, with a "Maintenance" bar captioned *"Attributed ledger categories only"* — this is sourced **exclusively** from ledger events, i.e. only whatever subset of maintenance spend someone happened to separately re-key into Business Finance.

These two numbers will not reconcile, and the caption explaining why is easy to miss. As an accountant, this is the kind of discrepancy that erodes trust in the numbers the moment someone notices it — and someone will notice it, because it's sitting on the same page.

### 3.4 Recommended fix

You don't have to choose between "fully automatic and risk double-counting quotes" and "fully manual." The `maintenance_records.status` field already exists and can distinguish completed/paid services from quotes/estimates. Concretely:

1. **Auto-post to the ledger only when a maintenance record is finalized** (e.g. `status = 'completed'`), using the same `sourceType`/`sourceId`/idempotency-key pattern already used for tolls, fuel, and fixed expenses (`eventType: 'maintenance'`, `sourceType: 'maintenance_record'`, `sourceId: <record id>`, `vehicleId: <vehicle_id>`, `netAmount: <cost>`). Quotes/estimates would never post, addressing the original concern directly.
2. **Add a `currency` column to `maintenance_records`** so it can carry the same currency-awareness the ledger already has, rather than implicitly assuming JMD.
3. **Add a vehicle picker to `LogBusinessExpenseDialog.tsx`** so any manually-logged expense (maintenance or otherwise) is reliably attributable to a vehicle — currently it's optional/absent, which weakens vehicle-level P&L for every category logged through that quick form, not just maintenance.
4. **Once auto-posting exists, either remove the redundant manual "Maintenance" category from the quick-entry form or clearly relabel it** (e.g. "Other vehicle-related expense") so users aren't tempted to double-enter the same cost.
5. **Until #1 ships, add a reconciliation view**: a simple report listing "maintenance records with no matching ledger entry," so nothing falls through the cracks silently the way it can today. This is a cheap, high-value stopgap.

This closes the loop the way your fuel and toll tracking already work (both of those are described in the same internal docs as "fully wired," with dedicated auto-posting pipelines) — maintenance is currently the one operating-expense category that's the odd one out.

### 3.5 Other accountant-relevant notes

- The `vehicle_id` convention (plain text ID) is **consistent** between the maintenance and finance sides, so the integration in §3.4 doesn't require any ID-mapping work — this is the one piece of groundwork that's already done correctly.
- No vendor entity (§2.2) also has an accounting angle: without a vendor master record, you can't easily produce a 1099-equivalent vendor payment summary or catch a shop that's quietly raising prices over time.
- Cost fields on both sides use `numeric(12,2)` — sane precision for currency; no rounding-related issue found.

---

## 4. Summary Findings Table (all severities)

| Severity | Area | Finding |
|---|---|---|
| **High** | Finance wiring | Maintenance costs never auto-post to the ledger; requires manual double-entry; two mismatched "maintenance cost" figures are shown to users today with an easy-to-miss caption as the only explanation. |
| **High** | Driver workflow | Driver "service request" creates a $0 placeholder expense transaction, not a maintenance record — a real functional dead end between the driver app and the maintenance module. |
| **Medium** | Operations | No due-date notifications of any kind (email/push/SMS) — fully pull-based; a busy fleet manager can miss overdue service with no prompt. |
| **Medium** | Operations | New vehicles aren't auto-scheduled on catalog match — requires a manual "Bootstrap" click, so a newly matched vehicle can silently have zero schedule. |
| **Medium** | Data model | `maintenance_records` has no currency column; finance/ledger side is currency-aware, maintenance side implicitly assumes one currency. |
| **Low-Med** | Code health | `apps/fleet/src/components/admin/maintenance-templates/*` and its service/util dependencies are byte-identical, unreachable dead code from the monorepo split — should be deleted. |
| **Low-Med** | Code health | Orphaned `fuel-maintenance` KV-based edge function appears superseded by the Postgres routes but nothing confirms it's undeployed — potential stale attack surface / cost. |
| **Low** | Data model | No vendor/shop entity — `provider` is free text; no parts-consumption tracking despite a separate parts catalog existing. |
| **Low** | Migration hygiene | One migration file is UTF-16LE/BOM-encoded while all siblings are UTF-8; two "history-alignment stub" migrations have real DDL living in oddly-ordered sibling files. |
| **Low** | UX/naming | `MaintenancePage.tsx` is actually the platform-downtime splash screen, unrelated to vehicle maintenance — a naming collision worth renaming to avoid future confusion. |
| **Info** | Architecture | Roam Dominion has no backend of its own — the shared edge function serving both apps physically lives in the fleet app's source tree, creating a deploy-coupling risk without any current failure observed. |
| **Info** | Architecture | No cross-tenant maintenance-compliance dashboard exists in Dominion; overdue visibility is entirely per-tenant. |

---

## 5. Files Referenced

**RoamFleet (`apps/fleet`):**
`src/components/vehicles/FleetMaintenanceHub.tsx`, `LogMaintenanceServiceDialog.tsx`, `MaintenanceManager.tsx`, `analytics/AnalyticsMaintenanceSection.tsx`, `analytics/AnalyticsFinancialSection.tsx` · `src/components/MaintenancePage.tsx` · `src/components/business-finance/BusinessFinancePage.tsx`, `ExpensesTab.tsx`, `LogBusinessExpenseDialog.tsx`, `businessFinancePnL.ts`, `expense-hub/*` · `src/components/driver-portal/ServiceRequestForm.tsx` · `src/supabase/functions/server/maintenance_routes.ts`, `maintenance_bootstrap_core.ts`, `maintenance_schedule_engine.ts`, `expense_hub_routes.ts`, `index.tsx` · `src/supabase/functions/fuel-maintenance/index.ts` · `src/services/maintenanceTemplateService.ts`, `expenseHubService.ts`, `expenseService.ts` · `src/utils/maintenanceScheduleEngine.ts`, `maintenanceOverdueDetails.ts`, `maintenanceCatalogOptions.ts` · `src/types/maintenance.ts` · `src/docs/business-finance-coverage-audit.md`, `business-overhead-finance-wiring.md`, `Fuel Maintenance.md` · `src/components/admin/maintenance-templates/MaintenanceTemplatesManager.tsx` (dead code).

**Roam Dominion (`apps/admin`):**
`src/components/admin/maintenance-templates/MaintenanceTemplatesManager.tsx` · `src/components/admin/AdminPortal.tsx`, `AdminLayout.tsx`, `adminNavConfig.ts` · `src/components/admin/vehicle-catalog/VehicleCatalogManager.tsx`.

**Shared (`packages/`, `supabase/migrations/`):**
`packages/types/src/maintenance.ts` · `20260412120000_maintenance_schedule_system.sql`, `20260417140000_vehicle_maintenance_next_due_miles_max.sql`, `20260418120000_maintenance_frequency_kind.sql`, `20260418133408_maintenance_frequency_kind_and_schedule_status.sql`, `20260418133422_maintenance_template_global_catalog.sql`, `20260419120000_maintenance_template_global_catalog.sql`, `20260718220100_schema_audit_wave1_catalog_maintenance.sql`.

**Driver app (`apps/driver`):**
`src/components/fleet/ServiceRequestForm.tsx`, `FleetServiceRequestPage.tsx`.

---

## Sources (competitor research)

- [8 Best Fleet Maintenance Software of 2026 + Pricing Guide](https://softwareconnect.com/roundups/best-fleet-maintenance-software/)
- [Whip Around vs Fleetio (2026)](https://whiparound.com/alternatives-fleetio/)
- [Fleet Maintenance Software: Complete Lifecycle Tracking — Fleetio](https://www.fleetio.com/solutions/fleet-maintenance-software)
- [Auto Parts Inventory Management Software — Fleetio](https://www.fleetio.com/features/parts-inventory-system)
- [Fleet Management Costs in 2026 — Geotab](https://www.geotab.com/blog/fleet-costs/)
- [Fleet Total Cost of Ownership Guide — Autosist](https://autosist.com/resources/guides/fleet-vehicles-total-cost-of-ownership/)
- [QuickBooks Fleet Management Software Integration — Locate2u](https://www.locate2u.com/products/fleet-management/quickbooks/)
- [Accounting Software Integration — FleetRabbit](https://fleetrabbit.com/integration/accounting)
- [Best Vehicle Inspection Apps for Fleet Drivers — Autosist](https://autosist.com/blog/best-vehicle-inspection-apps-fleet-drivers/)
- [Simply Fleet's Digital Vehicle Inspection Software](https://www.simplyfleet.app/features/vehicle-inspection-app)
- [Driveroo — Asset and Fleet Management Software](https://www.driveroo.com/)
