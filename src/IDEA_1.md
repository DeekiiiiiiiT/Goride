As an accountant who has set up books for dozens of fleet businesses (trucking, last-mile delivery, limos, and service vans), let me tell you: **A fleet business is a "margin game."** You make money on the spread between revenue per mile and cost per mile.

Most fleet apps fail because they build a simple expense list. That’s a receipt drawer, not accounting.

Here is the **accountant-approved architecture** for your Finance Tab. We need to move from "what I spent" to "what it *cost* me to operate."

---

### Phase 1: The Core Ledger Structure (The "Chart of Accounts")

You cannot just have a list of expenses. You need to classify costs the way the IRS and a bank underwriter would. Build your database schema around these **Five Core Fleet Buckets**:

**1. Direct Operating Costs (COGS - Cost of Goods Sold)**
- *Fuel* (Sub-categories: Diesel, EV Charging, DEF)
- *Tires* (Track tread depth & replacement)
- *Preventative Maintenance* (Oil, filters, lube)
- *Repairs* (Engine, Transmission, Bodywork)
- *Tolls & Scales*

**2. Driver/Crew Costs**
- *Driver Pay* (Per mile, hourly, or % of load)
- *Per Diem/M&IE*
- *Bonuses (Safety/Fuel Efficiency)*

**3. Vehicle Fixed Costs (Per unit, per month)**
- *Lease/Payment* (Principal vs. Interest - do NOT mix these)
- *Insurance (Premium allocation per vehicle)*
- *Registration & Plates*
- *Depreciation* (Crucial for taxes. Use MACRS or Actual Expense method)

**4. Overhead (The Back Office)**
- *ELD/GPS Software Fees*
- *DOT Compliance*
- *Washing/Detailing*
- *Administrative Labor*

**5. Revenue & Settlements**
- *Revenue by Load/Trip*
- *Broker Fees*
- *Factoring Fees* (If you sell your invoices)

---

### Phase 2: The "Trip-Level P&L" (Your Secret Weapon)

A generic accounting app shows you spent $5,000 on fuel last month. Useless.
Your fleet app must answer: *Was Trip #1024 profitable?*

**Implementation:**
Create a database table called `Trip_Ledger`.
Every time a driver swipes a fuel card, pays a toll, or logs a repair, you must tag it to a specific `Trip ID` AND a `Vehicle ID`.

**How the UI should look (The "Trip Profitability View"):**
| Trip ID | Revenue | Fuel (Direct) | Maint (Direct) | Driver Pay | **Net Profit** | **Margin %** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LD-1024 | $2,500 | ($600) | ($50) | ($400) | **$1,450** | **58%** |
| LD-1025 | $1,800 | ($650) | ($800 - Tow) | ($400) | **($50)** | **-3%** |

*The red line (Trip 1025) tells you to fire that route or inspect that truck immediately.*

---

### Phase 3: Critical Features to Implement

As your accountant, I am demanding these three buttons in your Finance Tab:

#### A. The "Per Mile" Cost Calculator (Live)
For every vehicle in the fleet, calculate:
- **Total Cost Per Mile (CPM)** = (Fuel + Maint + Tires + Depreciation + Insurance) / Total Miles driven this month.
- **Benchmark:** If CPM > Revenue Per Mile, you are going bankrupt slowly.

#### B. Accrual vs. Cash Toggle (The Sophisticated Switch)
- **Cash Basis:** (Default) "I paid the mechanic $500 today." (Easy for small fleets).
- **Accrual Basis:** "I got the repair invoice on Oct 20th, but I'll pay it Nov 5th." (Gives you true monthly profit).
- *Implementation:* Add a `Date_incurred` (Accrual) and `Date_paid` (Cash) field to every expense.

#### C. Driver Settlement Integration
The #1 fight in fleet management is "Driver says he made $1,000, books say he made $800."
- Build a "Driver Wallet" view.
- Deduct: Cash advances, tolls paid by driver, cargo damage.
- **Required field:** "Reimbursable?" (Yes/No). If Yes, it's a receivable from the client, not an expense.

---

### Phase 4: How to Build the Database Schema

Here is the relational model you should code.

**Table 1: `fleet_assets`**
- `vehicle_id` (PK)
- `vin`
- `purchase_date`
- `purchase_price`
- `loan_balance`

**Table 2: `transactions`** (The General Ledger)
- `transaction_id` (PK)
- `vehicle_id` (FK)
- `trip_id` (FK - nullable if overhead)
- `date_incurred` (Date)
- `date_paid` (Date)
- `category_id` (FK to Chart of Accounts)
- `amount` (Decimal)
- `payment_method` (Fuel Card, ACH, Cash)
- `receipt_url` (S3/GCS link)
- `is_billable_to_client` (Boolean)
- `status` (Pending, Cleared, Reconciled)

