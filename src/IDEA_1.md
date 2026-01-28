Based on the reports you provided (specifically `vehicle_performance.csv`), here is the exact logic Uber uses to allocate hours.

Uber breaks down the time into three distinct "buckets" based on the driver's status. To replicate this in your own system or calculate it from these sheets, you must use the **`vehicle_performance.csv`** file, as it contains the aggregate counters needed.

### 1. The Formulas

Here is how the hours are defined and calculated:

| Metric | Uber Definition | Calculation Formula |
| --- | --- | --- |
| **Available** | Time spent online *waiting* for a request. | **`Hours Online` - `Hours On Job**` |
| **To Trip** | Time spent driving *to* the passenger (En Route). | **`Hours On Job` - `Hours On Trip**` |
| **On Trip** | Time spent *with* the passenger (Pickup to Dropoff). | **`Hours On Trip`** (No calculation needed) |

---

### 2. Calculation Using Your Data

Using the data from your **`vehicle_performance.csv`** (Row 2), here is the breakdown:

* **Hours Online:** `68.48`
* **Hours On Job:** `57.50` (Total busy time: Driving to pickup + Driving passenger)
* **Hours On Trip:** `39.39` (Only time with passenger)

**The Allocation:**

* **Available Hours:**  **`10.98 Hours`**
*(You were online but idle for ~11 hours)*
* **To Trip Hours:**  **`18.11 Hours`**
*(You spent ~18 hours driving to pickups)*
* **On Trip Hours:** **`39.39 Hours`**
*(You spent ~39 hours driving passengers)*

---

### 3. Implementing This in Your App (Trip Meter)

If you are building this into your own application, you cannot calculate "To Trip" using *only* the **`trip_activity.csv`** file you uploaded.

* **The Problem:** Your `trip_activity.csv` only shows `Trip request time` and `Trip drop off time`. It is missing the **"Pickup Time"**.
* **The Solution:** To calculate "To Trip" vs "On Trip" accurately in your app, you must record three timestamps for every trip:
1. **`T1` (Accepted):** When the driver accepts the job.
2. **`T2` (Pickup):** When the passenger gets in the car.
3. **`T3` (Dropoff):** When the trip ends.



**Your App's Logic Should Be:**

* `To Trip` = **T2 - T1**
* `On Trip` = **T3 - T2**