# Unmatched Tolls Sub-Tabs & Auto-Confirm Perfect Matches

## Overview

Two major changes to the Toll Reconciliation system:

1. **Auto-confirm Perfect Matches** — Tolls with `PERFECT_MATCH` (active trip + amount matches within 5 cents) are auto-reconciled server-side and sent straight to Matched History, tagged as "Auto-matched" so the admin can distinguish them from manual confirmations.

2. **Sub-tabs for Unmatched Tolls** — The single flat "Unmatched Tolls" tab is split into 4 sub-tabs based on the system's classification:
   - **Needs Review** — No suggestion, low confidence, or possible match (admin must investigate)
   - **Underpaid** — Platform reimbursed less than actual toll (file a claim)
   - **Deadhead** — Business driving tolls not reimbursed (absorb or deduct; tax-deductible)
   - **Personal Use** — High-confidence personal driving (charge the driver)

---

## Files Involved

| File | Role |
|------|------|
| `/supabase/functions/server/toll_controller.tsx` | Server — `/unreconciled` endpoint, `/reconcile` endpoint, matching engine |
| `/hooks/useTollReconciliation.ts` | Client hook — fetches data, manages state, exposes `reconcile`/`autoMatchAll` |
| `/components/toll-tags/reconciliation/UnmatchedTollsList.tsx` | UI — renders unmatched tolls, Smart Suggestions, "Other Unmatched" table |
| `/components/toll-tags/reconciliation/ReconciledTollsList.tsx` | UI — renders Matched History table |
| `/components/toll-tags/reconciliation/ReconciliationDashboard.tsx` | UI — parent component with top-level tabs + financial summary cards |
| `/components/toll-tags/reconciliation/SuggestedMatchCard.tsx` | UI — individual Smart Suggestion card |
| `/utils/tollReconciliation.ts` | Shared — `MatchType` type, `findTollMatches()`, `calculateTollFinancials()` |

---

## Phase 1: Server-Side Auto-Confirm for PERFECT_MATCH

**Goal:** When the `/unreconciled` endpoint is called, the server automatically reconciles any `PERFECT_MATCH` tolls before returning results. These never appear in the Unmatched list.

### Step 1.1: Add `autoMatched` flag to the reconcile logic
- In `toll_controller.tsx`, inside the `/unreconciled` endpoint (around line 740), after `findTollMatchesServer()` generates suggestions:
  - Loop through the `suggestionsMap` entries
  - Identify entries where the best match (index 0) has `matchType === 'PERFECT_MATCH'`
  - For each such entry, auto-reconcile by:
    1. Loading the transaction via `kv.get(`transaction:${txId}`)`
    2. Loading the trip via `kv.get(`trip:${match.tripId}`)`
    3. Setting `tx.tripId = match.tripId`, `tx.isReconciled = true`, `tx.driverId`, `tx.driverName`
    4. Setting `tx.metadata.reconciledBy = 'system-auto'` (instead of `'admin'`) — this is the key flag
    5. Setting `tx.metadata.reconciledAt = new Date().toISOString()`
    6. Setting `tx.metadata.autoMatchReason = match.reason` (preserve why it matched)
    7. Setting `tx.metadata.autoMatchScore = match.confidenceScore` (preserve the score)
    8. Writing to KV via `kv.set(`transaction:${txId}`, tx)`
    9. Writing a ledger entry via `writeTollLedgerEntry()` with `matchedBy: 'system-auto'`
  - Remove these auto-reconciled transactions from the `page` array before returning
  - Remove them from `suggestionsMap` before returning
  - Add an `autoReconciled: number` count to the response JSON so the frontend knows how many were auto-processed

### Step 1.2: Guard against double-reconciliation
- Before auto-reconciling, check `if (tx.isReconciled && tx.tripId)` — skip if already reconciled
- This prevents issues if the endpoint is called multiple times in quick succession (e.g., page refresh)

### Step 1.3: Add logging
- Log each auto-reconciliation: `[TollReconciliation] Auto-confirmed PERFECT_MATCH: tx ${txId} -> trip ${tripId} (score: ${score})`
- Log the total count: `[TollReconciliation] Auto-confirmed ${count} perfect matches`

### Step 1.4: Update the response shape
- The `/unreconciled` response currently returns `{ success, data, suggestions, total, limit, offset }`
- Add `autoReconciled: number` to the response
- Adjust `total` to reflect the count AFTER auto-reconciliation (so pagination remains accurate)

