# In-House desk redesign: what's left

**Rev 2 · 2026-10-15** · Rev 1 was the full brief (it's in git history). Most of it is built. This page lists only what's still open.

**Checked:**
- Production database: the migration `20261015200000` is applied. The cleanup ran: 3 duplicate lobster stores archived, 8 empty Domino's sections hidden.
- The deployed `delivery` function, compared file by file with the repo.
- The live `roamrush.app` bundle.
- `deno test supabase/functions/delivery/inHouse/`: 21 of 21 pass.
- `tsc` through `apps/dash-customer`.
- Nothing was checked in a browser.

---

## 1. Nothing is live yet

- **Uncommitted.** All In-House changes are uncommitted, and they're mixed in with unrelated fleet, driver and finance edits. Commit them on their own.
- **Server not deployed.** `delivery` is v859 from Oct 14. The deployed `inHouse/routes.ts` and `deskRules.ts` don't match the repo. That means the **toggle data-loss bug (old B1) is still live**: turning a store on or off still erases its terms review and notes.
- **Frontend not deployed.** The live bundle still shows the old workspace ("Let go").
- **Deploy order:** `delivery` first, then the frontend. The new screens call `/stores/:id/live`, `/audience`, `/archive` and `/menu/:itemId/archive`, which don't exist on v859.

## 2. Must fix

| # | Problem | Where | Fix |
|---|---|---|---|
| R1 | **Order totals show 100× too small.** `customerTotal` is `orders.total`, which is in dollars, but the board divides it by 100. A J$4,280 order shows as J$42.80. | `InHouseOrdersPage.tsx:204` | Don't divide. The workspace already treats `order.total` as dollars (`InHouseWorkspacePage` multiplies by 100). |
| R2 | **"Ready to go live" never appears.** `restaurantStatus` requires `setup_status === 'ready'`, but the server sets `ready` only *when* the store goes live. So the Ready filter is always 0 and the list's **Go live** button never shows. Also, "In-House switch is off" and "no card" are desk-wide, so they block every store's checklist while the switch is off. | `inHouseUi.ts:52`; `routes.ts` live endpoint | Mark a store ready when its *own* blockers are clear. Show desk-wide blockers once, above the list, not inside each store's status. |
| R3 | **Adding a dish still goes by the section's name.** `saveMenuItems` (the create path) uses `/drink/i` and `/pizza/i` on the name. Add a dish to a Sizes section called "Beverages" and it fails ("needs how many minutes"). A pizza section called "Pies" skips pizza pricing. | `routes.ts:1561-1562` | Read `section_kind` for the category, as the update path at line 1377 already does. |
| R4 | **"Archive card" deletes instead.** The button promises "Past purchases stay", but it calls `DELETE /cards/:id`. That endpoint refuses any card that has been used, so a used card can never be retired. | `InHouseDeskPages.tsx:183-191`; `routes.ts:788` | Archive by setting `active = false`. The list already filters on `active`. |
| R5 | **The terms review gets re-stamped on every save.** The Ordering step always sends `tosReviewed: true`, so every save overwrites "reviewed by X on date" with whoever saved last. | `InHouseRestaurantHomePage.tsx:349`; `deskRules.ts` `storePatchFromBody` | Stamp it only when it changes from unreviewed to reviewed. |
| R6 | **Ops sees wrong customer prices in the menu builder.** `markup_bps` is sent to admins only, so ops falls back to 15%. | `routes.ts` GET `/stores`; `InHouseMenuBuilderPage.tsx` | Send `markup_bps` to ops. It drives what customers pay, not internal money. |

## 3. Small items

- **Changing a section's type uses `window.prompt`**, where you have to type "standard, sized, or pizza" (`InHouseMenuEditor.tsx:435`). Use the same select as "Add section".
- **Sections can't be reordered.** `sort_order` exists and is read, but nothing writes it.
- **No confirmation on two money actions:** **Approve** (orders over J$15,000) and **Refund** in the resolution drawer both act on one click.
- **Two new type errors:** `InHouseOrdersPage.tsx:254` (`task` possibly null) and `InHouseRestaurantHomePage.tsx:257` (`'pricing'` missing from `done`).
- **Delete the three stub files:** `InHouseOpsBoard.tsx`, `InHouseQueuePage.tsx` and `InHouseRestaurantDesk.tsx`. Nothing imports them.
- **Not built yet (optional):** "Send test text" for late-order phones, and the 30-day trend on Reports.

## 4. After deploying

Click through as an admin, an ops login and a buyer login, at desktop and 375px. Confirm that:
- [ ] Turning a store on or off, or changing who can order, leaves its link, notes and terms review unchanged.
- [ ] A new restaurant is visible to a second person on another computer while it's being set up.
- [ ] A store with all its steps done shows **Ready to go live**, and Go live works once the switch is on and a card exists.
- [ ] A dish can be added to a Sizes section that isn't named "Drinks".
- [ ] Order totals on the board match the order page.
- [ ] Ops can open a restaurant's menu, and the customer price matches the restaurant's markup.
