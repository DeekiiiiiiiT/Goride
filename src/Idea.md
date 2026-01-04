# Driver Performance Report Implementation Plan

## Phase 1: Backend Data Aggregation
**Goal:** Create a robust server-side function to transform raw trip data into daily performance metrics.
- [ ] **Step 1.1: Create Edge Function Structure**
  - Create `/supabase/functions/server/performance-metrics.tsx`.
  - Import `Trip` type and helper libraries (`date-fns`).
- [ ] **Step 1.2: Implement Grouping Logic**
  - Create a helper function `groupTripsByDriverAndDate(trips: Trip[])`.
  - It should return a nested object or map: `Record<DriverId, Record<DateString, DailyStats>>`.
  - `DailyStats` should include: `totalTrips`, `totalEarnings`, `hoursOnline` (if available, otherwise estimate or skip).
- [ ] **Step 1.3: Apply Quota Logic**
  - Define default quotas (e.g., $100/day, 5 trips/day).
  - Iterate through the grouped data.
  - Calculate `metRideQuota` (boolean) and `metEarningsQuota` (boolean) for each day.
  - Calculate `successRate` (days met / total days active).
- [ ] **Step 1.4: Calculate Streaks**
  - Implement a `calculateStreak(dailyStats[])` function.
  - Sort days descending.
  - Count consecutive days where `metQuota` is true.
- [ ] **Step 1.5: Expose API Endpoint**
  - Create route `/performance-report` in `index.tsx`.
  - It should accept `startDate` and `endDate` query params.
  - Return JSON: `{ drivers: DriverPerformanceSummary[], globalStats: GlobalStats }`.

## Phase 2: Frontend Types & State Management
**Goal:** set up the data layer in the React application.
- [ ] **Step 2.1: Define TypeScript Interfaces**
  - Create `/types/performance.ts`.
  - Define `DailyPerformance`, `DriverPerformanceSummary`, `PerformanceReport`.
- [ ] **Step 2.2: Create API Service Method**
  - Update `/services/api.ts`.
  - Add `getPerformanceReport(startDate, endDate)`.
- [ ] **Step 2.3: Create Hook**
  - Create `/hooks/usePerformanceReport.ts`.
  - Use `useQuery` pattern (state: data, loading, error).
  - Implement default date range (Last 30 days).

## Phase 3: "At Risk" & "Top Performer" Business Logic
**Goal:** specific logic to identify outliers.
- [ ] **Step 3.1: Implement Filtering Utilities**
  - Create `/utils/performanceUtils.ts`.
  - `getTopPerformers(drivers, limit=5)`: Sort by compliance %.
  - `getAtRiskDrivers(drivers, limit=5)`: Sort by compliance % ascending, filter where active > 7 days.
- [ ] **Step 3.2: Streak Logic Validation**
  - Ensure the logic correctly handles weekends or days off (do they break the streak? - Decision: Only days with 1+ trip count towards streak logic, or assume strict daily). *Assumption: Strict daily for now.*

## Phase 4: Dashboard UI - Summary Cards
**Goal:** Build the high-level metrics view.
- [ ] **Step 4.1: Create Container Component**
  - Create `/components/admin/performance/PerformanceDashboard.tsx`.
  - Add `DateRangePicker` in the header.
- [ ] **Step 4.2: Build "Top Performers" Card**
  - Display list of top 5 drivers.
  - Show Green Progress Bar for score.
- [ ] **Step 4.3: Build "Needs Attention" Card**
  - Display list of bottom 5 drivers.
  - Show Red/Orange Progress Bar.
- [ ] **Step 4.4: Build "Quick Stats" Card**
  - Show Total Active Drivers, Avg Fleet Compliance, Total Missed Days.

## Phase 5: Detailed Driver Table
**Goal:** The main list view for all drivers.
- [ ] **Step 5.1: Setup Table Columns**
  - Driver Name, Total Rides, Total Earnings, Quota Hit Rate, Current Streak, Status Badge.
- [ ] **Step 5.2: Implement Status Badges**
  - Create `ComplianceBadge.tsx`.
  - Green (>90%), Yellow (70-90%), Red (<70%).
- [ ] **Step 5.3: Add Sorting & Pagination**
  - Allow sorting by Name, Earnings, or Hit Rate.

## Phase 6: Drill-Down Modal & Charts
**Goal:** Visualize individual performance.
- [ ] **Step 6.1: Create Detail Modal**
  - `/components/admin/performance/DriverPerformanceModal.tsx`.
- [ ] **Step 6.2: Implement Trend Chart**
  - Use `Recharts` `LineChart`.
  - X-Axis: Date. Y-Axis: Earnings.
  - Add a static reference line for the "Daily Quota".
- [ ] **Step 6.3: Implement Calendar View (Optional/Simplified)**
  - Show a grid of the last 30 days with Green/Red blocks.

## Phase 7: Quota Management & Final Integration
**Goal:** Allow admins to configure the targets.
- [ ] **Step 7.1: Quota Settings UI**
  - Add a "Settings" button to the Dashboard.
  - Allow setting `Global Daily Earnings Target` and `Global Daily Ride Target`.
- [ ] **Step 7.2: Wire up to Backend**
  - Pass these settings to the backend calculation engine (or store in DB).
- [ ] **Step 7.3: Add to Navigation**
  - Add "Performance" link to the Admin Sidebar.