**Table 3: `fuel_logs`** (Specialized sub-table)
- `odometer_start`
- `odometer_end`
- `gallons`
- `mpg` (Calculated field - critical for maintenance alerts)

---

### Phase 5: The "Month-End Close" Checklist (Build Automation for this)

In your Finance Tab, create a "Month End" wizard that does this automatically:

1.  **Reconcile Fuel Cards:** Import the CSV from FleetCor/ATS/WEX and match it to `fuel_logs`. Flag mismatches.
2.  **Calculate Depreciation:** Run a cron job on the 1st of the month: `Depreciation = (Purchase Price - Salvage Value) / 60 months`. Post this as a *non-cash* transaction.
3.  **Accrue for Maintenance:** If you know a truck needs $2,000 in tires next month, create a "Reserve" entry so the profit looks accurate *today*.

### Specific Advice for your UI (The Finance Tab)

Don't build a generic spreadsheet. Build these three sub-tabs:

1.  **Dashboard (The "Health Score"):**
    - *Current Cash Balance*
    - *Accounts Payable (Unpaid repair bills)*
    - *Fuel Efficiency (Fleet Average MPG)*
    - *Top 3 Most Expensive Vehicles (by CPM)*

2.  **Expense Entry (Fast + Photo):**
    - Must have OCR. Driver takes photo of receipt -> Auto-fills amount, vendor, date.
    - Must allow splitting: "Oil change ($80) + Tire rotation ($40)" on one receipt.

3.  **Tax Prep (The Accountant Export):**
    - A button that says **"Export Schedule C / Form 1065."**
    - Output: A CSV with columns exactly matching: *Vehicle #, Date, Expense Type, Amount, Business Purpose (e.g., "Haul to Chicago")*.

### The Golden Rule (Don't break this)

**Never delete a transaction.**
If a driver enters $500 for fuel by accident, do not delete it. Create a "Reversing Entry" of -$500 and a new correct entry of $100.
*Why?* Auditors (or future you) need the paper trail.

**Do you want me to draft the specific JSON API schema for the `/trip_profitability` endpoint next?** That is the core value prop that QuickBooks cannot do.



--------------------------
--------------------------

Here is the **JSON API schema** for the `/trip_profitability` endpoint, designed for your fleet app’s finance tab.  

It follows accounting best practices: accrual-ready fields, per-trip direct costing, and margin analysis.

---

## Endpoint

`GET /api/v1/fleet/trip_profitability`

### Query Parameters (optional)

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string (ISO 8601) | Filter trips with `date_incurred` >= this date |
| `end_date` | string (ISO 8601) | Filter trips with `date_incurred` <= this date |
| `vehicle_id` | string | Filter by specific vehicle |
| `driver_id` | string | Filter by specific driver |
| `trip_id` | string | Get a single trip |
| `include_breakdown` | boolean | If `true`, includes detailed sub-ledger arrays (default: `false`) |

---