### Verification:
- After Phase 1, loading the Toll Reconciliation page should:
  - Auto-reconcile any PERFECT_MATCH tolls server-side
  - Return fewer items in the Unmatched list
  - The auto-reconciled items should appear in the Reconciled list (but won't have the badge yet — that's Phase 2)

---

## Phase 2: Auto-Matched Badge in Matched History

**Goal:** Show a visual indicator in the Matched History table so the admin can tell which matches were auto-confirmed vs manually confirmed.

### Step 2.1: Surface the `reconciledBy` metadata in the UI
- In `ReconciledTollsList.tsx`, each toll row already has access to the full transaction object (`tx`)
- The `tx.metadata.reconciledBy` field will be either `'system-auto'` (from Phase 1) or `'admin'` (existing manual flow)
- Add a new column or inline badge after the "Description" column

### Step 2.2: Add the badge rendering
- If `tx.metadata?.reconciledBy === 'system-auto'`:
  - Show a small Badge: `<Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200 text-[10px]">Auto-matched</Badge>`
  - Include a bot icon (`Bot` from lucide-react) for visual clarity
- If `tx.metadata?.reconciledBy === 'admin'` or no metadata:
  - No badge needed (default = manually matched), OR optionally show a subtle "Manual" indicator

### Step 2.3: Add a column header
- Add "Source" or "Match Type" as a new `<TableHead>` in the Matched History table header
- Keep it narrow (e.g., `w-[100px]`) so it doesn't take up too much space

### Step 2.4: Handle the toast notification
- In `useTollReconciliation.ts`, after `fetchData()` completes, check if `unreconciledRes.autoReconciled > 0`
- If so, show a toast: `toast.info(`${count} toll(s) auto-matched to trips`)`
- This gives the admin passive awareness that auto-matching happened

### Verification:
- After Phase 2, Matched History should show "Auto-matched" badges on items from Phase 1
- A toast should appear when auto-matches are processed

---

## Phase 3: Sub-Tab Infrastructure in UnmatchedTollsList

**Goal:** Add the 4 sub-tab toggle buttons inside the Unmatched Tolls section. No filtering logic yet — just the visual tabs and state management.

### Step 3.1: Define the sub-tab type and state
- In `UnmatchedTollsList.tsx`, add a new type:
  ```ts
  type UnmatchedSubTab = 'needs-review' | 'underpaid' | 'deadhead' | 'personal-use';
  ```
- Add state: `const [activeSubTab, setActiveSubTab] = useState<UnmatchedSubTab>('needs-review');`

### Step 3.2: Build the sub-tab bar UI
- Place it above the Smart Suggestions section (around line 247)
- Use plain HTML buttons styled with Tailwind (NOT Radix Tabs — to keep it simple and avoid nested tab issues)
- Layout: a horizontal row of 4 toggle buttons, each showing label + count badge
- Active button gets a colored underline/background; inactive buttons are muted
- Example structure:
  ```
  [ Needs Review (12) ] [ Underpaid (3) ] [ Deadhead (5) ] [ Personal Use (8) ]
  ```

### Step 3.3: Pass counts as props (placeholder)
- For now, compute placeholder counts using the `suggestions` map:
  - **Needs Review**: tolls with no suggestion, or suggestion with `confidence === 'low'` or `confidence === 'medium'`, or `matchType === 'POSSIBLE_MATCH'`
  - **Underpaid**: tolls with best match `matchType === 'AMOUNT_VARIANCE'`
  - **Deadhead**: tolls with best match `matchType === 'DEADHEAD_MATCH'` OR (`matchType === 'PERSONAL_MATCH'` AND `reason` includes 'Approach')
  - **Personal Use**: tolls with best match `matchType === 'PERSONAL_MATCH'` AND reason does NOT include 'Approach'
- These counts are computed in a `useMemo` and displayed in each tab button

### Step 3.4: Ensure the sub-tab bar is responsive
- On mobile, the 4 buttons should wrap or scroll horizontally
- Use `flex flex-wrap gap-1` or `overflow-x-auto` with `flex-nowrap`

### Verification:
- After Phase 3, the Unmatched Tolls tab should show the 4 sub-tab buttons with counts
- Clicking a sub-tab should update the active state (visual highlight changes)
- The actual toll list content does NOT change yet — that's Phase 4

---

## Phase 4: Classification Logic & Filtering Per Sub-Tab

**Goal:** Wire up the sub-tabs so each one only shows tolls belonging to that category.

