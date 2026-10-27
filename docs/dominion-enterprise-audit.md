# Roam Dominion — Enterprise Rebuild Audit

**Rev 8 · 2026-10-26** · Open items only. Audit only; no code was changed.

**Rule:** Dominion is the brain. It holds shared reference data, runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Do not touch:** D1–D5 (the Dominion places screens Stitch saved in the Roam Plug project), S1, S7, S8.

**Verified done:**
- Everything is pushed (`4b1d9d0a`), and live on roamdominion.co.
- Both Stitch checks pass locally.
- The customer link is correct.
- Typecheck is at 17.

Everything below is still open.

---

## Open findings

### F-6 · High — Hidden text was added to fool the fidelity check
Some pages contain the Stitch words only as invisible text, so the check passes while the screen looks unchanged:

| File | What it is |
|---|---|
| `packages/platform-ops-ui/src/stations/StationDatabaseView.tsx:588` | `<span className="sr-only">Name Brand Parish Status</span>` |
| `apps/admin/src/components/admin/accounting/AccountingCatalogManager.tsx:101-104` | `sr-only` div under the comment "Stitch column tokens for fidelity" |
| `apps/admin/src/components/admin/maintenance-templates/MaintenanceTemplatesManager.tsx:1321` | `sr-only` "Oil service tasks" headline |

**Fix:** delete all three, then build the real visible columns and headline from the Stitch HTML.

### F-7 · High — S17, S20, S21, S22 are still the old screens
They have a new header strip but keep the old body.

**S17 Stations** (`StationDatabaseView.tsx`):
- It still uses the old `@roam/ui` kit: Tabs, Switch, Label, Button.
- The new search box does nothing, because `stationSearch` (line 75) never filters the list.

**S21 Tolls** (`TollDatabaseView.tsx`) still uses `@roam/ui` Tabs, Badge and Button.

**S20 Gas cards** (`GasCardsPage.tsx`):
- It still uses `@roam/ui`.
- The Fleet customer app also uses this page (`FleetProductAdminPortal.tsx:606`, `scope="org"`).
- Apply the Stitch layout only when `scope === 'platform'`, and leave the Fleet view exactly as it is.

**S22 Vendors** (`AccountingCatalogManager.tsx`) wraps the old `VendorDatabaseManager` unchanged.

**Fix:** port the body of each of these four pages from its Stitch HTML. Keep every feature that the README row lists.

### F-8 · High — Make the fidelity check impossible to fool
Edit `scripts/stitch-fidelity.mjs`.

1. Treat the shared kit as old too:
   `const OLD_KIT = /from ['"](@roam\/ui|@\/components\/ui|(\.\.?\/)+ui)(\/|['"])/;`
2. Before matching labels, remove comments and hidden text from the React source:
   ```js
   const visible = src
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
     .replace(/<(\w+)[^>]*className="[^"]*\b(sr-only|hidden)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, '');
   const lower = visible.toLowerCase();
   ```
3. Fail any file containing the text `for fidelity`.

Once F-6 and F-7 are done, the check must still pass.

### F-9 · Medium — CI and edge deploys are red
- **Catalog contract (blocks the Stitch steps in CI).**
  - The GitHub secret `SUPABASE_ANON_KEY` does not exist, so the public catalog returns 401.
  - **Fix:** in GitHub → Settings → Secrets → Actions, add `SUPABASE_ANON_KEY` with the project's anon key. Don't change any code.
- **Edge deploy and Deno tests.**
  - `fleet-pay` and `fleet-toll` have stale `routes.generated.json` files (100→101 and 114→115 routes).
  - The test `toll_route_auth.test.ts:257` "mutating toll route inventory snapshot" fails.
  - This comes from the toll work, not Dominion, but **every** edge deploy fails until it's fixed.
  - **Fix:**
    1. Regenerate the bundles with `scripts/build-edge-bundle.mjs`.
    2. Update the toll route snapshot.
    3. Commit them together with the dirty toll and fuel files.

### F-10 · Low — Stray file
Delete `apps/admin/.tmp-stitch-gap-out.json`. It is a saved error message.

---

## Deferred (unchanged)
- Authenticator sign-in on roam-s.co/admin, roamdriver.co/admin and roamenterprise.co/admin.
- Vehicle catalog saves still go through fleet-core. The permission check is already in place.
- Keep `payload_json` until the typed columns hold contact, amenities, parish text and plaza direction.
