/** Courier search starts at the restaurant. The customer pin is only a fallback. */

function coord(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function courierSearchOrigin(input: {
  merchantLat?: number | null;
  merchantLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
}): { lat: number; lng: number } | null {
  const merchantLat = coord(input.merchantLat);
  const merchantLng = coord(input.merchantLng);
  if (merchantLat != null && merchantLng != null) {
    return { lat: merchantLat, lng: merchantLng };
  }
  const deliveryLat = coord(input.deliveryLat);
  const deliveryLng = coord(input.deliveryLng);
  if (deliveryLat != null && deliveryLng != null) {
    return { lat: deliveryLat, lng: deliveryLng };
  }
  return null;
}