### Step 4.1: Create the classification function
- In `UnmatchedTollsList.tsx`, create a `useMemo` that classifies every toll into one of the 4 buckets:
  ```ts
  const classified = useMemo(() => {
    const buckets = {
      'needs-review': [] as FinancialTransaction[],
      'underpaid': [] as FinancialTransaction[],
      'deadhead': [] as FinancialTransaction[],
      'personal-use': [] as FinancialTransaction[],
    };
    filteredTolls.forEach(tx => {
      const best = suggestions.get(tx.id)?.[0];
      if (!best) {
        buckets['needs-review'].push(tx);
        return;
      }
      switch (best.matchType) {
        case 'AMOUNT_VARIANCE':
          buckets['underpaid'].push(tx);
          break;
        case 'DEADHEAD_MATCH':
          buckets['deadhead'].push(tx);
          break;
        case 'PERSONAL_MATCH':
          if (best.reason?.includes('Approach')) {
            buckets['deadhead'].push(tx); // Unreimbursed = Deadhead variant
          } else {
            buckets['personal-use'].push(tx);
          }
          break;
        case 'POSSIBLE_MATCH':
        default:
          buckets['needs-review'].push(tx);
          break;
      }
    });
    return buckets;
  }, [filteredTolls, suggestions]);
  ```

### Step 4.2: Replace the flat list with the active sub-tab's filtered list
- Currently, `smartMatches` and `otherTolls` are computed from `filteredTolls`
- Change these to compute from `classified[activeSubTab]` instead of `filteredTolls`
- The `smartMatches` filter still applies (confidence >= 50 and not hidden) but only within the active sub-tab's tolls
- The `otherTolls` filter = remaining tolls in the active sub-tab that aren't smart matches

### Step 4.3: Update the "Show More" counters
- `visibleSmartMatches` and `visibleOtherTolls` should reset to their defaults when the sub-tab changes
- Add a `useEffect` that resets these when `activeSubTab` changes:
  ```ts
  useEffect(() => {
    setVisibleSmartMatches(10);
    setVisibleOtherTolls(25);
  }, [activeSubTab]);
  ```

### Step 4.4: Update sub-tab counts from the classification
- Replace the placeholder counts from Phase 3 Step 3.3 with actual `classified['needs-review'].length`, etc.

### Step 4.5: Update the empty state
- If the active sub-tab has 0 tolls, show a sub-tab-specific empty message:
  - Needs Review: "No tolls pending review"
  - Underpaid: "No underpaid tolls found"
  - Deadhead: "No deadhead tolls found"
  - Personal Use: "No personal use tolls detected"

### Verification:
- After Phase 4, clicking each sub-tab should filter the toll list
- Counts should match the actual number of items in each tab
- Smart Suggestions should only show for the active sub-tab
- All action buttons (Confirm, Dismiss, Resolve dropdown, etc.) should still work

---

## Phase 5: Smart Suggestions Scoped to Sub-Tabs

**Goal:** Ensure the Smart Suggestions cards and their action buttons behave correctly per sub-tab context.

### Step 5.1: Scope Smart Suggestions to the active sub-tab
- Currently, Smart Suggestions show ALL high-confidence matches regardless of matchType
- After Phase 4, they're already filtered by the classified bucket — but verify:
  - **Needs Review tab**: Smart Suggestions should show `POSSIBLE_MATCH` items with score >= 50 (if any)
  - **Underpaid tab**: Smart Suggestions should show `AMOUNT_VARIANCE` matches with score >= 50
  - **Deadhead tab**: Smart Suggestions should show `DEADHEAD_MATCH` + `PERSONAL_MATCH` (Approach) with score >= 50
  - **Personal Use tab**: Smart Suggestions should show `PERSONAL_MATCH` (non-Approach) with score >= 50

### Step 5.2: Customize the Smart Suggestion card action buttons per sub-tab
- The `SuggestedMatchCard` currently shows different buttons based on match type and payment method
- Verify that the correct actions appear in each sub-tab context:
  - **Needs Review**: "Link" button (tag) or manual resolution dropdown
  - **Underpaid**: "Flag" button (for filing a claim)
  - **Deadhead**: "Link" button + context that it's a business expense
  - **Personal Use**: "Reject" button (for cash claims) or "Link" (for tag — auto-charges driver)

### Step 5.3: Update the "Auto-match All" button scope
- The "Auto-match All" button in `ReconciliationDashboard.tsx` currently processes ALL high-confidence matches
- Since Perfect Matches are now auto-confirmed (Phase 1), this button effectively handles the remaining types
- No code change needed here — it already filters by `confidence === 'high'`
- But update the button label/count to reflect the new reality (fewer items since PERFECT_MATCHes are gone)

