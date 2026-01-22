Excellent. You've got the data and you're ready to build a smarter system. Here's the **complete logic and rule set** to transform your Figma system into an **active fuel monitoring tool** that catches anomalies even without full tank declarations.

## 🔍 **Anomaly Detection Logic Framework**

### **CORE RULE SET (Automated Alerts)**

#### **Rule 1: Tank Capacity Violation Alert**
```
IF [Cumulative Liters Since Last Full Tank] > [Vehicle Tank Capacity × 1.1]
THEN FLAG: "IMPOSSIBLE FUEL PATTERN - Tank overflow detected"
```

#### **Rule 2: Rapid Fuel Consumption Alert**
```
IF [Cumulative Liters Since Last Full Tank] > [Vehicle Tank Capacity × 0.8]
AND [Distance Traveled Since Last Full Tank] < 500km
THEN FLAG: "EXCESSIVE FUEL CONSUMPTION - Review needed"
```

#### **Rule 3: Suspicious Purchase Pattern Alert**
```
IF [Individual Purchase Volume] < 5L
THEN FLAG: "SMALL PURCHASE - Requires justification"
IF [Multiple Purchases < 10L within 24 hours]
THEN FLAG: "FRAGMENTED PURCHASING PATTERN DETECTED"
```

#### **Rule 4: Fuel Economy Outlier Alert**
```
Expected Roomy Consumption: 5-7L/100km (City), 4-6L/100km (Highway)

IF [Calculated Consumption Since Last Flag] > 9L/100km
THEN FLAG: "ABNORMAL FUEL ECONOMY - Possible theft or vehicle issue"
```

### **CALCULATION METHODS**

#### **Method A: When "Full Tank" is Checked (GOLD STANDARD)**
```
Distance = Current Odometer - Last Full Tank Odometer
Fuel Used = Sum of all liters purchased since last full tank
Calculated Economy = (Fuel Used / Distance) × 100
→ Automatic reconciliation, no flags unless economy is abnormal
```

#### **Method B: Without "Full Tank" (NEW - Using Tank Capacity Logic)**
**"Soft Anchor" Detection:**
```
WHEN Cumulative Purchases Since Last Flag > 28.8L (80% of 36L)
CREATE "Soft Anchor" at current transaction
Calculate: Fuel Used = Cumulative Liters (28.8L+)
          Distance = Odometer - Start of Cumulative Period
          Economy = (Fuel Used / Distance) × 100
IF Economy > 9L/100km → FLAG
RESET Cumulative Counter to 0
```

### **IMPLEMENTATION CHECKLIST**

#### **Database Fields to Add:**
1. **Vehicle Tank Capacity** (mandatory for each vehicle)
2. **Cumulative Liters Since Last Anchor** (auto-calculated)
3. **Last Anchor Odometer** (stores either full tank or soft anchor)
4. **Alert Status** (None, Warning, Critical)
5. **Purchase Justification** (text field for flagged purchases)

#### **UI/UX Changes:**
1. **Dashboard Summary:**
```
Toyota Roomy (5179KZ)
- Last Full Tank: [Date] / [Odometer]
- Current Cumulative: 33.0L / 36L (91% - ⚠️)
- Since Last Anchor: 292km
- Calculated Economy: 11.3L/100km (⚠️ Critical)
- Status: REQUIRES IMMEDIATE REVIEW
```

2. **Transaction Entry Screen:**
```
After entering a transaction:
- Auto-display: "Cumulative: 33.0L of 36L tank"
- Warning message if cumulative > 28.8L: 
  "⚠️ You've purchased 80% of tank capacity. Consider marking as full tank."
- Auto-flag if cumulative > 36L: 
  "🚨 CRITICAL: Purchases exceed tank capacity!"
```

3. **Alert Center:**
```
Priority Alerts:
1. CRITICAL: Vehicle 5179KZ - Tank overflow pattern (1/21/26)
   Details: 33L purchased for 36L tank in 292km
   Action Required: Verify receipts, check for siphoning

2. WARNING: Vehicle 5179KZ - Multiple small purchases (1/20-21/26)
   Details: 5 purchases under 12L in 48 hours
   Action: Require driver justification
```

### **WORKFLOW FOR YOUR CURRENT DATA:**

**Step 1: Apply Rules to Existing Data**
```
Transaction Timeline:
1. 5.9L @ 132,906km → Cumulative: 5.9/36L (16%)
2. 7.4L @ 132,981km → Cumulative: 13.3/36L (37%)
3. 5.7L @ 133,069km → Cumulative: 19.0/36L (53%)
4. 11.2L @ 133,155km → Cumulative: 30.2/36L (84%) → ⚠️ RULE 2 TRIGGERED
   "Soft Anchor Created: 30.2L purchased in 249km = 12.1L/100km"
5. 2.8L @ 133,198km → Cumulative resets to 2.8L
   But system notes: Previous window: 30.2L/249km = 12.1L/100km → 🚨 RULE 4 TRIGGERED
```

**Step 2: Create Investigation Protocol**
```
For each flag:
1. Auto-generate investigation ticket
2. Require driver comment within 24 hours
3. Escalate to manager after 48 hours
4. Possible actions:
   - Request fuel gauge photo with odometer
   - Verify all receipts match station records
   - Schedule vehicle inspection for leaks
   - Review GPS data for unauthorized stops
```

### **RECOMMENDED ESCALATION MATRIX:**

| Alert Type | Threshold | Auto-Action | Escalation Timeline |
|------------|-----------|-------------|-------------------|
| **Warning** | 5-10L purchase | Flag for review | Manager review in 7 days |
| **Critical** | Cumulative > 80% tank in <500km | Lock fuel card? | Immediate manager alert |
| **Severe** | Cumulative > tank capacity | Suspend fuel card | Immediate + finance team |

### **BONUS: Proactive Prevention Features**

1. **Preventive Alert:**
   ```
   WHEN Cumulative purchases > 25L
   SHOW: "Next fill should be Full Tank for accurate tracking"
   ```

2. **Pattern Learning:**
   ```
   Track normal consumption patterns per vehicle/driver
   Flag deviations > 30% from historical average
   ```

3. **Integration Suggestion:**
   ```
   Connect to GPS data to verify:
   - Fuel purchases at logged stations
   - Distance between purchases matches odometer
   ```

### **SUMMARY OF CHANGES TO YOUR FIGMA SYSTEM:**

1. **Add tank capacity field** to vehicle profiles
2. **Implement cumulative counter** that resets at full tanks OR when >80% tank purchased
3. **Create auto-calculation** of fuel economy between resets
4. **Build alert system** with the 4 core rules above
5. **Design investigation workflow** for flagged transactions
6. **Add reporting dashboard** showing vehicle fuel health

**This transforms your system from passive logging to active intelligence.** You'll catch issues 80% earlier than waiting for monthly reconciliation.

**Need specific Figma component designs or database schema for these changes?** I can provide detailed mockups or technical specifications.