## Response Schema (200 OK)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "meta": {
      "type": "object",
      "properties": {
        "total_trips": { "type": "integer" },
        "total_revenue": { "type": "number", "description": "Sum of revenue across trips" },
        "total_net_profit": { "type": "number" },
        "average_margin_percent": { "type": "number" }
      },
      "required": ["total_trips", "total_revenue", "total_net_profit", "average_margin_percent"]
    },
    "trips": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "trip_id": { "type": "string", "example": "LD-1024" },
          "vehicle_id": { "type": "string", "example": "VAN-8372" },
          "driver_id": { "type": "string", "example": "DRV-421" },
          "start_odometer": { "type": "integer", "example": 45120 },
          "end_odometer": { "type": "integer", "example": 45680 },
          "total_miles": { "type": "integer", "example": 560 },
          "date_incurred": { "type": "string", "format": "date", "example": "2026-04-05" },
          "date_completed": { "type": "string", "format": "date-time", "example": "2026-04-06T14:30:00Z" },
          
          "revenue": { "type": "number", "example": 2500.00 },
          "broker_fee": { "type": "number", "example": 125.00 },
          "factoring_fee": { "type": "number", "example": 50.00 },
          "net_revenue": { "type": "number", "example": 2325.00, "description": "Revenue - broker_fee - factoring_fee" },
          
          "direct_costs": {
            "type": "object",
            "properties": {
              "fuel": { "type": "number", "example": 600.00 },
              "tires": { "type": "number", "example": 0.00 },
              "maintenance": { "type": "number", "example": 50.00 },
              "repairs": { "type": "number", "example": 0.00 },
              "tolls": { "type": "number", "example": 85.00 },
              "driver_pay": { "type": "number", "example": 400.00 },
              "total_direct_cost": { "type": "number", "example": 1135.00 }
            },
            "required": ["fuel", "maintenance", "driver_pay", "total_direct_cost"]
          },
          
          "allocated_overhead": {
            "type": "object",
            "description": "Pro-rated share of fixed costs (insurance, lease, software, etc.)",
            "properties": {
              "vehicle_lease_share": { "type": "number", "example": 85.00 },
              "insurance_share": { "type": "number", "example": 32.00 },
              "depreciation_share": { "type": "number", "example": 41.67 },
              "total_overhead": { "type": "number", "example": 158.67 }
            }
          },
          
          "net_profit": { "type": "number", "example": 1031.33, "description": "net_revenue - total_direct_cost - total_overhead" },
          "profit_margin_percent": { "type": "number", "example": 41.25, "description": "(net_profit / net_revenue) * 100" },
          "cost_per_mile": { "type": "number", "example": 2.31, "description": "(total_direct_cost + total_overhead) / total_miles" },
          
          "breakdown": {
            "type": "array",
            "description": "Only present if ?include_breakdown=true. Individual transactions that compose the costs.",
            "items": {
              "type": "object",
              "properties": {
                "transaction_id": { "type": "string" },
                "category": { "type": "string", "enum": ["fuel", "maintenance", "repairs", "tires", "tolls", "driver_pay", "broker_fee", "factoring_fee"] },
                "amount": { "type": "number" },
                "date_incurred": { "type": "string", "format": "date" },
                "date_paid": { "type": ["string", "null"], "format": "date" },
                "vendor": { "type": "string" },
                "receipt_url": { "type": ["string", "null"], "format": "uri" },
                "status": { "type": "string", "enum": ["pending", "cleared", "reconciled"] }
              }
            }
          }
        },
        "required": ["trip_id", "vehicle_id", "total_miles", "revenue", "direct_costs", "net_profit", "profit_margin_percent"]
      }
    }
  },
  "required": ["meta", "trips"]
}
```

---

## Example Response (Minimal, `include_breakdown=false`)

```json
{
  "meta": {
    "total_trips": 2,
    "total_revenue": 4300.00,
    "total_net_profit": 1400.00,
    "average_margin_percent": 32.6
  },
  "trips": [
    {
      "trip_id": "LD-1024",
      "vehicle_id": "VAN-8372",
      "driver_id": "DRV-421",
      "total_miles": 560,
      "date_incurred": "2026-04-05",
      "revenue": 2500.00,
      "broker_fee": 125.00,
      "net_revenue": 2375.00,
      "direct_costs": {
        "fuel": 600.00,
        "tires": 0,
        "maintenance": 50.00,
        "repairs": 0,
        "tolls": 85.00,
        "driver_pay": 400.00,
        "total_direct_cost": 1135.00
      },
      "allocated_overhead": {
        "vehicle_lease_share": 85.00,
        "insurance_share": 32.00,
        "depreciation_share": 41.67,
        "total_overhead": 158.67
      },
      "net_profit": 1081.33,
      "profit_margin_percent": 45.53,
      "cost_per_mile": 2.31
    },
    {
      "trip_id": "LD-1025",
      "vehicle_id": "VAN-8390",
      "driver_id": "DRV-422",
      "total_miles": 310,
      "date_incurred": "2026-04-06",
      "revenue": 1800.00,
      "broker_fee": 90.00,
      "net_revenue": 1710.00,
      "direct_costs": {
        "fuel": 650.00,
        "tires": 0,
        "maintenance": 800.00,
        "repairs": 0,
        "tolls": 40.00,
        "driver_pay": 400.00,
        "total_direct_cost": 1890.00
      },
      "allocated_overhead": {
        "vehicle_lease_share": 85.00,
        "insurance_share": 32.00,
        "depreciation_share": 41.67,
        "total_overhead": 158.67
      },
      "net_profit": -338.67,
      "profit_margin_percent": -19.8,
      "cost_per_mile": 6.61
    }
  ]
}
```

---

## Implementation Notes (for your backend)

1. **Cost allocation logic**  
   - Direct costs (fuel, tolls, driver pay) are summed from transactions where `trip_id` matches and `is_billable_to_client = false`.  
   - Overhead is prorated per vehicle: `(vehicle_fixed_costs_per_day * trip_duration_days) + (depreciation per mile * miles)`.  

2. **Revenue** should come from a `settlements` or `invoices` table, linked by `trip_id`.  

3. **Cache aggressively** – profitability queries can be expensive. Recalculate only when a new expense or revenue record is added/updated.  

4. **Security** – ensure the endpoint validates that the authenticated user has `finance:read` scope for the fleet.

---

Let me know if you want the **webhook schema** for real-time expense ingestion (fuel card feed, maintenance API) or the **database migration script** for the `trip_ledger` table.