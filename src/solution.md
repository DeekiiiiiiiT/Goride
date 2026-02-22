# Toll Analytics Implementation Plan

> **Feature:** Toll Analytics dashboard — a dedicated analytics page under Toll Management, modelled after the existing Fuel Performance Analytics (`FuelPerformanceAnalytics.tsx`) but tailored to toll-specific data dimensions (plazas, highways, payment methods, E-Tag adoption).

> **Data source:** Reuses the existing `useTollLogs` hook which fetches all toll transactions, vehicles, drivers, and plazas in one call. All analytics are computed client-side via `useMemo`.

> **Target file:** `/components/toll/TollAnalytics.tsx` (new standalone page component)

---

## Phase 1 — Foundation: File Scaffold, Routing & Sidebar Wiring

**Goal:** Create the empty component file, hook it into App.tsx routing and the sidebar, so the page is reachable and renders a placeholder. No charts or data processing yet.

### Step 1.1 — Create `/components/toll/TollAnalytics.tsx` with skeleton

- Create the file with a basic React functional component.
- Import `useTollLogs` from `../../hooks/useTollLogs`.
- Call `useTollLogs()` inside the component to destructure `{ logs, loading, vehicles, drivers, plazas }`.
- Render a simple placeholder: page title "Toll Analytics" with a subtitle, and a `Loader2` spinner when `loading` is true.
- Export the component as a named export: `export function TollAnalytics()`.
- **Verify:** The file compiles, imports are correct, and `useTollLogs` types align with what we destructure.

### Step 1.2 — Add route in `App.tsx`

- Import `TollAnalytics` at the top: `import { TollAnalytics } from './components/toll/TollAnalytics';`
- Add a new route line next to the other toll routes (after line ~156): `{currentPage === 'toll-analytics' && <TollAnalytics />}`
- **Verify:** No duplicate route keys; the component renders when `currentPage` equals `'toll-analytics'`.

### Step 1.3 — Add sidebar item in `AppLayout.tsx`

- Add `'toll-analytics'` to the `isTollManagementOpen` array (line ~86) so the Toll Management collapsible auto-opens when this page is active.
- Add a new `<SidebarMenuSubItem>` inside the Toll Management collapsible section (between Toll Logs and Toll Reconciliation, or at the end — placing it **first** in the list for prominence):
  - `isActive={currentPage === 'toll-analytics'}`
  - `onClick={() => onNavigate?.('toll-analytics')}`
  - Label text: `"Toll Analytics"`
  - Include a `<Badge>` with text `"New"` using the same styling as the Fueling Analytics badge: `className="bg-indigo-500 text-white border-none h-4 px-1 text-[8px]"`
- **Verify:** Clicking the sidebar item navigates to the page; the collapsible auto-opens when the page is active.

### Step 1.4 — Empty state & loading state

- In `TollAnalytics.tsx`, add an empty-state view that shows when `!loading && logs.length === 0`:
  - Icon: `Receipt` from lucide-react
  - Title: "No toll data yet"
  - Subtitle: "Import toll transactions from the Imports page or add them via Toll Logs to see analytics here."
- Add a loading state that shows a centered `Loader2` spinner with "Loading toll analytics..." text when `loading` is true.
- **Verify:** The three states (loading, empty, has-data) all render correctly without errors.

---

## Phase 2 — KPI Summary Cards (Top Row)

**Goal:** Build the 4 headline KPI cards across the top of the page. These are computed from the `logs` array.

### Step 2.1 — Compute summary statistics via `useMemo`

Create a single `useMemo` block (named `summaryStats`) that computes:

- `totalSpend` — Sum of `absAmount` for all usage logs (`isUsage === true`).
- `totalTopups` — Sum of `absAmount` for all top-up logs (`isUsage === false`).
- `totalTransactions` — Count of all logs.
- `usageCount` — Count of usage-only logs.
- `avgCostPerPassage` — `totalSpend / usageCount` (guard against division by zero).
- `eTagCount` — Count of usage logs where `paymentMethodDisplay` equals `'E-Tag'`.
- `eTagRate` — `(eTagCount / usageCount) * 100` (percentage, guard zero).
- `netPosition` — `totalTopups - totalSpend` (positive = surplus, negative = deficit).

**Dependency array:** `[logs]`

