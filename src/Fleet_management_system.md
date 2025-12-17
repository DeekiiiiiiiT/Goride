# Fleet Management System

(# **COMPLETE FLEET MANAGEMENT SYSTEM IMPLEMENTATION GUIDE FOR FIGMA MAKE (NON-CODER EDITION)**

## **SYSTEM OVERVIEW**
You are building a fleet management system that processes Uber CSV reports to show critical metrics. The system will automatically import files, calculate key performance indicators, and display them on dashboards.

---

## **PHASE 1: SYSTEM SETUP & FILE HANDLING**
**Goal:** Create a system to receive and organize Uber CSV files

### **Step 1.1: Create File Upload System**
- Make a "File Upload" module where users can drag and drop Uber CSV files
- Set up a folder structure in Google Drive named:
  ```
  Uber_Fleet_Data/
    ├── Raw_Reports/ (Original files kept for backup)
    ├── Processed_Data/ (Files being worked on)
    ├── Archived_Reports/ (Old files moved here)
    └── Error_Files/ (Problem files go here)
  ```

### **Step 1.2: File Type Identification**
- Create a module that reads the first line of each CSV to identify report type
- Tag each file with its report type using these identifiers:
  ```
  Payment_Order → "Transaction Details"
  Payment_Driver → "Driver Payments"
  Payment_Organization → "Fleet Payments"
  Driver_Quality → "Driver Performance"
  Driver_Activity → "Driver Hours"
  Trip_Activity → "Trip Details"
  Vehicle_Performance → "Vehicle Stats"
  ```

### **Step 1.3: Validation System**
- Check each CSV has the correct columns (based on Uber's documentation)
- Create error messages for:
  - Missing required columns
  - Empty files
  - Wrong file format (not CSV)
- Send email notifications for file processing status

### **Step 1.4: Date Processing**
- Extract date information from each file (either from filename or content)
- Tag all data with "Report Date" and "Processing Date"
- Create a "Data Date" field for historical tracking

---

## **PHASE 2: FINANCIAL DATA PROCESSING**
**Goal:** Process payment reports and calculate money metrics

### **Step 2.1: Process Payment_Order.csv**
- Extract these columns: Transaction UUID, Driver UUID, Trip UUID, Earnings, Payouts, Cash Collected
- Calculate for each transaction:
  ```
  Net Transaction = Earnings - Payouts
  Cash Percentage = (Cash Collected ÷ Earnings) × 100
  Transaction Type = "Completed Trip" / "Fare Adjustment" / "Tip" / "Settlement"
  ```

### **Step 2.2: Process Payment_Driver.csv**
- Extract: Driver UUID, Total Earnings, Refunds & Expenses, Payouts, Cash Collected
- Calculate for each driver:
  ```
  Net Earnings = Total Earnings - Refunds & Expenses
  Cash Flow Risk = IF(Cash Collected ÷ Total Earnings > 0.3, "HIGH", "OK")
  Expense Ratio = (Refunds & Expenses ÷ Total Earnings) × 100
  ```

### **Step 2.3: Process Payment_Organization.csv**
- Extract: Organization Balance, Total Earnings, Net Fare
- Calculate:
  ```
  Period Change = End Balance - Start Balance
  Fleet Profit Margin = (Net Fare ÷ Total Earnings) × 100
  Cash Position = Cash Collected ÷ Total Earnings
  ```

### **Step 2.4: Financial Summary Creation**
- Create a daily financial summary with:
  ```
  Total Fleet Earnings Today: [Sum of all driver earnings]
  Average Earnings Per Driver: [Total ÷ Driver Count]
  Total Expenses Today: [Sum of Refunds & Expenses]
  Cash Collected Today: [Total cash]
  Top 3 Earning Drivers: [List names and amounts]
  ```

---

## **PHASE 3: DRIVER PERFORMANCE PROCESSING**
**Goal:** Calculate driver quality and productivity metrics

### **Step 3.1: Process Driver_Quality.csv**
- Extract: Trips Completed, Confirmation Rate, Cancellation Rate, Completion Rate, Driver Ratings
- Calculate performance tiers:
  ```
  IF Confirmation Rate > 0.85 AND Cancellation Rate < 0.03 → "PLATINUM"
  IF Confirmation Rate 0.70-0.85 AND Cancellation Rate 0.03-0.05 → "GOLD"
  IF Confirmation Rate 0.50-0.70 AND Cancellation Rate 0.05-0.08 → "SILVER"
  ELSE → "NEEDS TRAINING"
  ```

### **Step 3.2: Process Driver_Activity.csv**
- Extract: Trips Completed, Online Hours, OnTrip Hours
- Convert time format (Days:Hours:Minutes) to decimal hours
- Calculate:
  ```
  Utilization % = (OnTrip Hours ÷ Online Hours) × 100
  Trips Per Hour = Trips Completed ÷ Online Hours
  Idle Time = Online Hours - OnTrip Hours
  ```

### **Step 3.3: Create Driver Scorecards**
- Combine data from all sources for each driver
- Create a score from 0-100 using this formula:
  ```
  Driver Score = 
    (Confirmation Rate × 25) +
    ((1 - Cancellation Rate) × 25) +
    (Completion Rate × 20) +
    (Rating ÷ 5 × 20) +
    (Utilization % × 10)
  ```

### **Step 3.4: Performance Alerts Setup**
- Set up automatic alerts when:
  ```
  Confirmation Rate < 50% → "CRITICAL - Low Acceptance"
  Cancellation Rate > 10% → "HIGH - Too Many Cancellations"
  Utilization < 40% → "WARNING - Low Activity"
  Rating < 4.5 → "ALERT - Customer Service Issue"
  ```

---

## **PHASE 4: TRIP DATA ANALYSIS**
**Goal:** Analyze trip patterns and efficiency

### **Step 4.1: Process Trip_Activity.csv**
- Extract: Trip Request Time, Drop Off Time, Pickup Address, Drop Off Address, Distance, Status
- Calculate for completed trips:
  ```
  Trip Duration = Drop Off Time - Request Time
  Speed = Distance ÷ Trip Duration
  Time of Day = Extract hour from Request Time
  ```

### **Step 4.2: Geographic Analysis**
- Group trips by pickup areas (extract city/area from addresses)
- Identify:
  ```
  Most Frequent Pickup Areas (Top 5)
  Most Frequent Drop-off Areas (Top 5)
  Most Profitable Routes (Earnings ÷ Distance)
  Dead Zones (Areas with long wait times)
  ```

### **Step 4.3: Trip Pattern Recognition**
- Calculate averages:
  ```
  Average Trip Distance: [All completed trips]
  Average Trip Duration: [All completed trips]
  Peak Hours: [Hours with most trips]
  Most Common Trip Status: % Completed vs % Cancelled
  ```

### **Step 4.4: Cancellation Analysis**
- Separate trips by status: completed, rider_cancelled, driver_cancelled
- Calculate cancellation rates by:
  ```
  Time of Day
  Driver
  Location
  ```
- Flag drivers with high cancellation rates in specific areas

---

## **PHASE 5: VEHICLE PERFORMANCE PROCESSING**
**Goal:** Track vehicle efficiency and utilization

### **Step 5.1: Process Vehicle_Performance.csv**
- Extract: Vehicle Plate, Total Earnings, Earnings Per Hour, Hours Online, Hours On Trip, Total Trips
- Calculate:
  ```
  Vehicle Utilization = Hours On Trip ÷ Hours Online
  Cost Efficiency = Earnings Per Hour ÷ [Your Target Rate]
  Productivity = Total Trips ÷ Hours Online
  ```

### **Step 5.2: Vehicle Ranking System**
- Rank vehicles by:
  ```
  1. Earnings Per Hour (Highest first)
  2. Utilization % (Highest first)
  3. Trips Per Hour (Highest first)
  ```
- Create color coding:
  ```
  Green: Top 25% performers
  Yellow: Middle 50%
  Red: Bottom 25%
  ```

### **Step 5.3: Maintenance Scheduling**
- Track hours for each vehicle
- Set up alerts:
  ```
  After 100 Hours Online → "Schedule Basic Check"
  After 250 Hours Online → "Schedule Maintenance"
  After 500 Hours Online → "Schedule Major Service"
  ```

### **Step 5.4: Vehicle-Driver Assignment Analysis**
- Match vehicle performance with driver assignments
- Identify:
  ```
  Which drivers perform best in which vehicles
  Vehicle-driver combinations with highest earnings
  Underperforming vehicle-driver pairs
  ```

---

## **PHASE 6: DATA INTEGRATION & CONSOLIDATION**
**Goal:** Combine all data into unified views

### **Step 6.1: Create Driver Master Records**
- Combine data from all reports for each Driver UUID
- Create a single driver record with:
  ```
  Personal Info: Name, Contact (from reports)
  Financial: Total Earnings, Average Daily Earnings
  Performance: Score, Tier, Ratings
  Activity: Avg Hours/Day, Avg Trips/Day
  Vehicle: Current Assignment
  ```

### **Step 6.2: Create Daily Summary Tables**
- Build daily roll-up tables:
  ```
  Daily Fleet Summary:
    Date, Total Drivers Active, Total Trips, Total Earnings
    Total Expenses, Net Profit, Average Driver Score
    
  Daily Driver Performance:
    Date, Driver, Earnings, Trips, Hours, Score
  ```

### **Step 6.3: Historical Trend Tables**
- Store daily metrics to track trends
- Calculate week-over-week and month-over-month changes
- Identify patterns (best days, seasonal trends)

### **Step 6.4: Data Quality Checks**
- Create validation rules:
  ```
  All Driver UUIDs must exist in all relevant reports
  Financial totals must match across reports
  Time calculations must be logical
  ```
- Generate data quality reports weekly

---

## **PHASE 7: DASHBOARD CREATION**
**Goal:** Build visual dashboards for monitoring

### **Step 7.1: Executive Dashboard**
**Layout:**
- Top Row: Key Metrics Today
  ```
  [Large Number] Total Earnings Today
  [Large Number] Active Drivers Now
  [Large Number] Trips Completed Today
  [Large Number] Fleet Score Average
  ```

- Middle Row: Performance Overview
  ```
  Left: Driver Performance Distribution (Pie Chart: Platinum/Gold/Silver/Bronze)
  Center: Daily Earnings Trend (Line Chart - Last 7 days)
  Right: Top 5 Drivers by Earnings (Bar Chart)
  ```

- Bottom Row: Alerts & Issues
  ```
  List of current alerts with priority (High/Medium/Low)
  Today's cancellations by reason
  Low performers needing attention
  ```

### **Step 7.2: Driver Performance Dashboard**
**Layout:**
- Driver Selection Dropdown (Choose driver)
- Driver Profile Card (Photo, Name, Tier, Score)
- Performance Metrics Grid:
  ```
  Acceptance Rate: [Value] vs Target: 85%
  Cancellation Rate: [Value] vs Target: <5%
  Completion Rate: [Value] vs Target: 95%
  Customer Rating: [Value] vs Target: 4.8
  Earnings Today: [Value] vs Average: [Value]
  Utilization %: [Value] vs Target: 60%
  ```
- Performance History Chart (Last 30 days trend)

### **Step 7.3: Financial Dashboard**
**Layout:**
- Financial Summary Cards:
  ```
  Total Revenue This Month
  Net Profit This Month
  Average Revenue Per Driver
  Expense Ratio
  Cash Percentage
  ```
- Revenue Breakdown (Pie Chart):
  ```
  UberX Service: [%]
  Other Services: [%]
  Tips: [%]
  Promotions: [%]
  ```
- Expense Analysis:
  ```
  Refunds: [Amount]
  Tolls: [Amount]
  Other Expenses: [Amount]
  ```

### **Step 7.4: Vehicle Dashboard**
**Layout:**
- Vehicle List Table with sortable columns:
  ```
  Plate | Vehicle | Driver | Earnings/Hour | Utilization | Status
  ```
- Utilization Heat Map (Color-coded by vehicle)
- Maintenance Schedule Calendar View
- Vehicle Performance Trends (Line chart per vehicle)

---

## **PHASE 8: ALERT & NOTIFICATION SYSTEM**
**Goal:** Create automated alerts and reports

### **Step 8.1: Real-time Alert Configuration**
- Set up alert rules in plain language:
  ```
  IF Driver_Confirmation_Rate < 50% THEN Alert = "Critical"
  IF Driver_Cancellation_Rate > 10% THEN Alert = "High"
  IF Vehicle_Utilization < 40% THEN Alert = "Warning"
  IF Daily_Earnings < [Target] THEN Alert = "Check"
  ```

### **Step 8.2: Alert Delivery System**
- Create alert delivery methods:
  ```
  Email Alerts: For all alerts
  SMS Alerts: For critical alerts only
  Dashboard Notifications: All alerts
  Weekly Summary Email: Every Monday morning
  ```

### **Step 8.3: Daily Morning Report**
- Automated email sent at 6 AM daily with:
  ```
  Yesterday's Performance Summary
  Top 3 Performing Drivers
  Bottom 3 Drivers Needing Attention
  Today's Alerts to Watch
  Weather & Traffic Impact Notice
  ```

### **Step 8.4: Weekly Performance Report**
- Automated email every Monday with:
  ```
  Week-over-Week Comparison
  Monthly Targets Progress
  Driver Performance Rankings
  Vehicle Utilization Summary
  Financial Summary vs Budget
  Recommendations for Next Week
  ```

---

## **PHASE 9: MAINTENANCE & MONITORING**
**Goal:** Keep system running smoothly

### **Step 9.1: System Health Monitoring**
- Daily check: Are new files being processed?
- Weekly check: Are all reports being imported?
- Monthly check: Data accuracy validation

### **Step 9.2: Update Procedures**
- Document how to add new report types
- Create backup procedures for all data
- Test new Uber report formats quarterly

### **Step 9.3: User Training Materials**
- Create simple guides:
  ```
  How to Upload Reports (1-page guide)
  How to Read Dashboards (Video tutorial)
  What Each Metric Means (Reference sheet)
  How to Respond to Alerts (Action guide)
  ```

### **Step 9.4: Performance Review Process**
- Monthly review of:
  ```
  System Accuracy (Metrics vs Reality)
  User Satisfaction (Feedback collection)
  Improvement Opportunities
  New Uber Features to Integrate
  ```

---

## **IMPLEMENTATION TIMELINE & PRIORITIES**

### **WEEK 1-2: Foundation**
- Set up file upload and organization (Phase 1)
- Create basic financial processing (Phase 2, Steps 2.1-2.2)

### **WEEK 3-4: Core Metrics**
- Implement driver performance calculations (Phase 3)
- Build Executive Dashboard (Phase 7.1)

### **WEEK 5-6: Advanced Features**
- Add trip analysis (Phase 4)
- Complete all dashboards (Phase 7)

### **WEEK 7-8: Automation**
- Set up alert system (Phase 8)
- Create automated reports (Phase 8.3-8.4)

### **WEEK 9-10: Polish & Training**
- System testing and validation
- User training materials creation
- Go-live preparation

---

## **STARTING POINT FOR FIGMA MAKE**

**Begin with this exact setup:**

1. **Create a new Figma Make scenario** called "Uber Fleet Import"
2. **Add Google Drive as first module** - Set to "Watch for new files" in your "Uber Reports" folder
3. **Add CSV Parser module** - Connect to Google Drive to read each new file
4. **Add Router module** - Split by filename to send to different processing paths
5. **For each report type**, create a separate processing branch that:
   - Extracts the key columns listed above
   - Performs the calculations shown
   - Stores results in Google Sheets (one sheet per report type)
6. **Create a Dashboard Sheet** that pulls from all processed sheets
7. **Set up Data Studio** to visualize the Dashboard Sheet

**Pro Tip:** Start with just 2 report types first (Payment_Driver and Driver_Quality), get those working perfectly, then add more one at a time.

---

## **CRITICAL SUCCESS FACTORS**

1. **Test with Real Data Weekly** - Use your actual Uber reports to verify accuracy
2. **Start Simple** - Don't build everything at once
3. **Document Everything** - Keep notes of what each calculation does
4. **Get Driver Feedback** - Show drivers their dashboards for verification
5. **Validate Daily** - Check that yesterday's manual calculations match system outputs

This phased approach ensures you build a working system piece by piece without getting overwhelmed. Each phase produces tangible results you can use immediately while building toward the complete solution.)
