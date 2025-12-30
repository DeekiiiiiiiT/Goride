a ride-share fleet company with detailed profit tracking and driver performance KPIs.

---

## **PHASE 1: CORE STRUCTURE & USER FLOWS**

### **1.1 User Types & Access**
- **Admin/Company View** (Web Dashboard)
- **Driver View** (Mobile App + Web Portal)
- **Separate login flows** with role-based dashboards

### **1.2 Main Navigation Structure**
```
Admin Dashboard:
├── Profit Dashboard (Home)
├── Driver Management
├── Expense Tracking
├── Reports & Analytics
└── Settings (Tiers, Splits, Rules)

Driver App:
├── My Earnings (Home)
├── Weekly Breakdown
├── Tier Progress
├── Expense Log
└── History
```

---

## **PHASE 2: COMPANY PROFIT DASHBOARD**

### **2.1 Dashboard Header**
```
[Logo] Ride-Share Fleet Management
Date Range Selector: [Weekly] [Monthly] [Quarterly] [Custom]
Quick Stats Cards:
• Total Revenue: $XX,XXX
• Net Profit: $X,XXX
• Profit Margin: XX%
• Active Drivers: XX
```

### **2.2 Profit Breakdown Section**
**Visual Layout: 2-Column with Charts**

**Left Column - Income Statement:**
```
TOTAL REVENUE
└── Driver Earnings: $XX,XXX
└── Other Income: $X,XXX

EXPENSES
├── Fixed Expenses
│   ├── Maintenance: $X,XXX
│   ├── Insurance: $X,XXX
│   ├── Amber Connect: $XXX
│   └── Hawkeye: $X,XXX
│
├── Fuel Expenses
│   ├── Company Share (50%): $X,XXX
│   ├── Driver Share (50%): $X,XXX
│   └── Misc Fuel: $XXX
│
└── Other Expenses: $XXX

DRIVER PAYOUTS: $XX,XXX
(Tier-based calculation)

NET PROFIT: $X,XXX
```

**Right Column - Visualization:**
1. **Pie Chart**: Expense Breakdown (Fixed vs Variable vs Driver Payout)
2. **Bar Chart**: Revenue vs Profit Trend (Last 8 weeks)
3. **Progress Bar**: Current Month vs Target Profit
4. **Comparison Cards**: 
   - This Week vs Last Week
   - This Month vs Last Month

### **2.3 Fuel Split Calculator Module**
```
FUEL SPLIT CALCULATOR
Total Fuel Charges: $[Input Field]
└── Company Share (50%): $[Auto-calc]
└── Driver Share (50%): $[Auto-calc]

Additional Splits:
• Company Misc Usage: 100% Company
• Personal Fuel: 100% Driver
• Fuel Misc: 50/50 Split
```

---

## **PHASE 3: DRIVER KPI DASHBOARD**

### **3.1 Driver Home Screen (Mobile-First)**
**Header:**
```
[Driver Photo] Welcome, [Driver Name]
Current Tier: [Tier Level] - [XX% to next tier]
Progress Bar: [===============] XX%
```

**Main Stats Cards:**
```
THIS WEEK'S EARNINGS
Gross: $X,XXX
Tips: $XXX
Cash Collected: $XXX
Net Payout: $X,XXX
[View Breakdown Button]
```

### **3.2 Tier Progress Section**
```
TIER PROGRESS
Current Tier: [Tier Name] - [XX% Share]
Cumulative Earnings: $XX,XXX / $XX,XXX (Next Tier)

Tier Structure Visual:
[ ] Tier 1: $0-75K → 25% Share
[✔] Tier 2: $75K-150K → 27% Share
[Current] Tier 3: $150K-225K → 29% Share
[ ] Tier 4: $225K-300K → 31% Share
[ ] Tier 5: $300K-375K → 33% Share
[ ] Tier 6: $375K+ → 35% Share
```

### **3.3 Earnings Breakdown Page**
```
WEEK OF [Date]
EARNINGS
├── Total Earnings: $X,XXX
├── Promotions: $X
├── Tips: $XXX
└── Cash Collected: $XXX

EXPENSES (Your Share)
├── Operating Fuel (50%): $XXX
├── Personal Fuel (100%): $XXX
├── Fuel Misc (50%): $XX
└── Vehicle Damage: $XXX

TIER CALCULATION
Cumulative before this week: $XX,XXX
This week's earnings: $X,XXX
New cumulative: $XX,XXX
Tier payout: $XXX

NET TO YOU: $X,XXX
```

### **3.4 Expense Tracking (Driver Side)**
```
LOG EXPENSES
[Camera Icon] Upload Receipt
Category: [Dropdown - Fuel, Maintenance, Other]
Amount: $[Input]
Date: [Date Picker]
Notes: [Text Field]

EXPENSE HISTORY
[ ] Week 1: $XXX
[ ] Week 2: $XXX
[ ] Week 3: $XXX
[Export to PDF Button]
```

