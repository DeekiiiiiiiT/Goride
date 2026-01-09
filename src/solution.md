# Implementation Plan: Active Pipeline Metrics for Claimable Loss

This plan adds "Active Pipeline" metrics to the dashboard to complement the existing "Resolved History" metrics.

### Phase 1: Calculate Active Financial Metrics
**Goal:** Compute the real-time financial values for unclaimed losses, pending recoveries, and at-risk disputes.
- [ ] **Step 1:** In `/pages/ClaimableLoss.tsx`, inside the existing `ClaimableLoss` component, locate the `losses` `useMemo` hook.
- [ ] **Step 2:** Create a new `useMemo` block specifically for "Active Metrics".
- [ ] **Step 3:** Calculate `unclaimedTotal`: Iterate through the `losses` array and sum the `match.varianceAmount` (ensure to handle potential nulls safely).
- [ ] **Step 4:** Calculate `pendingTotal`: Sum the amounts of `pendingClaims` (Submitted to Uber) and `awaitingDriverClaims` (Sent to Driver).
- [ ] **Step 5:** Calculate `atRiskTotal`: Sum the amounts of `lostClaims` (Rejected/Dispute Lost).
- [ ] **Step 6:** Return these three values from the hook.

### Phase 2: Enhance StatCard Component Types
**Goal:** Update the reusable `StatCard` to support new visual states (Warning for risk, Info for pending, Slate for potential).
- [ ] **Step 1:** Open `/components/claimable-loss/StatCard.tsx`.
- [ ] **Step 2:** Update the `StatCardProps` interface to include new `type` options: `'warning'` (Amber) and `'info'` (Blue).
- [ ] **Step 3:** Inside the component logic, add a condition for `type === 'warning'`. Set `colorClass` to amber/orange variants and `bgClass` to amber-50.
- [ ] **Step 4:** Add a condition for `type === 'info'`. Set `colorClass` to blue variants and `bgClass` to blue-50.
- [ ] **Step 5:** Verify the 'neutral' or default styling works for the "Unclaimed" card (likely Slate/Gray).

### Phase 3: Implement Active Pipeline Grid
**Goal:** Render the new top-level grid displaying the active financial pipeline.
- [ ] **Step 1:** In `/pages/ClaimableLoss.tsx`, import necessary icons from `lucide-react`: `AlertCircle` (At Risk), `Timer` (Pending), and `Banknote` (Unclaimed).
- [ ] **Step 2:** Create a wrapper `div` above the existing stats grid. Give it a label/header "Active Pipeline".
- [ ] **Step 3:** Inside this wrapper, render a `div` with `grid grid-cols-1 md:grid-cols-3 gap-4`.
- [ ] **Step 4:** Render 3 `StatCard` components:
    - **Unclaimed Potential:** `amount={unclaimedTotal}`, `type="neutral"`, `icon={Banknote}`.
    - **Pending Recovery:** `amount={pendingTotal}`, `type="info"`, `icon={Timer}`.
    - **Action Required:** `amount={atRiskTotal}`, `type="warning"`, `icon={AlertCircle}`.

### Phase 4: Reorganize Resolved History Grid
**Goal:** Visually distinguish the existing "Net Result" grid as a separate "Historical Performance" section.
- [ ] **Step 1:** In `/pages/ClaimableLoss.tsx`, wrap the existing 4-tile grid in a new container `div`.
- [ ] **Step 2:** Add a label/header above this grid: "Resolved Performance".
- [ ] **Step 3:** Ensure the gap between the "Active Pipeline" section and the "Resolved Performance" section is sufficient (e.g., `gap-8` or `my-6`).
- [ ] **Step 4:** (Optional) Add a visual separator (`<hr>` or border) if the sections feel too crowded.

### Phase 5: Responsive Layout & Mobile Optimization
**Goal:** Ensure the dual-grid layout stacks correctly and looks good on smaller screens.
- [ ] **Step 1:** Review the grid classes (`grid-cols-1 md:grid-cols-X`).
- [ ] **Step 2:** Ensure the "Active Pipeline" uses `md:grid-cols-3` (since there are 3 tiles) and the "Resolved" section uses `md:grid-cols-4` (4 tiles).
- [ ] **Step 3:** Check padding and text sizes for mobile breakpoints.

### Phase 6: Final Polish and Code Cleanup
**Goal:** Remove any temporary logs, unused imports, and ensure strict type safety.
- [ ] **Step 1:** Scan `/pages/ClaimableLoss.tsx` for unused variables.
- [ ] **Step 2:** Verify that `match.varianceAmount` is being accessed correctly with type safety (it's part of the `MatchResult` in `losses`).
- [ ] **Step 3:** Ensure the dollar sign formatting is consistent across all new tiles.
