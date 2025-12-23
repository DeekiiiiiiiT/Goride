# Data Mapping

I ONLY WANT YOU TO USE THIS AS A GUIDE. JUST TAKE FROM IT WHAT IS NEEDED TO IMPROVE THE CURRENT SYSTEM


---

________________________________________
Part 1: Data Mapping Breakdown
1. Driver Section (The "Who")
•	Goal: Monitor performance and reliability.
•	Primary Source: driver_quality.csv & driver_activity.csv
•	Data Fields Needed:
o	Driver Name: Driver first name + Driver last name
o	Performance Score: Driver ratings (last 4 weeks) (Display as Stars)
o	Reliability: Acceptance rate (Color code: Green > 80%, Red < 30%)
o	Work Ethic: Time online (days : hours: minutes) vs. Trips completed
o	ID for Deep Dive: Driver UUID (Hidden ID to link to other tables)
2. Vehicle Section (The "What")
•	Goal: Track asset utilization and ROI.
•	Primary Source: vehicle_performance.csv
•	Data Fields Needed:
o	Vehicle ID: Vehicle Plate Number & Vehicle Name
o	Efficiency: Earnings / hr (Key metric for vehicle profitability)
o	Utilization Rate: Calculated field: (Hours On Job / Hours Online) * 100. (Shows how much "dead time" the car has).
o	Cash Risk: Cash Collected (Money sitting in the car, not in your bank).
3. Trip Analytics (The "Where" & "How")
•	Goal: Visualize routes and completion status.
•	Primary Source: trip_activity.csv
•	Data Fields Needed:
o	Route Visuals: Pickup address to Drop off address (For map pins).
o	Status Filter: Trip status (Group by: Completed, Rider Cancelled, Driver Cancelled).
o	Timestamps: Trip request time vs Trip drop off time (Calculate duration).
o	Revenue leaks: Highlight trips with status = cancelled but Trip distance > 0.
4. Reports & Financial Analytics (The "How Much")
•	Goal: Net profit and payout management.
•	Primary Source: Payment_organisation.csv & Payments_Transaction.csv
•	Data Fields Needed:
o	Net Payout: End of period balance (The most important number—what you get paid).
o	Gross Revenue: Total Earnings : Net Fare + Total Earnings:Tip.
o	Deductions: Payouts : Cash Collected (Subtract this from Gross).
o	Transaction Audit: List rows from Payments_Transaction.csv where Description != "trip completed order" (To spot adjustments/refunds).
________________________________________
relationships between specific CSV files.


I am building a Fleet Management App with four specific screens. I have 7 CSV files containing raw data from Uber. I need you to write the logic/code to map the raw CSV columns to the UI components for each screen described below.
The Data Structure (CSV Sources):
1.	Drivers: driver_quality.csv (Ratings, Acceptance), driver_activity.csv (Time online)
2.	Vehicles: vehicle_performance.csv (Earnings, Hours)
3.	Trips: trip_activity.csv (Locations, Status)
4.	Financials: Payment_organisation.csv (Balances), Payments_Transaction.csv (Line items)
Please map the data to the App Sections as follows:
SECTION 1: DRIVER DASHBOARD
•	Header: Display Driver first name + Driver last name.
•	KPI Cards:
o	Rating: Display Driver ratings (last 4 weeks) on a 5-star scale.
o	Acceptance Rate: Display Acceptance rate as a percentage. IF rate < 40%, flag with Red Warning Icon.
o	Online Time: Display Time online (days : hours: minutes).
•	Action: When clicked, use Driver UUID to filter the Trip Analytics section below.
SECTION 2: VEHICLE MONITOR
•	List View: Show Vehicle Name (e.g., Toyota Sienta) and Vehicle Plate Number.
•	Utilization Graph: Create a progress bar showing Efficiency.
o	Formula: (Hours On Job / Hours Online) * 100.
o	Label: "Active Utilization %".
•	Earnings Metric: Display Earnings / hr prominently to show asset value.
SECTION 3: TRIP ANALYTICS
•	Map View: Plot pins using Pickup address (Start) and Drop off address (End).
•	Status List: List all trips sorted by Trip request time.
o	Color Coding:
	Trip status = "completed" (Green)
	Trip status = "rider_cancelled" (Yellow)
	Trip status = "driver_cancelled" (Red)
•	Anomaly Detection: Highlight any row where Trip status is "cancelled" BUT Trip distance > 0.1.
SECTION 4: FINANCIAL REPORTS
•	Main Balance (Big Text): Display End of period balance from Payment_organisation.csv. This is the "Net Payout".
•	Cash Liability: Display Payouts : Cash Collected in Red (this is money the driver holds).
•	Revenue Breakdown:
o	Gross Fares: Total Earnings : Net Fare
o	Tips: Total Earnings:Tip
o	Tolls/Refunds: Refunds & Expenses:Refunds:Toll
•	Transaction Ledger: Populate a table using Payments_Transaction.csv. Columns: Time, Description, Paid to you.
Technical Requirement:
Please generate the code/logic to parse these CSVs and bind them to the UI components defined above. Ensure Driver UUID is used as the foreign key to link Drivers to their specific Trips and Financial transactions.