### Step 2.2 — Card 1: Total Toll Spend

- Use the dark gradient card style from Fuel Analytics (slate-900 to slate-800 with white text).
- Icon: `TrendingDown` in rose-400 colour (spend is an outflow).
- Title: "Total Toll Spend".
- Value: Format `totalSpend` as JMD currency using `Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD', minimumFractionDigits: 0 })`.
- Subtitle: `"{usageCount} passages"`.
- Include a small badge: "JMD" with a subtle background.

### Step 2.3 — Card 2: Average Cost per Passage

- Standard white card.
- Icon: `Calculator` in blue on a blue-50 background circle.
- Title: "Avg Cost per Passage".
- Value: JMD formatted `avgCostPerPassage`.
- Subtitle: "Per toll transaction".

### Step 2.4 — Card 3: E-Tag Adoption Rate

- Standard white card.
- Icon: `CreditCard` in emerald on an emerald-50 background circle.
- Title: "E-Tag Adoption".
- Value: `{eTagRate}%` formatted to 1 decimal place.
- Include a progress bar (same style as Fuel Analytics' integrity rate bar): green fill width = eTagRate%.
- Subtitle: `"{eTagCount} of {usageCount} passages via E-Tag"`.

### Step 2.5 — Card 4: Net Position (Balance Health)

- Standard white card.
- Icon: Conditional — `TrendingUp` in green if positive, `TrendingDown` in red if negative.
- Title: "Net Position".
- Value: JMD formatted `netPosition` with sign (+/−).
- Colour the value text green if positive, red if negative.
- Subtitle: "Top-ups minus spend".

### Step 2.6 — Layout the 4 cards

- Use `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` to lay them out responsively.
- Wrap in the page's `<div className="space-y-6">` container.
- **Verify:** Cards render with real or zero data, currency formatting is correct, no NaN values appear.

---

## Phase 3 — Monthly Spend Trend Chart + Spend by Plaza Chart

**Goal:** Build the first row of charts (2-column grid): an area chart showing monthly spend/top-ups over time, and a horizontal bar chart showing spend per plaza.

### Step 3.1 — Compute monthly trend data via `useMemo`

- Import `subMonths`, `startOfMonth`, `endOfMonth`, `eachMonthOfInterval`, `format` from `date-fns`.
- Generate an array of the last 6 months using `eachMonthOfInterval`.
- For each month, filter `logs` to entries within that month's date range.
- Compute per-month: `spend` (sum absAmount of usage logs), `topups` (sum absAmount of top-up logs), `count` (number of transactions).
- Return array of `{ name: format(month, 'MMM'), spend, topups, count }`.
- **Dependency array:** `[logs]`

### Step 3.2 — Render the Monthly Toll Spend Trend area chart

- Use `<Card>` with `<CardHeader>` (title: "Monthly Toll Spend Trend", description: "Toll spend and top-ups over the last 6 months.").
- Use `SafeResponsiveContainer` (imported as `ResponsiveContainer` from `../ui/SafeResponsiveContainer`), height 300.
- `<AreaChart>` with:
  - `<defs>` with a `linearGradient` for the spend area (rose/red gradient, matching the spend-is-outflow colour).
  - `<CartesianGrid>` with `strokeDasharray="3 3"`, `vertical={false}`, `stroke="#f1f5f9"`.
  - `<XAxis>` with `dataKey="name"`, no axis line, no tick line, fontSize 12.
  - `<YAxis>` with no axis line, tickFormatter showing JMD abbreviated (e.g., "$50K").
  - `<Tooltip>` with rounded style, JMD currency formatter.
  - `<Area>` for `spend` — rose-500 stroke, gradient fill.
  - `<Area>` for `topups` — emerald-500 stroke, low opacity fill.
- **Verify:** Chart renders without errors; gradient IDs are unique.

### Step 3.3 — Compute spend-by-plaza data via `useMemo`

- Filter to usage logs only.
- Group by `plazaName` (fall back to `locationRaw` or `"Unknown Plaza"`).
- Sum `absAmount` per plaza.
- Sort descending by total spend.
- Take top 8 plazas.
- Return array of `{ name: string, spend: number, count: number }`.
- **Dependency array:** `[logs]`

### Step 3.4 — Render the Spend by Plaza horizontal bar chart

- Use `<Card>` with title "Spend by Plaza" and description "Top plazas ranked by total toll spend."
- Use `SafeResponsiveContainer`, height 300.
- `<BarChart>` with `layout="vertical"`, `margin={{ left: 40 }}`.
- `<YAxis>` with `dataKey="name"`, type category, truncated labels (fontSize 10).
- `<XAxis>` type number, hidden or with JMD tick formatter.
- `<Bar>` with `dataKey="spend"`, indigo-500 fill, radius `[0, 4, 4, 0]`, barSize 18.
- `<Tooltip>` with JMD formatter.
- **Verify:** Bar labels don't overflow; chart handles 0-8 plazas gracefully.

### Step 3.5 — Layout the two charts

- Wrap both in `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">`.
- **Verify:** Responsive — stacks on mobile, side-by-side on desktop.

---

## Phase 4 — Vehicle Spend Chart + Payment Method Distribution Chart

**Goal:** Build the second row of charts: toll spend by vehicle (bar chart), and payment method distribution (pie/donut chart).

### Step 4.1 — Compute spend-by-vehicle data via `useMemo`

- Filter to usage logs only.
- Group by `vehicleId` (fall back to `vehicleName` for grouping display).
- For each vehicle, sum `absAmount` and count flagged logs (where `status === 'Flagged'`).
- Resolve vehicle display name using `vehicleName` field from logs.
- Sort descending by total spend.
- Take top 5.
- Return array of `{ name: string, spend: number, flags: number, count: number }`.
- **Dependency array:** `[logs]`

### Step 4.2 — Render the Toll Spend by Vehicle horizontal bar chart

- Same pattern as Fuel Analytics' "Integrity Health by Vehicle" chart.
- `<BarChart layout="vertical">` with `margin={{ left: 50 }}`.
- `<YAxis dataKey="name">` — vehicle plate/name labels.
- `<Bar dataKey="spend">` with conditional `<Cell>` colouring: red (`#f43f5e`) if `flags > 0`, indigo (`#6366f1`) otherwise.
- Title: "Toll Spend by Vehicle", description: "Top 5 vehicles by toll cost. Red bars indicate flagged transactions."
- **Verify:** Red/indigo colouring works; empty state shows "No vehicle data available" message.

### Step 4.3 — Compute payment method distribution via `useMemo`

- Filter to usage logs only.
- Group by `paymentMethodDisplay` (values: "E-Tag", "Cash", "Card", "Unknown", etc.).
- Count transactions and sum spend per method.
- Return array of `{ name: string, value: number, spend: number, count: number }`.
- Define a colour map: E-Tag = emerald-500, Cash = amber-500, Card = blue-500, Unknown = slate-400.
- **Dependency array:** `[logs]`

### Step 4.4 — Render the Payment Method Distribution pie chart

- Import `PieChart`, `Pie`, `Cell` from recharts.
- Use a donut style: `innerRadius={60}`, `outerRadius={100}`.
- `<Cell>` for each slice using the colour map.
- Custom centre label showing total transaction count.
- `<Tooltip>` showing method name, count, and spend (JMD).
- Legend below the chart showing method name + percentage.
- Title: "Payment Method Split", description: "Distribution of toll payments by method."
- **Verify:** Donut renders; legend is readable; handles edge case where only 1 method exists.

### Step 4.5 — Layout the two charts

- Same 2-column grid as Phase 3: `grid grid-cols-1 lg:grid-cols-2 gap-6`.

---

## Phase 5 — Highway Corridor Spend + Driver Spend Charts

**Goal:** Build the third row of charts: spend grouped by highway, and top drivers by toll cost.

### Step 5.1 — Compute spend-by-highway data via `useMemo`

- Filter to usage logs only.
- Group by `highway` field (fall back to `"Unknown Highway"` if null).
- Sum `absAmount` per highway, count transactions.
- Sort descending by spend.
- Return array of `{ name: string, spend: number, count: number }`.
- **Dependency array:** `[logs]`

### Step 5.2 — Render the Spend by Highway Corridor bar chart

- Use a **vertical bar chart** (not horizontal) since highway names are short enough for X-axis labels.
- `<BarChart>` with `<XAxis dataKey="name">`, angled labels if needed (`angle={-20}`).
- `<Bar dataKey="spend">` with indigo gradient fill.
- `<Tooltip>` with JMD formatter and transaction count.
- Title: "Spend by Highway Corridor", description: "Toll spend distributed across highway networks."
- **Verify:** Labels don't overlap; handles 1–5 highways gracefully.

### Step 5.3 — Compute spend-by-driver data via `useMemo`

- Filter to usage logs only.
- Group by `driverId` (use `driverDisplayName` for the label).
- Sum `absAmount` per driver, count flagged transactions.
- Sort descending by spend.
- Take top 5.
- Return array of `{ name: string, spend: number, flags: number, count: number }`.
- **Dependency array:** `[logs]`

### Step 5.4 — Render the Toll Spend by Driver horizontal bar chart

- Exactly mirrors the Fuel Analytics "Fuel Spend by Driver" chart pattern.
- `<BarChart layout="vertical">` with left margin for name labels.
- Conditional `<Cell>` colouring: red if flags > 0, indigo otherwise.
- `<Tooltip>` with JMD formatter.
- Title: "Toll Spend by Driver" with `<Users>` icon, description: "Top 5 drivers ranked by total toll cost. Red bars indicate drivers with flagged transactions."
- Empty state: "No driver data available." centered message.
- **Verify:** Driver names display correctly; flags colouring works.

### Step 5.5 — Layout the two charts

- Same 2-column grid pattern.

---

## Phase 6 — Insights Panel (Anomaly-Style Cards)

**Goal:** Build the bottom insights section — two side-by-side insight cards highlighting actionable patterns, modelled after Fuel Analytics' "Anomaly Insights" section.

### Step 6.1 — Compute insight data via `useMemo`

Build an `insights` memo that computes:

- **Highest-Cost Vehicles:** Top 3 vehicles by toll spend with their flag counts (reuse `vehicleSpendData` from Phase 4 or recompute).
- **Cash Overpay Candidates:** Vehicles that have more than 30% of their toll transactions paid by Cash (meaning they could save by switching to E-Tag). For each, calculate: total cash toll spend, estimated savings (e.g., 10-15% tag discount — use a configurable constant `TAG_DISCOUNT_RATE = 0.10`).
- **Flagged Transaction Summary:** Count of transactions with status "Flagged" grouped by plaza, for the flagged-plaza insight.
- **Dependency array:** `[logs]`

### Step 6.2 — Render the "Highest-Cost Vehicles" insight card

- Styled like Fuel Analytics' "High Efficiency Risk" card: bg-slate-50 rounded-xl border.
- Title icon: `TrendingDown` in red.
- Title: "Highest Toll Spend".
- List top 3 vehicles with:
  - Avatar circle showing first 2 letters of plate.
  - Plate number (bold) and vehicle model (subtitle).
  - Badge showing total spend in JMD.
  - If flags > 0, show a red "X Flags" badge.
- Empty state: "All vehicles within normal spend range."

### Step 6.3 — Render the "Cash Overpay Opportunity" insight card

- Title icon: `CreditCard` in amber.
- Title: "E-Tag Savings Opportunity".
- List vehicles with high cash usage:
  - Avatar circle in amber.
  - Vehicle plate and "X% cash payments" subtitle.
  - Badge showing estimated annual savings: `"{estimatedSavings} potential savings"`.
- Empty state: "All vehicles are using E-Tag efficiently."

### Step 6.4 — Layout the insight cards

- Wrap in a `<Card>` with header (title: "Toll Insights", icon: `Zap` in orange, description: "Actionable patterns detected from your toll transaction data.").
- Inside `<CardContent>`, use `grid grid-cols-1 md:grid-cols-2 gap-4`.
- **Verify:** Both cards render; empty states display when no matching data.

---

## Phase 7 — Reconciliation Status Donut + Parish Heatmap

**Goal:** Add a final row with a reconciliation status overview (donut chart) and a parish-level spend summary table, then do a full polish pass.

### Step 7.1 — Compute reconciliation status data via `useMemo`

- Group all logs by `statusDisplay` (Completed, Pending, Flagged, Reconciled, Void, etc.).
- Count transactions per status.
- Define colour map: Completed = emerald, Pending = amber, Flagged = red, Reconciled = blue, Void = slate.
- Return array of `{ name: string, value: number, color: string }`.
- **Dependency array:** `[logs]`

### Step 7.2 — Render the Reconciliation Status donut chart

- Same donut pattern as Phase 4's payment method chart.
- `innerRadius={55}`, `outerRadius={95}`.
- Centre label: total transaction count.
- Legend below with status name, count, and colour.
- Title: "Reconciliation Overview", description: "Transaction status distribution across all toll records."

### Step 7.3 — Compute parish-level spend data via `useMemo`

- Group usage logs by `parish` field (fall back to "Unknown").
- Sum `absAmount` per parish, count transactions, calculate average.
- Sort descending by spend.
- Return array of `{ parish: string, spend: number, count: number, avg: number }`.
- **Dependency array:** `[logs]`

### Step 7.4 — Render the Parish Spend Summary as a compact table

- Use a `<Card>` with title "Spend by Parish" and description "Toll expenditure grouped by Jamaican parish."
- Render a small `<Table>` with columns: Parish, Transactions, Total Spend, Avg per Passage.
- Format currency as JMD.
- Highlight the top-spending parish row with a subtle indigo-50 background.
- If no parish data, show "No parish data available" placeholder.

### Step 7.5 — Layout the two components

- Same 2-column grid.

### Step 7.6 — Full polish pass

- Ensure all JMD currency formatting uses the same helper function (define once at top of file).
- Ensure all chart gradient IDs are unique (prefix with `toll-` to avoid collision with fuel charts if both are in DOM).
- Ensure all `<Tooltip>` contentStyles are consistent (12px border-radius, no border, shadow).
- Ensure all empty/loading states are covered.
- Ensure page title section at top includes: `<Receipt>` icon, "Toll Analytics" title, subtitle "Comprehensive analysis of your fleet's toll expenditure", and a refresh button that calls the hook's refetch.
- Test responsive layout: verify all grids stack on mobile.
- **Verify:** Full page renders without console errors; all charts display; no NaN or undefined values.

---

## Phase 8 — Date Format Compliance & Final QA ✅ COMPLETED

**Goal:** Ensure DD/MM/YYYY date formatting is used throughout, and do a final quality-assurance pass.

### Step 8.1 — Date format audit ✅

- All date displays in tooltips use `formatJMD()` for JMD amounts; no individual dates appear in tooltips.
- Monthly axis labels use `MMM yyyy` (abbreviated month names) which are fine as-is.
- No DD/MM/YYYY conversion was needed since no tooltip or label shows individual date values.

### Step 8.2 — Remove any debug console.logs ✅

- Zero `console.log` statements found in TollAnalytics.tsx.
- Do NOT touch `console.log` statements in other files (the `[TankCap Debug]` one in FuelLogTable.tsx is noted but not our scope).

### Step 8.3 — Final type-safety check ✅

- **Fixed:** Restored missing `import React, { useMemo } from 'react'` (critical bug — was lost during Phase 6/7 edits).
- No `any` types used.
- All `useMemo` dependency arrays are `[logs]` — complete and correct.
- All recharts `.map()` calls have unique key props.

### Step 8.4 — Cross-reference with Fuel Analytics consistency ✅

- **Fixed:** Bar chart `radius` aligned from `[0, 6, 6, 0]` to `[0, 4, 4, 0]` matching FuelPerformanceAnalytics.
- Tooltip styles identical: `{ borderRadius: '12px', border: 'none', boxShadow: '...' }`.
- CartesianGrid identical: `strokeDasharray="3 3"`, `stroke="#f1f5f9"`.
- Dark gradient hero card identical: `bg-gradient-to-br from-slate-900 to-slate-800`.
- Layout spacing identical: `space-y-6`.
- Gradient IDs unique: `tollSpendGrad`, `tollTopupGrad` (vs Fuel's `colorLiters`).
- Stale comment updated.

---

## Summary — File Manifest

| File | Action | Phase |
|------|--------|-------|
| `/components/toll/TollAnalytics.tsx` | **Create** | Phase 1 (scaffold), Phases 2–7 (content), Phase 8 (polish) |
| `/App.tsx` | **Edit** — add import + route | Phase 1 |
| `/components/layout/AppLayout.tsx` | **Edit** — add sidebar item + update open-check array | Phase 1 |
| `/solution.md` | **Edit** — this plan | Pre-work |

No backend changes. No new hooks. No new types. All data comes from the existing `useTollLogs` hook.