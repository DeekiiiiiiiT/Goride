# Tag top-up vs P&L (Recon P5)

## Question

Do toll tag **top-ups** double-count in Business Finance P&L alongside **tag usage**?

## Finding

**No double-count on the canonical path.**

1. **`toll_controller` / `saveTollLedgerEntry`** — Business Finance canonical append is **usage/refund only**; `top_up` is deliberately excluded from that P&L writer (comment at save time). Top-ups still post to the unified ledger as `tag_top_up` (prepaid clearing), not as operating expense.

2. **`buildCanonicalGenericTransactionEvent`** — Uses `classifyPostedBusinessTransaction`. Toll categories were implicit nulls (not in `EXPENSE_CATEGORIES`). P5 adds explicit exclusions for `Toll Top-up`, `Toll Usage`, `Toll Refund`, etc., so legacy `transaction:*` rows with category **Toll Top-up** cannot enter canonical via the generic bridge.

3. **Tag usage** — Recognized as toll spend through the dedicated toll canonical path, not as a manual business expense.

## Residual risk

Very old data entered only as a generic **Expense** with a non-toll category label could still hit P&L; that is outside the toll top-up path. Ops should keep top-ups on the toll ledger / Toll Top-up import, not manual “Other expenses.”

## Recon implication

The **Tag account** wizard step roll-forward treats top-ups as **balance funding** (opening + top-ups − usage = expected closing). They are not attributed to rideshare vs delivery line spend.
