# Path B launch gate

## Non-goals (do not ship in core mailbox program)

- [ ] No customer self-serve suite / pre-alert portal (ops + SMS only)
- [ ] No live ASYCUDA World API integration (broker CSV + manual board only)
- [ ] No monetization / paywall before dispatch
- [ ] No Path A second deploy of `apps/fleet` as Enterprise
- [ ] No use of Dash "enterprise inventory" or Haul haulage catalog for freight

## Functional smoke

### Domestic (existing)

1. Marketing site loads; **Sign In** goes to `/login`
2. `/reset-password` route exists
3. Login → `/app` dashboard (empty state OK)
4. Create carrier (own + 3PL), client, rate card
5. Create shipment with cargo + leg → book → transition → bill (idempotent)
6. Wrong `productLine: fleet` account blocked by WrongProductLineGate

### International mailbox pipeline

See [`docs/enterprise-intl-freight-pipeline.md`](enterprise-intl-freight-pipeline.md).

1. Seed facilities; create suite + pre-alert
2. Miami scan → manifest seal → customs CSV → clear
3. Hub sort → pickup collect **and** door batch (org + client fleet POD once)
4. Dominion Enterprise settings show new freight modules

## Security

- [ ] Apply migration `20260801120000_freight_intl_pipeline.sql`
- [ ] Deploy `freight` edge function
- [ ] Supabase advisors: no RLS warnings on new `freight.*` tables
- [ ] Cross-org read denied; scan/seal Idempotency-Key respected
- [ ] Public `/freight/public/pod/:token` only exposes batch stops for valid unexpired token

## Deploy

```bash
npx supabase functions deploy freight --use-api --project-ref <ref>
```
