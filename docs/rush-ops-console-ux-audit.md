# Rush Ops Console (`/admin`): what's left

**Rev 2 · 2026-10-13** · Rev 1 was the full redesign brief. This revision lists only what is still open after the implementation pass.

**Done and verified in code:** grouped sidebar with badges, collapse rail and user menu; header with breadcrumbs, search, bell and environment pill; role-based navigation from one capability table, with an access-denied page; every redesign route and old-URL redirect; Home inbox fed by `/admin/console/attention`; ⌘K search; hub pages (Dispatch, Merchants, Couriers, Customers, Markets, Courier cash, Promotions, Team and access, Audit, Settings) with tabs in the URL; Merchants directory with health columns; Support inbox with selects and "Assign to me"; Orders on the shared table with views, pagination and a preview drawer; tabs on the merchant, courier and customer detail pages; 4 dead files deleted.

**Checks run:** `tsc` (dash-customer project) shows no errors on any line you changed. The 293 errors it reports were already there. Vitest isn't installed for `packages/dash-admin`, so its tests weren't run. Nothing was checked in a browser, including the 375px mobile layout.

---

## 1. Must fix: access and wrong numbers

| # | Where | Problem | Fix |
|---|---|---|---|
| A1 | `supabase/functions/delivery/admin/consoleRoutes.ts:246-292` | `/search` has no role check. Any console login, including In-House buyers (`dash_concierge`) and courier staff, can look up customer names and emails. It also builds the `.or()` filter from raw input and strips only `%` and `_`. | Filter each result type with `canSee()`. Return people only to roles that can open Customers or Team. Also strip `,` `(` `)` from `q`. |
| A2 | `consoleRoutes.ts:294`, `:370`; `HomePage.tsx:316` | `/summary` and `/merchant-health` have no role check. Home loads the summary for every role, so courier staff (Finance: none) see today's sales. | Add a role check to both routes. Only show sales tiles to roles that can open Finance. |
| A3 | `consoleRoutes.ts:297`, `:314` | "Today" and the hourly chart use the server clock (UTC). Jamaica is UTC−5, so the day resets at 7pm local and the hourly chart is 5 hours off. | Work out day start and hour in `America/Jamaica`. |
| A4 | `consoleRoutes.ts:299-302` | Orders today and Sales today include cancelled orders. The query fetches 8 days of orders with `limit(5000)` and no sort, so on a busy week some of today's orders can be missing from the counts. | Exclude cancelled orders. Query today and the same day last week separately, or aggregate in SQL. |
| A5 | `supabase/functions/delivery/admin/identityRoutes.ts:183-195` | The Customers and Couriers lists load up to 2,000 IDs, then send them all back in one `.in()` filter. The request URL grows about 37 characters per ID, so the list stops loading after a few hundred customers. Past 2,000 people it silently cuts off. | Filter in SQL: `identity_personas!inner(persona)`, or an RPC. |
| A6 | `pages/finance/FinancePage.tsx:366-378` | Moving appeals into Courier cash dropped the `canApprove` check. Uphold/Reverse now show for courier staff and analysts, and the server answers 403 (`rushMoney/routes.ts:293`). The appeals list is dash-admin-only, so courier roles see it fail to load. The appeal-window date was also removed. | Restore the `canApprove` check and the date. Remove the Appeals tab for roles that can't load it. |
| A7 | `config/dashAdminCapabilities.ts:196-220` | `/reports` maps to no capability, so `canOpenPath` lets every role in, In-House buyers included. | Add a `reports` capability, or map `/reports` to `finance`. |
| A8 | `consoleRoutes.ts:288` → `/users/:id` | Search results for people link to `/users/:id`. That path falls under Team, so Ops, Support and Analyst get "You don't have access" when they click one. | Resolve the persona on the server and return `/customers/:id` or `/couriers/:id` directly. |

## 2. Should fix: plan items that are only partly done

**B1. Double titles.** Twenty pages still render their old title under the new page header.

| Hub | Inner title still showing |
|---|---|
| Dispatch | `LiveOpsPage.tsx:158` "Live Ops" · `CourierPresenceManager.tsx:68` |
| Couriers / Customers | `ComplianceManager.tsx:161` · `IdentityDirectoryPage.tsx:104` "Users: All people across Rush, Courier, and Partner" (wrong on both pages) |
| Merchants | `BusinessTypesPage.tsx:334` |
| Markets | `MarketsPage.tsx:2714` "Markets" under "Markets" · `BoundaryLibraryPage.tsx:88` · `CoverageHealthPage.tsx:51` |
| Courier cash | `RemittanceDeskPage.tsx:380` "Remittance Desk" + "never Driver Settlements Collect" |
| Promotions | `PromotionsPage.tsx:156`. Rush Pass embeds the whole Pricing page, including the "Pricing" title and its tab bar (`PricingHubPage.tsx:1049`, which ignores `onlyTab`) |
| Team and access | `DashTeamPage.tsx:147` · `MerchantStaffDirectoryPage.tsx:79` · `IdentityDirectoryPage.tsx:104` |
| Audit log | `UsersAuditPage.tsx:62` |
| In-House desk | `InHouseOpsBoard.tsx:87` "Desk" · `InHouseQueuePage.tsx:100` "Orders" · `InHouseDeskPages.tsx:79, 211` · `InHouseRestaurantDesk.tsx:353` |

