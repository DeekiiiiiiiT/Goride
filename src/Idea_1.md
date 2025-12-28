## **Your Current System's Fatal Flaw**

**Your system is filing false claims against Uber for expenses they're not responsible for.**

Here's exactly why:

1. **Your "Strict Window" definition is wrong:**
   - You use: Request Time → Drop-off + 15 minutes
   - This includes deadhead time (driving to pickup) where Uber explicitly doesn't pay

2. **Your logic creates false Amber claims:**
   - A toll at 2:05 PM for a trip requested at 2:00 PM (but not started until 2:15 PM) falls in your "Strict Window"
   - Uber correctly pays $0 (they don't pay deadhead tolls)
   - Your system flags this as **Amber = "Claim from Uber"**
   - **But this is a false claim** - Uber shouldn't pay for deadhead tolls

3. **Your buffer creates double standards:**
   - You accept Uber's payments for tolls up to 15 minutes after drop-off (Green matches)
   - But you only file claims for tolls up to 5 minutes after drop-off (Amber claims)
   - This lets Uber incorrectly pay you for personal tolls while restricting your legitimate claims

**Result:** You waste time filing claims Uber will reject, your loss metrics are inflated with false data, and you're not compliant with Uber's actual policy.

---

## **The Corrected System Logic**

### **Core Principle:**
Uber only pays for tolls **WITH A RIDER IN THE CAR** (Trip Start → Drop-off).

### **Three Essential Windows:**

#### **1. Active Trip Window (Uber's Responsibility)**
- **Start:** Trip Start Time (when rider enters vehicle)
- **End:** Drop-off Time (when rider exits)
- **No buffers** - strict compliance with Uber's policy
- **Only tolls here can generate claims**
  - ✅ Green: Amount matches exactly
  - ⚠️ Amber: Valid claim (Uber paid wrong amount or $0)

#### **2. Approach Window (Driver's Business Expense)**
- **Start:** Request Time - 45 minutes
- **End:** Trip Start Time (when rider enters)
- **Never generates claims** - driver's responsibility
  - 🔵 Blue: Business expense (tax deductible, not reimbursable)

#### **3. Matching Window (Search Scope Only)**
- **Start:** Request Time - 45 minutes
- **End:** Drop-off Time + 15 minutes
- **Purpose:** Just to find transactions, NOT determine eligibility

---

## **Revised Waterfall Logic**

For each toll transaction:

### **Step 1: Is it during the active trip?**
```
IF transaction.time BETWEEN trip.start_time AND trip.dropoff_time:
    IF amount_matches(transaction, trip.toll_charge):
        RETURN Green ✅ "Perfect Match"
    ELSE:
        RETURN Amber ⚠️ "Valid Claim - Uber should have paid"
```

### **Step 2: Is it during approach/deadhead?**
```
ELIF transaction.time BETWEEN (trip.request_time - 45min) AND trip.start_time:
    RETURN Blue 🔵 "Business Expense - Driver's responsibility"
```

### **Step 3: Is it outside both?**
```
ELSE:
    RETURN Purple 🟣 "Personal Use - Charge Driver"
```

---

## **Reverse Logic (Unchanged)**
For trips with toll reimbursements but no matching transaction:
- **Yellow 🟡 "Likely Cash"** - Reimburse driver

---

## **Key Changes From Your System:**

1. **Active Trip Window is tighter:** Trip Start → Drop-off (no +15 minutes)
2. **Approach Window is separate:** Request-45min → Trip Start (not lumped with active trip)
3. **No double standard:** Same timing rules for accepting payments and filing claims
4. **Amber claims only for active trip:** No more false claims for deadhead tolls

---

## **Example in Practice:**

**Trip:** Requested 2:00 PM, Started 2:10 PM, Ended 2:30 PM

**Transaction A:** Toll at 2:05 PM
- **Your system:** Amber ❌ (false claim - Uber will reject)
- **Correct system:** Blue ✅ (business expense - driver's responsibility)

**Transaction B:** Toll at 2:20 PM  
- **Both systems:** Amber ✅ (valid claim during trip)

**Transaction C:** Toll at 2:35 PM
- **Your system:** Green ❌ (incorrectly accepting personal toll)
- **Correct system:** Purple ✅ (personal - charge driver)

This system is fully compliant with Uber's policy, only files valid claims, and accurately categorizes expenses between Uber, business, and personal.