# Multi-Vertical Compatibility Matrix & Rollback

## API contracts (baseline)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/partner/business-types` | GET | Partner onboarding business type catalog |
| `/merchant/profile` | GET | Merchant + membership for signed-in partner |
| `/merchant/application-status` | GET | Pending/go-live checklist |
| `/merchants` | POST | Final application submit |
| `/merchant/documents` | POST | KYC document upload |

## Compatibility matrix

| Scenario | Expected behavior |
|----------|-------------------|
| Existing draft merchants | Resume wizard at saved step; null vertical fields → restaurant defaults |
| Existing submitted restaurants | Pending/go-live/dashboard unchanged |
| `merchants.vertical_type` null | Server treats as `restaurant` |
| `merchants.fulfillment_type` null | Server treats as `cook_to_order` |
| `merchants.go_live_rule` null | Server treats as `menu_min_5` |
| Old clients ignoring new JSON fields | Safe; fields are additive |

## Rollback playbook

1. Migrations are forward-only; do not run destructive down migrations in production.
2. Roll back edge function: redeploy previous `delivery` function revision.
3. Hide new business types: set `is_active = false` on `delivery.merchant_business_types`.
4. Regulated types remain inactive until compliance phase is explicitly enabled.

## Hardcoded restaurant touchpoints (inventory)

- `apps/dash-merchant`: cuisine types, menu checklist, wizard step keys
- `apps/dash-customer`: `discoverContent.ts`, `restaurantContent.ts`, `RestaurantPage`
- `apps/dash-courier`: `AtRestaurantPage`, mock delivery types
- `supabase/functions/delivery`: `menuComplete`, document allowlist, `partnerOnboarding.ts`
