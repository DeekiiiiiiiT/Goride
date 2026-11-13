# Cursor prompt — Toll Phase 3, P3-R3b: fixes from Claude's check of P3-R3

Claude checked P3-R3. These are right:
- Step 1 sends tag statements and top-ups only to the new import;
- Uber goes through the old import, then the toll import;
- the source is marked received through `registerReconImport`;
- the late-item `carry_forward` bodies;
- the take-back's three-way routing;
- `REOPEN_INSTEAD`;
- the plate aliases (server and lookup).

Fix these 5. Do not change any migration. Do not commit, branch or push. Don't run `pnpm test:toll` or reset the database.

**1. A refused command still shows a success message** (all of `tolls-v2/`).
- **Cause:** `runCommand` returns `null` on `VERSION_CHANGED`, but the handlers show their success toast anyway: "Matched" (`applyTopSuggestion`), "Moved to the open week" (`handleCarryLate`), "Take-back recorded" (`handleRecordTakeBack`), "Receipt checked", the decision toasts, and the rest. The screen then says something happened when the server refused it.
- **Fix:** every handler checks the result. `null` → no success toast, no follow-up command (for example, don't run `correct_charge_amount` after a refused `verify_cash_receipt`), and the dialog stays open on the refreshed data.
- **Test:** a mocked `VERSION_CHANGED` on Confirm, on a late-item move and on a take-back shows the "Someone else changed this toll" card and **no** success toast.

**2. A command that fails with any other code leaves an unhandled promise.**
- **Cause:** `runCommand` shows an error toast and throws, but the handlers are called with `void handler()` and don't catch it.
- **Fix:** each handler catches. The error toast is already shown; the dialog stays open so the person can try again. There must be no unhandled rejection in the tests (make vitest fail on unhandled rejections for this folder, if it doesn't already).

**3. "Confirm all sure matches" stops at the first failed row** (`runConfirmAllSure`).
- **Cause:** a thrown error (not `VERSION_CHANGED`) ends the loop, so the remaining sure matches never run. The audit says the rest still go through.
- **Fix:** catch each row; count `matched`, `changed` (`VERSION_CHANGED`) and `failed`. The toast reads "4 matched · 1 changed · 0 failed — list refreshed" (leave out zero parts except "matched").
- **Test:** one row throws, and the next row still runs.

**4. "Owner only" is not true.**
- **Cause:** the server allows `reopen_week` for `toll.manage` (owner and manager), and the button already checks `toll.manage`. The text "Owner only" under "Reopen tolls" is wrong.
- **Fix:** change the line to "Owners and managers can reopen". Keep the permission check as it is.

**5. Toll health is in the wrong menu.**
- **Cause:** the design (Screen 11) has it under **Money › Tolls**: the Money tab is active, and the breadcrumb is "Money › Tolls". P3-R3 put it under Business Finance next to Week Reconciliation.
- **Fix:** move the nav leaf to the Money group, as "Tolls". The breadcrumb reads "Money › Tolls". Keep the same show-when rule (recon v2 on, toll v2 on, permission). "Open" on a week still goes to Week Reconciliation step 3 for that week.

## Run
- the `tolls-v2`, Step 1 and Toll health vitest;
- the Fleet typecheck, with 0 errors in the touched files.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
