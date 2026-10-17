# In-House desk redesign: what's left

**Rev 2 · 2026-10-17** · Rev 1 was the full Stitch brief (it's in git history). The redesign is built from Stitch project `2779535092411918519` (screens listed in `docs/stitch/roam-rush-admin-design/README.md`). This page lists only what's still open.

**Done and checked:**
- **Orders:**
  - Desk status header and Needs-you strip.
  - Confirmation on Approve and Refund.
  - Error with Retry.
  - Correct totals.
  - Setup is now a banner.
- **Workspace:** keeps every "Still needed" rule and the price limit.
- **Menu:** shows one editor, and the words "engine", "snapshot" and "classic editor" are gone.
- **Code health:** no new type errors in the In-House files.

---

## 1. Must fix

| # | Problem | Where | Fix |
|---|---|---|---|
| S1 | **Menus can't be properly edited any more.** The classic editor was removed (`InHouseMenuEditor.tsx` is no longer imported anywhere). The new dish drawer only edits name, description, price, photo **URL**, sold out and "price verified". Nothing in the admin can edit **pizza** (sizes, crusts, toppings), **choices / sizes / extras**, **wings**, or **combos**. Photos can't be uploaded, only pasted as a link. Dishes can't be archived. New sections are always `standard` (`EngineMenuPanel.tsx:230`). | `EngineMenuPanel.tsx`, `InHouseMenuBuilderPage.tsx` | In the dish drawer, render the shared editors from `@roam/menu-builder` by product type: `PizzaConfigEditor` for pizza sections, `ProductTypeEditor` (choice groups), `WingsEditor`, `ComboSlotsEditor`. Add a section-type picker, photo upload (`uploadDeskImage`), archive and Preview as customer. Until then, keep the old editor reachable behind "Advanced editor". |
| S2 | **Stitch mockups would go live publicly.** The raw Stitch HTML (sample data) was copied into `packages/dash-admin/public/stitch/` and `apps/dash-customer/public/stitch/`. Everything in `public/` is deployed as-is, so these would be served at `roamrush.app/stitch/in-house/*.html`. | both `public/stitch/` folders | Delete both folders. Keep the copies in `docs/stitch/` only. |

## 2. Decide

- **Colour:** the In-House desk now uses Stitch's "Oceanic Blue" (blue-to-cyan gradient buttons, `inHouseTheme.ts`). The rest of the admin uses amber. Either keep blue for In-House on purpose, or switch `IH.primaryBtn` / `chipActive` / `link` to the console's amber so the desk doesn't look like a different app.

## 3. Ship

- **Commit** the 13 In-House files + `inHouseTheme.ts` + `styles.css`. Leave the `public/stitch` folders out (S2).
- **Deploy** the admin. Then run through, at desktop and 390px:
  - Claim → place → Mark placed.
  - Resolve "card may have been used".
  - Edit a pizza price and a size choice (after S1).
  - Publish.
