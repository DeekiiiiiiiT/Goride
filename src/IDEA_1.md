The Enterprise Architecture: What It Should Be
In a proper enterprise fleet management system, you separate data into three clean layers with strict rules about who reads what:

Layer 1: Raw Trip Records (trip:*)
Purpose: Operational source of truth. Distance, duration, route, status, ratings, timestamps.

Who reads it: Efficiency tab, Trip Analytics, Trip History, Trips tab — anything about what happened on the road.

Financial fields (amount, cashCollected, etc.) exist on the trip record for reference only — no screen should use them for financial reporting.

Layer 2: Financial Ledger (ledger:*)
Purpose: Financial source of truth. Every money movement is a ledger entry.

Who reads it: Overview earnings, Financials tab, Payout History, Platform earnings breakdown — anything about money.

Rule: The ledger is the only source of truth for any dollar amount shown anywhere in the app. If a screen shows a dollar sign, it reads from the ledger. No exceptions.

Layer 3: Cash Wallet Transactions (transaction:*)
Purpose: Cash management source of truth. Payments, floats, fuel, toll reimbursements.

Who reads it: Cash Wallet section, Payment Log, Transaction List.

Rule: These are manually-logged financial events (cash collection, float issued, etc.) that happen outside trip imports.

Layer 4: Driver Profiles (driver:*)
Purpose: Identity and HR data. Name, status, tier, documents, bank info.

Not a source of truth for earnings, trip counts, or performance — those are computed from Layers 1-3.

The Key Enterprise Rule
Each screen reads from exactly ONE layer for each type of data. Never mix.

In your current app, the Drivers List page computes earnings by looping over trip:* records client-side. In a clean architecture, it would call a server endpoint that reads ledger:* entries — same as the Driver Detail Overview does.

What "Clean" Looks Like
Screen	Reads from	Why
Any dollar amount anywhere	ledger:* (Layer 2)	Single financial source of truth
Trip counts for operational purposes (completion rate, activity patterns)	trip:* (Layer 1)	Operational source of truth
Distance, duration, ratings, efficiency	trip:* (Layer 1)	Operational source of truth
Cash owed, float, payments	transaction:* (Layer 3)	Cash management source of truth
Driver name, status, tier	driver:* (Layer 4)	Identity source of truth
What Needs to Change in Your App
The main violations of this clean architecture today:

Drivers List page computes earnings from trip:* instead of ledger:* — should call a server endpoint that aggregates ledger data per driver
Executive Dashboard receives trips as props and computes financial KPIs from raw trip amounts — should read from ledger
Transaction List uses allTrips (from trip:*) as grouping parents for transactions — this is actually fine architecturally (trips are the operational context for when a transaction happened), but it means deleting trips removes the grouping context
The metrics useMemo in DriverDetail computes periodEarnings, cashCollected, etc. from trip:* as a "legacy fallback" — this should be removed once ledger is fully trusted
The One-Sentence Summary
Your app should treat trip:* like an operational log (what happened), ledger:* like an accounting book (what money moved), and transaction:* like a cash register (what was paid/collected) — and every screen should pick exactly one book to read from for each type of data it displays, never mixing.

Want me to investigate exactly which trip:* and ledger:* records survived your delete (to diagnose why data is still showing), or would you prefer to discuss a plan for migrating the remaining screens to the clean architecture first?

