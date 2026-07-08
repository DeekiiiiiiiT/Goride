# Screen Briefs — Toll Reconciliation Sync Fix

## 1. Platform Source Badge Strip
Compact status strip for history rows. Three platform chips: **UB** (black/white Uber), **RM** (indigo Roam), **ID** (green InDrive). When toll platform ≠ refund platform, show both: “Uber toll / Roam refund”. High usability, tiny footprint, readable on mobile widths.

## 2. Undo Apply to Underpaid Dialog
Modal titled “Undo Applied Refund”. Amber warning icon. Summary: “$275 from Uber trip applied to $285 TransJam toll”. Checklist of what happens: trip returns to Unlinked Refunds; claim reverts to prior status; if prior was Charge Driver, warn charge will reinstate on driver financials. Secondary Cancel + destructive Confirm Undo. Frictionless — one confirm, clear consequences.

## 3. Platform Mismatch Warning Banner
Inline amber banner inside Apply drawer. Copy: “Platform mismatch: This Uber refund will be applied to a toll from a Roam trip.” Checkbox “Proceed anyway” required before apply. No cards clutter — single purpose banner.

## 4. Unified Resolution Audit Card
Card linking Source Trip (platform, date, driver, +$refund) → Target Toll/Claim (plaza, cost, status) with applied/leftover amounts, timestamp, admin. Optional Undo. Used in Resolved refunds + Claims History.

## 5. Enhanced Matched History Row
Table section mock: columns Toll Date, Description, Platform, **Refund Source** (Trip Match / Unlinked Refund / Dispute Refund), Paid Via, Recovered, Net Loss, Action. Row examples mix Uber Trip Match and Unlinked Refund with source platform chip.
