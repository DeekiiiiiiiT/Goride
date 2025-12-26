# How the System Works: Trip Meter & Time Reconstruction

## 1. The Challenge
Uber provides data in two disconnected formats:
1.  **Trip Activity:** Detailed logs of every trip (Distance, Duration, Fare) but *no* information about waiting time or time spent driving to the pickup.
2.  **Vehicle Performance:** Aggregate totals for the entire week (Online Hours, On-Trip Hours) but *no* connection to specific trips.

The **Trip Meter** solves this by bridging the gap, mathematically "reconstructing" the missing time segments for every single trip.

## 2. The Solution: Ratio-Reconstruction Algorithm
Instead of guessing, the system uses the global efficiency of your fleet to allocate time to each trip.

### Step 1: Establish Fleet Efficiency (The "Golden Ratios")
When you upload `vehicle_performance.csv`, the system sums up three key metrics for the entire batch:
*   **Total Online Hours:** The total time drivers were logged in.
*   **Total On-Trip Hours:** The actual time spent driving passengers (Revenue generating).
*   **Total On-Job Hours:** Time spent driving to pickup + driving passengers.

From this, we calculate global ratios. For example, if your fleet spends 60% of "Job Time" actually carrying a passenger, then the **On-Trip Ratio** is 0.6.

### Step 2: Reconstruct Individual Trips
For every trip in `trip_activity.csv`, we take the **only known time variable**—the `Trip Duration` (Time with Passenger)—and reverse-engineer the other segments using the global ratios.

**The Logic:**
If a 15-minute trip represents 60% of the work required to complete it, then the *Total Job Time* must have been 25 minutes (15 / 0.6).

*   **Known:** `Trip Duration` (e.g., 15 mins)
*   **Calculated:**
    *   `To-Trip Time` (Driving to pickup) = Derived from the gap between Job Time and Trip Time.
    *   `Available Time` (Waiting for request) = Derived from the gap between Online Time and Job Time.

**Result:** A simple 15-minute trip is transformed into a "Work Unit" that accurately reflects the 10 minutes of driving to pickup and waiting that made that trip possible.

## 3. Data Integrity & Safety
To ensure the data remains accurate even with extreme inputs, we enforce strict rules:

1.  **The "24-Hour" Sanity Check:**
    *   If the reconstruction algorithm calculates that a single trip represents more than 24 hours of work (due to extreme ratios or bad data), it automatically **caps the total at 24 hours**.
    *   All time segments are pro-rated down to fit within this limit, preserving the ratios but enforcing reality.
    
2.  **Missing Performance Data:**
    *   If you upload trips *without* a `vehicle_performance.csv` file, the system defaults to a **Conservative Mode**:
        *   On-Trip Time: 100% of the duration.
        *   Waiting/Pickup Time: 0 minutes.
    *   This ensures we never "hallucinate" hours without evidence.

## 4. The Trip Meter Tab (Preview)
The "Trip Meter" tab in the import screen is a **Live Verification Tool**.
*   **Transparency:** It displays the raw `Trip Duration` alongside the calculated `Total Hours` for each trip.
*   **Verification:** It allows you to spot anomalies (e.g., a short trip being allocated excessive waiting time) *before* the data is saved.
*   **Commitment:** The values you see in this tab are **exactly** what will be stored in the database fields (`onTripHours`, `toTripHours`, `availableHours`).

## 5. Technical Data Flow
1.  **Upload:** You drop the CSV files.
2.  **Parse & Detect:** The system identifies `vehicle_performance` and `trip_activity` files.
3.  **Calculate Ratios:** The system computes the global efficiency factors from the performance file.
4.  **Enrich:** The system loops through every trip, applies the ratios, and adds the new time fields to the JSON object.
5.  **Audit:** The Sanity Check runs to clamp any >24h values.
6.  **Preview:** The "Trip Meter" tab renders these values for your review.
7.  **Commit:** When you click "Complete Import," these enriched Trip objects are saved permanently to the Supabase database.
