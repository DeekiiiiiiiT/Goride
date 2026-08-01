# Jamaica international freight pipeline — ops runbook

## Scope

Ops-managed mailbox freight (no customer portal). SMS status updates. Pickup **and** door delivery. Mixed fleets: Roam marketplace, org fleet, client-owned vehicles, 3PL. Monetization wall deferred. Customs = broker CSV + manual board (not live ASYCUDA).

## Smoke path

1. **Seed facilities** — Suites page → “Seed Miami + Kingston facilities”.
2. **Create client** (+ optional rate card for domestic; not required for mailbox).
3. **Create suite** — phone for SMS, default pickup or door, default fleet type.
4. **Pre-alert** — Packages → ops pre-alert with courier tracking #.
5. **Miami Scan** — scan tracking # (or unknown + suite) → weight/dims → `received_miami`.
6. **Manifest** — open → add Miami packages → **Seal** → Download customs CSV → Mark shipped → Arrived JA.
7. **Customs board** — mark Cleared (or Hold then Cleared).
8. **Hub Station** — inbound scan → sort (pickup or door).
9. **Fulfillment**
   - Pickup: Mark collected.
   - Door: select packages → assignee type (org / Roam / client fleet / 3PL) → Create batch → Load / Delivered (or client `/pod/:token` link).

## Apply migration

```bash
npx supabase db push
# or apply supabase/migrations/20260801120000_freight_intl_pipeline.sql
npx supabase functions deploy freight --use-api --project-ref <ref>
```

## Modules

New Enterprise modules (Dominion packaging): `suites`, `mailboxPackages`, `miamiScan`, `manifests`, `customsBoard`, `hubStation`, `fulfillmentDesk`, `clientFleet`.
