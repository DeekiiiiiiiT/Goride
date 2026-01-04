# Driver Quota Report**

## **Module Setup Instructions**

### **1. FIRST: Database Tables to Create**

**Table 1: `drivers`**
```
- driver_id (Text, Primary Key)
- driver_name (Text)
- daily_ride_quota (Number, default: 10)
- hourly_earnings_quota (Number, default: $25)
- date_added (Date)
```

**Table 2: `daily_performance`**
```
- record_id (Auto ID)
- driver_id (Text, Link to drivers table)
- date (Date)
- total_rides (Number)
- total_earnings (Number)
- hours_online (Number)
- rides_per_hour (Formula: total_rides ÷ hours_online)
- earnings_per_hour (Formula: total_earnings ÷ hours_online)
- met_ride_quota (Boolean, Formula: total_rides >= linked_driver.daily_ride_quota)
- met_earnings_quota (Boolean, Formula: total_earnings >= hours_online × linked_driver.hourly_earnings_quota)
```

### **2. Create the Report Page**

**Add these modules in order:**

**A. Header Section (Row Layout)**
```
- Text: "Driver Performance Report"
- Date Range Picker: Set variable `date_range`
- Dropdown: "Metric Type" 
  Options: "Daily Rides", "Hourly Earnings", "Both"
  Set variable `metric_type`
- Button: "Generate Report" 
  On Click: Trigger workflow "calculate_performance"
```

**B. Summary Cards (Row Layout with 3 columns)**

**Column 1: Top Performers Card**
```
- Container with light green background (#E8F5E9)
- Text: "🎯 Top Performers"
- Repeater: 
  Data source: Variable `top_performers` (array)
  Display: 
    • Text: "{item.driver_name}: {item.success_rate}%"
    • Progress Bar: {item.success_rate}%
```

**Column 2: Needs Attention Card**
```
- Container with light orange background (#FFF3E0)
- Text: "⚠️ Needs Attention"
- Repeater:
  Data source: Variable `need_attention` (array)
  Display:
    • Text: "{item.driver_name}: {item.success_rate}%"
    • Progress Bar: {item.success_rate}%
```

**Column 3: Quick Stats Card**
```
- Container with light blue background (#E3F2FD)
- Text: "📊 Quick Stats"
- Display:
  • Text: "Period: {date_range}"
  • Text: "Avg Success Rate: {avg_success_rate}%"
  • Text: "Total Drivers: {total_drivers}"
```

**C. Detailed Table (Table Module)**
```
Table Columns:
1. Driver Name (Text)
2. Total Days (Number)
3. Days Met Quota (Number)
4. Success Rate (Text with conditional formatting)
   - If >= 80%: Green text
   - If 60-79%: Orange text
   - If < 60%: Red text
5. Current Streak (Number)
6. Best Streak (Number)
7. Actions (Button: "View Details")
```

### **3. Workflows to Create**

**Workflow 1: `calculate_performance`**
```
Trigger: Button click "Generate Report"

Steps:
1. Get date_range variable
2. Search records in `daily_performance` where date is between date_range
3. Group records by driver_id (use "Group by" module)
4. For each driver group:
   - Count total days: Count of records
   - Count days met: Sum where met_ride_quota = true (or both metrics if selected)
   - Calculate success_rate: (days_met ÷ total_days) × 100
   - Find current streak: Count consecutive days met until today
   - Find best streak: Maximum consecutive days met in period
5. Sort by success_rate descending
6. Set variables:
   - top_performers = First 5 drivers
   - need_attention = Last 5 drivers
   - avg_success_rate = Average of all success rates
   - total_drivers = Count of unique drivers
```

**Workflow 2: `export_to_excel`**
```
Trigger: Button click "Export Report"

Steps:
1. Get current report data from variables
2. Convert to CSV format
3. Create file download
```

### **4. Detail Modal (Pop-up)**

**Create modal triggered by "View Details" button:**
```
Modal Content:
- Driver Name: {selected_driver.name}
- Quota: {selected_driver.daily_ride_quota} rides/day
- Period: {date_range}
- Calendar View: Show each day with ✅ or ❌
- Trend Graph: Line chart showing daily performance
- Notes Field: For manager comments
```

### **5. Additional Features (Optional)**

**A. Automated Email Report**
```
Create workflow "send_weekly_report" that:
1. Triggers every Monday at 9 AM
2. Calculates previous week's performance
3. Sends email to managers with summary
```

**B. Alert System**
```
Create workflow "low_performance_alert":
Trigger: When driver success_rate < 60% for 3 consecutive days
Action: Send push notification to manager
```

### **6. Page Styling**

**Colors:**
- Success (green): #4CAF50
- Warning (orange): #FF9800
- Danger (red): #F44336
- Primary: #2196F3
- Background: #F5F5F5

**Spacing:**
- Between sections: 20px
- Card padding: 16px
- Table row height: 48px

### **7. Testing Data**

**Add sample records for testing:**
```
In daily_performance table:
- driver_id: "DRV001"
- date: Yesterday
- total_rides: 12
- total_earnings: 280
- hours_online: 8
(Repeat for 30 days with varying numbers)
```

### **8. Common Issues & Fixes**

**Problem:** Data not grouping correctly
**Solution:** Ensure driver_id is exact same in both tables

**Problem:** Formulas not calculating
**Solution:** Check field types (must be Number, not Text)

**Problem:** Date filter not working
**Solution:** Format dates as YYYY-MM-DD

---

## **Quick Start Checklist:**
- [ ] Create both database tables
- [ ] Add sample data (10 drivers, 30 days)
- [ ] Build the report page layout
- [ ] Create the `calculate_performance` workflow
- [ ] Test with different date ranges
- [ ] Add styling and formatting

---

## **Figma Make Specific Tips:**

1. **Use "Repeaters"** for dynamic lists
2. **Set variables** to store calculation results
3. **Conditional formatting** = If/Then modules
4. **Grouping data** = Use "Group by" after search
5. **Charts** = Use Chart.js integration or SVG modules

**Need help with a specific module?** Reply with:
- Which step you're stuck on
- Screenshot of your setup
- Error message if any

Start with just the basic table first, then add cards and graphs later!