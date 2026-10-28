# Roam Dominion — Enterprise Rebuild Audit

**Rev 13 · 2026-10-27** · **CLOSED.** No open Dominion findings. Audit only; no code was changed.

**Rule:** Dominion is the brain. It holds shared reference data, runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Do not touch:** D1–D5 (the Dominion places screens Stitch saved in the Roam Plug project).

**Last verified (`2c7868ed`, live):**
- The catalog, toll plazas and the platform/engine routes return 200 in the edge logs.
- The migration file matches production (`20261027015940`).

---

## Outside this audit
- CI's "Deno check edge functions" step still fails with 106 type errors.
- They're all in settlements, toll and fuel files: `week_close.ts`, `toll_controller.tsx`, `fuel_period_routes.ts`, `recon_routes.ts`, `evidence_storage.ts` and `claim_service.ts`.
- Fix them under the Driver Settlements audit. Until then, CI can't catch a Dominion break.

## Deferred (unchanged)
- Authenticator sign-in on roam-s.co/admin, roamdriver.co/admin and roamenterprise.co/admin.
- Vehicle catalog saves still go through fleet-core. The permission check is already in place.
- `payload_json` stays until every reader uses the new contact, parish and direction columns.
