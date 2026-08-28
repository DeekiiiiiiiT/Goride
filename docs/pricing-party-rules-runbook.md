# Ops runbook — Change one party's rules without touching others

## Change courier COD threshold (Rider) in one town

1. Open **Pricing → Market Rules → Town / City**
2. Select parish → pick the town override (or configure a town without override)
3. Open **Rider rules → Edit**
4. Change **COD pause threshold** → Save

Customer service fee and delivery schedule are unchanged.

## Change service fee (Customer) globally

1. **Pricing → Market Rules → Default**
2. **Customer rules → Edit**
3. Adjust marginal brackets → Save

Rider share and partner tiers are unchanged.

## Change commission (Partner)

Use **Merchant Tiers** tab — not Market Rules.

## Deploy order after code pull

1. Deploy `delivery` edge function (parser + admin API)
2. Deploy dash-admin frontend
3. Run migration: `supabase/migrations/20260828100000_party_rules_namespaces.sql`
