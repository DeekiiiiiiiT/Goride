/** SVG-based Google Maps markers for passenger ride maps. */

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\n\s*/g, ' ').trim())}`;
}

function googleMarkerIcon(
  svg: string,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
): google.maps.Icon {
  return {
    url: svgDataUrl(svg),
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(anchorX, anchorY),
  };
}

/** Gender-neutral rider / pickup (head + rounded torso). */
const RIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40">
  <circle cx="16" cy="9.5" r="5.25" fill="#059669" stroke="#ffffff" stroke-width="2"/>
  <rect x="9" y="15" width="14" height="18" rx="7" fill="#059669" stroke="#ffffff" stroke-width="2"/>
</svg>`;

/** Destination / drop-off map pin with center dot. */
const DROPOFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40">
  <path d="M16 2C10.48 2 6 6.48 6 12c0 7.2 10 25 10 25s10-17.8 10-25c0-5.52-4.48-10-10-10z" fill="#18181b" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="16" cy="12" r="4" fill="#ffffff"/>
  <circle cx="16" cy="12" r="2" fill="#18181b"/>
</svg>`;

/** Top-down vehicle; points north at 0° rotation (windshield at top). */
const VEHICLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
  <rect x="11" y="6" width="18" height="28" rx="5" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
  <rect x="14" y="9" width="12" height="10" rx="2" fill="#bfdbfe"/>
  <rect x="12" y="26" width="6" height="5" rx="1.5" fill="#1d4ed8"/>
  <rect x="22" y="26" width="6" height="5" rx="1.5" fill="#1d4ed8"/>
</svg>`;

const RIDER_SIZE = { w: 32, h: 40, ax: 16, ay: 38 };
const DROPOFF_SIZE = { w: 32, h: 40, ax: 16, ay: 38 };
const VEHICLE_SIZE = { w: 40, h: 40, ax: 20, ay: 20 };

export function riderPickupMarkerIcon(): google.maps.Icon {
  return googleMarkerIcon(RIDER_SVG, RIDER_SIZE.w, RIDER_SIZE.h, RIDER_SIZE.ax, RIDER_SIZE.ay);
}

export function dropoffMarkerIcon(): google.maps.Icon {
  return googleMarkerIcon(DROPOFF_SVG, DROPOFF_SIZE.w, DROPOFF_SIZE.h, DROPOFF_SIZE.ax, DROPOFF_SIZE.ay);
}

export function driverVehicleMarkerIcon(rotation = 0): google.maps.Icon {
  return {
    ...googleMarkerIcon(VEHICLE_SVG, VEHICLE_SIZE.w, VEHICLE_SIZE.h, VEHICLE_SIZE.ax, VEHICLE_SIZE.ay),
    rotation,
  };
}