Fix: give each page an `embedded` prop that hides its title block, or delete the block outright.

**B2. Finance.**
- The page doesn't use `PageHeader`, and its tab bar renders *below* the risk and chargeback sections (`FinancePage.tsx:383-445`).
- The revenue tiles were removed from Pricing but never added to Finance. Home's "Sales today" tile links to a Finance overview with no sales on it, and Pricing still says "Revenue for today is on Finance" (`PricingHubPage.tsx:1056`).
- The revenue code still exists in Pricing's unreachable `overview` branch (`PricingHubPage.tsx:1093`). Move it to Finance → Overview.

**B3. Lists don't open the profile pages.**
- Clicking a row in the Customers or Couriers list opens the generic identity overlay (`IdentityDirectoryPage.tsx:189`), so `/customers/:id` and `/couriers/:id` can't be reached from their own lists.
- The customer page's Access tab links to `/team?tab=all-users` with no ID, so it doesn't open that person.

**B4. Placeholder tabs.**
- Courier cash: Reports and Balances show the same page (`CourierCashPage.tsx:27`).
- Courier detail: Documents repeats Overview, and Cash is only a link to the desk, not filtered to that courier (`CourierDetailPage.tsx` ~251).

**B5. Tabs not in the URL.**
- Merchant filters (`MerchantManager.tsx:23`), so Home can't link to "Pending".
- App releases has its own Rush/Courier switch (`PlayStoreLaunchPage.tsx:347`). The Settings scope switch is also visible on that tab and does nothing there, so the page shows two Rush/Courier switches. Hide the scope switch on App releases and System, or wire it through.

**B6. The audit log isn't one log yet.**
- Pricing prints raw action strings with no who or when (`AuditHubPage.tsx:425-432`).
- Merchant is just a sentence pointing elsewhere.
- No filters for person, entity or date.

**B7. Home and Reports.**
- The hourly chart draws only today's bars, although its title says "and last week".
- Each bar is `today × 4px` with no cap, so it overflows the card past 24 orders an hour (`HomePage.tsx:358`).
- No change vs last week on the tiles, and average ETA comes back `null` and isn't shown.
- The greeting is always "Good morning".
- Reports is a single today-by-market list, with no date range or trend.

**B8. Smaller items.**

| Area | What's missing |
|---|---|
| Orders | No courier, market or payment columns. No date-range filter. The search text isn't kept in the URL (`OrdersListPage.tsx:22, 101`). |
| Reviews | Still a card list: no rating, store or hidden filters, no store or courier names, no pagination. |
| Support | The assignee shows as a UUID fragment (`SupportToolsPage.tsx:156`). No age-limit (SLA) chip on cases. A debug line "Signed in as {role}" is left in (`:167`). |
| Team | Courier admins see every role in the invite dropdown, including Dash Admin (`DashTeamPage.tsx:170`). Check that the server rejects it, and filter the list either way. |
| Bell | It opens a panel inside the page content instead of a dropdown (`DashAdminPortal.tsx:181-189`). The attention feed reloads on every page change and Home loads it a second time, at 9 queries per load. Use a single interval poll instead. |
| Breadcrumbs | They show "Details" instead of the order number or the person's or store's name. |

## 3. Polish

- **Leftover emerald and odd styles.** The In-House cards tabs still use emerald (`InHouseDeskPages.tsx:81-82`), and so do the overlay links (`IdentityDetailOverlay.tsx`). In-House uses bare `rounded`. `StitchMenuScreens.tsx` has hard-coded hex colours and `font-headline`.
- **Money formatting.** Bare `$` remains in `FinancePage.tsx:519, 635` and `OrderDetailPage.tsx:144, 179, 189`. Hand-built `J$…toFixed(2)` remains in Finance and Remittance. Switch all of them to `formatMoney`.
- **Shared components only partly adopted.** `StatusBadge` is used only in Orders and Support, and `DataTable` only in Orders. `MerchantStatusBadge`, `IdentityStatusBadge` and Live Ops' `StatusPill` are still separate.
- **Back button.** `useUrlParam` always uses `replace`. Refresh and shared links work, but Back skips over tab changes. Push history for tab changes and keep `replace` for filters.
- **Multi-role users.** The client builds the nav from `jwtPrimaryRole` only, while the server checks every role. Someone with two roles only gets the primary role's nav. This was already the case before your changes.

## 4. Cleanup and ship

- **Now dead:**
  - `pages/DashAdminDashboard.tsx`
  - `pages/PlatformSettingsPage.tsx`
  - `pages/couriers/DeliveryLedgerPage.tsx`
  - `useSegmentTab` in `components/SegmentTabs.tsx`
  - Pricing's `overview` branch and its COD banner (after B2)
- **Everything is uncommitted.** Deploy the `delivery` edge function (it has the new `consoleRoutes.ts`) before or alongside the frontend. Otherwise Home, the badges, search and Settings → System will all show as unavailable.
- **Before calling this done:** click through each hub at desktop and 375px wide, signed in as one role from each column of the role table (owner, ops, courier, In-House buyer, support, analyst).
