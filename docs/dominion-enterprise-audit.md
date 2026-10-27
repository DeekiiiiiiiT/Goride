# Roam Dominion — Enterprise Rebuild Audit

**Rev 10 · 2026-10-27** · Closeout in progress / verified where noted.

**Rule:** Dominion is the brain. It holds shared reference data, runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Do not touch:** D1–D5 (the Dominion places screens Stitch saved in the Roam Plug project). S1, S7 and S8 keep their layout; only the colour fix in D-4 is allowed.

---

## Closed findings

### D-1 · Critical — Public catalog stations/tolls — CLOSED
- Applied migration `station_plaza_contact_columns` to production (GoRide).
- Verified `/v1/stations` and `/v1/tolls` return **200 with rows** (anon key).

### D-2 · High — Toll database empty for Dominion — CLOSED
- **Server:** `GET /toll-plazas` no-org branch now filters `organization_id is null` (master plazas).
- **Page:** `TollDatabaseView` keeps load errors and shows “Could not load plazas” + Retry.
- **Deploy:** `fleet-toll` redeployed on main (closeout push).

### D-3 · High — Platforms/engines/catalog tools 404 — FIXED
- `partSourcingService` `adminGet` / `adminSend` route `part-*`, `vehicle-catalog*`, `catalog-gate*` to platform-catalog; everything else to fleet-core.

### D-4 · Medium — Sidebar dark-on-dark — FIXED
- `AdminLayout` sidebar slate classes replaced with `#cbd5e1` / `#94a3b8` (layout unchanged).

### D-5 · Medium — S22 Vendors old screen — FIXED
- Vendors tab uses S22 table shell with live verified rows (`DominionVendorsPanel`).
- Empty orphan thead + nested `VendorDatabaseManager` removed from this tab.
- Pending requests stay on `PendingVendorRequestsManager`; decorative empty pending shell removed.

### D-6 · Medium — Push / CI / deploys
- Code closeout committed and pushed with this rev. Confirm CI, Test Supabase Functions, and Deploy Supabase Edge Function go green; confirm `fleet-toll` deployed for D-2.

---

## Deferred (unchanged)
- Authenticator sign-in on roam-s.co/admin, roamdriver.co/admin and roamenterprise.co/admin.
- Vehicle catalog saves still go through fleet-core. The permission check is already in place.
- `payload_json` stays until every reader uses the new columns from D-1.
