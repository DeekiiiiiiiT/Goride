# Jamaica international freight pipeline — ops runbook

## Scope

Ops-managed mailbox freight (no customer portal). SMS status updates. Pickup **and** door delivery. Mixed fleets: org fleet, client-owned vehicles, 3PL. Domestic freight auto-dispatch (org drivers) is live on the Dispatch Board; full Roam Driver marketplace supply and mailbox-batch auto-dispatch are later. Monetization wall deferred.

**Cargo manifesto:** generated at the US warehouse / consolidator (item list), compiled and sealed by the courier in Roam, then submitted toward Jamaica Customs as an electronic file (CSV today). Customs does **not** create the manifesto — they receive, hold, or clear it. Live ASYCUDA / Port Community System API and a US warehouse staff portal are future work.

## Smoke path

1. **Facilities** — US Intake Warehouse (catalog pick) + Jamaica Hub (+ optional Branch / Pickup).
2. **Suites** — import or create mailbox customers (suite codes).
3. **Optional pre-alert / Receive** — packages in Miami (`received_miami`) if compiling by hand.
4. **Manifests — Upload cargo list** — US warehouse CSV → open cargo manifesto with lines  
   _(alt)_ **Compile from Receive** — empty manifesto + add Miami-received packages.
5. **Seal cargo manifesto** — locks lines; packages → `manifested`.
6. **Download & mark submitted for Customs** — electronic CSV for broker / ASYCUDA filing; customs case → `submitted`.
7. **Mark shipped → Arrived Jamaica**.
8. **Customs board** — Hold or Cleared / Released (mirror of agency review).
9. **Hub Station** — inbound scan → sort (pickup or door).
10. **Fulfillment**
    - Pickup: Mark collected.
    - Door: select packages → assignee type (org / client fleet / 3PL) → Create batch → Load / Delivered (or client `/pod/:token` link).

## Apply migration

```bash
npx supabase db push
# or apply supabase/migrations/20260801120000_freight_intl_pipeline.sql
npx supabase functions deploy freight --use-api --project-ref <ref>
```

## Modules

New Enterprise modules (Dominion packaging): `freight_suites`, `freight_mailbox_packages`, `freight_miami_scan`, `freight_manifests`, `freight_customs_board`, `freight_hub_station`, `freight_fulfillment`, `freight_client_fleet`, plus domestic `freight_shipments` / `freight_dispatch` / `freight_service_zones` / `freight_ops_inbox`. Reserved (off): `grocery_catalog`, `grocery_orders`, `grocery_fulfillment`.
