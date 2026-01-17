# Fuel Economy Tracking Implementation

## 1. Current System Analysis
The current `GoRide` dashboard tracks vehicle mileage and odometer history but lacks precise fuel consumption data.
- **Mileage Tracking:** Good. We have daily trips and odometer readings.
- **Fuel Cost Estimation:** Inaccurate. Currently uses a hardcoded multiplier (`totalDistance * 0.15`) in `VehicleDetail.tsx`.
- **Fuel Efficiency:** Non-existent. There is no input for fuel volume (liters/gallons) or actual fuel costs.

To track "real fuel economy" (e.g., L/100km or MPG), the system must correlate **Distance Driven** with **Fuel Consumed**.

## 2. Missing Information
To implement this feature, we need to start capturing the following data points at every refueling stop:
1.  **Odometer Reading:** Exact reading at the pump.
2.  **Volume:** Amount of fuel added (Liters/Gallons).
3.  **Cost:** Total cost of the transaction (or Price/Unit).
4.  **Full Tank Indicator:** A boolean flag (`Yes/No`).
    *   *Why?* You can only calculate accurate efficiency between two "Full Tank" events. If a driver only puts in $10 worth of gas, you don't know how much of the tank was used since the last fill-up.

## 3. Proposed Solution

### A. New Data Structure (`FuelLog`)
We should introduce a `FuelLog` type to store refueling events.

```typescript
export interface FuelLog {
  id: string;
  vehicleId: string;
  date: string;
  odometer: number;      // Reading at time of fill-up
  volume: number;        // Liters
  totalCost: number;     // Currency
  pricePerUnit?: number; // Calculated or Input
  isFullTank: boolean;   // Essential for efficiency calc
  stationName?: string;  // Optional
  receiptImage?: string; // Optional proof
}
```

### B. UI Enhancements
1.  **New "Fuel" Tab:** Add a `FuelManager` component in `VehicleDetail` (alongside "Maintenance" and "Odometer").
2.  **Add Fuel Entry:** A simple form to input the data points above.
3.  **Fuel History:** A table showing recent fill-ups.

### C. Analytics Updates
Once we have this data, we can calculate:
1.  **Real Efficiency (L/100km):** 
    `((Litres Filled) / (Current Odometer - Previous Odometer)) * 100`
    *(Only valid if both current and previous fill-ups were "Full Tank")*
2.  **Real Cost per Km:** 
    `Total Fuel Cost / Total Distance Driven`
3.  **Average Fuel Consumption:** 
    Global average over a selected date range.

### D. Integration Plan
1.  **Create Component:** `components/vehicles/FuelManager.tsx`.
2.  **Update Interface:** Add `FuelLog` to `types/vehicle.ts`.
3.  **Update Analytics:** Modify `VehicleDetail.tsx` to replace `totalDistance * 0.15` with `sum(fuelLogs.cost)` for the selected period.
4.  **Data Storage:** Use the existing KV store pattern: `vehicle:${id}:fuel_logs`.

## 4. Next Steps
When you are ready, I can:
1.  Create the `FuelManager` component.
2.  Integrate it into the `VehicleDetail` view.
3.  Update the financial algorithms to use real data.
