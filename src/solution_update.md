# Phase 8: Claimable Loss UI Improvements

## Phase 8.1: Component Analysis & Setup
- [x] Locate `LossList` component and `ClaimableLoss` page.
- [x] Verify `api.unreconcileTollTransaction` availability.

## Phase 8.2: UI Transformation (Dropdown Menu)
- [x] Import `DropdownMenu`, `Tooltip` components in `LossList.tsx`.
- [x] Replace "View Match" button with a Dropdown Menu Trigger ("Actions").
- [x] Add "View Match" as the first menu item.
- [x] Add "Reverse" as the second menu item.
- [x] Ensure styling matches the design.

## Phase 8.3: Logic Implementation (Reverse Action)
- [x] Implement `handleReverseLoss` in `ClaimableLoss.tsx` using `api.unreconcileTollTransaction`.
- [x] Pass `handleReverseLoss` to `LossList` via props.
- [x] Connect the "Reverse" menu item to this handler.

## Phase 8.4: Tooltip & UX
- [x] Add a Tooltip to the "Reverse" menu item explaining its function ("Send back to Toll Reconciliation").
- [x] Add toast notifications for success/failure.
- [x] Ensure the list refreshes after the action.

## Phase 8.5: Verification
- [x] Verify "View Match" functionality.
- [x] Verify "Reverse" functionality (removes from list, unlinks transaction).
