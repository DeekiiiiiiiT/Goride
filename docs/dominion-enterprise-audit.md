# Roam Dominion — Enterprise Rebuild Audit

**Rev 7 · 2026-10-26** · Open findings from Rev 6 are closed. Deferred items stay deferred.

**Rule:** Dominion is the brain. It holds shared reference data, runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Status (closed 26 Oct 2026):**
- Stitch project **Dominion Redesign** (`7083594865949473827`) HTML and screenshots live under `docs/stitch/dominion-redesign/`.
- README statuses are `Final — do not touch` (D1–D5), `Ported` (S1–S34), or `Superseded by S7 — do not build`.
- `scripts/stitch-contract.mjs` and `scripts/stitch-fidelity.mjs` both pass; fidelity runs in CI after the contract.
- Customer list default is `/fleet-admin/customers`.
- Baseline and port waves committed and pushed; edge (fleet-core, platform-catalog) and roam-dominion path deploy fired from `main`.
- Typecheck errors stay at 17 (baseline 20).
- D1–D5, S1, S7, and S8 were not redesigned in this program.

## Closed findings (Rev 6)

| ID | Result |
|---|---|
| **F-1** | All §2 screens Ported; fidelity ≥80% labels and no old `components/ui` on checked rows. |
| **F-2** | `scripts/stitch-fidelity.mjs` added and wired in CI. |
| **F-3** | Committed and deployed (admin + fleet-core + platform-catalog). |
| **F-4** | Defaults point at `/fleet-admin/customers`. |
| **F-5** | Superseded draft row in the Stitch README. |

## Deferred (unchanged)

- Sign in with the authenticator on roam-s.co/admin, roamdriver.co/admin and roamenterprise.co/admin.
- **Backend:**
  - Vehicle catalog saves still go through fleet-core; the permission check is already in place.
  - `payload_json` stays until the typed columns hold contact, amenities, parish text and plaza direction.
