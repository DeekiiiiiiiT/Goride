# Toll Reconciliation Sync Fix — Stitch Reference

**Project:** Roam Fleet APP (`projects/3587123323600813385`)  
**Feature:** Toll Reconciliation Sync Fix  
**Plan:** Cursor plan `toll_reconciliation_sync_fix_b27c2293`  
**Model:** `GEMINI_3_1_PRO`  
**Device:** Desktop (fleet ops console)

| # | Screen | Stitch screen ID | Device | Status |
|---|--------|------------------|--------|--------|
| 1–5 | Sync Fix showcase (badges, undo, mismatch, audit, matched row) | `9f252910615c4a0c928e8fa2e9877e64` (polished) · original `a8536914191e40ca87a665a9c5f1499b` | Desktop | Done |
| Design system | Precision Operations | `assets/d393c21ec4be4c768bf9a2e8060fd674` | — | Applied |

**React targets (exported):**
- `PlatformSourceBadge.tsx`
- `UndoApplyToUnderpaidDialog.tsx`
- `PlatformMismatchWarning.tsx`
- `UnifiedResolutionAuditCard.tsx`
- Enhanced `ReconciledTollsList.tsx` (Refund Source column)
- Wired `ResolvedRefundsList.tsx` + `RefundResolutionDrawer.tsx`

**Design language:** Indigo primary (`indigo-600`), Emerald success, Amber warning, Rose destructive. Slate neutrals. Existing Fleet shadcn patterns.

**PO note:** Backend Phases 2–6 shipped with React shells. Enable **Undo Apply to Underpaid** in Toll Automation Settings before testing undo.
