The correct approach is geofencing with a radius (also known as circular geofencing). Instead of checking if the driver is exactly at (lat, lon), you check if the driver’s location is within, say, 50 meters of that point.

Below I’ll walk you through the best way to implement this in a fleet app, covering both client‑side (mobile) and server‑side approaches, with practical code examples.

1. The Core Concept: Distance + Radius
Given a gas station’s coordinates (stationLat, stationLon) and a driver’s current location (driverLat, driverLon), compute the distance between them. If that distance is less than your chosen radius (e.g., 50 m), the driver is considered “at the station”.

The formula used is the Haversine formula, which gives great‑circle distance on a sphere. It’s accurate enough for geofencing up to a few kilometers.

2. Choosing the Right Radius
Typical gas station footprint: 30–50 m across.

GPS error: 5–20 m in open areas.

Recommended radius: 50–100 m.

Smaller (e.g., 30 m) might miss drivers at the far pump.

Larger (e.g., 150 m) may catch vehicles on adjacent roads.

You can also adjust the radius per station if some are unusually large or small.

3. Two Implementation Strategies
A. Client‑Side Geofencing (Mobile)
Use the platform’s built‑in geofencing APIs. This is battery‑efficient because the OS monitors location and wakes your app only when a boundary is crossed.

Android: GeofencingClient

iOS: CLCircularRegion with startMonitoring(for:)

Advantages:

Low power consumption.

Immediate triggering even when the app is in the background.

Disadvantages:

You must pre‑define all geofences on the device.

Limited number of geofences (typically 100 per app on iOS, variable on Android).

B. Server‑Side Geofencing
The driver’s app sends location updates to your server (e.g., every 30–60 seconds). The server then checks each location against the list of gas stations.

Advantages:

No limit on number of geofences.

You can easily update station data without pushing to devices.

Disadvantages:

Higher battery usage (constant GPS and network calls).

Not real‑time – you rely on the ping interval.

For a fleet app, a hybrid approach often works best: use client‑side geofencing for the most frequented stations, and fall back to server‑side checks for others. Or, if your drivers visit many different stations, server‑side may be simpler to maintain.

4. Adding “Dwell Time” (Avoid False Positives)
A driver passing by on a nearby highway might briefly enter the geofence. To avoid marking those as fueling events, require that the driver stays inside the fence for a minimum duration, e.g., 2 minutes.

On Android/iOS geofencing, you can set loiteringDelay (Android) or use CLLocation timestamps and manual dwell detection.

On the server side, track consecutive location points that fall inside the fence and calculate the elapsed time.

5. Code Examples (Distance Calculation)
Here’s how to compute the distance in several common languages. You can use this in your server‑side logic or inside a mobile app if you’re doing manual checks.

JavaScript / TypeScript (Node.js or React Native)
javascript
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth’s radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
}

// Usage
const distance = getDistanceFromLatLonInMeters(driverLat, driverLon, stationLat, stationLon);
if (distance < 50) {
  console.log("Driver is at the gas station");
}
Kotlin (Android – without using Geofencing API)
kotlin
fun isWithinRadius(
    stationLat: Double, stationLon: Double,
    driverLat: Double, driverLon: Double,
    radiusMeters: Float
): Boolean {
    val results = FloatArray(1)
    Location.distanceBetween(stationLat, stationLon, driverLat, driverLon, results)
    return results[0] <= radiusMeters
}
Swift (iOS – without using CoreLocation region monitoring)
swift
import CoreLocation

func isWithinRadius(station: CLLocation, driver: CLLocation, radius: CLLocationDistance) -> Bool {
    let distance = driver.distance(from: station)
    return distance <= radius
}
6. Implementing Dwell Time (Server‑Side Example)
If you’re doing server‑side checks with periodic location updates, you can track each driver’s state for a given station:

python
# Pseudocode
driver_state = {}  # key: driver_id, value: {station_id, entry_time}

for location in location_updates:
    for station in gas_stations:
        if distance(location, station) < station.radius:
            if driver_id not in driver_state:
                driver_state[driver_id] = {"station_id": station.id, "entry_time": location.timestamp}
            else:
                # Already inside this station – check dwell time
                if driver_state[driver_id]["station_id"] == station.id:
                    dwell = location.timestamp - driver_state[driver_id]["entry_time"]
                    if dwell >= timedelta(minutes=2):
                        trigger_fueling_event(driver_id, station.id)
                        del driver_state[driver_id]  # reset
                else:
                    # Switched to a different station – update state
                    driver_state[driver_id] = {"station_id": station.id, "entry_time": location.timestamp}
        else:
            # Driver left the station – clear state for this station
            if driver_id in driver_state and driver_state[driver_id]["station_id"] == station.id:
                del driver_state[driver_id]
7. Best Practices for Production
Use a combination of GPS and network location – not just GPS. This improves accuracy indoors (like under a canopy) and saves battery.

Set appropriate location request priorities:

On Android: LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY for geofencing.

On iOS: desiredAccuracy = kCLLocationAccuracyHundredMeters for geofencing, kCLLocationAccuracyBest when actively tracking.

Handle permissions gracefully and explain why background location is needed.

Test with real driving patterns – you may need to tweak the radius and dwell time based on typical speeds and station layouts.

Consider using reverse geocoding to get the place name (e.g., “Shell, Main St”) for a nicer user interface, but do not rely on it for entry detection – it’s slower and less reliable.

8. Conclusion
Do not switch to Plus Codes – they won’t fix the underlying problem. Instead, implement radius‑based geofencing with a dwell time check. Start with a simple server‑side distance calculation to prove the concept, then move to platform‑specific geofencing APIs for better battery life and real‑time detection.

If you let me know which framework or language you’re using (e.g., React Native, Flutter, native Android/iOS, or a backend stack), I can give you more tailored examples.