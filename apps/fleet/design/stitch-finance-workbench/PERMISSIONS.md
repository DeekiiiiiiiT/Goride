# Workbench permissions note

- **View Business Finance / Workbench:** same as before — `nav.financial_analytics` / page `business-finance` + `businessFinance` feature flag.
- **Approve/reject expenses:** unchanged writers (`api.saveTransaction` via `ExpenseApprovals`). Roles that could approve in FA can still approve here.
- **Settlement command / Export / deep-links:** read-only or navigation only — no new mutation permissions.
- Specialist desks (Bank, Fuel, Toll, Drivers Settlement) keep their existing permissions.
