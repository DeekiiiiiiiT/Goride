# Stitch project: roam rush admin design

- **Project id:** `2779535092411918519`
- **Design system:** Roam Rush Oceanic Blue (`assets/14775531807612419287`)

## All Stitch screens (HTML pulled)

Raw files live in `docs/stitch/roam-rush-admin-design/html/` only (not under any app `public/` folder — those would deploy publicly).

Open a file from disk, or serve the docs folder locally if you need a browser URL.

| # | Stitch screen | File | Stitch screen id |
|---|---|---|---|
| 1 | Orders — Buyer Cash-Desk | `orders-buyer-cash-desk.html` | `0660280617ec434f9d135862835f423c` |
| 2 | Orders — Calm (Variant B) | `orders-calm.html` | `52f5382b22934e52aafaac2688fd7435` |
| 3 | Orders — Mobile 390px | `orders-mobile.html` | `7a1ce49744a043f9b07aa073b11e9f3c` |
| 4 | Restaurants Directory | `restaurants-directory.html` | `a76e0e7869a742389f88b06535767d18` |
| 5 | Restaurants Desk (alt) | `restaurants-desk.html` | `12faef77933e4e14b58d72130686f3ae` |
| 6 | Restaurant Setup | `restaurant-setup.html` | `3b0eaafcf4b14771abe6568be56bf736` |
| 7 | Menu Builder Desk | `menu-builder.html` | `478c23536e974a50991e32fbfd1b495b` |
| 8 | Menu Builder Variant A | `menu-builder-variant-a.html` | `bbe9e12f5bed48b4854b49d1c3222287` |
| 9 | Empty menu (Start from a kit) | `menu-empty.html` | `9bd11984925a4dd5a6c44276ae37f43d` |
| 10 | Cards & spend | `cards.html` | `7bfc4af64e2e4276871b2bd34feb9382` |
| 11 | Reports | `reports.html` | `c7fe2bbe503a4406ac2c1b8c08c506d7` |
| 12 | Settings | `settings.html` | `0c7bb2b6094449239f5edfe5c04f4f26` |
| — | Order Workspace (extra) | `workspace.html` | `065e64ea379f4f629037d711dedb95b6` |
| — | Cards vault (alt) | — | `6fdabfeae02644a9aa0ce045d6877e72` |

## Wired into the React app

| Area | Primary Stitch file | React |
|---|---|---|
| Desk shell + Orders | `orders-buyer-cash-desk.html` | `InHouseTeamPage`, `InHouseOrdersPage` |
| Restaurants | `restaurants-directory.html` | `InHouseRestaurantsPage` |
| Setup | `restaurant-setup.html` | `InHouseRestaurantHomePage` |
| Menu | `menu-builder.html` + `menu-empty.html` | `InHouseMenuBuilderPage`, `EngineMenuPanel` (+ Advanced editor bridge) |
| Cards | `cards.html` | `InHouseCardsPage` |
| Reports | `reports.html` | `InHouseReportsPage` |
| Settings | `settings.html` | `InHouseDeskSettingsPage` |
| Workspace | `workspace.html` | `InHouseWorkspacePage` |