### Step 5.4: Verify the Resolve dropdown works in each sub-tab
- The custom dropdown with "Find Match...", "Personal (Driver Pays)", "Write Off (Fleet Pays)", "Business Expense" should work in all sub-tabs
- Test specifically that `onManualResolve` correctly processes items and removes them from the correct sub-tab bucket

### Verification:
- After Phase 5, each sub-tab's Smart Suggestions should only show relevant match types
- Action buttons should be contextually appropriate
- Auto-match button count should be correct (excluding already-auto-confirmed Perfect Matches)

---

## Phase 6: Dashboard Card Updates & Final Polish

**Goal:** Update the financial summary cards and overall UX to reflect the new architecture.

### Step 6.1: Update financial summary calculations
- In `ReconciliationDashboard.tsx`, the 4 summary cards currently calculate amounts from `filteredUnreconciledTolls`
- Since PERFECT_MATCH tolls are now auto-reconciled (Phase 1), they no longer appear in `filteredUnreconciledTolls`
- The "Recovered" card should now include auto-matched amounts (they're in `reconciledTolls`)
- Verify that the "Claimable Loss" card correctly reflects only AMOUNT_VARIANCE items
- Verify that the "Driver Liability" card correctly reflects only PERSONAL_MATCH items + unreconciled unknowns

### Step 6.2: Add an auto-match summary indicator
- Below the financial cards (or as a banner), show a subtle informational message when auto-matches occurred:
  - e.g., "3 tolls were auto-matched this session" with an info icon
  - This reinforces to the admin that the system is working without requiring manual intervention

### Step 6.3: Update the top-level tab counts
- The "Unmatched Tolls" tab badge count should now be lower (since PERFECT_MATCHes are removed)
- The "Matched History" tab badge count should be higher (since auto-matched items are included)
- These counts are already computed from `filteredUnreconciledTolls.length` and `reconciledTolls.length` — they should auto-adjust since Phase 1 changes the underlying data

### Step 6.4: Verify the Unmatch flow for auto-matched items
- In `ReconciledTollsList.tsx`, when an admin un-matches an auto-matched toll:
  - The existing `onUnmatch` handler calls `unreconcile(tx)` which removes `tripId` and `isReconciled`
  - The toll should reappear in the correct sub-tab of Unmatched Tolls
  - The `autoMatched` metadata should be cleared so it doesn't get auto-matched again immediately
  - **Important**: In the server's `/unreconcile` endpoint, add logic to set a flag like `tx.metadata.autoMatchOverridden = true` so the auto-confirm logic in Phase 1 skips this toll in future loads

### Step 6.5: Update the source filter
- The source filter (All Sources / Tag Imports Only / Cash Claims Only) in UnmatchedTollsList should still work across all sub-tabs
- Verify the filter is applied BEFORE classification (it already is, since `filteredTolls` is used as input to the classifier)

### Step 6.6: Final edge case testing checklist
- [ ] Load page with 0 unmatched tolls — should show "All Tolls Reconciled" in Needs Review
- [ ] Load page with only PERFECT_MATCH tolls — all auto-reconciled, Unmatched shows empty
- [ ] Load page with mix of all match types — each sub-tab shows correct items
- [ ] Click "Refresh Data" — auto-confirm runs again, no duplicates
- [ ] Unmatch an auto-matched toll — it appears in Unmatched, does NOT get re-auto-matched
- [ ] Use the source filter in each sub-tab — correctly filters tag vs cash
- [ ] Pagination ("Show More") works correctly per sub-tab

### Verification:
- After Phase 6, the entire flow should work end-to-end:
  1. Page loads -> PERFECT_MATCHes auto-confirmed -> toast notification
  2. Unmatched Tolls shows 4 sub-tabs with correct counts
  3. Each sub-tab shows only relevant tolls with correct actions
  4. Matched History shows "Auto-matched" badge on auto-confirmed items
  5. Unmatching an auto-confirmed item sends it back to Unmatched and prevents re-auto-matching
  6. Financial cards reflect accurate numbers

---

## Status Tracker

| Phase | Description | Status |
|-------|------------|--------|
| 1 | Server-side auto-confirm PERFECT_MATCH | COMPLETE |
| 2 | Auto-matched badge in Matched History | COMPLETE |
| 3 | Sub-tab infrastructure in UnmatchedTollsList | COMPLETE |
| 4 | Classification logic & filtering per sub-tab | COMPLETE |
| 5 | Smart Suggestions scoped to sub-tabs | COMPLETE |
| 6 | Dashboard card updates & final polish | COMPLETE |