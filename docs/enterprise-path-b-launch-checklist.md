# Path B v1 launch gate

## Non-goals (do not ship)

- [ ] No courier/driver field app or offline PWA
- [ ] No customs / international document workflows
- [ ] No fuel or toll modules in Enterprise v1
- [ ] No Path A second deploy of `apps/fleet` as Enterprise
- [ ] No use of Dash "enterprise inventory" or Haul haulage catalog for freight

## Functional smoke

1. Marketing site loads; **Sign In** goes to `/login`
2. `/reset-password` route exists
3. Login → `/app` dashboard (empty state OK)
4. Create carrier (own + 3PL), client, rate card
5. Create shipment with cargo + leg → book → transition → bill (idempotent)
6. Wrong `productLine: fleet` account blocked by WrongProductLineGate
7. Dominion Enterprise settings show freight modules + no rideshare toggle

## Security

- [ ] Apply migrations: business_type freight_forwarding, roam_enterprise ledger, freight schema
- [ ] Deploy `freight` edge function
- [ ] Supabase advisors: no RLS warnings on `freight.*`
- [ ] Cross-org read denied

## Deploy

```bash
pnpm deploy:freight   # add script if missing
npx supabase functions deploy freight --use-api --project-ref <ref>
```