---

## **PHASE 4: ADMIN DRIVER MANAGEMENT**

### **4.1 Driver List View**
```
DRIVERS
[Search Bar] [Add Driver Button]

Table Columns:
• Driver Name
• Vehicle
• Current Tier
• This Week Earnings
• Cumulative Earnings
• This Week Payout
• Status (Active/Inactive)
• [Actions: View Details, Edit, Deactivate]
```

### **4.2 Individual Driver Management**
```
DRIVER PROFILE
[Driver Info Card]
[Performance Charts]

EARNINGS HISTORY TABLE
Week | Total Earnings | Tier | Payout | Actions
-----|---------------|------|--------|--------

TIER MANAGEMENT (Admin Override)
[Manual Tier Adjustment Toggle]
[Override Reason Field]
[Save Changes Button]
```

### **4.3 Tier Configuration Panel**
```
TIER SETTINGS
[Add New Tier Button]

Tier Configuration Table:
Level | Threshold | Profit Share % | Edit | Delete
------|-----------|---------------|------|-------
1     | $75,000   | 25%           | [✎]  | [🗑]
2     | $150,000  | 27%           | [✎]  | [🗑]
...etc

[Test Tier Calculator Button]
[Save All Changes]
```

---

## **PHASE 5: REPORTS & ANALYTICS**

### **5.1 Report Generator**
```
GENERATE REPORT
Report Type: [Weekly Summary | Monthly P&L | Driver Performance]
Date Range: [From] [To]
Format: [PDF | Excel | Email]
Include: [✓ All Drivers] [✓ Expense Details] [✓ Tier Calculations]

Preview & Generate Button
```

### **5.2 Analytics Dashboard**
```
PERFORMANCE METRICS
• Average Profit Margin: XX%
• Best Performing Driver: [Name] - $X,XXX/week
• Highest Expense Category: [Category] - XX%
• Tier Distribution: [Pie Chart of drivers per tier]

TREND ANALYSIS
[Line Chart: Profit Margin over last 12 weeks]
[Bar Chart: Driver earnings comparison]
[Heat Map: Busiest earning days/times]
```

---

## **PHASE 6: SETTINGS & CONFIGURATION**

### **6.1 Company Settings**
```
FINANCIAL SETTINGS
• Default Fuel Split: [50%] Company / [50%] Driver
• Expense Categories: [Manage List]
• Tax Rate: [X]%

NOTIFICATION SETTINGS
• Weekly Reports: [✓ Email] [✓ In-App]
• Driver Payout Alerts: [✓ Enabled]
• Expense Threshold Alerts: [>$XXX]

USER MANAGEMENT
• Add/Remove Admins
• Role Permissions
```

---

## **VISUAL DESIGN GUIDELINES**

### **Color Scheme:**
- **Primary**: Professional blue (#2563EB) for admin, green (#10B981) for positive numbers
- **Secondary**: Orange for warnings, red for expenses, purple for tiers
- **Neutrals**: Gray scale for backgrounds and text

### **Typography:**
- **Headings**: Inter Bold
- **Body**: Inter Regular
- **Numbers**: Roboto Mono for financial data

### **Components Library:**
- Cards with subtle shadows
- Progress bars with gradient fills
- Interactive data tables with hover states
- Modal windows for detailed views
- Mobile-responsive grids

### **Interactive Elements:**
- **Hover States**: All clickable items
- **Loading States**: For calculations
- **Empty States**: For new users/no data
- **Success/Error Messages**: For actions

---

## **USER TESTING SCENARIOS**

1. **Admin Flow**: Generate weekly profit report
2. **Driver Flow**: Check tier progress and calculate next week's potential earnings
3. **Setup Flow**: Configure new tier system
4. **Expense Flow**: Driver logs fuel expense, admin reviews and allocates

---

## **DELIVERABLES**
1. **Complete Figma File** with:
   - Style guide & component library
   - Admin dashboard (desktop)
   - Driver app (mobile + responsive web)
   - All user flows connected
   - Interactive prototypes for key flows

2. **Design Documentation**:
   - User personas
   - User journey maps
   - Design rationale
   - Implementation notes for developers

---

**Key Design Principles:**
- **Clarity First**: Financial data must be immediately understandable
- **Action-Oriented**: Every screen should have clear next steps
- **Consistency**: Same calculations shown in same way everywhere
- **Transparency**: Drivers should understand exactly how their payout is calculated
- **Scalability**: Design should work for 10 drivers or 1000 drivers

Would you like me to elaborate on any specific screen or provide more detailed wireframe descriptions for any section?