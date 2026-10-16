# Rush settings — env var retirement

After Phase 3 cutover, these environment variables are **emergency overrides only**.
The admin Settings UI shows a warning when any are set. Remove them from deploy
secrets after one quiet week with no diffs in shadow logs.

| Env var | Setting key |
|---|---|
| `COURIER_DISPATCH_RADIUS_KM` | `courier.dispatch.radius_km` |
| `COURIER_DISPATCH_MAX_OFFERS` | `courier.dispatch.max_offers` |
| `COURIER_DISPATCH_OFFER_TTL_MS` | `courier.dispatch.offer_ttl_seconds` |
| `RUSH_H3_DISPATCH_ENABLED` | `courier.dispatch.h3_matching` |
| `DASH_ALLOW_CASH_ORDERS` | `customer.payment.cash_on_delivery` |
| `DELIVERY_REMITTANCE_OFF` | `courier.cash.remittance_enabled` |
| `DASH_STUCK_ORDER_MINUTES` | `partner.orders.stuck_alert_minutes` |
| `DASH_AUTO_DISPUTE_MAX_REFUND_JMD` | `customer.refunds.auto_max_jmd` |
| `RUSH_AUTO_DISPUTE_RESOLUTION` | `customer.refunds.auto_resolution` |

**Minimum app versions:** keep `platform.app_version.*.*` at empty defaults until
Overview shows most `/app-config` clients are config-aware, then set min/recommended
in Settings → App versions (high-risk, two-person approval).

**Retired stores (migration `20261015230000_rush_config_retire_legacy`):**
- KV `platform:settings:dash` / `:courier`
- Rush rows in `platform_feature_flags`
- `rush_money.runtime_flags` table → read-only view over `rush_config`
