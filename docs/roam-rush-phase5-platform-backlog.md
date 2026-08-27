# Roam Rush — Phase 5 platform backlog

Items deferred after the audit remediation Phases 0–3. Not blocking soft launch of promos / WiPay test rail.

## Decisions needed

### `/admin` co-hosted on customer origin (§F1)

Today `roamrush.app/admin` lazy-loads `@roam/dash-admin` inside the customer app (shared origin, CSP, storage). Roam Command is a separate deployment.

**Recommend:** Keep for soft launch (ops already use it). Revisit splitting to a dedicated ops host when CSP tightening or storage isolation becomes a hard requirement.

### Legacy pricing retirement (§F2)

Cart/checkout prefer the v2 quote path when markets have `pricing_v2_enabled`. Legacy still exists for markets without v2.

**Recommend:** After all soft-launch markets are on v2, delete the legacy client/server branches in a dedicated PR.

## Operational reviews

| Item | Current | Action |
|------|---------|--------|
| Delivery-zone cache TTL | 10 minutes (`DELIVERY_ZONES_CACHE_TTL_MS`) | Confirm with ops whether weather/courier shortages need a shorter TTL; server still rejects out-of-zone at place-order |
| Notification prefs sync | Local-only (`roam-dash-notification-prefs`) | Sync to server when push/email send decisions need to honour prefs |
| Cart cross-device sync | LocalStorage only | Optional enhancement (addresses/favorites already sync) |

## Tracking

Track these in Notion / product backlog; do not block Phases 0–3 ship.
