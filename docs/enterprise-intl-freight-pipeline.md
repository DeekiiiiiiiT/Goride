# Jamaica international freight pipeline — ops runbook

## Scope

Ops-managed mailbox freight (no customer portal). SMS status updates. Pickup **and** door delivery. Mixed fleets: org fleet, client-owned vehicles, 3PL. Domestic freight auto-dispatch (org drivers) is live on the Dispatch Board; full Roam Driver marketplace supply and mailbox-batch auto-dispatch are later. Monetization wall deferred.

**Cargo manifesto:** generated at the US Intake Warehouse / consolidator (item list), compiled and sealed by the courier in Roam, then submitted toward Jamaica Customs as AWBOLDS XML (CSV still available as fallback). Customs does **not** create the manifesto — they receive, hold, or clear it. Live ASYCUDA submit uses env credentials when set; otherwise a stub adapter persists filing status.

## End-to-end pipeline

1. **Suites** — mailbox customers with Jamaica TRN (9-digit validation + `trn_valid` flag).
2. **Receive Station** (`/app/receive-station`) — gun/scale scan → weight + bin → `received_at_warehouse`.
3. **Invoice Audit** — verify commercial invoices before seal.
4. **HS Tariffs + Duty** — CET catalog; Landed Cost Duty Engine (CIF → duty/SCF/ENV/GCT/stamp/CAF; US$100 threshold).
5. **Consolidated Billing** — dual-ledger invoice (courier revenue vs government pass-through).
6. **Manifest Builder / Gatekeeper** — seal blocked when TRN, verified invoice, or weight missing.
7. **AWBOLDS XML** — generate filing record + download; **Submit to JCA** (live or stub).
8. **Clearance Board** — green/yellow/red lanes; cleared packages unlock for Hub.
9. **Hub → Fulfillment** — existing sort / pickup / door delivery / POD unchanged.

## Smoke path

1. **Facilities** — US Intake Warehouse (catalog pick) + Jamaica Hub (+ optional Branch / Pickup).
2. **Suites** — import or create mailbox customers (suite codes + TRN).
3. **Receive Station** — scan packages at warehouse (`received_at_warehouse`).
4. **Invoice Audit / Package Duty** — verify invoice; compute landed cost.
5. **Manifests** — upload CSV or compile from received packages.
6. **Manifest Builder** — clear blockers → **Seal** → **Download AWBOLDS** → **Submit to JCA**.
7. **Mark shipped → Arrived Jamaica** (existing manifest transitions).
8. **Clearance Board** — Hold / Clear / Inspect (or legacy Customs board).
9. **Hub Station** — inbound scan → sort (pickup or door).
10. **Fulfillment** — pickup collected or door batch / POD.

## Smoke result (2026-08-08)

**Passed** on GoRide / Bootstrap Freight Co: `SMOKE-TRK-001` → `MF-20260808-5734` → clearance green → Kingston Hub `received_hub`.

### Known gaps
| Gap | Impact | Status |
|-----|--------|--------|
| Invoice file on package | Seal blocked without commercial invoice | **Upload wired** on Invoice Audit + Package Duty (PDF/image → org Files) |
| JCA live credentials | Submit records stub filing until `JCA_ASYCUDA_*` env set | Ops / EDI follow-up |
| Declared USD value | Must be set before seal | Capture on receive / package duty |
| Full `db push` | Other local-only migrations out of sync | Courier OS applied via targeted migration |

## Apply migration

```bash
npx supabase db push
# includes supabase/migrations/20260816120000_freight_courier_os_completion.sql
npx supabase functions deploy freight --use-api --project-ref <ref>
```

Optional JCA live submit secrets (otherwise stub):
- `JCA_ASYCUDA_ENDPOINT`
- `JCA_ASYCUDA_API_KEY` (if required by broker/EDI)

Product checklist (owners / brokers / go-live): Notion — **JCA / ASYCUDA live credentials checklist** (Feature Specs).

## New OS screens (Enterprise)

| Route | Module | Purpose |
|-------|--------|---------|
| `/app/pipeline` | `freight_pipeline_command` | Funnel counts + duty outstanding |
| `/app/receive-station` | `freight_miami_scan` | Warehouse gun/scale receive |
| `/app/package-duty` | `freight_mailbox_packages` | Duty + invoice audit panel |
| `/app/invoice-audit` | `freight_invoice_audit` | Invoice worklist |
| `/app/hs-tariffs` | `freight_hs_tariffs` | CET catalog CRUD |
| `/app/manifest-builder` | `freight_manifests` | Gatekeeper + AWBOLDS + JCA |
| `/app/billing` | `freight_billing` | Dual-ledger invoices |
| `/app/clearance` | `freight_customs_board` | Lane board + de-con scan |

## Schema (additive)

- `freight.hs_tariff_codes`, `freight.package_duty`
- Package columns: `hs_tariff_code_id`, `item_category`, freight/insurance minors, `bin_location`, invoice verified fields, `weight_kg`
- `suites.trn_valid`
- `freight.customs_filings`, `freight.clearance_events`
- `freight.consolidated_invoices`, `freight.invoice_lines`

## Modules

Enterprise freight modules include: `freight_suites`, `freight_mailbox_packages`, `freight_miami_scan`, `freight_manifests`, `freight_customs_board`, `freight_hub_station`, `freight_fulfillment`, `freight_client_fleet`, domestic `freight_shipments` / `freight_dispatch` / `freight_service_zones` / `freight_ops_inbox`, plus Courier OS modules above. Reserved (off): `grocery_catalog`, `grocery_orders`, `grocery_fulfillment`.
