# Roam Dominion — Enterprise Rebuild Audit

**Rev 12 · 2026-10-27** · All Rev 11 open items closed. Deferred and outside-CI unchanged.

**Rule:** Dominion is the brain. It holds shared reference data, runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Do not touch:** D1–D5 (the Dominion places screens Stitch saved in the Roam Plug project).

**Verified closed and live (`ce7cba36`):**
- Public catalog returns 200 on every route.
- fleet-toll v89 shows master plazas.
- Parts routes go to fleet-core.
- Sidebar colours are fixed.
- S22 is the real screen.
- Stitch contract and fidelity pass.

**Verified closed 2026-10-27 (Rev 11 close-out):**
- **R-1** — Repo migration renamed to `supabase/migrations/20261027015940_station_plaza_contact_columns.sql` (matches production version). Commit when requested.
- **R-2** — Live smoke on `https://roamdominion.co`: Tolls → Plazas shows **All plazas 12** / **Verified 12**; Platforms & engines loads with family rows and no errors.

---

## Open

_(none)_

### Outside this audit — CI is still red
- The "Deno check edge functions" step fails with 106 type errors, in these files:
  - `week_close.ts`, `toll_controller.tsx`, `fuel_period_routes.ts`
  - `recon_routes.ts`, `evidence_storage.ts`, `claim_service.ts`
- None of them are Dominion code. They belong to the Driver Settlements work, so fix them there.
- Until they're fixed, CI can't flag a Dominion break.

---

## Deferred (unchanged)
- Authenticator sign-in on roam-s.co/admin, roamdriver.co/admin and roamenterprise.co/admin.
- Vehicle catalog saves still go through fleet-core. The permission check is already in place.
- `payload_json` stays until every reader uses the new contact, parish and direction columns.
