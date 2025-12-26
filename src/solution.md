I need to upgrade the Data Import Logic to include "Dynamic Auto-Calibration". Please read the system architecture carefully. The goal is to reconcile the difference between the Trip Logs (granular but potentially inflated by timestamp lag) and the Vehicle Performance Report (the absolute source of truth).
Please implement this 4-Step Import Logic:
Step 1: Establish the "Golden Ratios" (Fleet Efficiency)
•	Source: vehicle_performance.csv
•	Variables:
o	TOTAL_ON_TRIP (Revenue Time)
o	TOTAL_ON_JOB (Driving + Pickup)
o	TOTAL_ONLINE (Total Shift)
•	Calculate Global Ratios:
1.	RATIO_ON_TRIP = TOTAL_ON_TRIP / TOTAL_ON_JOB
2.	RATIO_TO_TRIP = (TOTAL_ON_JOB - TOTAL_ON_TRIP) / TOTAL_ON_JOB
3.	RATIO_AVAILABLE = (TOTAL_ONLINE - TOTAL_ON_JOB) / TOTAL_ON_JOB
•	Fallback: If vehicle_performance.csv is missing, use Conservative Mode (OnTrip=100%, others=0%).
Step 2: Calculate "Phantom Lag" (The Auto-Calibration)
Before processing individual rows, compare the dataset totals to detect "Ghost Time."
1.	TARGET_TOTAL = TOTAL_ONLINE (from Performance Report).
2.	RAW_LOG_SUM = Sum of (DropOff - RequestTime) for all completed trips in trip_activity.csv.
3.	TRIP_COUNT = Total number of completed trips.
4.	Calculate Deduction per Trip:
o	DIFF = RAW_LOG_SUM - TARGET_TOTAL
o	IF DIFF > 0 (Logs are inflated):
	CALIBRATION_DEDUCTION = DIFF / TRIP_COUNT
o	ELSE (Logs are accurate or lower):
	CALIBRATION_DEDUCTION = 0
o	Note: This ensures we deduct the exact amount of "Timestamp Lag" (e.g., 2.5 mins) required to make the totals match.
Step 3: Reconstruct Individual Trips (Row Processing)
Loop through every trip in trip_activity.csv and apply the logic:
1.	Clean the Data:
o	Raw_Duration = (Drop Off - Request Time)
o	True_Job_Time = Raw_Duration - CALIBRATION_DEDUCTION
o	(If result < 0, clamp to 0).
2.	Apply Ratios (Reconstruction):
o	trip.onTripHours = True_Job_Time * RATIO_ON_TRIP
o	trip.toTripHours = True_Job_Time * RATIO_TO_TRIP
o	trip.availableHours = True_Job_Time * RATIO_AVAILABLE
3.	Calculate Total:
o	trip.totalHours = Sum of the three fields above.
Step 4: Safety & Verification
1.	The 24-Hour Sanity Check:
o	If trip.totalHours > 24, pro-rate all segments down so the total equals 24.0.
2.	Commit to DB:
o	Save these calculated values to the database so the "Trip Meter" tab works accurately.
Why this works: This approach preserves your "Ratio-Reconstruction" architecture but adds a smart calibration layer. It ensures that when a user filters for "All Time," the sum of the trips exactly matches the Uber Official Report, regardless of "phantom time" variance.

